/* =====================================================================================
   SHIFTLIGHT — the game page.
   Builds Neon Loop and its city, the car and its renderer, runs the physics at 240 Hz,
   follows the car with the camera, drives the engine and effects synths, draws the HUD.
   States: title (the car drives itself behind the logo) -> drive <-> pause.
   ===================================================================================== */
import {Renderer} from '../src/render/renderer.js';
import {CarRenderer,PAINTS,TRAFFIC_PAINTS,TAXI_PAINT} from '../src/render/car.js';
import {poseView} from '../src/game/carview.js';
import {Traffic} from '../src/game/traffic.js';
import {Race,DIFFICULTY} from '../src/game/race.js';
import {carBox} from '../src/physics/carcontact.js';
import {ENVS,ENV_IDS} from '../src/render/env.js';
import {Particles} from '../src/render/particles.js';
import {DRS} from '../src/render/drs.js';
import {makeLevel,LEVELS} from '../src/game/levels.js';
import {Vehicle,ASSISTS} from '../src/physics/vehicle.js';
import {CHASSIS,ENGINE_CHOICES,carSpec} from '../src/game/cars.js';
import {SIM} from '../src/engine/engine-sim.js';
import {Input} from '../src/game/input.js';
import {CameraRig,CAM_MODES} from '../src/game/camera.js';
import {GameAudio} from '../src/audio/game-audio.js';
import {HUD} from '../src/ui/hud.js';
import {Menu,loadSettings,saveSettings} from '../src/ui/menu.js';
import {qmat,mcol,mvec,add,norm,clamp,madd,sub,len,dot} from '../src/physics/math3.js';

const $=id=>document.getElementById(id);
const Q=new URLSearchParams(location.search);
const DEFAULTS={event:'race',laps:3,rivals:'racing',level:'city',assist:'easy',gearbox:'auto',engine:'six',paint:'magenta',env:'rain',cam:'chase',display:'modern',ledRes:'classic',quality:'high',scale:'auto',volume:.8,units:'kmh'};
const settings=loadSettings(DEFAULTS);
for(const k of Object.keys(DEFAULTS))if(Q.has(k))settings[k]=isNaN(+Q.get(k))||k==='scale'&&Q.get(k)==='auto'?Q.get(k):+Q.get(k);
const save=()=>{if(!Q.has('manual'))saveSettings(settings);};

/* ---------- the world ---------- */
const canvas=$('view'),hudC=$('hud');
const R=new Renderer(canvas,{quality:settings.quality});
let level=makeLevel(settings.level);R.loadWorld(level.geo,level.T);
const CR=new CarRenderer(R,CHASSIS);
const extraCars=[];   /* other cars to draw (the traffic fills this; tests can too) */
const PS=new Particles(R,level.mask,{rainN:{low:4000,medium:6500,high:9000,ultra:12000}[settings.quality]||9000});
const drs=new DRS({min:.5,max:R.Q.maxScale,start:settings.scale==='auto'?.85:+settings.scale});drs.enabled=settings.scale==='auto';
const hud=new HUD(hudC);hud.setMap(level.map);
const ledHud=document.createElement('canvas');const ledHudView=new HUD(ledHud);ledHudView.setMap(level.map);
const audio=new GameAudio();audio.setVolume(settings.volume);
const input=new Input(window),cam=new CameraRig(level);
const menu=new Menu($('menu'));
let env=ENVS[settings.env]||ENVS.rain;
cam.mode=Math.max(0,CAM_MODES.indexOf(settings.cam));
if(Q.get('orbit')){const o=Q.get('orbit').split(',').map(Number);cam.orbit={yaw:o[0],pitch:o[1],dist:o[2],fov:o[3]||.7,y:o[4]||0};}

