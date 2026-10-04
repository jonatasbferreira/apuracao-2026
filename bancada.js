(function(root) {
  const colors={PL:'#2476b5',PT:'#cf3546',PSB:'#d49b13',MDB:'#25815a',PSD:'#7162a5',PSOL:'#bd6b1c',REDE:'#3a9c88',PV:'#69932b',PCDOB:'#ac274b',PP:'#397e99','UNIÃO':'#3157a0',PRD:'#ad5786',SOLIDARIEDADE:'#c47a38',PDT:'#984537',REPUBLICANOS:'#578ca7',NOVO:'#bd5d20',PODE:'#71892e',CIDADANIA:'#b24987',PSDB:'#557dba',AVANTE:'#7471a0'};
  const fallback=['#326a79','#925a76','#638342','#a77432','#635a97','#327d69'];
  function color(party) {
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
        seats.push({candidate:candidate?.votes>0 ? candidate : null,party:candidate?.votes>0 ? candidate.party : '',group:group.label,tied:Boolean(tied)});
      }
    }
    while(seats.length<race.totalSeats)seats.push({candidate:null,party:'',group:'Aguardando distribuição',tied:false});
    seats.sort((a,b)=>a.party.localeCompare(b.party)||a.group.localeCompare(b.group)||(b.candidate?.votes || 0)-(a.candidate?.votes || 0));
    const legend=new Map();
    for(const seat of seats) {
      if(!legend.has(seat.party))legend.set(seat.party,{party:seat.party,label:seat.party || 'A definir',color:seat.party ? color(seat.party) : '#ccd4d0',seats:0,elected:0});
      const item=legend.get(seat.party);item.seats++;item.elected+=Number(Boolean(seat.candidate?.elected));
    }
    const rows=[Math.round(race.totalSeats*.2),Math.round(race.totalSeats*.32)];rows.push(race.totalSeats-rows[0]-rows[1]);
    const positions=rows.flatMap((count,row)=>Array.from({length:count},(_,index)=>{
      const angle=count===1 ? Math.PI/2 : Math.PI*index/(count-1), radius=130+row*64;
      return {angle,radius,x:320-radius*Math.cos(angle),y:290-radius*Math.sin(angle)};
    })).sort((a,b)=>a.angle-b.angle||a.radius-b.radius);
    return {seats:seats.map((seat,index)=>({...seat,...positions[index],index})),legend:[...legend.values()].sort((a,b)=>b.seats-a.seats||a.label.localeCompare(b.label)),total:race.totalSeats,defined:seats.filter(s=>s.candidate).length};
  }
  const api={color,simulate};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.Bancada=api;
})(typeof window!=='undefined' ? window : globalThis);
