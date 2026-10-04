const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/app.js','utf8').split('let races =')[0];
const read=saved=>vm.runInNewContext(source+'; settings;',{
  location:{hostname:'example.github.io'},document:{getElementById:()=>null},
  localStorage:{getItem:()=>JSON.stringify(saved)},structuredClone,save:()=>{}
});
test('existing favorites get Wagner once, without replacing custom choices',()=>{
  const settings=read({pins:{'5':['400','180','999'],'6':['2277','1111']}});
  assert.deepEqual(Array.from(settings.pins['5']),['400','180','999','445']);
  assert.deepEqual(Array.from(settings.pins['6']),['2277','1111']);
  assert.equal(settings.pinsVersion,1);
});
test('removing Wagner after migration is respected on subsequent reloads',()=>{
  const settings=read({pinsVersion:1,pins:{'5':['400']}});
  assert.deepEqual(Array.from(settings.pins['5']),['400']);
});
test('fresh visitors see Wagner in senate favorites',()=>{
  assert.equal(read(null).pins['5'].includes('445'),true);
});
test('auto refresh defaults to enabled for fresh and older saved settings',()=>{
  assert.equal(read(null).auto,true);
  assert.equal(read({auto:false,pinsVersion:1}).auto,true);
  assert.equal(read({auto:true,pinsVersion:1}).auto,true);
  assert.equal(read(null).autoDefaultVersion,1);
});
test('a later explicit choice to disable auto refresh is preserved',()=>{
  assert.equal(read({auto:false,autoDefaultVersion:1,pinsVersion:1}).auto,false);
  assert.equal(read({autoDefaultVersion:1,pinsVersion:1}).auto,true);
});
test('main tab and chamber choice are restored with conservative defaults',()=>{
  assert.equal(read(null).page,'results');
  assert.equal(read(null).benchMode,'federal-br');
  const saved=read({page:'benches',benchMode:'state-ce'});
  assert.equal(saved.page,'benches');assert.equal(saved.benchMode,'state-ce');
  const invalid=read({page:'unknown',benchMode:'unknown'});
  assert.equal(invalid.page,'results');assert.equal(invalid.benchMode,'federal-br');
});
