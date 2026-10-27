/* =====================================================================================
   CAREER — money, reputation, the parts you own, and the events.
   Five tiers by class (D up to S). Each tier has a race, a time trial, a drift event and a
   drag race; reputation from your best result in each (3 for a win or gold, 2, 1) opens the
   next tier. Your car must be in the event's class or below. Rivals in a race are built to
   the tier's reference car (with their own engines), so upgrading within the class helps.
   Saved in this browser.
   ===================================================================================== */
import {STOCK_SETUP,PARTS,ENGINE_PRICES,build,CLASSES} from './setup.js';

const KEY='shiftlight.career.v1';
/* the reference car for each class: rivals race it, medals and drag opponents are set by it */
export const REF={
  D:Object.assign({},STOCK_SETUP,{exhaust:2,intake:1,cams:1}),
  C:Object.assign({},STOCK_SETUP,{induction:1,exhaust:2,cams:1,tyres:1}),
  B:Object.assign({},STOCK_SETUP,{engine:'boxer',exhaust:1,tyres:1}),
  A:Object.assign({},STOCK_SETUP,{engine:'muscle',tyres:2,brakes:1,suspension:1}),
  S:Object.assign({},STOCK_SETUP,{engine:'v12',tyres:3,brakes:2,suspension:2,weight:2,aero:2})
};
export const TIER_REP={D:0,C:6,B:15,A:26,S:38};
const T=(id,cls,kind,name,o)=>Object.assign({id,cls,kind,name},o);
export const EVENTS=[
  T('d-race','D','race','Rookie Night',{place:'loop',laps:3,diff:'relaxed',env:'night',pay:[3000,1800,1000],blurb:'Five other first-timers, three laps, nothing to lose but the paint.'}),
  T('d-trial','D','trial','Clock In',{place:'loop',laps:5,env:'dusk',pay:[2400,1400,800],blurb:'Five laps alone with the clock. Your best one counts.'}),
  T('d-drift','D','drift','First Slide',{place:'loop',time:90,env:'night',pay:[2400,1400,800],blurb:'Ninety seconds. Angle and speed score, the wall takes it all away.'}),
  T('d-drag','D','drag','Quarter on Main',{place:'city',env:'night',pay:[2600,1500,800],blurb:'A quarter mile down Main Avenue with the side streets blocked off.'}),
  T('c-race','C','race','Club Night',{place:'loop',laps:3,diff:'racing',env:'rain',pay:[5000,3000,1600],blurb:'The club regulars, in the rain.'}),
  T('c-trial','C','trial','Sector Hunter',{place:'loop',laps:5,env:'night',pay:[4200,2500,1300],blurb:'Five flying laps on a cold night.'}),
  T('c-drift','C','drift','Wet Sideways',{place:'loop',time:90,env:'rain',pay:[4200,2500,1300],blurb:'Slides come easy on a wet road. So do walls.'}),
  T('c-drag','C','drag','Twelve-Second Club',{place:'city',env:'rain',pay:[4500,2700,1400],blurb:'Get off the line on wet tarmac.'}),
  T('b-race','B','race','Midnight Five',{place:'loop',laps:5,diff:'racing',env:'night',pay:[8000,4800,2600],blurb:'Five laps, and they know the line.'}),
  T('b-trial','B','trial','Golden Hour',{place:'loop',laps:5,env:'dusk',pay:[6800,4000,2100],blurb:'Low sun in your eyes on the back straight.'}),
  T('b-drift','B','drift','Tyre Smoke',{place:'loop',time:120,env:'night',pay:[6800,4000,2100],blurb:'Two minutes to fill the loop with smoke.'}),
  T('b-drag','B','drag','Main Street Eleven',{place:'city',env:'night',pay:[7200,4300,2300],blurb:'Eleven seconds is the number.'}),
  T('a-race','A','race','Hard Lap',{place:'loop',laps:5,diff:'hard',env:'rain',pay:[14000,8400,4500],blurb:'Fast cars, wet road, nobody lifting.'}),
  T('a-trial','A','trial','Redline Reflex',{place:'loop',laps:5,env:'night',pay:[11000,6600,3500],blurb:'Every corner, every lap.'}),
  T('a-drift','A','drift','Full Lock',{place:'loop',time:120,env:'dusk',pay:[11000,6600,3500],blurb:'A lot of horsepower, all of it sideways.'}),
  T('a-drag','A','drag','Ten-Second Street',{place:'city',env:'night',pay:[12000,7200,3800],blurb:'Run a ten and the street knows your name.'}),
  T('s-race','S','race','The Neon Crown',{place:'loop',laps:8,diff:'hard',env:'night',pay:[30000,18000,9000],blurb:'Eight laps. The best of them, all on the limit.'}),
  T('s-trial','S','trial','Ghost of the Loop',{place:'loop',laps:5,env:'rain',pay:[22000,13000,7000],blurb:'Chase the fastest lap anyone has driven here.'}),
  T('s-drift','S','drift','Smoke Show',{place:'loop',time:150,env:'night',pay:[22000,13000,7000],blurb:'Two and a half minutes of the biggest angles you have.'}),
  T('s-drag','S','drag','Top Fuel Main',{place:'city',env:'night',pay:[26000,15600,8000],blurb:'Single digits, or go home.'})
];
/* time trial medals (dry; the rain adds 7%), measured from the AI field in each class's reference car */
export const MEDAL_LAPS={D:[60.4,62.9,67.2],C:[58.0,61.0,64.6],B:[55.9,58.5,63.2],A:[52.9,56.2,59.9],S:[51.2,53.4,56.6]};
/* drift score targets for a 90 s run (longer runs scale up) */
export const DRIFT_TARGETS={D:[18000,10000,4000],C:[21000,12000,5000],B:[26000,15000,6500],A:[31000,18000,8000],S:[38000,22000,10000]};
/* how quick the drag opponent is off the line */
export const DRAG_RT={D:.32,C:.27,B:.22,A:.17,S:.12};
export const KIND_NAME={race:'Race',trial:'Time trial',drift:'Drift',drag:'Drag'};
export const MEDALS=['','GOLD','SILVER','BRONZE'];

