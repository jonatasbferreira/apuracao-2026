const $ = id => document.getElementById(id);
const directTSE = !['127.0.0.1','localhost','::1'].includes(location.hostname);
const titles = {'1':'Presidente', '3':'Governador', '5':'Senador', '6':'Deputado federal', '7':'Deputado estadual'};
const colors = {'1':'#337e98', '3':'#21725b', '5':'#b18c32', '6':'#456d91', '7':'#8c5e78'};
const defaults = {'1':[], '3':['45','13','14'], '5':['400','222','300','180','445'], '6':['2277'], '7':['22777']};
let settings = {turn:'1', president:'br', auto:true, autoDefaultVersion:1, page:'results', benchMode:'federal-br', view:'regions', mapColor:'progress', pinsVersion:0, pins:structuredClone(defaults)};
try {
  const saved = JSON.parse(localStorage.getItem('apuracao-ce-v1'));
  if (saved) {
    settings.turn = ['1','2'].includes(saved.turn) ? saved.turn : '1';
    settings.president = ['br','ce'].includes(saved.president) ? saved.president : 'br';
    settings.auto = saved.autoDefaultVersion === 1 ? saved.auto !== false : true;
    settings.view = saved.view === 'map' ? 'map' : 'regions';
    settings.mapColor = saved.mapColor === 'region' ? 'region' : 'progress';
    settings.page=saved.page==='benches' ? 'benches' : 'results';
    settings.benchMode=['federal-br','state-ce','federal-ce','senate-br'].includes(saved.benchMode) ? saved.benchMode : 'federal-br';
    settings.pinsVersion = Number(saved.pinsVersion) || 0;
    for (const id of Object.keys(defaults)) {
      if (Array.isArray(saved.pins?.[id])) settings.pins[id] = saved.pins[id].filter(n => /^\d+$/.test(n));
    }
  }
} catch {}
save();
if (settings.pinsVersion<1) {
  if (!settings.pins['5'].includes('445')) settings.pins['5'].push('445');
  settings.pinsVersion=1;
  save();
}
let races = {}, errors = {}, busy = false, due = Date.now() + 11000, pickerId, draftPins;
let controller = null, epoch = 0, consulted = null;
let overview = null, overviewError = '';
let mapGeometry = null, mapPromise = null, focusedRegion = null;
let benchParty=null, benchCandidate=null;
const nationalQueries=new Map();
function nationalQuery(cargo) {
  if(!nationalQueries.has(cargo))nationalQueries.set(cargo,{data:null,busy:false,controller:null,requestedAt:0,error:''});
  return nationalQueries.get(cargo);
}
function nationalMode(){return ['federal-br','senate-br'].includes(settings.benchMode);}
let previewUf = null, previewTimer = null, previewRequest = null, previewCloseTimer = null;
const previewCache = new Map();
const integer = new Intl.NumberFormat('pt-BR');
const decimal = new Intl.NumberFormat('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function save() {try {localStorage.setItem('apuracao-ce-v1', JSON.stringify(settings));} catch {}}
function row(candidate, pinned) {
  const partyPosition = candidate.partyRank ? `<span class="party-position" title="Posição por votos entre todos os candidatos do ${esc(candidate.party)} neste cargo e estado. Empates compartilham a posição; não indica eleição.">${candidate.partyRank}º no ${esc(candidate.party)}</span>` : '';
  const federationPosition = candidate.federationRank ? `<span class="federation-position" title="${esc(candidate.federation)} · posição por votos entre os candidatos dos partidos integrantes. Não indica eleição.">${candidate.federationRank}º na federação</span>` : '';
  const seats = candidate.groupSeats!=null ? `<div class="candidate-seats" title="Vagas informadas pelo TSE para o partido ou federação neste cargo. Durante a apuração, podem mudar.">${esc(candidate.federation ? 'Federação' : candidate.party)}: <strong>${integer.format(candidate.groupSeats)} vagas ${candidate.seatsFinal ? 'TSE' : 'na parcial'}</strong></div>` : '';
  return `<div class="candidate ${pinned ? 'pinned' : ''}" data-number="${esc(candidate.number)}">
    <div class="rank" title="Colocação geral por votos">${candidate.rank ? candidate.rank + 'º' : '—'}</div>
    <img class="portrait" src="${esc(candidate.photo)}" alt="" loading="lazy" referrerpolicy="no-referrer">
    <div class="person"><div class="name">${esc(candidate.name)}</div><div class="details"><span>${esc(candidate.number)} · ${esc(candidate.party)}</span>${pinned ? '<span class="pin">Fixado</span>' : ''}${candidate.status ? `<span class="status-label">${esc(candidate.status)}</span>` : candidate.elected ? '<span class="status-label">Eleito</span>' : ''}</div>${partyPosition||federationPosition ? `<div class="party-positions">${partyPosition}${federationPosition}</div>` : ''}${seats}</div>
    <div class="numbers"><div class="votes">${integer.format(candidate.votes)}</div><div class="percent">${decimal.format(candidate.percent)}%</div></div></div>`;
}
function renderSeats(race) {
  if (!race?.seatGroups) return '';
  const elected=race.candidates.filter(candidate=>candidate.elected).length;
  return `<div class="seats-summary"><span>Eleitos indicados pelo TSE</span><strong>${elected}${race.totalSeats!=null ? ` / ${integer.format(race.totalSeats)}` : ''}</strong></div><details class="seats-details"><summary>Vagas por partido / federação</summary><table class="seats-table"><thead><tr><th>Partido / fed.</th><th>${race.finished ? 'Vagas TSE' : 'Vagas parciais'}</th><th>Eleitos TSE</th></tr></thead><tbody>${race.seatGroups.map(group=>`<tr><th scope="row" title="${esc(group.name)}">${esc(group.label)}${group.federation ? '<small>Federação</small>' : ''}</th><td>${group.seats==null ? '—' : integer.format(group.seats)}</td><td>${integer.format(group.elected)}</td></tr>`).join('')}</tbody></table><p class="seats-note">${race.finished ? 'Situação informada pelo TSE.' : 'Vagas na parcial podem mudar. Eleitos: somente candidatos já marcados pelo TSE.'}</p></details>`;
}
function renderRace(id) {
  const race = races[id];
  const top = ['1','6','7'].includes(id);
  const pins = settings.pins[id];
  const pinned = race?.candidates.filter(c => pins.includes(c.number)) || [];
  const hasVotes = race && (race.totalVotes > 0 || race.candidates.some(c => c.votes > 0));
  const leaders = top && hasVotes ? race.candidates.slice(0,5) : [];
  const selected = top ? [...pinned, ...leaders.filter(c => !pins.includes(c.number))] : pinned;
  const scope = id === '1' ? (settings.president === 'br' ? 'Brasil' : 'Ceará') : 'Ceará';
  let message = errors[id] ? `<div class="race-message race-error">${esc(errors[id])}${race ? ' Exibindo a última consulta bem-sucedida.' : ''}</div>` : '';
  if (race && !hasVotes && !errors[id]) message += '<div class="race-message">Aguardando os primeiros votos do TSE</div>';
  const empty = !race ? (errors[id] ? 'Aguardando dados oficiais para este turno.' : busy ? 'Consultando dados oficiais...' : 'Dados indisponíveis neste momento.') : top && !hasVotes ? 'Os cinco mais votados aparecerão com o início da apuração.' : 'Nenhum candidato fixado.';
  return `<section class="race" data-id="${id}" style="--accent:${colors[id]}">
    <div class="race-head"><div><h2>${titles[id]}</h2><div class="race-sub">${scope} · ${top ? '5 mais votados' : 'Candidatos fixados'}</div></div>
    <div class="race-actions">${id === '1' ? `<select id="president-scope" aria-label="Abrangência de presidente"><option value="br" ${settings.president === 'br' ? 'selected' : ''}>Brasil</option><option value="ce" ${settings.president === 'ce' ? 'selected' : ''}>Ceará</option></select>` : ''}<button class="select-button" data-pick="${id}" ${!race ? 'disabled' : ''} title="Selecionar candidatos fixados">Selecionar</button></div></div>
    <div class="progress-line"><span>${race?.finished ? 'Apuração encerrada' : 'Seções totalizadas'}</span><strong>${race ? decimal.format(race.sectionPercent) + '%' : '—'}</strong></div>
    <div class="progress"><span style="width:${race ? Math.min(100, Math.max(0,race.sectionPercent)) : 0}%"></span></div>${message}
    <div class="list">${selected.map(c => row(c, pins.includes(c.number))).join('')}${(!selected.length || top && !hasVotes) ? `<div class="empty">${empty}</div>` : ''}</div>
    <div class="metrics"><div class="metric"><span>Votos brancos</span><strong>${race ? integer.format(race.whiteVotes) : '—'} <small>${race ? decimal.format(race.whitePercent) + '%' : ''}</small></strong></div><div class="metric"><span>Votos nulos</span><strong>${race ? integer.format(race.nullVotes) : '—'} <small>${race ? decimal.format(race.nullPercent) + '%' : ''}</small></strong></div></div>
    ${['6','7'].includes(id) ? renderSeats(race) : ''}
    <div class="timestamps">${race ? `${integer.format(race.sections)} de ${integer.format(race.totalSections)} seções · <a href="${esc(race.source)}" target="_blank" rel="noopener noreferrer">Fonte TSE ↗</a><br>Arquivo TSE: ${esc(race.generated)}${race.totalized ? `<br>Totalização TSE: ${esc(race.totalized)}` : ''}` : 'Aguardando publicação do TSE'}</div></section>`;
}
function render() {
  const openSeats = new Set([...document.querySelectorAll('.race')].filter(section=>section.querySelector('.seats-details')?.open).map(section=>section.dataset.id));
  $('dashboard').innerHTML = ['1','3','5','6','7'].map(renderRace).join('');
  document.querySelectorAll('.race').forEach(section=>{const details=section.querySelector('.seats-details');if(details)details.open=openSeats.has(section.dataset.id);});
  document.querySelectorAll('img.portrait').forEach(img => img.addEventListener('error', () => {img.removeAttribute('src'); img.style.visibility = 'hidden';}, {once:true}));
  document.querySelectorAll('[data-pick]').forEach(button => button.addEventListener('click', () => openPicker(button.dataset.pick)));
  $('president-scope').addEventListener('change', e => {settings.president = e.target.value; resetQuery('1');});
  renderOverview();
  renderBench();
  if(settings.page==='benches'&&nationalMode())loadNationalBench();
}
function updateMainView() {
  const benches=settings.page==='benches';
  $('results-panel').hidden=benches;$('benches-panel').hidden=!benches;
  $('results-tab').setAttribute('aria-selected',String(!benches));$('benches-tab').setAttribute('aria-selected',String(benches));
  for(const mode of ['federal-br','state-ce','federal-ce','senate-br'])$(mode+'-tab').setAttribute('aria-selected',String(settings.benchMode===mode));
  $('bench-section').setAttribute('aria-labelledby',settings.benchMode+'-tab');
  hideStatePreview();
  if(benches){renderBench();if(nationalMode())loadNationalBench();}
  else updateOverviewView();
}
async function loadNationalBench(force=false) {
  const cargo=settings.benchMode==='senate-br' ? '5' : '6',query=nationalQuery(cargo);
  if(query.busy||settings.page!=='benches'||!nationalMode()||!force&&Date.now()-query.requestedAt<11000)return;
  query.busy=true;query.requestedAt=Date.now();query.error='';
  const request=new AbortController(),turn=settings.turn,requestEpoch=epoch;
  query.controller=request;
  const timeout=setTimeout(()=>request.abort(),75000);
  renderBench();
  try {
    let data;
    if(directTSE)data=await TSEClient.benches(turn,request.signal,cargo);
    else {
      const response=await fetch(`/api/benches?turn=${turn}&cargo=${cargo}`,{signal:request.signal,cache:'no-store'});
      data=await response.json();
      if(!response.ok)throw new Error(data.error || 'Não foi possível consultar as UFs.');
    }
    if(requestEpoch!==epoch)return;
    if(data.error)throw new Error(data.error);
    query.data=data;
  } catch(error) {
    if(requestEpoch===epoch)query.error=error.name==='AbortError' ? 'A consulta nacional demorou demais. Tente atualizar novamente.' : error.message;
  } finally {
    clearTimeout(timeout);
    if(query.controller===request){query.busy=false;query.controller=null;}
    if(requestEpoch===epoch)renderBench();
  }
}
function renderBench() {
  if(settings.page!=='benches')return;
  const senate=settings.benchMode==='senate-br',national=nationalMode(),cargo=senate ? '5' : settings.benchMode==='state-ce' ? '7' : '6';
  const query=nationalQuery(cargo),nationalBench=query.data;
  const race=races[cargo],states=nationalBench?.states || [], model=senate ? Bancada.senate(states) : national ? Bancada.national(states) : Bancada.simulate(race);
  $('bench-title').textContent=senate ? 'Senado · Brasil' : national ? 'Câmara Federal · Brasil' : cargo==='7' ? 'Assembleia Legislativa · Ceará' : 'Bancada federal · Ceará';
  $('bench-note').textContent=senate ? 'Simulação dos dois primeiros por UF para as 54 vagas em disputa. Empates e critérios de elegibilidade não são resolvidos; não é uma lista oficial de eleitos. As 27 cadeiras em continuidade aparecem em cinza escuro, sem composição partidária representada. A legenda por partido considera apenas as vagas em disputa.' : 'Simulação por votação nominal dentro das vagas do partido ou federação informadas pelo TSE em cada UF. Não aplica critérios individuais de elegibilidade nem desempates; não é uma lista oficial de eleitos.';
  $('bench-svg').setAttribute('aria-label',$('bench-title').textContent);
  $('bench-svg').classList.toggle('bench-dense',national);
  const scrollTop=$('bench-detail').querySelector('.bench-candidates')?.scrollTop || 0;
  const warning=national ? query.error || (nationalBench?.errors.length ? `UFs sem atualização: ${nationalBench.errors.join(', ')}. Últimos dados recebidos mantidos; vagas sem dados aparecem em cinza.` : '') : errors[cargo];
  $('bench-warning').hidden=!warning;
  $('bench-warning').textContent=warning || '';
  if(!model) {
    $('bench-status').textContent='Simulação da distribuição de vagas';
    $('bench-svg').innerHTML='';$('bench-legend').innerHTML='';$('bench-count').textContent='';
    $('bench-detail').innerHTML='<p class="empty">Aguardando distribuição de vagas do TSE.</p>';return;
  }
  if(benchParty!==null&&!model.legend.some(item=>item.party===benchParty))benchParty=null;
  if(benchCandidate&&!model.seats.some(seat=>seat.candidate?.key===benchCandidate))benchCandidate=null;
  if(national) {
    const sections=states.reduce((sum,state)=>sum+state.sections,0),total=states.reduce((sum,state)=>sum+state.totalSections,0);
    $('bench-status').textContent=`${query.busy ? 'Consultando as UFs…' : 'Simulação parcial'} · ${states.length}/27 UFs · ${decimal.format(total ? 100*sections/total : 0)}% nas UFs recebidas${nationalBench?.checkedAt ? ` · Consulta: ${new Date(nationalBench.checkedAt).toLocaleTimeString('pt-BR')}` : ''}`;
  } else $('bench-status').textContent=`${race.finished ? 'Simulação com a totalização do TSE' : 'Simulação parcial'} · ${decimal.format(race.sectionPercent)}% apurado`;
  $('bench-count').textContent=senate ? '54 em disputa · 27 em continuidade' : `${model.total} cadeiras`;
  $('bench-svg').innerHTML=model.seats.map(seat=>{
    const candidate=seat.candidate,selected=candidate?.key===benchCandidate;
    const label=candidate ? `${candidate.name} · ${candidate.party} · ${candidate.uf} · ${integer.format(candidate.votes)} votos${candidate.elected ? ' · Eleito pelo TSE' : ' · Simulação'}${seat.tied ? ' · Empate na votação' : ''}` : seat.group;
    const pinned=candidate&&candidate.uf==='CE'&&settings.pins[cargo].includes(candidate.number);
    return `<g class="bench-seat ${selected?'selected':''}" data-seat="${seat.index}" tabindex="0" role="button" aria-label="${esc(label)}" opacity="${benchParty!==null&&seat.party!==benchParty ? '.18' : '1'}"><title>${esc(label)}</title><circle cx="${seat.x}" cy="${seat.y}" r="${model.radius}" fill="${seat.party ? Bancada.color(seat.party) : '#ccd4d0'}"/>${!national ? `<text x="${seat.x}" y="${seat.y+4}" text-anchor="middle">${esc(candidate?.number || '—')}</text>` : ''}${pinned ? `<circle class="bench-pin" cx="${seat.x+model.radius*.7}" cy="${seat.y-model.radius*.7}" r="${Math.min(5,model.radius*.35)}"/>` : ''}</g>`;
  }).join('');
  $('bench-legend').innerHTML=model.legend.map(item=>`<button class="bench-party ${benchParty===item.party?'active':''}" data-party="${esc(item.party)}" aria-pressed="${benchParty===item.party}"><i style="background:${item.color}"></i><span>${esc(item.label)}</span><strong>${item.seats}</strong></button>`).join('');
  const visible=model.seats.filter(seat=>seat.candidate&&(benchParty===null||seat.party===benchParty));
  const chosen=visible.find(seat=>seat.candidate.key===benchCandidate);
  $('bench-detail').innerHTML=`<div class="bench-detail-head"><h3>${esc(benchParty===null ? 'Candidatos na simulação' : benchParty || 'A definir')}</h3><span>${benchParty===null ? model.defined : model.legend.find(item=>item.party===benchParty).seats} cadeiras</span></div>${chosen ? `<div class="bench-selection"><strong>${esc(chosen.candidate.name)}</strong><span>${esc(chosen.candidate.number)} · ${esc(chosen.candidate.party)} · ${esc(chosen.candidate.uf)} · ${integer.format(chosen.candidate.votes)} votos</span><small>${chosen.candidate.elected ? 'Eleito indicado pelo TSE' : chosen.tied ? 'Votação empatada no limite das vagas' : 'Presença estimada pela votação nominal'}</small></div>` : ''}<div class="bench-candidates">${visible.map(seat=>`<button data-candidate="${esc(seat.candidate.key)}" class="bench-person ${benchCandidate===seat.candidate.key?'active':''}"><i style="background:${Bancada.color(seat.party)}"></i><span><strong>${esc(seat.candidate.name)}</strong><small>${esc(seat.party)} · ${esc(seat.candidate.uf)} · ${integer.format(seat.candidate.votes)} votos${seat.candidate.elected?' · Eleito TSE':''}${seat.tied?' · Empate':''}</small></span>${seat.candidate.uf==='CE'&&settings.pins[cargo].includes(seat.candidate.number)?'<small class="pin">Fixado</small>':''}</button>`).join('') || '<p class="empty">Aguardando candidatos para essas vagas.</p>'}</div>`;
  $('bench-legend').querySelectorAll('[data-party]').forEach(button=>button.addEventListener('click',()=>{benchParty=benchParty===button.dataset.party?null:button.dataset.party;benchCandidate=null;renderBench();}));
  const selectSeat=seat=>{benchCandidate=seat.candidate?.key || null;benchParty=seat.party;renderBench();};
  $('bench-svg').querySelectorAll('[data-seat]').forEach(element=>{
    element.addEventListener('click',()=>selectSeat(model.seats[Number(element.dataset.seat)]));
    element.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();selectSeat(model.seats[Number(element.dataset.seat)]);}});
  });
  $('bench-detail').querySelectorAll('[data-candidate]').forEach(button=>button.addEventListener('click',()=>{benchCandidate=button.dataset.candidate;renderBench();}));
  $('bench-detail').querySelector('.bench-candidates').scrollTop=scrollTop;
}
function renderOverview() {
  $('overview-scope').textContent = `Presidente · ${settings.turn}º turno · Seções totalizadas`;
  $('overview-error').hidden = !overviewError;
  $('overview-error').textContent = overviewError + (overview && overviewError ? ' Exibindo o último resumo recebido.' : '');
  if (!overview) {
    $('national').innerHTML = `<div class="empty">${overviewError ? 'Aguardando dados oficiais para este turno.' : busy ? 'Consultando apuração por estado...' : 'Resumo indisponível neste momento.'}</div>`;
    $('states').innerHTML = ''; $('overview-time').textContent = ''; $('brazil-map').innerHTML = ''; $('map-regions').innerHTML = ''; return;
  }
  const total = overview.national;
  const bar = percent => Math.min(100,Math.max(0,percent));
  $('overview-time').innerHTML = `Arquivo TSE: ${esc(overview.generated)} · <a href="${esc(overview.source)}" target="_blank" rel="noopener noreferrer">Fonte TSE ↗</a>`;
  $('national').innerHTML = `<div class="national-summary"><strong>Brasil</strong><span>${integer.format(total.sections)} <span class="national-denominator">de ${integer.format(total.totalSections)} seções</span></span><strong class="national-percent">${decimal.format(total.percent)}%</strong><div class="national-bar" role="progressbar" aria-label="Apuração do Brasil" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${bar(total.percent)}"><span style="width:${bar(total.percent)}%"></span></div></div>`;
  const groups = ApuracaoGeo.group(overview.states);
  $('states').innerHTML = groups.filter(group=>group.states.length).map(group=>`<section class="region-group" style="--region-color:${group.color}"><div class="region-head"><div><h3>${group.name}</h3><span>${integer.format(group.sections)} de ${integer.format(group.totalSections)} seções</span></div><strong>${decimal.format(group.percent)}%</strong></div><table class="state-table"><thead><tr><th scope="col">Estado / UF</th><th scope="col">Seções</th><th scope="col">Apurado</th></tr></thead><tbody>${group.states.map(state=>`<tr class="${state.uf==='CE'?'ce-state':''}" data-uf="${state.uf}"><th scope="row"><button class="state-name" data-state="${state.uf}" aria-label="Presidente em ${esc(state.name)}"><span class="uf-code">${state.uf}</span>${esc(state.name)}</button></th><td>${integer.format(state.sections)}<small>de ${integer.format(state.totalSections)}</small></td><td><strong>${decimal.format(state.percent)}%</strong><div class="state-bar"><span style="width:${bar(state.percent)}%"></span></div></td></tr>`).join('')}</tbody></table></section>`).join('');
  bindStatePreviews($('states'));
  updateOverviewView();
}
function updateOverviewView() {
  const map = settings.view === 'map';
  $('region-view').hidden = map; $('map-view').hidden = !map;
  $('region-tab').setAttribute('aria-selected',String(!map)); $('map-tab').setAttribute('aria-selected',String(map));
  $('map-color').value = settings.mapColor;
  if (map && overview && settings.page==='results') ensureMap();
}
async function ensureMap() {
  if (mapGeometry) {drawMap(); return;}
  if (!mapPromise) mapPromise = fetch('./brasil-uf.geojson').then(response=>{
    if (!response.ok) throw new Error('Malha geográfica indisponível.');
    return response.json();
  }).then(data=>{
    // GeoJSON uses the opposite ring winding from D3's spherical convention.
    for (const feature of data.features) if (d3.geoArea(feature)>2*Math.PI) {
      const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
      polygons.forEach(polygon=>polygon.forEach(ring=>ring.reverse()));
    }
    mapGeometry = data;
  }).catch(error=>{
    $('map-error').hidden = false; $('map-error').textContent = error.message; mapPromise = null;
  });
  await mapPromise;
  if (mapGeometry && overview && settings.view === 'map') drawMap();
}
function drawMap() {
  const progressColor = d3.scaleLinear().domain([0,5,25,50,100]).range(['#eaf2ee','#b9dcc8','#72b798','#388563','#15503a']).clamp(true);
  const projection = d3.geoMercator().fitExtent([[30,18],[600,595]],mapGeometry);
  const path = d3.geoPath(projection);
  const svg = d3.select('#brazil-map');
  svg.selectAll('*').remove();
  const stateByUf = new Map(overview.states.map(state=>[state.uf,state]));
  for (const feature of mapGeometry.features) {
    const uf = ApuracaoGeo.ibge[feature.properties.codarea], state = stateByUf.get(uf);
    const region = ApuracaoGeo.regionFor(uf);
    const fill = settings.mapColor === 'region' ? region.color : state ? progressColor(state.percent) : '#e4e8e6';
    const group = svg.append('g').attr('opacity',focusedRegion && region.name!==focusedRegion ? .25 : 1);
    group.append('path').attr('d',path(feature)).attr('class','map-state'+(uf==='CE'?' map-ce':''))
      .attr('fill',fill).attr('data-state',uf).attr('role','button').attr('tabindex',0)
      .attr('aria-label',`Presidente em ${state?.name||uf}, ${state?decimal.format(state.percent):'0'}% apurado`);
    const point = projection(d3.geoCentroid(feature));
    const offsets = {RN:[33,-7],PB:[45,1],PE:[45,16],AL:[43,24],SE:[33,30],ES:[25,0],RJ:[20,14],DF:[24,-13]};
    const offset = offsets[uf] || [0,0];
    if (offsets[uf]) group.append('line').attr('x1',point[0]).attr('y1',point[1]).attr('x2',point[0]+offset[0]).attr('y2',point[1]+offset[1]).attr('class','map-callout');
    group.append('text').attr('x',point[0]+offset[0]).attr('y',point[1]+offset[1]).attr('class','map-label').attr('data-state',uf).attr('text-anchor','middle').text(uf);
  }
  bindStatePreviews($('brazil-map'));
  $('map-legend').innerHTML = settings.mapColor==='region' ? ApuracaoGeo.regions.filter(r=>r.name!=='Exterior').map(r=>`<span><i style="background:${r.color}"></i>${r.name}</span>`).join('') : [0,5,25,50,100].map(n=>`<span><i style="background:${progressColor(n)}"></i>${n}%</span>`).join('');
  const groups = ApuracaoGeo.group(overview.states);
  $('map-regions').innerHTML = groups.map(group=>`<section class="map-region" style="--region-color:${group.color}"><button class="region-filter ${focusedRegion===group.name?'active':''}" data-region="${group.name}" aria-pressed="${focusedRegion===group.name}"><span><i style="background:${group.color}"></i>${group.name}</span><strong>${decimal.format(group.percent)}%</strong></button><div class="map-state-list">${group.states.map(state=>`<button data-state="${state.uf}" class="${state.uf==='CE'?'ce-state':''}" aria-label="Presidente em ${esc(state.name)}"><span>${state.uf}</span><strong>${decimal.format(state.percent)}%</strong></button>`).join('')}</div></section>`).join('');
  $('map-regions').querySelectorAll('[data-region]').forEach(button=>button.addEventListener('click',()=>{focusedRegion=focusedRegion===button.dataset.region?null:button.dataset.region; drawMap();}));
  bindStatePreviews($('map-regions'));
}
function bindStatePreviews(container) {
  container.querySelectorAll('[data-state]').forEach(element=>{
    element.classList.toggle('state-selected',element.dataset.state===previewUf);
    element.addEventListener('pointerenter',event=>{
      if (event.pointerType==='touch') return;
      clearTimeout(previewCloseTimer);
      clearTimeout(previewTimer);
      previewTimer=setTimeout(()=>openStatePreview(element.dataset.state),220);
    });
    element.addEventListener('pointerleave',event=>{
      clearTimeout(previewTimer);
      if (event.pointerType!=='touch') schedulePreviewClose();
    });
    element.addEventListener('focus',()=>openStatePreview(element.dataset.state));
    element.addEventListener('blur',schedulePreviewClose);
    element.addEventListener('click',()=>openStatePreview(element.dataset.state));
    if (element.tagName.toLowerCase()==='path') element.addEventListener('keydown',event=>{if (event.key==='Enter'||event.key===' ') {event.preventDefault();openStatePreview(element.dataset.state);}});
  });
}
function schedulePreviewClose() {
  clearTimeout(previewCloseTimer);
  previewCloseTimer=setTimeout(hideStatePreview,1000);
}
function hideStatePreview() {
  clearTimeout(previewTimer); clearTimeout(previewCloseTimer); previewRequest?.abort();
  previewUf=null; $('state-preview').hidden=true;
  document.querySelectorAll('.state-selected').forEach(element=>element.classList.remove('state-selected'));
}
function openStatePreview(uf) {
  clearTimeout(previewTimer); clearTimeout(previewCloseTimer);
  const state=overview?.states.find(state=>state.uf===uf);
  if (!state) return;
  if (previewUf===uf&&!$('state-preview').hidden) return;
  if (previewUf!==uf) previewRequest?.abort();
  previewUf=uf; $('preview-title').textContent=`${state.name} (${uf})`; $('state-preview').hidden=false;
  document.querySelectorAll('[data-state]').forEach(element=>element.classList.toggle('state-selected',element.dataset.state===uf));
  const key=settings.turn+':'+uf, cached=previewCache.get(key);
  if (cached) paintStatePreview(cached.data); else $('preview-content').innerHTML='<p class="preview-loading">Consultando os três líderes...</p>';
  if (!cached||Date.now()-cached.time>=11000) loadStatePreview(uf);
}
async function loadStatePreview(uf) {
  previewRequest?.abort();
  const request=new AbortController(); previewRequest=request;
  const turn=settings.turn, key=turn+':'+uf, timeout=setTimeout(()=>request.abort(),12000);
  try {
    let data;
    if (directTSE) data=await TSEClient.state(turn,uf.toLowerCase(),request.signal);
    else {
      const response=await fetch(`/api/state?uf=${uf.toLowerCase()}&turn=${turn}`,{signal:request.signal,cache:'no-store'});
      data=await response.json();
      if (!response.ok||data.error) throw new Error(data.error||'Dados indisponíveis.');
    }
    previewCache.set(key,{data,time:Date.now()});
    if (previewUf===uf&&settings.turn===turn) paintStatePreview(data);
  } catch(error) {
    if (previewUf===uf&&settings.turn===turn&&previewRequest===request) $('preview-content').innerHTML=`<p class="preview-loading">${esc(error.name==='AbortError'?'Consulta interrompida. Tente novamente.':error.message)}</p>`;
  } finally {clearTimeout(timeout);}
}
function paintStatePreview(data) {
  $('preview-content').innerHTML=`<div class="preview-sub">Presidente · ${esc(data.turn)}º turno <strong>${decimal.format(data.sectionPercent)}% apurado</strong></div>${data.leaders.length?data.leaders.map((candidate,index)=>`<div class="preview-candidate"><span class="preview-rank">${index+1}º</span><div><strong>${esc(candidate.name)}</strong><small>${esc(candidate.number)} · ${esc(candidate.party)}</small></div><div class="preview-votes"><strong>${integer.format(candidate.votes)}</strong><small>${decimal.format(candidate.percent)}%</small></div></div>`).join(''):'<p class="preview-loading">Aguardando os primeiros votos.</p>'}<p class="preview-time">Arquivo TSE: ${esc(data.generated)} · <a href="${esc(data.source)}" target="_blank" rel="noopener noreferrer">Fonte ↗</a></p>`;
}
function resetQuery(id) {
  save(); epoch++; controller?.abort(); busy = false;
  if (id) {delete races[id]; delete errors[id];} else {hideStatePreview();previewCache.clear();for(const query of nationalQueries.values())query.controller?.abort();nationalQueries.clear();benchParty=null;benchCandidate=null;races = {}; errors = {}; overview = null; overviewError = ''; consulted = null; $('checked').textContent = '';}
  render(); refresh();
}
async function refresh() {
  if (busy) return;
  busy = true;
  due = Date.now() + 11000;
  const requestEpoch = epoch;
  controller = new AbortController();
  const thisController = controller;
  const timeout = setTimeout(() => thisController.abort(), 25000);
  $('refresh').disabled = true; $('refresh').innerHTML = '<span aria-hidden="true">↻</span> Consultando...';
  $('connection').textContent = 'Consultando o TSE...';
  if (!Object.keys(races).length) render();
  try {
    let data;
    if (directTSE) data = await TSEClient.results(settings.turn,settings.president,thisController.signal);
    else {
      const response = await fetch(`/api/results?turn=${settings.turn}&president=${settings.president}`, {cache:'no-store', signal:thisController.signal});
      data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível atualizar.');
    }
    if (requestEpoch !== epoch) return;
    errors = {};
    for (const race of data.races) {
      if (race.error) errors[race.id] = race.error;
      else races[race.id] = race;
    }
    overviewError = data.overview?.error || '';
    if (data.overview?.national) overview = data.overview;
    consulted = data.checkedAt;
    const failed = Object.keys(errors).length;
    $('connection').textContent = failed || overviewError ? 'Alguns dados indisponíveis' : 'Conectado ao TSE';
    $('connection').classList.toggle('bad', failed > 0 || Boolean(overviewError));
    $('error').hidden = true;
    $('checked').textContent = 'Consulta: ' + new Date(consulted).toLocaleTimeString('pt-BR');
    render();
    if (previewUf) loadStatePreview(previewUf);
  } catch (error) {
    if (requestEpoch !== epoch) return;
    $('error').textContent = (error.name === 'AbortError' ? 'A consulta demorou demais. Tente atualizar novamente.' : error.message) + (Object.keys(races).length ? ' Exibindo os últimos resultados recebidos; eles podem estar desatualizados.' : '');
    $('error').hidden = false;
    $('connection').textContent = 'Falha na atualização'; $('connection').classList.add('bad');
  } finally {
    clearTimeout(timeout);
    if (requestEpoch === epoch) {
      busy = false;
      $('refresh').disabled = false; $('refresh').innerHTML = '<span aria-hidden="true">↻</span> Atualizar agora';
      if (!Object.keys(races).length) render();
    }
  }
}
function openPicker(id) {
  pickerId = id; draftPins = new Set(settings.pins[id]);
  $('picker-title').textContent = titles[id] + ': fixados';
  $('search').value = ''; renderChoices(); $('picker').showModal(); $('search').focus();
}
const fold = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function renderChoices() {
  const search = fold($('search').value.trim());
  const candidates = races[pickerId].candidates.filter(c => fold(c.name + ' ' + c.number + ' ' + c.party).includes(search));
  $('choices').innerHTML = candidates.map(c => `<label class="choice"><input type="checkbox" value="${esc(c.number)}" ${draftPins.has(c.number) ? 'checked' : ''}><span class="choice-text"><strong>${esc(c.name)}</strong><small>${esc(c.number)} · ${esc(c.party)}</small></span><span>${integer.format(c.votes)}</span></label>`).join('') || '<div class="empty">Nenhum candidato encontrado.</div>';
  $('choices').querySelectorAll('input').forEach(input => input.addEventListener('change', () => {if (input.checked) draftPins.add(input.value); else draftPins.delete(input.value);}));
}
$('auto').checked = settings.auto; $('turn').value = settings.turn;
$('refresh').addEventListener('click',()=>{refresh();if(settings.page==='benches'&&nationalMode())loadNationalBench(true);});
$('auto').addEventListener('change', () => {settings.auto = $('auto').checked; due = Date.now() + 11000; save(); tick();});
$('turn').addEventListener('change', () => {settings.turn = $('turn').value; resetQuery();});
$('search').addEventListener('input', renderChoices);
$('close-picker').addEventListener('click', () => $('picker').close());
$('save-picker').addEventListener('click', () => {settings.pins[pickerId] = [...draftPins]; save(); $('picker').close(); render();});
$('region-tab').addEventListener('click',()=>{settings.view='regions';save();updateOverviewView();});
$('map-tab').addEventListener('click',()=>{settings.view='map';save();updateOverviewView();});
$('map-color').addEventListener('change',event=>{settings.mapColor=event.target.value;save();if(mapGeometry&&overview)drawMap();});
$('results-tab').addEventListener('click',()=>{settings.page='results';save();updateMainView();});
$('benches-tab').addEventListener('click',()=>{settings.page='benches';save();updateMainView();});
for(const mode of ['federal-br','state-ce','federal-ce','senate-br'])$(mode+'-tab').addEventListener('click',()=>{settings.benchMode=mode;benchParty=null;benchCandidate=null;save();updateMainView();});
$('close-preview').addEventListener('click',hideStatePreview);
$('state-preview').addEventListener('pointerenter',()=>clearTimeout(previewCloseTimer));
$('state-preview').addEventListener('pointerleave',event=>{if(event.pointerType!=='touch')schedulePreviewClose();});
$('state-preview').addEventListener('focusin',()=>clearTimeout(previewCloseTimer));
$('state-preview').addEventListener('focusout',event=>{if(!$('state-preview').contains(event.relatedTarget))schedulePreviewClose();});
document.addEventListener('keydown',event=>{if(event.key==='Escape')hideStatePreview();});
updateMainView();
function tick() {
  $('countdown').textContent = !settings.auto ? 'Atualização automática desligada' : busy ? 'Atualizando...' : `Próxima consulta em ${Math.max(0,Math.ceil((due-Date.now())/1000))}s`;
  if (settings.auto && !busy && Date.now() >= due) refresh();
}
setInterval(tick, 1000); render(); refresh(); tick();