/* ---------- the car ---------- */
let car=null,spec=null;
function makeCar(engineId,keep){
  spec=carSpec(engineId);const c=new Vehicle(CHASSIS.sl3,spec,level.world);c.setAssists(settings.assist);c.pt.auto=settings.gearbox==='auto';
  if(keep){c.p=keep.p.slice();c.q=keep.q.slice();c.v=keep.v.slice();c.w=keep.w.slice();c.wheels.forEach((w,i)=>{w.w=keep.wheels[i].w;w.ang=keep.wheels[i].ang;});c.hint=keep.hint;
    c.pt.st='run';c.pt.we=Math.max(c.pt.we,spec.idle*6.283/60*1.5);c.pt.gear=Math.min(keep.pt.gear,spec.nG);c.pt.rpm=keep.pt.rpm;}
  else level.spawn(c);
  car=c;audio.configure(SIM.dspCfg(spec));guide=level.guide(car);botFn=level.bot(car);
  return c;
}
/* swap levels in place: the renderer, rain, minimap, camera and the car all move to the new one */
function loadLevel(kind){
  settings.level=kind;save();
  level=makeLevel(kind);R.loadWorld(level.geo,level.T);PS.setMask(level.mask);hud.setMap(level.map);ledHudView.setMap(level.map);cam.setLevel(level);
  car.world=level.world;level.spawn(car);car.pt.start();guide=level.guide(car);botFn=level.bot(car);
  lap.n=0;lap.t0=-1;lap.lastS=null;lap.best=0;lap.bestTrace=null;loadBest();makeTraffic();race=null;
  if(state!=='title')startEvent();
  if(state==='title'){if(level.botStart)level.botStart(car);$('titleSub').textContent=titleSub();}
}
const titleSub=()=>`◀  ${level.name} · ${level.kind==='loop'?(settings.event==='race'?'Race':'Practice'):LEVELS[level.kind].mode}  ▶`;
let botFn=null,guide=null;
/* ---------- the traffic ---------- */
const TRAFFIC_N={low:28,medium:42,high:56,ultra:76},SL3_BOX=carBox({xF:2.25,xR:-2.30,hw:.966,H:1.28},CHASSIS.sl3.hcg);
let traffic=null,trafficInit=false,camLast={pos:[0,0,0],fwd:[1,0,0]};
/* ---------- the race (Neon Loop) ---------- */
let race=null,resultsShown=false;const pendingFx=[];
function startEvent(){
  race=null;resultsShown=false;
  if(level.kind==='loop'&&settings.event==='race'){race=new Race(level,car,{rivals:5,laps:+settings.laps||3,difficulty:settings.rivals,wet:env.wet,slot:3});hud.message('GET READY','#ffb040',1.6);}
  else level.spawn(car);
  lap.n=0;lap.t0=-1;lap.lastS=null;
}
function raceEvents(){
  for(const e of race.takeEvents()){
    if(e.type==='light')pendingFx.push({type:'beep',f:660,len:.16,a:.5});
    else if(e.type==='go'){pendingFx.push({type:'beep',f:1320,len:.5,a:.6});hud.message('GO','#5dff7a',1.2);}
    else if(e.type==='finish'&&e.e.you)hud.message('FINISHED  P'+e.e.pos,e.e.pos===1?'#5dff7a':'#f4f2ff',4);
    else if(e.type==='crash')pendingFx.push({type:'hit',a:Math.min(1,e.speed/12)*.5});}
  const you=race.entrants.find(e=>e.you);
  if(!resultsShown&&you.finished&&(race.phase==='done'||time-race.finishT>6)){resultsShown=true;showResults();}
}
function showResults(){
  state='pause';audio.suspend(true);
  const fmtR=t=>t?fmt(t):'—';
  const rows=[{type:'head',label:'Neon Loop · '+race.laps+' laps · '+DIFFICULTY[settings.rivals].name}];
  for(const r of race.results())rows.push({type:'head',label:`${r.pos}.  ${r.name.padEnd(8,' ')}  ${r.dnf?'DNF':r.pos===1?fmtR(r.time):'+'+(r.gap!==null?r.gap.toFixed(3):'—')}   best ${fmtR(r.best)}`,you:r.you});
  rows.push({type:'action',label:'Race again',act:()=>{menu.hide();state='drive';audio.suspend(false);startEvent();}});
  rows.push({type:'action',label:'Practice',act:()=>{settings.event='practice';save();menu.hide();state='drive';audio.suspend(false);startEvent();}});
  rows.push({type:'action',label:'Settings',act:()=>{menu.show(menuRows(),'PAUSED');}});
  menu.show(rows,'RESULTS');
}
function makeTraffic(){traffic=level.kind==='city'&&!Q.has('notraffic')?new Traffic(level,{count:+(Q.get('traffic')||TRAFFIC_N[settings.quality]||56)}):null;trafficInit=true;}
const playerBody=()=>({p:car.p,v:car.v,hcg:car.c.hcg,veh:car,box:SL3_BOX});
makeCar(settings.engine);car.pt.start();makeTraffic();

/* ---------- laps ---------- */
const BEST_KEY='shiftlight.best.neon';
const lap={n:0,t0:-1,lastS:null,last:0,best:0,trace:null,bestTrace:null,armed:false};
function loadBest(){try{const b=JSON.parse(localStorage.getItem(BEST_KEY)||'null');if(b&&b.t>0){lap.best=b.t;lap.bestTrace=b.trace?Float32Array.from(b.trace):null;}}catch(e){}}
loadBest();
function lapUpdate(){
  if(!level.laps||!car.loc)return;const s=car.loc.s,T=level.T;
  if(lap.lastS!==null){
    if(lap.lastS>T.len-40&&s<40){/* crossed the line going forward */
      if(lap.t0>=0&&lap.armed){const t=time-lap.t0;lap.last=t;
        if(!lap.best||t<lap.best){lap.best=t;lap.bestTrace=lap.trace;hud.message('BEST LAP','#5dff7a');try{localStorage.setItem(BEST_KEY,JSON.stringify({t,trace:Array.from(lap.trace||[])}));}catch(e){}}
        else hud.message(fmt(t),'#f4f2ff',1.6);}
      lap.t0=time;lap.n++;lap.trace=new Float32Array(Math.ceil(T.len)+1);lap.armed=true;}
    else if(lap.lastS<40&&s>T.len-40)lap.armed=false;  /* backed over the line */
  }
  if(lap.trace&&lap.t0>=0)lap.trace[Math.floor(s)]=time-lap.t0;
  lap.lastS=s;
}
const fmt=t=>{const m=Math.floor(t/60),s=t-m*60;return m+':'+(s<10?'0':'')+s.toFixed(3);};

