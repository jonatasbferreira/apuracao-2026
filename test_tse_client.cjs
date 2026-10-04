const {test} = require('node:test');
const assert = require('node:assert/strict');
const client = require('./tse-client.js');
test('deputy party ranks and federation ranks cover all members and tied votes',()=>{
  const cand = (n,vap)=>({n,nmu:n,vap});
  const data = {carg:[{cd:'6',agr:[{tp:'f',n:'101',nm:'Federacao teste',par:[
    {n:'13',sg:'PT',cand:[cand('1301',100),cand('1302',60),cand('1303',0)]},
    {n:'43',sg:'PV',cand:[cand('4301',100),cand('4302',80)]}
  ]},{tp:'i',par:[{n:'22',sg:'PL',cand:[cand('2201',200)]}]}]}],s:{},v:{}};
  const race = client.normalize(data,'6',{cycle:'ele2026',code:'6259'},'ce','sample.json');
  const byNumber = Object.fromEntries(race.candidates.map(c=>[c.number,c]));
  assert.equal(byNumber['1302'].partyRank,2);
  assert.equal(byNumber['1302'].federationRank,4);
  assert.equal(byNumber['4302'].federationRank,3);
  assert.equal(byNumber['1301'].federationRank,1);
  assert.equal(byNumber['4301'].federationRank,1);
  assert.equal(byNumber['2201'].partyRank,1);
  assert.equal(byNumber['2201'].federationRank,null);
  assert.equal(byNumber['1303'].partyRank,null);
  assert.equal(byNumber['1303'].federationRank,null);
  assert.equal(byNumber['1301'].federation,'Federacao teste');
  data.carg[0].cd='7';
  assert.equal(client.normalize(data,'7',{cycle:'ele2026',code:'6259'},'ce','sample.json').candidates.find(c=>c.number==='1302').partyRank,2);
});
test('browser parser ranks candidates and preserves white votes and totalized sections',()=>{
  const candidate = (n,vap,pvap)=>({n,nmu:'Pessoa '+n,vap,pvap});
  const data = {carg:[{cd:'1',agr:[{par:[{sg:'PT',cand:[candidate('13','10','50,00'),candidate('14','10','50,00'),candidate('15','0','0')]}]}]}],s:{st:'5',ts:'100',pst:'5,00',psa:'100,00'},v:{tv:'22',vb:'2',pvb:'9,09',tvn:'0',ptvn:'0'}};
  const race = client.normalize(data,'1',{cycle:'ele2026',code:'6257'},'ce','sample.json');
  assert.deepEqual(race.candidates.map(c=>c.rank),[1,1,null]);
  assert.equal(race.sectionPercent,5);
  assert.equal(race.whiteVotes,2);
  assert.equal(race.candidates[0].percent,50);
});
test('browser overview uses the national total and includes exterior',()=>{
  const item = (cdabr,st,ts,pst)=>({cdabr,s:{st,ts,pst,psa:'100'}});
  const overview = client.tracking({abr:[item('br','40','100','40'),item('ce','3','30','10'),item('zz','1','2','50')]},'tracking.json');
  assert.equal(overview.national.sections,40);
  assert.equal(overview.national.percent,40);
  assert.deepEqual(overview.states.map(s=>s.uf),['CE','ZZ']);
});
