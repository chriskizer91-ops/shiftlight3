/* The career's bookkeeping: buying and fitting parts, class limits, rewards, reputation and
   tiers, repeat payouts, ghosts saved and loaded.  node test/career.mjs */
const store=new Map();globalThis.localStorage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
globalThis.btoa=s=>Buffer.from(s,'binary').toString('base64');globalThis.atob=s=>Buffer.from(s,'base64').toString('binary');
const {Career,EVENTS,TIER_REP}=await import('../src/game/career.js');
const {encodeGhost,decodeGhost,GhostRecorder}=await import('../src/game/ghost.js');
let fails=0;const check=(ok,name,info)=>{console.log((ok?'PASS ':'FAIL ')+name+'  '+info);if(!ok)fails++;};
const C=new Career();C.reset();
check(C.money===8000&&C.rep===0&&C.car().cls==='D','a new career: $8,000, no reputation, a class D car',`$${C.money}, rep ${C.rep}, ${C.car().cls} ${C.car().pi}`);
const ev=id=>EVENTS.find(e=>e.id===id);
check(!C.check(ev('c-race')).ok&&C.check(ev('d-race')).ok,'class C events are locked at the start',C.check(ev('c-race')).why);
/* spend: a turbo kit costs money and pushes the car into class C */
const before=C.money,r=C.fit('induction',1);
check(r.ok&&C.money===before-6500&&C.car().cls!=='D','buying a turbo kit costs $6,500 and lifts the class',`now $${C.money}, ${C.car().cls} ${C.car().pi}`);
check(!C.check(ev('d-race')).ok,'too fast for class D now',C.check(ev('d-race')).why);
check(C.fit('induction',0).ok&&C.money===before-6500&&C.owns('induction',1),'taking it off is free and you keep it',`$${C.money}`);
check(C.fit('induction',1).ok&&C.money===before-6500,'putting it back on costs nothing',`$${C.money}`);
C.fit('induction',0);
check(!C.fit('engine','gp').ok,'you cannot buy what you cannot afford',C.fit('engine','gp').msg);
/* results: a win pays in full once, then 40%; reputation is your best per event */
const m0=C.money,a1=C.award(ev('d-race'),1,{});const m1=C.money,a2=C.award(ev('d-race'),1,{});
check(a1.pay===3000&&a2.pay===1200&&C.rep===3,'a win pays $3,000, a repeat win $1,200, reputation counts once',`${a1.pay} then ${a2.pay}, rep ${C.rep}`);
C.award(ev('d-trial'),2,{best:63.1});C.award(ev('d-trial'),3,{best:66});
check(C.d.results['d-trial'].rank===2&&C.d.results['d-trial'].best===63.1,'a worse run keeps your best result and time',JSON.stringify(C.d.results['d-trial']));
const t=C.award(ev('d-drift'),1,{score:20000});
check(C.rep===8&&t.newTier==='C'&&C.tierOpen('C'),'enough reputation opens the next tier',`rep ${C.rep}, opened ${t.newTier}`);
/* it survives a reload */
const C2=new Career();check(C2.rep===8&&C2.money===C.money&&C2.d.results['d-race'].rank===1,'saved and loaded',`rep ${C2.rep}, $${C2.money}`);
/* ghosts round-trip through storage */
const rec=new GhostRecorder(),car={p:[0,0,0],q:[0,0,0,1],steer:0,wheels:[{ang:0}]};for(let i=0;i<200;i++){car.p=[i,0,i*.5];rec.add(i/20,car);}
const g=rec.take(10),g2=decodeGhost(JSON.parse(JSON.stringify(encodeGhost(g))));
check(g2.data.length===g.data.length&&Math.abs(g2.data[9*150]-150)<1e-4,'a ghost survives being saved',`${g2.data.length} floats`);
console.log(fails?fails+' FAILED':'all passed');process.exit(fails?1:0);