/* ---------- state ---------- */
let slowT=0,slowHinted=false;
let state='boot',time=0,acc=0,frameN=0,highBeam=false,lastInp={};
const DT=1/240;
function enterTitle(){
  $('boot').hidden=true;state=Q.has('manual')?'drive':'title';
  if(state==='title'){$('title').hidden=false;cam.orbit={yaw:2.5,pitch:.1,dist:7.6,fov:.72,y:.2};$('titleSub').textContent=titleSub();if(level.botStart)level.botStart(car);}
}
function begin(){
  if(state!=='title')return;
  state='drive';$('title').hidden=true;cam.orbit=null;cam.mode=Math.max(0,CAM_MODES.indexOf(settings.cam));cam.cut=true;
  car.pt.stop&&car.pt.stop();car.pt.start();startEvent();
  audio.start();
}
/* on the title: left and right choose the place, anything else starts */
const anyKey=e=>{if(state==='title'){if(e&&(e.key==='ArrowLeft'||e.key==='ArrowRight'||e.key==='a'||e.key==='d')){switchTitleLevel();return;}begin();}else audio.start();};
function switchTitleLevel(){const ks=Object.keys(LEVELS),k=ks[(ks.indexOf(level.kind)+1)%ks.length];$('titleSub').textContent='Loading '+LEVELS[k].name+'…';setTimeout(()=>loadLevel(k),30);}
window.addEventListener('keydown',anyKey);window.addEventListener('pointerdown',()=>anyKey(null));
window.addEventListener('keydown',e=>{if(!menu.open)return;const k={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',Enter:'enter',' ':'enter'}[e.key];if(k){menu.key(k);e.preventDefault();}});

function pause(on){
  if(on===(state==='pause'))return;
  if(on){state='pause';menu.show(menuRows(),'PAUSED');audio.suspend(true);}
  else{state='drive';menu.hide();audio.suspend(false);}
}
function swapEngine(id){settings.engine=id;save();const keep={p:car.p,q:car.q,v:car.v,w:car.w,wheels:car.wheels,hint:car.hint,pt:car.pt};makeCar(id,keep);}
function menuRows(){
  const opt=(id,label,desc,extra)=>Object.assign({id,label,desc},extra||{});
  const set=(k,fn)=>v=>{settings[k]=v;save();fn&&fn(v);};
  return [
    {type:'action',label:'Resume',act:()=>pause(false)},
    ...(level.kind==='loop'?[{type:'head',label:'Race'},
      {type:'choice',label:'Event',chips:1,get:()=>settings.event,set:set('event'),options:[opt('race','Race','Five rivals, a standing start, the start lights.'),opt('practice','Practice','Just you and the clock.')]},
      {type:'choice',label:'Rivals',chips:1,get:()=>settings.rivals,set:set('rivals'),options:Object.entries(DIFFICULTY).map(([id,d])=>opt(id,d.name))},
      {type:'choice',label:'Laps',chips:1,get:()=>String(settings.laps),set:set('laps',v=>{settings.laps=+v;}),options:['3','5','8'].map(n=>opt(n,n))},
      {type:'action',label:settings.event==='race'?'Start the race':'Start practice',act:()=>{pause(false);startEvent();}}]:[]),
    {type:'head',label:'Driving'},
    {type:'choice',label:'Assists',chips:1,get:()=>settings.assist,set:set('assist',v=>{car.setAssists(v);car.pt.auto=settings.gearbox==='auto';guide=level.guide(car);}),options:[
      opt('easy','Arcade Easy','The car slows for corners and steers off the walls for you, grips harder in the wet, and stays on its wheels. Handbrake drifts still work.'),
      opt('arcade','Arcade','Steering, stability and drift help. Handbrake into a corner and hold the angle with the stick.'),
      opt('sport','Sport','Less steering help, a looser stability net. The car moves around more.'),
      opt('sim','Simulation','Just the car: no steering or stability help. ABS stays on.')]},
    {type:'choice',label:'Gearbox',chips:1,get:()=>settings.gearbox,set:set('gearbox',v=>{car.pt.auto=v==='auto';}),options:[opt('auto','Automatic'),opt('manual','Manual','Q / E or the B / X buttons to shift.')]},
    {type:'head',label:'Car'},
    {type:'choice',label:'Engine',get:()=>settings.engine,set:v=>swapEngine(v),options:ENGINE_CHOICES.map(id=>{const p=SIM.PRESETS.find(q=>q.id===id);return opt(id,p.name,p.tag);})},
    {type:'choice',label:'Paint',chips:1,get:()=>settings.paint,set:set('paint'),options:Object.entries(PAINTS).map(([id,p])=>opt(id,p.name,'',{swatch:`rgb(${p.col.map(c=>Math.round(Math.pow(c,1/2.2)*255)).join(',')})`}))},
    {type:'head',label:'World'},
    {type:'choice',label:'Place',chips:1,get:()=>level.kind,set:v=>{if(v!==level.kind){loadLevel(v);pause(false);}},options:Object.entries(LEVELS).map(([id,L])=>opt(id,L.name,L.mode==='Circuit'?'The street circuit: laps against the clock.':'The whole town, the expressway and its ramps. Go anywhere.'))},
    {type:'choice',label:'Time',chips:1,get:()=>settings.env,set:set('env',v=>{env=ENVS[v];}),options:ENV_IDS.map(id=>opt(id,ENVS[id].name))},
    {type:'head',label:'View'},
    {type:'choice',label:'Camera',chips:1,get:()=>CAM_MODES[cam.mode],set:v=>{cam.mode=CAM_MODES.indexOf(v);cam.cut=true;settings.cam=v;save();},options:CAM_MODES.map(m=>opt(m,m[0].toUpperCase()+m.slice(1)))},
    {type:'choice',label:'Display',chips:1,get:()=>settings.display,set:set('display'),options:[opt('modern','Modern'),opt('led','LED Matrix','The whole picture on a wall of round lamps, the HyperDot way. L toggles it while driving.')]},
    {type:'choice',label:'LED density',chips:1,get:()=>settings.ledRes,set:set('ledRes'),options:[opt('classic','Classic 320 × 180'),opt('fine','Fine 480 × 270')]},
    {type:'choice',label:'Speed units',chips:1,get:()=>settings.units,set:set('units'),options:[opt('kmh','km/h'),opt('mph','mph')]},
    {type:'head',label:'Graphics'},
    {type:'choice',label:'Quality',chips:1,get:()=>settings.quality,set:v=>{settings.quality=v;save();location.reload();},options:['low','medium','high','ultra'].map(q=>opt(q,q[0].toUpperCase()+q.slice(1),'Changing this reloads the page.'))},
    {type:'choice',label:'Resolution',chips:1,get:()=>String(settings.scale),set:v=>{settings.scale=v==='auto'?'auto':+v;save();drs.enabled=v==='auto';if(v!=='auto')R.resize(canvas.width,canvas.height,+v);},
      options:[opt('auto','Auto','Keeps the frame rate by adjusting the render scale; TAA rebuilds full resolution.'),opt('0.5','50%'),opt('0.67','67%'),opt('0.85','85%'),opt('1','100%')]},
    {type:'head',label:'Sound'},
    {type:'slider',label:'Volume',min:0,max:1,stepV:.05,get:()=>settings.volume,set:v=>{settings.volume=v;save();audio.setVolume(v);},fmt:v=>Math.round(v*100)+'%'},
    {type:'action',label:level.laps?'Back to the grid':'Back to the start',act:()=>{car.pt.start();pause(false);startEvent();}}
  ];
}

/* ---------- per-frame pieces ---------- */
function fit(){const dpr=Math.min(2,devicePixelRatio||1),w=Math.round(innerWidth*dpr),h=Math.round(innerHeight*dpr);
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;hudC.width=w;hudC.height=h;}
  R.resize(w,h,R.iw?R.scale:(settings.scale==='auto'?drs.scale:+settings.scale));}
function carView(){
  return {id:1,design:'sl3',self:true,driver:CAM_MODES[cam.mode]!=='cockpit',p:car.p,q:car.q,paint:PAINTS[settings.paint]||PAINTS.magenta,caliper:[.75,.03,.02],
    wheels:car.wheels.map(w=>({hp:w.hp,len:w.len,steer:w.front?car.steer:0,ang:w.ang,disc:w.disc})),
    lamps:[env.night>.3?1:0,env.night>.3?1:0,car.brkIn>.05?1:0,car.rev?1:0]};
}
const sc3=(a,k)=>[a[0]*k,a[1]*k,a[2]*k];
function carLights(){
  const M=qmat(car.q),F=mcol(M,0),U=mcol(M,1),Rt=mcol(M,2),h=car.c.hcg,at=(x,y,z)=>add(car.p,mvec(M,[x,y-h,z]));
  const dyn=[],brake=car.brkIn>.05;
  for(const z of [-.66,.66])dyn.push({pos:at(-2.45,.78,z),r:brake?11:6,col:brake?[5,.12,.06]:[.9,.02,.01],type:1,dir:norm(madd(sc3(F,-1),U,-.35)),cosO:Math.cos(1.3)});
  if(car.rev)for(const z of [-.36,.36])dyn.push({pos:at(-2.45,.77,z),r:9,col:[3,2.9,2.7],type:1,dir:norm(madd(sc3(F,-1),U,-.3)),cosO:Math.cos(1.2)});
  const on=env.night>.3;
  return {dyn,headlights:on?{on:1,high:highBeam?1:0,posL:at(2.12,.6,-.62),posR:at(2.12,.6,.62),dir:norm(madd(F,U,-.035)),right:Rt,up:U,col:[1050,1090,1140],range:95}:null};
}
function flicker(t){
  /* 1-7: the neon's moods; 8-12: the five red start lights; 13: the green */
  const held=race&&(race.phase==='grid'||race.phase==='countdown'),n=race&&race.phase==='countdown'?race.lights:0;
  return [1,.9+.1*Math.sin(t*37),Math.random()<.04?.15:1,(Math.sin(t*3.1)>.96)?.25:1,.88+.12*Math.sin(t*61),.6+.4*Math.sin(t*1.3),Math.sin(t*5.6)>0?1:0,Math.sin(t*3)>.9?1:.03,
    n>0?1:0,n>1?1:0,n>2?1:0,n>3?1:0,n>4?1:0,held?0:1,1,1];}
function effects(dt){
  const M=qmat(car.q),F=mcol(M,0),U=mcol(M,1),Rt=mcol(M,2),wet=env.wet,sp=len(car.v);
  car.wheels.forEach((w,i)=>{if(!w.contact)return;const back=w.front?.25:.4;
    if(wet>.2&&sp>4)PS.emit('sp'+i,wet*(sp-4)*(w.front?1.5:4),dt,()=>{const r=()=>Math.random()-.5,p=madd(madd(w.cp,F,-back-.1*Math.random()),U,.12),side=(w.left?-1:1)*(.6+Math.random());
      PS.spawn(0,p,[car.v[0]*.55-F[0]*sp*.06+Rt[0]*side*.8+r()*.8,1.1+Math.random()*1.4+sp*.02,car.v[2]*.55-F[2]*sp*.06+Rt[2]*side*.8+r()*.8],.55+Math.random()*.7,.22,1.2+sp*.012,.05+.03*wet);});
    if(wet<.4&&w.slipV>3.5)PS.emit('sm'+i,(w.slipV-3.5)*w.Fz/2500*5,dt,()=>{const p=madd(w.cp,U,.15);PS.spawn(1,p,[car.v[0]*.3+(Math.random()-.5),.4+Math.random()*.5,car.v[2]*.3+(Math.random()-.5)],1.8+Math.random()*1.6,.35,3.2,.22);});});
  for(const s of level.geo.steam){const dx=s.pos[0]-car.p[0],dz=s.pos[2]-car.p[2];if(dx*dx+dz*dz>90*90)continue;
    PS.emit(s,s.rate*4,dt,()=>PS.spawn(2,[s.pos[0]+(Math.random()-.5)*.4,s.pos[1]+.05,s.pos[2]+(Math.random()-.5)*.4],[.3+(Math.random()-.5)*.3,.7+Math.random()*.4,.15+(Math.random()-.5)*.3],3.5+Math.random()*2,.4,2.6,.1));}
}
function soundUpdate(c,ev){
  const M=qmat(car.q),F=mcol(M,0),h=car.c.hcg,mode=CAM_MODES[cam.mode];
  const exhaust=add(car.p,mvec(M,[-2.3,.25-h,0])),rel=sub(c.pos,exhaust),dist=len(rel);
  const right=norm([-(c.fwd[2]),0,c.fwd[0]]);const dirToCam=norm(sub(c.pos,car.p));
  let listener=0,geo={dist:Math.max(1.5,dist),pan:clamp(-dot(norm(sub(car.p,c.pos)),right)*.9,-1,1),rear:1};
  if(mode==='cockpit'){listener=1;geo={dist:1.4,pan:0,rear:.35};}
  else if(mode==='hood'||mode==='bumper'){geo={dist:mode==='hood'?3.2:4.6,pan:0,rear:mode==='hood'?.3:.15};}
  else if(mode==='tv'){listener=2;geo.rear=.5-.5*dot(dirToCam,F);geo.jump=c.cut;}
  else geo.rear=clamp(.5-.5*dot(dirToCam,F),0,1)*.6+.4;
  const ep=car.pt.soundParams(listener,len(car.v),geo);
  const tunnel=level.shelter(car);
  const tA=Math.tan(car.tyre.aPk),kP=car.tyre.kPk;
  const fx={lat:car.wheels.map(w=>w.contact?Math.abs(w.tanA)/tA:0),lon:car.wheels.map(w=>w.contact?Math.abs(w.kap)/kP:0),load:car.wheels.map(w=>w.Fz),wet:env.wet,speed:len(car.v),cabin:listener===1?1:0,
    curb:car.wheels.some(w=>w.contact&&w.surf==='curb')?1:0,scrape:ev.scrape||0,vol:1,tunnel};
  const fev=[];if(ev.wall>1.2)fev.push({type:'hit',a:ev.wall/9});
  fev.push(...pendingFx.splice(0));
  /* the rivals: the nearest two get their own engine synth */
  if(race){const cv=camLast.pos,list=[];
    const near=race.entrants.filter(e=>!e.you).map(e=>({e,d:Math.hypot(e.car.p[0]-cv[0],e.car.p[1]-cv[1],e.car.p[2]-cv[2])})).sort((a,b)=>a.d-b.d);
    for(const {e,d} of near.slice(0,2)){const u=norm(sub(e.car.p,cv)),Mr=qmat(e.car.q),Fr=mcol(Mr,0);
      const p=e.car.pt.soundParams(2,len(e.car.v),{dist:Math.max(2,d),pan:clamp(dot(u,right),-1,1)*.85,rear:clamp(.5+.5*dot(u,Fr),0,1)*.6+.4});p.vol=listener===1?.45:.8;
      list.push({id:e.P.engine,cfg:SIM.dspCfg(e.car.spec),p,ev:e.car.pt.takeEvents()});}
    for(const {e} of near.slice(2))e.car.pt.takeEvents();
    audio.rivals(list,{low:1,medium:1,high:2,ultra:2}[settings.quality]??2);}
  else audio.rivals([]);
  /* the traffic: the nearest engines, their horns, crashes down the street */
  if(traffic){const cv=camLast.pos,rt=right,near=[];
    for(const t of traffic.cars){if(!t.view||!t.view.p||t.dist>100)continue;const p=t.view.p,d=Math.hypot(p[0]-cv[0],p[1]-cv[1],p[2]-cv[2]);if(d<90)near.push({t,d,p});}
    near.sort((a,b)=>a.d-b.d);const voices=[];
    for(const {t,d,p} of near.slice(0,4)){const u=[(p[0]-cv[0])/d,(p[1]-cv[1])/d,(p[2]-cv[2])/d],Mt=qmat(t.view.q),Ft=mcol(Mt,0),vel=t.veh?t.veh.v:[Ft[0]*t.v,Ft[1]*t.v,Ft[2]*t.v];
      const vr=dot(sub(vel,car.v),u)*(listener===1?1:.6),dop=343/(343+clamp(vr,-60,60)),rpm=t.veh?t.veh.pt.rpm:820+t.v*(t.kind==='courier'?70:95),cyl=t.kind==='pip'?3:4;
      const load=t.veh?.35+.65*t.veh.pt.load:t.aCmd>.2?.8:.4;
      voices.push({g:.55/Math.pow(1+d/4,1.25)*load*(listener===1?.5:1),f:rpm/60*cyl/2*dop,pan:clamp(dot(u,rt),-1,1)*.8,rd:clamp(t.v/22,0,1)});}
    fx.traffic=voices;
    for(const e of traffic.takeEvents()){const p=e.p||car.p,d=Math.hypot(p[0]-cv[0],p[2]-cv[2]),a=1/Math.pow(1+d/8,1.1);
      if(e.type==='horn')fev.push({type:'horn',a:a*(listener===1?.6:1),len:e.len,f:e.kind==='courier'?330:e.kind==='pip'?480:405,pan:clamp(dot([(p[0]-cv[0])/(d||1),0,(p[2]-cv[2])/(d||1)],rt),-1,1)*.8});
      else if(e.type==='crash'&&e.far)fev.push({type:'hit',a:Math.min(1,e.speed/10)*a});}}if(ev.land>2.2)fev.push({type:'hit',a:ev.land/10});if(ev.ground>2)fev.push({type:'hit',a:ev.ground/8});
  audio.update(ep,car.pt.takeEvents(),fx,fev,{tunnel,cabin:listener===1});
}
function hudState(){
  const pt=car.pt,e=spec;const g=Math.max(1,pt.gear);
  const kmh=settings.units==='mph'?.621371:1;
  return {rpm:pt.rpm,limiter:e.limiterRpm,shiftRpm:(pt.upRpm&&pt.upRpm[g-1])||e.shiftRpm,speed:car.vf*kmh,units:settings.units==='mph'?'MPH':'KM/H',
    gear:pt.gear,rev:car.rev,auto:pt.auto,shiftLamp:pt.rpm>((pt.upRpm&&pt.upRpm[g-1])||e.shiftRpm)*.985,
    boost:pt.boost*(e.fiBoost||0),boostMax:e.turbo||e.sup?e.fiBoost:0,nos:pt.nos,nosMax:e.nosKw?1:0,nosOn:pt.nosOn,
    levelName:level.name.toUpperCase(),laps:level.laps,place:level.laps?null:level.place(car),mapHead:Math.atan2(-mcol(qmat(car.q),0)[2],mcol(qmat(car.q),0)[0]),
    lap:lap.n,lapT:lap.t0>=0?time-lap.t0:0,best:lap.best,last:lap.last,
    delta:lap.bestTrace&&lap.t0>=0&&car.loc?(time-lap.t0)-(lap.bestTrace[Math.floor(car.loc.s)]||0):null,
    assistName:ASSISTS[settings.assist].name.toUpperCase()+' · '+(pt.auto?'AUTO':'MANUAL'),
    tc:pt.tcOn,abs:car.absOn,esc:car.escOn,drift:car.drift.on,guide:car.aid.guide?(guide&&(guide.state.brake>.05||Math.abs(guide.state.steer)>.05)?1:.5):0,mapCar:[car.p[0],-car.p[2]],mapDots:traffic?traffic.cars.filter(t=>t.dist<520).map(t=>{const p=t.view&&t.view.p||traffic.worldPos(t);return [p[0],-p[2]];}):null,
    hint:state==='drive'&&time<6&&lap.n===0&&!race?'ESC FOR THE MENU · C CAMERA · L LED MATRIX':null,...(race?race.hud(time):{})};
}

/* ---------- the loop ---------- */
let camPrev=null;
function step(dt){
  const inp=input.poll(dt);lastInp=inp;
  if(inp.pause){if(state==='drive')pause(true);else if(state==='pause')pause(false);}
  if(menu.open&&inp.nav)for(const k of inp.nav){if(k==='back')pause(false);else menu.key(k);}
  if(state==='title'){if(inp.nav&&inp.nav.includes('enter'))begin();if(cam.orbit)cam.orbit.yaw+=dt*.11;}
  /* if this machine can't keep up even at the lowest render scale, say what to change */
  if(state==='drive'&&settings.scale==='auto'&&drs.scale<=drs.min+.001&&dt>drs.period/1000*1.45){slowT+=dt;if(slowT>6&&!slowHinted){slowHinted=true;hud.message(settings.quality==='low'?'LOW FRAME RATE':'TRY QUALITY: '+(settings.quality==='ultra'?'HIGH':settings.quality==='high'?'MEDIUM':'LOW'),'#ffb040',4);}}else slowT=Math.max(0,slowT-dt);
  if(state==='pause')return {ev:{}};
  if(state==='drive'){
    if(inp.cam){cam.next();settings.cam=CAM_MODES[cam.mode];save();}
    if(inp.led){settings.display=settings.display==='led'?'modern':'led';save();}
    if(inp.high)highBeam=!highBeam;
    if(inp.env){settings.env=ENV_IDS[(ENV_IDS.indexOf(settings.env)+1)%ENV_IDS.length];env=ENVS[settings.env];save();hud.message(env.name.toUpperCase(),'#4fe3ff',1.5);}
    if(inp.reset){level.resetAt(car);car.pt.start();}
    if(inp.up)car.pt.shift(1);if(inp.down)car.pt.shift(-1);
  }
  car.wet=env.wet;
  let drive=state==='title'||Q.has('auto')?Object.assign({},inp,botFn(car)):inp;
  if(state==='drive'&&car.aid.guide&&guide)drive=guide(drive);
  const pb=playerBody();if(race&&state==='drive')drive=race.gate(drive);
  acc+=dt;let n=0;while(acc>=DT&&n<24){car.step(DT,drive);if(race)race.stepPhysics(DT);if(traffic)traffic.stepPhysics(DT,pb);acc-=DT;n++;time+=DT;}
  if(acc>DT)acc=0;
  if(traffic){traffic.wet=env.wet;traffic.update(dt,{time,player:pb,cam:camLast,night:env.night,init:trafficInit});trafficInit=false;}
  if(race){race.wet=env.wet;race.update(dt,time);raceEvents();}
  lapUpdate();effects(dt);
  return {ev:car.takeEvents()};
}
function render(dt,ev){
  const c=cam.update(dt,car,{look:!!lastInp.look,impact:Math.max(ev.wall||0,ev.land||0)*.25});
  const L=carLights(),M=qmat(car.q),F=mcol(M,0),fw=norm([F[0],0,F[2]]);camLast={pos:c.pos,fwd:c.fwd};
  const tv=traffic?traffic.views({night:env.night}):race?race.views(env.night>.3):[];
  if(race&&env.night>.3){const near=race.entrants.filter(e=>!e.you).map(e=>({e,d:Math.hypot(e.car.p[0]-c.pos[0],e.car.p[2]-c.pos[2])})).sort((a,b)=>a.d-b.d).slice(0,{low:0,medium:2,high:3,ultra:4}[settings.quality]??3);
    for(const {e} of near){const Mr=qmat(e.car.q),Fr=mcol(Mr,0),Ur=mcol(Mr,1),hr=e.car.c.hcg,pos=add(e.car.p,mvec(Mr,[2.1,.62-hr,0]));L.dyn.push({pos,r:30,col:[150,145,130],type:1,dir:[Fr[0]-Ur[0]*.08,Fr[1]-Ur[1]*.08-.04,Fr[2]-Ur[2]*.08],cosO:Math.cos(.6)});}}if(traffic)L.dyn.push(...traffic.lights({night:env.night,cam:c},Math.min(16-L.dyn.length,{low:0,medium:2,high:4,ultra:6}[settings.quality]??4)));
  const camVel=camPrev&&!c.cut?sub(c.pos,camPrev).map(x=>x/Math.max(dt,1e-3)):[0,0,0];camPrev=c.pos.slice();
  PS.rain.on=env.rain;PS.rain.camVel=camVel;PS.update(dt,c.pos);
  const led=settings.display==='led';
  let ledS=null;
  if(led){const res=settings.ledRes==='fine'?[480,270]:[320,180];if(ledHud.width!==res[0]){ledHud.width=res[0];ledHud.height=res[1];}
    ledHudView.pixel=true;ledHudView.draw(state==='drive'?hudState():null,dt);ledS={res,hud:R.hudTexture(ledHud),quant:15};}
  R.render({time,dt,cam:c,cut:c.cut,env,flicker:flicker(time),probePos:add(car.p,[0,.4,0]),dyn:L.dyn,headlights:L.headlights,
    occ:[[car.p[0],car.p[1],car.p[2],car.c.hcg,fw[0],fw[2],car.c.body.L/2,car.c.body.W/2]],cars:[carView(),...tv,...extraCars],
    shutter:.5,lensRain:c.lensRain*env.rain*(1-level.shelter(car)),led:ledS,debug:Q.get('debug'),debugGain:+(Q.get('gain')||1)});
  hud.draw(state==='drive'&&!led?hudState():null,dt);
  if(state!=='pause')soundUpdate(c,ev);
}
let last=performance.now(),fps=60;
function frame(dt){fit();const r=step(dt);render(dt,r.ev||{});frameN++;
  if(settings.scale==='auto'){const sc=drs.update(dt*1000,R.gpuMs);if(Math.abs(sc-R.scale)>.001)R.resize(canvas.width,canvas.height,sc);}}
function loop(now){const dt=Math.min(.05,(now-last)/1000);last=now;fps+=(1/Math.max(dt,1e-3)-fps)*.05;frame(dt);requestAnimationFrame(loop);}
document.addEventListener('visibilitychange',()=>{if(document.hidden&&state==='drive')pause(true);});
window.__game={R,CR,extraCars,get traffic(){return traffic;},
  /* park a car for tests and screenshots: design id, map x, world z, yaw, paint index */
  park:(design,x,z,yaw,paint=0,lamps=[1,1,0,0],opts={})=>{const ch=CHASSIS[design],g=level.world.ground(x,z,-1,50);
    extraCars.push(poseView(ch,Object.assign({id:100+extraCars.length,p:[x,g.y+ch.hcg,z],yaw,paint:design==='taxi'?TAXI_PAINT:TRAFFIC_PAINTS[paint%TRAFFIC_PAINTS.length],lamps},opts)));},get level(){return level;},get car(){return car;},cam,input,frame,audio,menu,settings,begin,pause,swapEngine,loadLevel,
  sim:sec=>{for(let t=0;t<sec;t+=1/60)step(1/60);},setEnv:id=>{settings.env=id;env=ENVS[id];},setPaint:id=>{settings.paint=id;},
  stats:()=>({iw:R.iw,ih:R.ih,gpu:R.gpuMs,drawn:R.drawn,speed:car.vf,gear:car.pt.gear,rpm:car.pt.rpm,s:car.loc&&car.loc.s,d:car.loc&&car.loc.d,lap:lap.n,state})};
/* compile every shader behind the boot screen, then show the title */
const bootMsg=$('boot').querySelector('div');
R.G.warmup((d,n)=>{bootMsg.innerHTML=`<b>SHIFTLIGHT</b> &nbsp;warming up the shaders ${d}/${n}`;}).then(()=>{enterTitle();window.__game.ready=true;if(!Q.has('manual'))requestAnimationFrame(loop);})
  .catch(e=>{bootMsg.textContent='Could not start the renderer: '+e.message;console.error(e);});
