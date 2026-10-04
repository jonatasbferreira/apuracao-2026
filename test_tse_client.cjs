const {test} = require('node:test');
const assert = require('node:assert/strict');
const client = require('./tse-client.js');
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
