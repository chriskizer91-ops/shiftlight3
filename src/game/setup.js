/* =====================================================================================
   SETUP — what's bolted to your car and how it's adjusted, and the car that makes.
   A setup is plain data (saved with the career): an engine from the Engine Lab, stages of
   exhaust, intake, cams and ECU, forced induction, nitrous, flywheel, gearbox, differential,
   drivetrain, tyres, brakes, suspension, weight reduction and aero, plus the tuning values.
   build(setup) turns it into the chassis and engine spec the Vehicle runs, and a
   performance index (an estimated Neon Loop lap, put on a 100-999 scale) with its class.
   ===================================================================================== */
import {SIM} from '../engine/engine-sim.js';
import {CHASSIS} from './cars.js';
import {buildTrack,speedProfile} from '../world/track.js';

const GEARS6=[3.13,2.1,1.58,1.25,1.03,.86],GEARS6C=[2.66,1.91,1.5,1.24,1.06,.92],GEARS6R=[2.9,2.1,1.66,1.37,1.16,1.0],GEARS7=[3.0,2.4,1.98,1.68,1.45,1.27,1.12];

/* engines you can buy (ids of the Engine Lab presets) */
export const ENGINE_PRICES={street4:0,oddv6:6500,rotary2:9500,three:9000,screamer:14500,boxer:13000,five:17500,rotary3:22000,eight:21000,muscle:19000,six:21000,
  v6tt:24000,flat6:28000,flatplane:34000,v10:40000,v12:52000,gp:95000,blown:58000};

