const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
require('./geography.js');
const geo = globalThis.ApuracaoGeo;

test('all states and DF belong to exactly one region; exterior stays separate',()=>{
  const states = geo.regions.flatMap(region=>region.ufs);
  assert.equal(new Set(states).size,28);
  assert.equal(states.length,28);
  for (const uf of Object.values(geo.ibge)) assert.equal(states.filter(state=>state===uf).length,1);
  assert.equal(geo.regionFor('CE').name,'Nordeste');
  assert.equal(geo.regionFor('ZZ').name,'Exterior');
});
test('regional progress is weighted by sections, with states sorted descending',()=>{
  const norte = geo.group([
    {uf:'AC',sections:1,totalSections:10,percent:10},
    {uf:'RO',sections:50,totalSections:100,percent:50},
  ]).find(region=>region.name==='Norte');
  assert.deepEqual(norte.states.map(state=>state.uf),['RO','AC']);
  assert.equal(norte.percent,100*51/110);
});
test('IBGE geometry projects to a nonblank Brazil map with 27 valid state paths',()=>{
  const d3 = require('./d3.min.js');
  const data = JSON.parse(fs.readFileSync(__dirname+'/brasil-uf.geojson','utf8'));
  assert.equal(data.features.length,27);
  for (const feature of data.features) {
    assert.ok(geo.ibge[feature.properties.codarea]);
    if (d3.geoArea(feature)>2*Math.PI) {
      const polygons = feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.coordinates;
      polygons.forEach(polygon=>polygon.forEach(ring=>ring.reverse()));
    }
  }
  const projection=d3.geoMercator().fitExtent([[30,18],[600,595]],data);
  const path=d3.geoPath(projection);
  for (const feature of data.features) assert.ok(path(feature).length>100);
  const bounds=path.bounds(data);
  assert.ok(bounds[1][0]-bounds[0][0]>450);
  assert.ok(bounds[1][1]-bounds[0][1]>500);
});
