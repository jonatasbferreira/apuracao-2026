(function(root) {
  const base = 'https://resultados.tse.jus.br/oficial/';
  const cargos = {'1':'Presidente','3':'Governador','5':'Senador','6':'Deputado federal','7':'Deputado estadual'};
  const names = {AC:'Acre',AL:'Alagoas',AM:'Amazonas',AP:'Amapá',BA:'Bahia',CE:'Ceará',DF:'Distrito Federal',ES:'Espírito Santo',GO:'Goiás',MA:'Maranhão',MG:'Minas Gerais',MS:'Mato Grosso do Sul',MT:'Mato Grosso',PA:'Pará',PB:'Paraíba',PE:'Pernambuco',PI:'Piauí',PR:'Paraná',RJ:'Rio de Janeiro',RN:'Rio Grande do Norte',RO:'Rondônia',RR:'Roraima',RS:'Rio Grande do Sul',SC:'Santa Catarina',SE:'Sergipe',SP:'São Paulo',TO:'Tocantins',ZZ:'Exterior',BR:'Brasil'};
  const number = value => Number(String(value || 0).replace(',','.'));
  const generated = data => `${data.dg || ''} ${data.hg || ''}`.trim();
  let catalog = null, catalogAt = 0;

  async function read(path, signal) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) abort();
    signal?.addEventListener('abort',abort,{once:true});
    const timeout = setTimeout(abort,10000);
    try {
      const response = await fetch(base+path+'?nocache='+Date.now(),{signal:controller.signal,credentials:'omit'});
      if (!response.ok) throw new Error(response.status===404 ? 'O TSE ainda não publicou estes dados.' : `TSE respondeu HTTP ${response.status}.`);
      return await response.json();
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort',abort);
    }
  }
  async function elections(turn, signal) {
    if (!catalog || Date.now()-catalogAt>=60000) {
      catalog = await read('comum/config/ele-c.json',signal);
      catalogAt = Date.now();
    }
    return (catalog.pl || []).filter(p=>p.c==='ele2026').flatMap(p=>(p.e || []).filter(e=>String(e.t)===turn).map(e=>({cycle:p.c,election:e})));
  }
  function match(entries, cargo) {
    const entry = entries.find(({election})=>(election.abr || []).some(a=>(a.cp || []).some(c=>String(c.cd)===cargo)));
    if (!entry) throw new Error('Este cargo ainda não tem dados publicados para este turno.');
    return {...entry,code:String(entry.election.cd)};
  }
  function resultPath(entry,cargo,uf) {
    return `${entry.cycle}/${entry.code}/dados/${uf}/${uf}-c${cargo.padStart(4,'0')}-e${entry.code.padStart(6,'0')}-u.json`;
  }
  function normalize(data,cargo,entry,uf,path) {
    if (!Array.isArray(data.carg) || !data.s || !data.v) throw new Error('Resposta incompleta do TSE.');
    const cargoData = data.carg.find(c=>String(c.cd)===cargo);
    const proportional = ['6','7'].includes(cargo);
    const candidates = data.carg.filter(c=>String(c.cd)===cargo).flatMap(c=>(c.agr || []).flatMap(g=>(g.par || []).flatMap(p=>(p.cand || []).map(c=>({
      number:String(c.n),name:c.nmu || c.nm || '',party:p.sg || '',votes:number(c.vap),percent:number(c.pvap),status:c.st || '',elected:c.e==='s',
      partyKey:String(p.n || p.sg || ''),federation:g.tp==='f' ? g.nm || '' : '',federationKey:g.tp==='f' ? String(g.n || g.nm || '') : '',
      groupSeats:proportional && g.vag!=null && g.vag!=='' ? number(g.vag) : null,seatsFinal:data.tf==='s',
      photo:/^\d+$/.test(String(c.sqcand || '')) ? `${base}${entry.cycle}/${entry.code}/fotos/${uf}/${c.sqcand}.jpeg` : ''
    })))));
    candidates.sort((a,b)=>b.votes-a.votes || a.name.localeCompare(b.name) || a.number.localeCompare(b.number));
    let last = null, rank = 0;
    candidates.forEach((c,index)=>{if(c.votes!==last){rank=index+1;last=c.votes;}c.rank=c.votes>0 ? rank : null;});
    if (['6','7'].includes(cargo)) {
      for (const [key,field] of [['partyKey','partyRank'],['federationKey','federationRank']]) {
        const groups = new Map();
        for (const candidate of candidates) {
          candidate[field]=null;
          if (!candidate[key]) continue;
          if (!groups.has(candidate[key])) groups.set(candidate[key],[]);
          groups.get(candidate[key]).push(candidate);
        }
        for (const members of groups.values()) {
          let last=null, rank=0;
          members.forEach((candidate,index)=>{
            if(candidate.votes!==last){rank=index+1;last=candidate.votes;}
            candidate[field]=candidate.votes>0 ? rank : null;
          });
        }
      }
    }
    const s = data.s, v = data.v;
    const seatGroups = proportional ? (cargoData?.agr || []).map(g=>({name:g.nm || g.com || '',label:g.com || (g.par || []).map(p=>p.sg).join(' / '),parties:(g.par || []).map(p=>p.sg || ''),federation:g.tp==='f',seats:g.vag!=null && g.vag!=='' ? number(g.vag) : null,elected:(g.par || []).reduce((sum,p)=>sum+(p.cand || []).filter(c=>c.e==='s').length,0)})).sort((a,b)=>(b.seats || 0)-(a.seats || 0) || a.label.localeCompare(b.label)) : undefined;
    return {id:cargo,name:cargos[cargo],uf:uf.toUpperCase(),candidates,seatGroups,totalSeats:proportional && cargoData?.nv!=null && cargoData.nv!=='' ? number(cargoData.nv) : null,source:base+path,generated:generated(data),totalized:`${data.dt || ''} ${data.ht || ''}`.trim(),generationId:data.idg,
      sections:number(s.st),totalSections:number(s.ts),sectionPercent:number(s.pst),totalVotes:number(v.tv),whiteVotes:number(v.vb),whitePercent:number(v.pvb),nullVotes:number(v.tvn),nullPercent:number(v.ptvn),finished:data.tf==='s'};
  }
  function tracking(data,path) {
    if (!Array.isArray(data.abr)) throw new Error('Resumo incompleto do TSE.');
    const rows = data.abr.filter(a=>names[String(a.cdabr).toUpperCase()]).map(a=>({uf:String(a.cdabr).toUpperCase(),name:names[String(a.cdabr).toUpperCase()],sections:number(a.s.st),totalSections:number(a.s.ts),percent:number(a.s.pst)}));
    const national = rows.find(r=>r.uf==='BR');
    if (!national) throw new Error('Resumo nacional indisponível.');
    return {national,states:rows.filter(r=>r.uf!=='BR').sort((a,b)=>a.uf.localeCompare(b.uf)),generated:generated(data),source:base+path};
  }
  async function results(turn,president,signal) {
    const entries = await elections(turn,signal);
    const racesPromise = Promise.all(Object.keys(cargos).map(async cargo=>{
      try {
        const entry = match(entries,cargo), uf = cargo==='1' ? president : 'ce';
        const path = resultPath(entry,cargo,uf);
        return normalize(await read(path,signal),cargo,entry,uf,path);
      } catch(error) {return {id:cargo,error:error.message};}
    }));
    const overviewPromise = (async()=>{
      try {
        const entry = match(entries,'1');
        const path = `${entry.cycle}/${entry.code}/dados/br/br-e${entry.code.padStart(6,'0')}-ab.json`;
        return tracking(await read(path,signal),path);
      } catch(error) {return {error:error.message};}
    })();
    const [races,overview] = await Promise.all([racesPromise,overviewPromise]);
    return {checkedAt:new Date().toISOString(),turn,races,overview};
  }
  async function state(turn,uf,signal) {
    const entry = match(await elections(turn,signal),'1');
    const path = resultPath(entry,'1',uf);
    const result = normalize(await read(path,signal),'1',entry,uf,path);
    const leaders = result.candidates.some(c=>c.votes>0) ? result.candidates.slice(0,3).map(({number,name,party,votes,percent})=>({number,name,party,votes,percent})) : [];
    return {uf:uf.toUpperCase(),name:names[uf.toUpperCase()],turn,sectionPercent:result.sectionPercent,generated:result.generated,source:result.source,checkedAt:new Date().toISOString(),leaders};
  }
  const api = {results,state,normalize,tracking};
  if (typeof module!=='undefined' && module.exports) module.exports=api;
  else root.TSEClient=api;
})(typeof window!=='undefined' ? window : globalThis);
