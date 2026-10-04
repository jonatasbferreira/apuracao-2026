const {test}=require('node:test');
const assert=require('node:assert/strict');
const {simulate,color,national,senate}=require('./bancada.js');
const candidate=(number,party,votes,elected=false)=>({number,name:'Pessoa '+number,party,votes,elected});
test('federation seats are allocated jointly then colored by the selected candidates parties',()=>{
  const model=simulate({totalSeats:5,seatGroups:[{label:'PT / PV',parties:['PT','PV'],seats:3},{label:'PL',parties:['PL'],seats:2}],candidates:[
    candidate('1301','PT',100),candidate('4301','PV',90),candidate('1302','PT',80),candidate('4302','PV',70),candidate('2201','PL',200),candidate('2202','PL',50)]});
  assert.equal(model.seats.length,5);
  assert.equal(model.defined,5);
  assert.deepEqual(Object.fromEntries(model.legend.map(item=>[item.party,item.seats])),{PL:2,PT:2,PV:1});
  assert.equal(model.seats.some(seat=>seat.candidate.number==='4302'),false);
  assert.equal(new Set(model.seats.map(seat=>seat.candidate.number)).size,5);
  for(const seat of model.seats)assert.ok(Number.isFinite(seat.x)&&Number.isFinite(seat.y));
});
test('unallocated seats remain grey and zero-vote candidates are not projected',()=>{
  const model=simulate({totalSeats:3,seatGroups:[{label:'PL',parties:['PL'],seats:2}],candidates:[candidate('2201','PL',20),candidate('2202','PL',0)]});
  assert.equal(model.seats.length,3);
  assert.equal(model.defined,1);
  assert.equal(model.legend.find(item=>item.party==='').seats,2);
  assert.equal(simulate({totalSeats:null,seatGroups:[],candidates:[]}),null);
});
test('official elected candidates are retained and a tied cutoff is marked',()=>{
  const race={totalSeats:2,seatGroups:[{label:'PL',parties:['PL'],seats:2}],candidates:[candidate('2200','PL',1,true),candidate('2201','PL',10),candidate('2202','PL',10)]};
  const model=simulate(race);
  assert.equal(model.seats.find(seat=>seat.candidate.number==='2200').candidate.elected,true);
  assert.equal(model.seats.find(seat=>seat.candidate.number==='2201').tied,true);
  assert.equal(model.legend[0].elected,1);
  assert.equal(color('PL'),color('PL'));
  assert.notEqual(color('PL'),color('PT'));
});
test('22-seat geometry has sufficient spacing for desktop and mobile circles',()=>{
  const seats=simulate({totalSeats:22,seatGroups:[],candidates:[]}).seats;
  for(const a of seats) {
    assert.ok(a.x>=21&&a.x<=619&&a.y>=21&&a.y<=319);
    for(const b of seats)if(a.index!==b.index)assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>44);
  }
});
test('national simulation allocates seats in each UF and distinguishes repeated candidate numbers',()=>{
  const state=(uf,votes,party,seats)=>({id:'6',uf,totalSeats:2,seatGroups:[{label:party,parties:[party],seats}],candidates:[candidate('2201',party,votes),candidate('2202',party,votes-1)]});
  const model=national([state('CE',100,'PL',1),state('SP',1000000,'PL',2)]);
  assert.equal(model.total,513);
  assert.equal(model.seats.length,513);
  assert.equal(model.defined,3);
  assert.equal(model.legend.find(item=>item.party==='PL').seats,3);
  assert.equal(model.legend.find(item=>item.party==='').seats,510);
  assert.deepEqual(model.seats.filter(s=>s.candidate).map(s=>s.candidate.key).sort(),['CE:2201','SP:2201','SP:2202']);
  assert.equal(model.seats.filter(s=>s.candidate?.uf==='CE').length,1);
});
test('46-seat and 513-seat layouts contain exactly that many nonoverlapping circles',()=>{
  for(const total of [46,81,513]) {
    const model=simulate({totalSeats:total,seatGroups:[],candidates:[]});
    assert.equal(model.seats.length,total);
    assert.ok(model.radius>3);
    for(const a of model.seats) {
      assert.ok(a.x-model.radius>=0&&a.x+model.radius<=640&&a.y-model.radius>=0&&a.y+model.radius<=340);
      for(const b of model.seats)if(a.index!==b.index)assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>model.radius*2);
    }
  }
});
test('senate selects two per UF, never proportional party seats, and separates continuing mandates',()=>{
  const state=(uf,multiplier)=>({uf,seatGroups:[],candidates:[candidate('100','PT',100*multiplier),candidate('200','PL',90*multiplier),candidate('300','PSD',80*multiplier)]});
  const model=senate([state('CE',1),state('SP',1000),state('CE',1)]);
  assert.equal(model.total,81);
  assert.equal(model.defined,4);
  assert.equal(model.legend.find(item=>item.party==='__retained').seats,27);
  assert.equal(model.legend.find(item=>item.party==='').seats,50);
  assert.deepEqual(model.seats.filter(s=>s.candidate).map(s=>s.candidate.key).sort(),['CE:100','CE:200','SP:100','SP:200']);
  assert.ok(model.seats.filter(s=>s.candidate).every(s=>s.candidate.cargo==='5'));
});
test('senate preserves official winners, flags cutoff ties and leaves zero votes pending',()=>{
  const model=senate([{uf:'CE',candidates:[candidate('100','PT',10),candidate('200','PL',10),candidate('300','PSD',1,true)]},{uf:'SP',candidates:[candidate('100','PT',0)]}]);
  assert.equal(model.defined,2);
  assert.ok(model.seats.some(s=>s.candidate?.elected));
  assert.ok(model.seats.some(s=>s.tied));
  assert.equal(senate([]).legend.find(item=>item.party==='').seats,54);
});
