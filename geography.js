/* Regional totals use section counts from a single TSE snapshot. */
globalThis.ApuracaoGeo = (() => {
  const regions = [
    {name:'Norte', color:'#277f72', ufs:['AC','AP','AM','PA','RO','RR','TO']},
    {name:'Nordeste', color:'#c59a35', ufs:['AL','BA','CE','MA','PB','PE','PI','RN','SE']},
    {name:'Centro-Oeste', color:'#96719a', ufs:['DF','GO','MT','MS']},
    {name:'Sudeste', color:'#4484ad', ufs:['ES','MG','RJ','SP']},
    {name:'Sul', color:'#ca776d', ufs:['PR','RS','SC']},
    {name:'Exterior', color:'#85918b', ufs:['ZZ']},
  ];
  const ibge = {'11':'RO','12':'AC','13':'AM','14':'RR','15':'PA','16':'AP','17':'TO',
    '21':'MA','22':'PI','23':'CE','24':'RN','25':'PB','26':'PE','27':'AL','28':'SE','29':'BA',
    '31':'MG','32':'ES','33':'RJ','35':'SP','41':'PR','42':'SC','43':'RS','50':'MS','51':'MT','52':'GO','53':'DF'};
  function group(states) {
    return regions.map(region => {
      const rows = states.filter(state => region.ufs.includes(state.uf))
        .sort((a,b) => b.percent-a.percent || a.uf.localeCompare(b.uf));
      const sections = rows.reduce((sum,state) => sum+state.sections,0);
      const totalSections = rows.reduce((sum,state) => sum+state.totalSections,0);
      return {...region, states:rows, sections, totalSections, percent:totalSections ? 100*sections/totalSections : 0};
    });
  }
  return Object.freeze({regions,ibge,group,regionFor:uf=>regions.find(region=>region.ufs.includes(uf))});
})();