/* each category: a list of options; index 0 is what the car came with unless noted */
export const PARTS={
  exhaust:{name:'Exhaust',opts:[{name:'Stock muffler',price:0},{name:'Cat-back',price:900,tq:.03},{name:'Headers and cat-back',price:2200,tq:.06},{name:'Straight pipe',price:3400,tq:.08,crackle:.3}]},
  intake:{name:'Intake',opts:[{name:'Stock airbox',price:0},{name:'Cold air',price:600,tq:.02},{name:'Ram air',price:1600,tq:.04},{name:'Individual throttle bodies',price:4200,tq:.06,resp:1}]},
  cams:{name:'Camshafts',opts:[{name:'Stock',price:0},{name:'Street cams',price:1300,tq:.03,red:250},{name:'Race cams',price:3200,tq:.06,red:600,cP:.06,idle:150},{name:'Wild cams',price:5600,tq:.09,red:900,cP:.1,cW:-.04,cA:-.06,idle:300}]},
  ecu:{name:'ECU',opts:[{name:'Stock map',price:0},{name:'Street map',price:800,tq:.03},{name:'Race map',price:2400,tq:.05,launch:1,limiter:'hard'},{name:'Race map, anti-lag',price:5400,tq:.05,launch:1,limiter:'hard',antilag:1,fiOnly:1}]},
  induction:{name:'Forced induction',opts:[{name:'As built',price:0},{name:'Small turbo kit',price:6500,fi:'turbo',boost:.8,tsize:0,naOnly:1},{name:'Big turbo kit',price:9800,fi:'turbo',boost:1.2,tsize:2,naOnly:1},
    {name:'Twin turbo kit',price:13500,fi:'twin',boost:1.0,tsize:0,naOnly:1},{name:'Roots blower',price:8800,fi:'roots',boost:.7,naOnly:1},{name:'Centrifugal blower',price:7200,fi:'cent',boost:.8,naOnly:1},
    {name:'Hybrid turbo upgrade',price:5200,boostAdd:.3,tsizeAdd:1,fiOnly:1}]},
  nitrous:{name:'Nitrous',opts:[{name:'None',price:0},{name:'35 shot',price:1500,nos:1},{name:'75 shot',price:2800,nos:2},{name:'125 shot',price:4500,nos:3},{name:'250 shot',price:8000,nos:4}]},
  flywheel:{name:'Flywheel',opts:[{name:'Stock',price:0},{name:'Lightweight',price:700,Ie:.75},{name:'Featherweight',price:1600,Ie:.55}]},
  gearbox:{name:'Gearbox',opts:[{name:'As built',price:0},{name:'Close-ratio six-speed',price:2400,gears:GEARS6C},{name:'Sequential six',price:5200,gears:GEARS6R,seq:1},{name:'Sequential seven',price:8200,gears:GEARS7,seq:1}]},
  diff:{name:'Differential',stock:1,opts:[{name:'Open',price:0,d:[0,0,0]},{name:'Street LSD',price:0,d:[40,.35,.15]},{name:'1.5-way clutch LSD',price:1500,d:[80,.5,.25],adj:1},{name:'2-way race LSD',price:2600,d:[120,.65,.5],adj:1},{name:'Welded',price:300,d:[2500,1,1]}]},
  drive:{name:'Drivetrain',opts:[{name:'Rear-wheel drive',price:0,drv:'RWD'},{name:'All-wheel-drive conversion',price:9500,drv:'AWD',kg:60}]},
  tyres:{name:'Tyres',stock:1,opts:[{name:'Street',price:400,t:{mu:1.06,kPk:.12,aPk:.15,slide:.8,slideW:.6,loadSens:.13,wet:1.02}},{name:'Sport',price:0,t:{mu:1.18,kPk:.11,aPk:.14,slide:.8,slideW:.6,loadSens:.12,wet:1}},
    {name:'Semi-slick',price:2200,t:{mu:1.31,kPk:.1,aPk:.125,slide:.76,slideW:.5,loadSens:.11,wet:.9}},{name:'Slick',price:4200,t:{mu:1.44,kPk:.095,aPk:.115,slide:.74,slideW:.45,loadSens:.1,wet:.68}},
    {name:'Drift',price:900,t:{mu:1.03,kPk:.12,aPk:.17,slide:.9,slideW:.95,loadSens:.12,wet:.98}}]},
  brakes:{name:'Brakes',opts:[{name:'Stock',price:0,b:5800},{name:'Sport pads and rotors',price:1400,b:7000},{name:'Six-piston race brakes',price:3600,b:8600}]},
  suspension:{name:'Suspension',opts:[{name:'Stock',price:0,k:1,arb:1,ride:0},{name:'Sport springs',price:1200,k:1.25,arb:1.3,ride:-.015},{name:'Coilovers',price:3600,k:1.4,arb:1.4,ride:-.02,adj:1}]},
  weight:{name:'Weight',opts:[{name:'Stock',price:0,kg:0},{name:'Stage 1: lighter seats, battery',price:1200,kg:-50},{name:'Stage 2: no spare, thin glass',price:3600,kg:-110},{name:'Stage 3: carbon panels',price:8000,kg:-180}]},
  aero:{name:'Aero',opts:[{name:'None',price:0,cl:[.28,.42],cd:0},{name:'Lip and ducktail',price:1200,cl:[.38,.56],cd:.02},{name:'Splitter and GT wing',price:3800,cl:[.55,.95],cd:.08,adj:1}]}
};
export const CATEGORIES=Object.keys(PARTS);
/* tuning ranges: [min, max, default, step, unit, what it needs] */
export const TUNE={
  boost:{name:'Boost',min:.5,max:1.3,def:1,step:.05,fmt:v=>Math.round(v*100)+'%',needs:s=>!!build(s,{noPI:true}).spec.fiBoost},
  fd:{name:'Final drive',min:.85,max:1.15,def:1,step:.01,fmt:v=>(v<1?'longer ':v>1?'shorter ':'')+v.toFixed(2)},
  bias:{name:'Brake bias (front)',min:.55,max:.75,def:.66,step:.01,fmt:v=>Math.round(v*100)+'%'},
  springF:{name:'Front springs',min:.7,max:1.5,def:1,step:.05,fmt:v=>Math.round(v*100)+'%',needs:s=>PARTS.suspension.opts[s.suspension].adj},
  springR:{name:'Rear springs',min:.7,max:1.5,def:1,step:.05,fmt:v=>Math.round(v*100)+'%',needs:s=>PARTS.suspension.opts[s.suspension].adj},
  arbF:{name:'Front anti-roll bar',min:0,max:2,def:1,step:.1,fmt:v=>Math.round(v*100)+'%',needs:s=>PARTS.suspension.opts[s.suspension].adj},
  arbR:{name:'Rear anti-roll bar',min:0,max:2,def:1,step:.1,fmt:v=>Math.round(v*100)+'%',needs:s=>PARTS.suspension.opts[s.suspension].adj},
  damp:{name:'Dampers',min:.7,max:1.4,def:1,step:.05,fmt:v=>Math.round(v*100)+'%',needs:s=>PARTS.suspension.opts[s.suspension].adj},
  ride:{name:'Ride height',min:-.03,max:.03,def:0,step:.005,fmt:v=>(v>=0?'+':'')+Math.round(v*1000)+' mm',needs:s=>PARTS.suspension.opts[s.suspension].adj},
  pre:{name:'Diff preload',min:0,max:250,def:80,step:10,fmt:v=>Math.round(v)+' N m',needs:s=>PARTS.diff.opts[s.diff].adj},
  acc:{name:'Diff lock, power',min:0,max:1,def:.5,step:.05,fmt:v=>Math.round(v*100)+'%',needs:s=>PARTS.diff.opts[s.diff].adj},
  dec:{name:'Diff lock, coast',min:0,max:1,def:.25,step:.05,fmt:v=>Math.round(v*100)+'%',needs:s=>PARTS.diff.opts[s.diff].adj},
  wing:{name:'Wing angle',min:.6,max:1.4,def:1,step:.05,fmt:v=>Math.round(v*100)+'%',needs:s=>PARTS.aero.opts[s.aero].adj},
  launch:{name:'Launch rpm',min:.35,max:.8,def:.6,step:.02,fmt:v=>Math.round(v*100)+'% of redline',needs:s=>PARTS.ecu.opts[s.ecu].launch}
};
export const STOCK_SETUP={engine:'street4',exhaust:0,intake:0,cams:0,ecu:0,induction:0,nitrous:0,flywheel:0,gearbox:0,diff:1,drive:0,tyres:1,brakes:0,suspension:0,weight:0,aero:0,tune:{},paint:'magenta'};
export const tuneVal=(s,k)=>s.tune&&s.tune[k]!==undefined?s.tune[k]:TUNE[k].def;

