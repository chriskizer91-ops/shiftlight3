/* =====================================================================================
   SHIFTLIGHT — the game page.
   Builds Neon Loop and its city, the car and its renderer, runs the physics at 240 Hz,
   follows the car with the camera, drives the engine and effects synths, draws the HUD.
   States: title (the car drives itself behind the logo) -> drive <-> pause.
   ===================================================================================== */
import {Renderer} from '../src/render/renderer.js';
import {CarRenderer,PAINTS} from '../src/render/car.js';
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
const DEFAULTS={level:'city',assist:'easy',gearbox:'auto',engine:'six',paint:'magenta',env:'rain',cam:'chase',display:'modern',ledRes:'classic',quality:'high',scale:'auto',volume:.8,units:'kmh'};
const settings=loadSettings(DEFAULTS);
for(const k of Object.keys(DEFAULTS))if(Q.has(k))settings[k]=isNaN(+Q.get(k))||k==='scale'&&Q.get(k)==='auto'?Q.get(k):+Q.get(k);
const save=()=>{if(!Q.has('manual'))saveSettings(settings);};

/* ---------- the world ---------- */
const canvas=$('view'),hudC=$('hud');
const R=new Renderer(canvas,{quality:settings.quality});
let level=makeLevel(settings.level);R.loadWorld(level.geo,level.T);
const CR=new CarRenderer(R,CHASSIS.sl3);
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
  lap.n=0;lap.t0=-1;lap.lastS=null;lap.best=0;lap.bestTrace=null;loadBest();
  if(state==='title'){if(level.botStart)level.botStart(car);$('titleSub').textContent=titleSub();}
}
const titleSub=()=>`◀  ${level.name} · ${LEVELS[level.kind].mode}  ▶`;
let botFn=null,guide=null;
makeCar(settings.engine);car.pt.start();

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
  level.spawn(car);car.pt.stop&&car.pt.stop();car.pt.start();lap.n=0;lap.t0=-1;lap.lastS=null;
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
    {type:'head',label:'Driving'},
    {type:'choice',label:'Assists',chips:1,get:()=>settings.assist,set:set('assist',v=>{car.setAssists(v);car.pt.auto=settings.gearbox==='auto';guide=makeGuide(T,car);}),options:[
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
    {type:'action',label:level.laps?'Back to the grid':'Back to the start',act:()=>{level.spawn(car);car.pt.start();lap.t0=-1;lap.lastS=null;pause(false);}}
  ];
}

/* ---------- per-frame pieces ---------- */
function fit(){const dpr=Math.min(2,devicePixelRatio||1),w=Math.round(innerWidth*dpr),h=Math.round(innerHeight*dpr);
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;hudC.width=w;hudC.height=h;}
  R.resize(w,h,R.iw?R.scale:(settings.scale==='auto'?drs.scale:+settings.scale));}
