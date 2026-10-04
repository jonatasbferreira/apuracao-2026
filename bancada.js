(function(root) {
  const colors={PL:'#2476b5',PT:'#cf3546',PSB:'#d49b13',MDB:'#25815a',PSD:'#7162a5',PSOL:'#bd6b1c',REDE:'#3a9c88',PV:'#69932b',PCDOB:'#ac274b',PP:'#397e99','UNIÃO':'#3157a0',PRD:'#ad5786',SOLIDARIEDADE:'#c47a38',PDT:'#984537',REPUBLICANOS:'#578ca7',NOVO:'#bd5d20',PODE:'#71892e',CIDADANIA:'#b24987',PSDB:'#557dba',AVANTE:'#7471a0'};
  const fallback=['#326a79','#925a76','#638342','#a77432','#635a97','#327d69'];
  function color(party) {
    if(party==='__retained')return '#858d96';
    if(colors[party])return colors[party];
    return fallback[[...party].reduce((sum,c)=>sum+c.charCodeAt(0),0)%fallback.length];
  }
  function simulate(race) {
    if(!race || !Number.isInteger(race.totalSeats) || race.totalSeats<=0 || !Array.isArray(race.seatGroups))return null;
    const seats=[];
    for(const group of race.seatGroups) {
      const members=race.candidates.filter(c=>(group.parties || []).includes(c.party))
        .sort((a,b)=>Number(b.elected)-Number(a.elected)||b.votes-a.votes||a.name.localeCompare(b.name)||a.number.localeCompare(b.number));
      const count=Number.isInteger(group.seats)&&group.seats>0 ? group.seats : 0;
      for(let index=0;index<count && seats.length<race.totalSeats;index++) {
        const candidate=members[index];
        const tied=candidate && !candidate.elected && members[count]?.votes===candidate.votes;
        seats.push({candidate:candidate?.votes>0 ? {...candidate,uf:race.uf || 'CE',key:`${race.uf || 'CE'}:${candidate.number}`,cargo:race.id || '6'} : null,party:candidate?.votes>0 ? candidate.party : '',group:group.label,tied:Boolean(tied)});
      }
    }
    while(seats.length<race.totalSeats)seats.push({candidate:null,party:'',group:'Aguardando distribuição',tied:false});
    return compose(seats,race.totalSeats);
  }
  function compose(seats,total) {
    seats.sort((a,b)=>a.party.localeCompare(b.party)||a.group.localeCompare(b.group)||(b.candidate?.votes || 0)-(a.candidate?.votes || 0));
    const legend=new Map();
    for(const seat of seats) {
      if(!legend.has(seat.party))legend.set(seat.party,{party:seat.party,label:seat.party==='__retained' ? 'Fora da disputa' : seat.party || 'A definir',color:seat.party ? color(seat.party) : '#ccd4d0',seats:0,elected:0});
      const item=legend.get(seat.party);item.seats++;item.elected+=Number(Boolean(seat.candidate?.elected));
    }
    let rows,radii;
    if(total<=24) {
      rows=[Math.round(total*.2),Math.round(total*.32)];rows.push(total-rows[0]-rows[1]);
      radii=[130,194,258];
    } else {
      const rowCount=Math.ceil(Math.sqrt(total/5));
      radii=Array.from({length:rowCount},(_,i)=>100+158*i/(rowCount-1));
      const sum=radii.reduce((a,b)=>a+b,0), targets=radii.map(radius=>total*radius/sum);
      rows=targets.map(Math.floor);
      const remainder=targets.map((value,index)=>({index,fraction:value-rows[index]})).sort((a,b)=>b.fraction-a.fraction);
      for(let i=0,left=total-rows.reduce((a,b)=>a+b,0);i<left;i++)rows[remainder[i].index]++;
    }
    const positions=rows.flatMap((count,row)=>Array.from({length:count},(_,index)=>{
      const angle=count===1 ? Math.PI/2 : Math.PI*index/(count-1), radius=radii[row];
      return {angle,radius,x:320-radius*Math.cos(angle),y:290-radius*Math.sin(angle)};
    })).sort((a,b)=>a.angle-b.angle||a.radius-b.radius);
    const spacing=Math.min(...rows.map((count,index)=>count>1 ? 2*radii[index]*Math.sin(Math.PI/(2*(count-1))) : Infinity),...radii.slice(1).map((r,index)=>r-radii[index]));
    return {seats:seats.map((seat,index)=>({...seat,...positions[index],index})),legend:[...legend.values()].sort((a,b)=>b.seats-a.seats||a.label.localeCompare(b.label)),total,radius:Math.min(21,spacing*.4),defined:seats.filter(s=>s.candidate).length};
  }
  function national(states) {
    // Federal seats are allocated within each UF, never by a national vote ranking.
    const seats=states.flatMap(state=>simulate(state)?.seats || []).slice(0,513);
    while(seats.length<513)seats.push({candidate:null,party:'',group:'UF com dados pendentes',tied:false});
    return compose(seats,513);
  }
  function senate(states) {
    const seats=[],seen=new Set();
    for(const state of states) {
      if(!state.uf || ['BR','ZZ'].includes(state.uf) || seen.has(state.uf) || seen.size>=27)continue;
      seen.add(state.uf);
      const members=[...state.candidates].sort((a,b)=>Number(b.elected)-Number(a.elected)||b.votes-a.votes||a.name.localeCompare(b.name)||a.number.localeCompare(b.number));
      for(let index=0;index<2;index++) {
        const member=members[index],candidate=member?.votes>0 ? {...member,uf:state.uf,key:`${state.uf}:${member.number}`,cargo:'5'} : null;
        seats.push({candidate,party:candidate?.party || '',group:`Senado · ${state.uf}`,tied:Boolean(candidate&&!candidate.elected&&members[2]?.votes===candidate.votes)});
      }
    }
    while(seats.length<54)seats.push({candidate:null,party:'',group:'Vaga em disputa · dados pendentes',tied:false});
    for(let index=0;index<27;index++)seats.push({candidate:null,party:'__retained',group:'Mandato em continuidade · fora da disputa de 2026 · partido não representado',tied:false});
    return compose(seats,81);
  }
  const api={color,simulate,national,senate};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.Bancada=api;
})(typeof window!=='undefined' ? window : globalThis);