export class Career{
  constructor(){this.load();}
  fresh(){return {v:1,money:8000,setup:JSON.parse(JSON.stringify(STOCK_SETUP)),owned:{engine:['street4'],...Object.fromEntries(Object.keys(PARTS).map(k=>[k,[STOCK_SETUP[k]]]))},results:{},ghosts:{},started:Date.now()};}
  load(){let d=null;try{d=JSON.parse(localStorage.getItem(KEY)||'null');}catch(e){}this.d=d&&d.v===1?d:this.fresh();this.exists=!!d;}
  save(){try{localStorage.setItem(KEY,JSON.stringify(this.d));this.exists=true;}catch(e){}}
  reset(){this.d=this.fresh();this.save();}
  get money(){return this.d.money;}
  get setup(){return this.d.setup;}
  get rep(){let r=0;for(const e of EVENTS){const x=this.d.results[e.id];if(x&&x.rank)r+=4-x.rank;}return r;}
  tierOpen(cls){return this.rep>=TIER_REP[cls];}
  car(){return build(this.d.setup);}
  /* can you enter this event with this car */
  check(ev){if(!this.tierOpen(ev.cls))return {ok:false,why:`Needs ${TIER_REP[ev.cls]} reputation (you have ${this.rep}).`};
    const b=this.car(),ci=CLASSES.findIndex(c=>c.id===b.cls),ei=CLASSES.findIndex(c=>c.id===ev.cls);
    if(ci>ei)return {ok:false,why:`Your car is class ${b.cls} (${b.pi}); this is for class ${ev.cls} and below. Change parts in the garage.`};
    return {ok:true};}
  owns(cat,i){if(!this.price(cat,i))return true;return cat==='engine'?this.d.owned.engine.includes(i):(this.d.owned[cat]||[]).includes(i);}
  price(cat,i){return cat==='engine'?ENGINE_PRICES[i]:PARTS[cat].opts[i].price;}
  /* buy (if needed) and fit; returns a message */
  fit(cat,i){
    if(!this.owns(cat,i)){const p=this.price(cat,i);if(p>this.d.money)return {ok:false,msg:`Not enough money: $${p.toLocaleString()} needed.`};
      this.d.money-=p;(cat==='engine'?this.d.owned.engine:(this.d.owned[cat]=this.d.owned[cat]||[])).push(i);}
    this.d.setup[cat]=i;this.save();return {ok:true};}
  tune(k,v){this.d.setup.tune=this.d.setup.tune||{};this.d.setup.tune[k]=v;this.save();}
  paint(id){this.d.setup.paint=id;this.save();}
  /* a result: rank 1-3 (or 0), plus whatever the mode measures; pays and records improvements */
  award(ev,rank,stat={}){
    const prev=this.d.results[ev.id]||{rank:0},first=!prev.rank||rank<prev.rank;
    const pay=rank?Math.round(ev.pay[rank-1]*(first?1:.4)/10)*10:Math.round(ev.pay[2]*.15/10)*10;
    this.d.money+=pay;
    const r=Object.assign({},prev,{runs:(prev.runs||0)+1});
    if(rank&&(!prev.rank||rank<prev.rank))r.rank=rank;
    for(const [k,v] of Object.entries(stat)){if(v===null||v===undefined)continue;const better=k==='score'?v>(prev[k]||0):!(prev[k]>0)||v<prev[k];if(better)r[k]=v;}
    const repBefore=this.rep;this.d.results[ev.id]=r;this.save();
    return {pay,first,repGain:this.rep-repBefore,newTier:Object.keys(TIER_REP).find(c=>TIER_REP[c]>repBefore&&TIER_REP[c]<=this.rep)};
  }
}

/* free play: the same garage, everything free, the car kept in the settings */
export class Sandbox{
  constructor(get,set){this.get=get;this.set=set;this.free=true;}
  get setup(){return this.get();}
  get money(){return Infinity;}
  get rep(){return undefined;}
  owns(){return true;}
  price(){return 0;}
  fit(cat,i){const s=this.get();s[cat]=i;this.set(s);return {ok:true};}
  tune(k,v){const s=this.get();s.tune=s.tune||{};s.tune[k]=v;this.set(s);}
  paint(id){const s=this.get();s.paint=id;this.set(s);}
  car(){return build(this.get());}
}