function carView(){
  return {id:1,self:true,p:car.p,q:car.q,paint:PAINTS[settings.paint]||PAINTS.magenta,caliper:[.75,.03,.02],
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
function flicker(t){return [1,.9+.1*Math.sin(t*37),Math.random()<.04?.15:1,(Math.sin(t*3.1)>.96)?.25:1,.88+.12*Math.sin(t*61),.6+.4*Math.sin(t*1.3),Math.sin(t*5.6)>0?1:0,Math.sin(t*3)>.9?1:.03];}
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
  const fev=[];if(ev.wall>1.2)fev.push({type:'hit',a:ev.wall/9});if(ev.land>2.2)fev.push({type:'hit',a:ev.land/10});if(ev.ground>2)fev.push({type:'hit',a:ev.ground/8});
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
    tc:pt.tcOn,abs:car.absOn,esc:car.escOn,drift:car.drift.on,guide:car.aid.guide?(guide&&(guide.state.brake>.05||Math.abs(guide.state.steer)>.05)?1:.5):0,mapCar:[car.p[0],-car.p[2]],
    hint:state==='drive'&&time<6&&lap.n===0?'ESC FOR THE MENU · C CAMERA · L LED MATRIX':null};
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
  acc+=dt;let n=0;while(acc>=DT&&n<24){car.step(DT,drive);acc-=DT;n++;time+=DT;}
  if(acc>DT)acc=0;
  lapUpdate();effects(dt);
  return {ev:car.takeEvents()};
}
function render(dt,ev){
  const c=cam.update(dt,car,{look:!!lastInp.look,impact:Math.max(ev.wall||0,ev.land||0)*.25});
  const L=carLights(),M=qmat(car.q),F=mcol(M,0),fw=norm([F[0],0,F[2]]);
  const camVel=camPrev&&!c.cut?sub(c.pos,camPrev).map(x=>x/Math.max(dt,1e-3)):[0,0,0];camPrev=c.pos.slice();
  PS.rain.on=env.rain;PS.rain.camVel=camVel;PS.update(dt,c.pos);
  const led=settings.display==='led';
  let ledS=null;
  if(led){const res=settings.ledRes==='fine'?[480,270]:[320,180];if(ledHud.width!==res[0]){ledHud.width=res[0];ledHud.height=res[1];}
    ledHudView.pixel=true;ledHudView.draw(state==='drive'?hudState():null,dt);ledS={res,hud:R.hudTexture(ledHud),quant:15};}
  R.render({time,dt,cam:c,cut:c.cut,env,flicker:flicker(time),probePos:add(car.p,[0,.4,0]),dyn:L.dyn,headlights:L.headlights,
    occ:[[car.p[0],car.p[1],car.p[2],car.c.hcg,fw[0],fw[2],car.c.body.L/2,car.c.body.W/2]],cars:[carView()],
    shutter:.5,lensRain:c.lensRain*env.rain*(1-level.shelter(car)),led:ledS,debug:Q.get('debug'),debugGain:+(Q.get('gain')||1)});
  hud.draw(state==='drive'&&!led?hudState():null,dt);
  if(state!=='pause')soundUpdate(c,ev);
}
let last=performance.now(),fps=60;
function frame(dt){fit();const r=step(dt);render(dt,r.ev||{});frameN++;
  if(settings.scale==='auto'){const sc=drs.update(dt*1000,R.gpuMs);if(Math.abs(sc-R.scale)>.001)R.resize(canvas.width,canvas.height,sc);}}
function loop(now){const dt=Math.min(.05,(now-last)/1000);last=now;fps+=(1/Math.max(dt,1e-3)-fps)*.05;frame(dt);requestAnimationFrame(loop);}
document.addEventListener('visibilitychange',()=>{if(document.hidden&&state==='drive')pause(true);});
window.__game={R,get level(){return level;},get car(){return car;},cam,input,frame,audio,menu,settings,begin,pause,swapEngine,loadLevel,
  sim:sec=>{for(let t=0;t<sec;t+=1/60)step(1/60);},setEnv:id=>{settings.env=id;env=ENVS[id];},setPaint:id=>{settings.paint=id;},
  stats:()=>({iw:R.iw,ih:R.ih,gpu:R.gpuMs,drawn:R.drawn,speed:car.vf,gear:car.pt.gear,rpm:car.pt.rpm,s:car.loc&&car.loc.s,d:car.loc&&car.loc.d,lap:lap.n,state})};
/* compile every shader behind the boot screen, then show the title */
const bootMsg=$('boot').querySelector('div');
R.G.warmup((d,n)=>{bootMsg.innerHTML=`<b>SHIFTLIGHT</b> &nbsp;warming up the shaders ${d}/${n}`;}).then(()=>{enterTitle();window.__game.ready=true;if(!Q.has('manual'))requestAnimationFrame(loop);})
  .catch(e=>{bootMsg.textContent='Could not start the renderer: '+e.message;console.error(e);});