/* rough engine weights, so a V12 nose sits heavier than a four */
function engineKg(p){const L=p.layout,base=L.startsWith('R')?55+p.disp*18:p.layout==='I3'?85:70+p.disp*30;return base+(p.fi&&p.fi!=='none'?22:0);}
const KG_STOCK=engineKg(SIM.PRESETS.find(p=>p.id==='street4'));

let NEON=null;
/* the car a setup makes */
export function build(setup,{noPI=false}={}){
  const S=Object.assign({},STOCK_SETUP,setup),P=PARTS,base=SIM.PRESETS.find(p=>p.id===S.engine)||SIM.PRESETS[0];
  const ex=P.exhaust.opts[S.exhaust],ik=P.intake.opts[S.intake],cm=P.cams.opts[S.cams],ec=P.ecu.opts[S.ecu],ind=P.induction.opts[S.induction];
  const e=Object.assign({},base);
  const na=!base.fi||base.fi==='none';
  /* forced induction: a kit on a natural engine, or an upgrade to the one it has */
  if(ind.fi&&na){e.fi=ind.fi;e.boost=ind.boost;e.tsize=ind.tsize??1;e.bov=ind.fi==='turbo'||ind.fi==='twin'?'flutter':'none';e.tq*=.94;}
  else if(ind.boostAdd&&!na){e.boost=(e.boost||1)+ind.boostAdd;e.tsize=Math.min(2,(e.tsize??1)+ind.tsizeAdd);}
  if(e.fi&&e.fi!=='none')e.boost*=tuneVal(S,'boost');
  /* the stages: torque, sound, rev range */
  const tq=1+(ex.tq||0)+(ik.tq||0)+(cm.tq||0)+(ec.tq||0);e.tq*=tq;
  e.ex=Math.min(4,(base.ex|0)+S.exhaust);e.intake=Math.min(3,(base.intake|0)+S.intake);e.cam=Math.min(3,(base.cam|0)+S.cams);
  e.crackle=Math.min(1,(base.crackle||.3)+(ex.crackle||0)+(S.ecu>=2?.15:0));
  e.redline=base.redline+(cm.red||0)*(base.redline/7000);e.idle=base.idle+(cm.idle||0);
  if(cm.cP)e.cP=Math.min(.9,base.cP+cm.cP);if(cm.cW)e.cW=Math.max(.3,base.cW+cm.cW);if(cm.cA)e.cA=Math.max(.3,base.cA+cm.cA);
  if(ec.launch){e.launch=1;e.launchRpm=Math.round(e.redline*tuneVal(S,'launch'));}
  if(ec.limiter)e.limiter=ec.limiter;
  if(ec.antilag&&e.fi&&e.fi!=='none')e.antilag=1;
  if(S.nitrous)e.nos=P.nitrous.opts[S.nitrous].nos;
  if(S.flywheel)e.Ie=base.Ie*P.flywheel.opts[S.flywheel].Ie;
  const gb=P.gearbox.opts[S.gearbox];if(gb.gears){e.gears=gb.gears.slice();e.seq=gb.seq||0;}
  const dr=P.drive.opts[S.drive];e.drv=dr.drv;
  /* the chassis */
  const c=JSON.parse(JSON.stringify(CHASSIS.sl3));
  const ekg=engineKg(base)-KG_STOCK;
  c.mass=CHASSIS.sl3.mass+ekg+(dr.kg||0)+P.weight.opts[S.weight].kg;e.mass=c.mass;
  c.wf=CHASSIS.sl3.wf+ekg*.00018;
  const ty=P.tyres.opts[S.tyres].t;c.tyre=Object.assign({},ty);
  c.brake=P.brakes.opts[S.brakes].b;c.bias=tuneVal(S,'bias');
  const su=P.suspension.opts[S.suspension],adj=su.adj;
  const kF=su.k*(adj?tuneVal(S,'springF'):1),kR=su.k*(adj?tuneVal(S,'springR'):1),dmp=Math.sqrt(su.k)*(adj?tuneVal(S,'damp'):1);
  Object.assign(c.susp,{kF:c.susp.kF*kF,kR:c.susp.kR*kR,cbF:c.susp.cbF*dmp*Math.sqrt(kF/su.k),crF:c.susp.crF*dmp*Math.sqrt(kF/su.k),cbR:c.susp.cbR*dmp*Math.sqrt(kR/su.k),crR:c.susp.crR*dmp*Math.sqrt(kR/su.k),
    arbF:c.susp.arbF*su.arb*(adj?tuneVal(S,'arbF'):1),arbR:c.susp.arbR*su.arb*(adj?tuneVal(S,'arbR'):1)});
  c.hcg=CHASSIS.sl3.hcg+su.ride+(adj?tuneVal(S,'ride'):0);
  const df=P.diff.opts[S.diff];c.diff=df.adj?{pre:tuneVal(S,'pre'),acc:tuneVal(S,'acc'),dec:tuneVal(S,'dec')}:{pre:df.d[0],acc:df.d[1],dec:df.d[2]};
  const ae=P.aero.opts[S.aero],wing=ae.adj?tuneVal(S,'wing'):1;
  c.clF=ae.cl[0];c.clR=ae.cl[1]*wing;c.cdA=CHASSIS.sl3.cdA+(ae.cd||0)*wing;
  const spec=SIM.makeSpec(e);
  spec.fd*=tuneVal(S,'fd');
  spec.name=base.name;spec.presetId=base.id;
  const out={setup:S,chassis:c,spec};
  if(!noPI)Object.assign(out,rate(c,spec));
  return out;
}
/* the performance index: an estimated lap of Neon Loop on the racing line */
export function rate(c,spec){
  if(!NEON)NEON=buildTrack('neon');const T=NEON,mu=c.tyre.mu;
  const prof=speedProfile(T,{mass:c.mass,clF:c.clF,clR:c.clR,cdA:c.cdA,powerKw:spec.peak.kw+(spec.nosKw||0)*.25},{mu,brake:mu*9.81*.92*Math.min(1.12,c.brake/5800*.35+.65)});
  let t=0;for(let i=0;i<T.N;i++)t+=T.ds/Math.max(prof[i],1);
  /* the lap says how it corners, brakes and puts power down; power to weight says the rest */
  const pw=(spec.peak.kw+(spec.nosKw||0)*.3)/(c.mass/1000);
  const pi=Math.round(Math.max(100,Math.min(999,40+34*(62-t)+260*Math.log(pw/60))));
  return {lap:t,pi,cls:classOf(pi),kw:spec.peak.kw,hp:spec.peak.hp,tq:spec.peak.tq,kg:c.mass};
}
export const CLASSES=[{id:'D',max:399,col:'#9ad0ff'},{id:'C',max:549,col:'#5dff7a'},{id:'B',max:699,col:'#ffd23f'},{id:'A',max:849,col:'#ff8a3d'},{id:'S',max:999,col:'#ff4fa0'}];
export const classOf=pi=>CLASSES.find(c=>pi<=c.max).id;
/* can this part go on this engine */
export function fits(setup,cat,i){const o=PARTS[cat].opts[i],base=SIM.PRESETS.find(p=>p.id===setup.engine)||SIM.PRESETS[0],na=!base.fi||base.fi==='none';
  if(o.naOnly&&!na)return false;if(o.fiOnly&&na&&!(PARTS.induction.opts[setup.induction].fi))return false;return true;}
