const {test}=require('node:test');
const assert=require('node:assert/strict');
const {simulate,color}=require('./bancada.js');
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
