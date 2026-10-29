/* =====================================================================================
   SHIFTLIGHT — the game page.
   Builds the world and the car, runs the physics at 240 Hz, follows the car with the
   camera, drives the engine and effects synths, draws the HUD, and moves between screens:
     title  ->  free play (Shift City, a race / practice / drift run on Neon Loop, a drag run)
            ->  career hub  <->  garage (parts, tuning, paint, dyno)
                            ->  an event  ->  results  ->  hub
   A session says whose car it is (your career car, or the free-play car in the settings)
   and which event (if any) is running. Every event is a "mode" with the same shape.
   ===================================================================================== */
import {Renderer} from '../src/render/renderer.js';
import {CarRenderer,PAINTS,TRAFFIC_PAINTS,TAXI_PAINT} from '../src/render/car.js';
import {poseView} from '../src/game/carview.js';
import {Traffic} from '../src/game/traffic.js';
import {Race,DIFFICULTY} from '../src/game/race.js';
import {TrialEvent,DriftEvent} from '../src/game/modes.js';
import {DragEvent} from '../src/game/drag.js';
import {DriftScore} from '../src/game/drift.js';
import {encodeGhost,decodeGhost} from '../src/game/ghost.js';
import {ReplayRecorder,ReplayPlayer} from '../src/game/replay.js';
import {wheelLayout} from '../src/game/carview.js';
import {build,STOCK_SETUP,classOf} from '../src/game/setup.js';
import {Career,Sandbox,EVENTS,REF,MEDAL_LAPS,DRIFT_TARGETS,DRAG_RT,MEDALS} from '../src/game/career.js';
import {carBox} from '../src/physics/carcontact.js';
import {ENVS,ENV_IDS} from '../src/render/env.js';
import {Particles} from '../src/render/particles.js';
import {DRS} from '../src/render/drs.js';
import {makeLevel,LEVELS} from '../src/game/levels.js';
import {Vehicle,ASSISTS,interpolateVehicles,restoreVehicles} from '../src/physics/vehicle.js';
import {CHASSIS,ENGINE_CHOICES} from '../src/game/cars.js';
import {SIM} from '../src/engine/engine-sim.js';
import {Input} from '../src/game/input.js';
import {CameraRig,CAM_MODES} from '../src/game/camera.js';
import {GameAudio} from '../src/audio/game-audio.js';
import {HUD} from '../src/ui/hud.js';
import {Menu,loadSettings,saveSettings} from '../src/ui/menu.js';
import {TitleMenu,CareerHub,Garage,Results} from '../src/ui/screens.js';
import {TouchControls} from '../src/ui/touch.js';
import {FlatsView} from '../src/render/flatsgeo.js';
import {FlatsRun} from '../src/game/flatsrun.js';
import {onFlats} from '../src/world/flats.js';
import {qmat,mcol,mvec,add,norm,clamp,madd,sub,len,dot} from '../src/physics/math3.js';

const $=id=>document.getElementById(id);
const Q=new URLSearchParams(location.search);
const DEFAULTS={event:'race',laps:3,rivals:'racing',level:'city',assist:'easy',gearbox:'auto',engine:'six',paint:'magenta',env:'rain',cam:'chase',display:'modern',ledRes:'classic',quality:'high',scale:'auto',fps:'auto',perf:false,nosFree:'endless',flatsRec:null,volume:.8,units:'kmh',sandbox:null,touch:'auto',steer:'slide',device:null};
const settings=loadSettings(DEFAULTS);
for(const k of Object.keys(DEFAULTS))if(Q.has(k))settings[k]=isNaN(+Q.get(k))||k==='scale'&&Q.get(k)==='auto'?Q.get(k):+Q.get(k);
const save=()=>{if(!Q.has('manual'))saveSettings(settings);};
/* phones and tablets: the first time, start on the mobile graphics tier with the touch controls */
const COARSE=matchMedia('(pointer: coarse)').matches;
if(!settings.device){settings.device=COARSE?'touch':'desktop';if(COARSE&&!Q.has('quality'))settings.quality='mobile';save();}

/* ---------- the world ---------- */
const canvas=$('view'),hudC=$('hud');
const R=new Renderer(canvas,{quality:settings.quality});
let level=makeLevel(settings.level);R.loadWorld(level.geo,level.T);
const flatsView=new FlatsView(R);
const flatsRun=new FlatsRun(settings.flatsRec,rec=>{settings.flatsRec=Object.assign({},rec);save();});
const CR=new CarRenderer(R,CHASSIS);for(const d of ['sl3_lip','sl3_wing'])CR.addDesign(Object.assign({},CHASSIS.sl3,{design:d}));
const AERO_DESIGN=['sl3','sl3_lip','sl3_wing'];
const extraCars=[];   /* other cars to draw (tests can add some) */
const PS=new Particles(R,level.mask,{rainN:{mobile:2500,low:4000,medium:6500,high:9000,ultra:12000}[settings.quality]||9000});
const drs=new DRS({min:.5,max:R.Q.maxScale,start:settings.scale==='auto'?.85:+settings.scale});drs.enabled=settings.scale==='auto';
const hud=new HUD(hudC);hud.setMap(level.map);
const ledHud=document.createElement('canvas');const ledHudView=new HUD(ledHud);ledHudView.setMap(level.map);
const audio=new GameAudio({ctx:settings.quality==='mobile'?{sampleRate:32000,latencyHint:'balanced'}:{}});audio.setVolume(settings.volume);
const touch=new TouchControls($('touch'));
const input=new Input(window,touch),cam=new CameraRig(level);
const menu=new Menu($('menu'));
let env=ENVS[settings.env]||ENVS.rain;
cam.mode=Math.max(0,CAM_MODES.indexOf(settings.cam));
if(Q.get('orbit')){const o=Q.get('orbit').split(',').map(Number);cam.orbit={yaw:o[0],pitch:o[1],dist:o[2],fov:o[3]||.7,y:o[4]||0};}

/* ---------- whose car: the career's, or free play's (kept in the settings) ---------- */
const career=new Career();
const sandbox=new Sandbox(()=>{if(!settings.sandbox)settings.sandbox=Object.assign(JSON.parse(JSON.stringify(STOCK_SETUP)),{engine:settings.engine||'six',paint:settings.paint||'magenta'});return settings.sandbox;},s=>{settings.sandbox=s;save();});
let session={kind:'free',ev:null,play:'city'};
const owner=()=>session.kind==='career'?career:sandbox;

/* ---------- the car ---------- */
let car=null,spec=null,carB=null;
function makeCar(keep){
  carB=build(owner().setup);spec=carB.spec;const c=new Vehicle(carB.chassis,spec,level.world);c.setAssists(settings.assist);c.pt.auto=settings.gearbox==='auto';
  if(keep){c.p=keep.p.slice();c.q=keep.q.slice();c.v=keep.v.slice();c.w=keep.w.slice();c.wheels.forEach((w,i)=>{w.w=keep.wheels[i].w;w.ang=keep.wheels[i].ang;});c.hint=keep.hint;
    c.pt.st='run';c.pt.we=Math.max(c.pt.we,spec.idle*6.283/60*1.5);c.pt.gear=Math.min(keep.pt.gear,spec.nG);c.pt.rpm=keep.pt.rpm;}
  else level.spawn(c);
  car=c;audio.configure(SIM.dspCfg(spec));guide=level.guide(car);botFn=level.bot(car);
  return c;
}
const keepOf=c=>({p:c.p,q:c.q,v:c.v,w:c.w,wheels:c.wheels,hint:c.hint,pt:c.pt});
function rebuildCar(){makeCar(keepOf(car));}
let botFn=null,guide=null;

/* ---------- places ---------- */
function loadLevel(kind){
  if(level.kind===kind)return;
  settings.level=kind;save();
  level=makeLevel(kind);R.loadWorld(level.geo,level.T);flatsView.gk=flatsView.rk=null;flatsRun.restart();PS.setMask(level.mask);hud.setMap(level.map);ledHudView.setMap(level.map);cam.setLevel(level);
  car.world=level.world;level.spawn(car);car.pt.start();guide=level.guide(car);botFn=level.bot(car);
  mode=null;makeTraffic();
}

/* ---------- the traffic ---------- */
const TRAFFIC_N={mobile:16,low:28,medium:42,high:56,ultra:76},SL3_BOX=carBox({xF:2.25,xR:-2.30,hw:.966,H:1.28},CHASSIS.sl3.hcg);
let traffic=null,trafficInit=false,camLast={pos:[0,0,0],fwd:[1,0,0]};
function makeTraffic(){traffic=level.kind==='city'&&!Q.has('notraffic')&&!(mode&&mode.kind==='drag')?new Traffic(level,{count:+(Q.get('traffic')||TRAFFIC_N[settings.quality]||56)}):null;level.traffic=traffic;trafficInit=true;}
const playerBody=()=>({p:car.p,v:car.v,hcg:car.c.hcg,veh:car,box:SL3_BOX});

/* ---------- events ---------- */
let mode=null,freeDrift=null,doneT=-1;const pendingFx=[];
const GHOST_KEY='shiftlight.ghost.practice';
const freeGhost=()=>{try{return decodeGhost(JSON.parse(localStorage.getItem(GHOST_KEY)||'null'));}catch(e){return null;}};
function startMode(){
  mode=null;freeDrift=null;doneT=-1;const ev=session.ev;recorder.reset();
  if(session.kind==='career'&&ev){
    const ref=build(REF[ev.cls]),wet=env.wet;
    if(ev.kind==='race')mode=new Race(level,car,{rivals:5,laps:ev.laps,difficulty:ev.diff,wet,slot:3,ref});
    else if(ev.kind==='trial')mode=new TrialEvent(level,car,{laps:ev.laps,ghost:decodeGhost(career.d.ghosts[ev.id]),medals:MEDAL_LAPS[ev.cls].map(t=>t*(1+.07*wet))});
    else if(ev.kind==='drift')mode=new DriftEvent(level,car,{time:ev.time,targets:DRIFT_TARGETS[ev.cls].map(x=>Math.round(x*ev.time/90))});
    else if(ev.kind==='drag')mode=new DragEvent(level,car,{opp:ref,rt:DRAG_RT[ev.cls]});
  }else if(session.play==='loop-race')mode=new Race(level,car,{rivals:5,laps:+settings.laps||3,difficulty:settings.rivals,wet:env.wet,slot:3});
  else if(session.play==='loop-practice')mode=new TrialEvent(level,car,{laps:Infinity,ghost:freeGhost()});
  else if(session.play==='loop-drift')mode=new DriftEvent(level,car,{time:120});
  else if(session.play==='drag'){const cls=carB.cls;mode=new DragEvent(level,car,{opp:build(REF[cls]),rt:DRAG_RT[cls]});}
  else{level.spawn(car);freeDrift=new DriftScore();}
  /* rivals and opponents wear the reference car's aero */
  if(mode&&session.kind==='career'&&ev)mode.aeroDesign=AERO_DESIGN[REF[ev.cls].aero|0];
  else if(mode&&mode.kind==='drag')mode.aeroDesign=AERO_DESIGN[REF[carB.cls].aero|0];
  if(mode&&mode.kind==='drag'){traffic=null;level.traffic=null;}else if(level.kind==='city'&&!traffic)makeTraffic();
  if(mode&&mode.kind==='race')hud.message('GET READY','#ffb040',1.6);
}
/* what the event says each frame: sounds, messages, and when it's over */
function modeEvents(){
  for(const e of mode.takeEvents()){
    if(e.type==='light')pendingFx.push({type:'beep',f:660,len:.16,a:.5});
    else if(e.type==='go'){pendingFx.push({type:'beep',f:1320,len:.5,a:.6});hud.message('GO','#5dff7a',1.2);}
    else if(e.type==='beep')pendingFx.push({type:'beep',f:e.f,len:e.len,a:.5});
    else if(e.type==='msg')hud.message(e.text,e.col||'#ffb040',2);
    else if(e.type==='finish'&&e.e&&e.e.you)hud.message('FINISHED  P'+e.e.pos,e.e.pos===1?'#5dff7a':'#f4f2ff',4);
    else if(e.type==='finish'&&e.you)hud.message('FINISH','#f4f2ff',1.5);
    else if(e.type==='crash')pendingFx.push({type:'hit',a:Math.min(1,e.speed/12)*.5});
    else if(e.type==='lap'){hud.message(e.best?'BEST LAP  '+fmt(e.t):fmt(e.t),e.best?'#5dff7a':'#f4f2ff',2);
      if(e.best&&session.play==='loop-practice'&&mode.bestRec){try{localStorage.setItem(GHOST_KEY,JSON.stringify(encodeGhost(mode.bestRec)));}catch(err){}}}
    else if(e.type==='drift'){const m=e.m;if(m.t==='bank'&&m.pts>200)hud.message('+'+m.pts.toLocaleString('en-US'),'#ff4fa0',1.3);else if(m.t==='lost')hud.message(m.why+'  -'+Math.round(m.pts).toLocaleString('en-US'),'#ff3d5a',1.6);}}
  if(mode.done&&doneT<0)doneT=time;
  if(doneT>=0&&time-doneT>(mode.kind==='race'?0:1.5)&&state==='drive')showResults();
}
/* records out on the flats: top speed, the flying mile, jumps */
function flatsUpdate(dt){const mph=settings.units==='mph';flatsRun.update(dt,time,car,mph);
  const sp=v=>(v*(mph?2.23694:3.6)).toFixed(1)+(mph?' MPH':' KM/H'),far=d=>mph?Math.round(d*3.28084)+' FT':Math.round(d)+' M';
  for(const m of flatsRun.takeMessages()){
    if(m.t==='jump')hud.message((m.best?'BEST JUMP  ':'AIR ')+m.air.toFixed(1)+' S  '+far(m.dist),m.best?'#5dff7a':'#ff4fa0',2.2);
    else if(m.t==='top')hud.message('NEW TOP SPEED  '+sp(m.v),'#5dff7a',2.6);
    else if(m.t==='flying')hud.message('FLYING '+(m.unit==='mile'?'MILE':'KM')+'  '+sp(m.v),'#5dff7a',2.6);}}
function freeDriftUpdate(dt,ev){if(!freeDrift)return;freeDrift.update(dt,car,ev);
  for(const m of freeDrift.takeMessages()){if(m.t==='bank'&&m.pts>800)hud.message('DRIFT  +'+m.pts.toLocaleString('en-US'),'#ff4fa0',1.4);else if(m.t==='lost'&&m.pts>800)hud.message(m.why,'#ff3d5a',1.2);}}

/* ---------- screens ---------- */
const titleMenu=new TitleMenu($('titleMenu'),[],id=>pickTitle(id));
const hub=new CareerHub($('screen'),{career,start:ev=>startCareerEvent(ev),garage:()=>openGarage(),back:()=>toTitle(),wipe:()=>{career.reset();makeCar();parkCar();hub.render();}});
const garage=new Garage($('screen'),{get career(){return owner();},changed:()=>{rebuildCar();},back:()=>closeGarage(),sound:d=>{audio.configure(SIM.dspCfg(d.e));}});
const results=new Results($('screen'),{});
function titleItems(){const c=career.exists?`$${career.money.toLocaleString('en-US')} · REP ${career.rep} · class ${career.car().cls}`:'New';
  return [{id:'career',label:career.exists?'Career':'Start a career',sub:c},{id:'city',label:'Free roam',sub:'Shift City'},{id:'loop-race',label:'Race',sub:'Neon Loop · 5 rivals'},
    {id:'loop-practice',label:'Practice',sub:'Neon Loop · your ghost'},{id:'loop-drift',label:'Drift',sub:'Neon Loop · 2 minutes'},{id:'drag',label:'Drag',sub:'Main Ave · 1/4 mile'},
    {id:'garage',label:'Garage',sub:'Free-play car'},{id:'options',label:'Options',sub:''}];}
function activeUI(){
  if(menu.open)return {key:k=>{if(k==='back'){menuBack();return true;}return menu.key(k);}};
  if(state==='replay')return replayUI;
  if(state==='title')return titleMenu;if(state==='hub')return hub;if(state==='garage')return garage;if(state==='results')return results;return null;}
let menuBack=()=>pause(false);
const keyName=e=>({ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',Enter:'enter',' ':'enter',Escape:'back',Backspace:'back'}[e.key]||(e.key.length===1?e.key.toLowerCase():null));
window.addEventListener('keydown',e=>{
  audio.start();
  const ui=activeUI();
  if(ui){const k=keyName(e);if(k&&ui.key(k))e.preventDefault();return;}
  if(state==='drive'&&(e.key==='Escape'||e.key==='p'||e.key==='P')){pause(true);e.preventDefault();}
});
for(const t of ['pointerdown','touchend','click'])window.addEventListener(t,()=>audio.start());

/* ---------- touch: shown while you drive when this is a touch screen (or you asked for it) ---------- */
let touchSeen=COARSE,touchCfgKey='',touchLayoutKey='',fsTried=false;
addEventListener('pointerdown',e=>{if(e.pointerType==='touch')touchSeen=true;if(settings.steer==='tilt'&&!touch.tilt.listening)touch.enableTilt();},true);
addEventListener('keydown',()=>{if(settings.touch==='auto')touchSeen=false;},true);
document.addEventListener('gesturestart',e=>e.preventDefault());
const touchOn=()=>settings.touch==='on'||settings.touch==='auto'&&touchSeen;
const portrait=matchMedia('(orientation: portrait) and (pointer: coarse)');
function goFullscreen(){const d=document.documentElement,f=d.requestFullscreen||d.webkitRequestFullscreen;if(!f||document.fullscreenElement||document.webkitFullscreenElement)return;
  try{const p=f.call(d,{navigationUI:'hide'});if(p&&p.then)p.then(()=>{try{screen.orientation.lock('landscape').catch(()=>{});}catch(e){}}).catch(()=>{});}catch(e){}}
function toggleFullscreen(){if(document.fullscreenElement||document.webkitFullscreenElement)(document.exitFullscreen||document.webkitExitFullscreen).call(document);else goFullscreen();}
function touchUI(){
  const on=touchOn(),rt=$('rtouch');document.documentElement.classList.toggle('touch',on);
  touch.show(on&&state==='drive');rt.hidden=!(on&&state==='replay'&&replay);
  const k=[!!spec.nosKw,!car.pt.auto,settings.steer,touch.tilt.ok].join();if(k!==touchCfgKey){touchCfgKey=k;touch.configure({nos:!!spec.nosKw,manual:!car.pt.auto,steer:settings.steer});}
  if(!rt.hidden){rt.querySelector('.pp').textContent=replay.paused||replay.t>=replay.t1?'PLAY':'PAUSE';rt.querySelector('.spd').textContent='X'+(replay.speed<1?String(replay.speed).replace(/^0/,''):replay.speed);}
  /* where the HUD can draw: the notch, the buttons */
  const lk=[on,state,canvas.width,canvas.height,innerWidth,innerHeight,settings.ledRes,touch.cfg.nos,touch.cfg.manual].join();if(lk===touchLayoutKey)return;touchLayoutKey=lk;
  const dpr=canvas.width/Math.max(1,innerWidth),cs=getComputedStyle($('safe')),px=v=>(parseFloat(v)||0)*dpr;
  const ins={l:px(cs.paddingLeft),r:px(cs.paddingRight),t:px(cs.paddingTop),b:px(cs.paddingBottom)};
  const cam=on&&state==='drive'?touch.el.cam.getBoundingClientRect():null,bar=on&&state==='replay'?rt.getBoundingClientRect():null;
  Object.assign(hud,{touch:on,ui:Math.max(1,Math.min(1.45,.46/Math.min(innerWidth/1920,innerHeight/1080))),ins,mapRight:cam&&cam.width?(cam.left-18)*dpr:0,replayBar:bar&&bar.height?(innerHeight-bar.top+4)*dpr:0});
  const k2=ledHud.width/Math.max(1,canvas.width);
  Object.assign(ledHudView,{touch:on,ui:1,ins:{l:ins.l*k2,r:ins.r*k2,t:ins.t*k2,b:ins.b*k2},mapRight:hud.mapRight*k2,replayBar:hud.replayBar*k2});
}
$('rtouch').addEventListener('click',e=>{const b=e.target.closest('[data-r]');if(!b||!replay)return;const k=b.dataset.r;
  if(k==='speed')replay.speed=replay.speed>=4?.25:replay.speed*2;else replayUI.key(k);touchLayoutKey='';});

/* ---------- moving between screens ---------- */
const ORBIT=(shift=0)=>({yaw:2.4,pitch:.12,dist:7.2,fov:.62,y:.25,shift});
function hideAll(){$('title').hidden=true;$('screen').hidden=true;hub.open=garage.open=results.open=false;menu.hide();}
function enterTitle(){
  $('boot').hidden=true;
  if(Q.has('manual')){state='drive';return;}
  toTitle();
}
function toTitle(){
  hideAll();session={kind:'free',ev:null,play:'title'};mode=null;
  env=ENVS[settings.env]||ENVS.rain;makeCar();if(level.botStart)level.botStart(car);car.pt.start();
  if(level.kind==='city'&&!traffic)makeTraffic();
  state='title';$('title').hidden=false;cam.orbit={yaw:2.5,pitch:.1,dist:7.6,fov:.72,y:.2};
  $('titleSub').textContent=level.name+' · '+env.name;titleMenu.set(titleItems());
}
function pickTitle(id){
  if(touchOn()&&!fsTried&&id!=='options'){fsTried=true;goFullscreen();}
  if(id==='career')return enterHub();
  if(id==='options'){menuBack=()=>{menu.hide();menuBack=()=>pause(false);};menu.show(menuRows(true),'OPTIONS');return;}
  if(id==='garage'){session={kind:'free',ev:null,play:'garage'};hideAll();makeCar();parkCar();return openGarage();}
  startFree(id);
}
function startFree(play){
  hideAll();session={kind:'free',ev:null,play};
  const place=play==='city'||play==='drag'?'city':'loop';
  if(level.kind!==place)loadLevel(place);
  env=ENVS[settings.env]||ENVS.rain;makeCar();
  state='drive';cam.orbit=null;cam.mode=Math.max(0,CAM_MODES.indexOf(settings.cam));cam.cut=true;car.pt.start();
  startMode();audio.start();audio.suspend(false);
}
/* park the car somewhere pretty and let it settle, for the hub and the garage */
function parkCar(){level.spawn(car);car.pt.start();car.pt.st='run';for(let i=0;i<120;i++)car.step(1/240,{thr:0,brk:.4,hb:1,steer:0});}
function enterHub(){
  hideAll();session={kind:'career',ev:null};mode=null;
  if(!career.exists)career.save();
  env=ENVS.night;makeCar();parkCar();
  state='hub';cam.orbit=ORBIT(2.2);hub.show();audio.suspend(false);
}
function openGarage(){
  garage.from=state;hideAll();state='garage';cam.orbit=ORBIT(2.4);garage.dyno=null;garage.show();audio.suspend(false);
}
function closeGarage(){
  garage.hide();garage.dyno=null;audio.configure(SIM.dspCfg(spec));
  if(session.kind==='career'){state='hub';hub.show();}
  else if(garage.from==='pause'){state='drive';if(mode)startMode();pause(true);}
  else toTitle();
}
function startCareerEvent(ev){
  hideAll();session={kind:'career',ev};
  env=ENVS[ev.env]||ENVS.night;
  if(level.kind!==ev.place)loadLevel(ev.place);
  makeCar();state='drive';cam.orbit=null;cam.mode=Math.max(0,CAM_MODES.indexOf(settings.cam));cam.cut=true;car.pt.start();
  startMode();audio.start();audio.suspend(false);
}
function showResults(){
  const r=mode.result(),ev=session.ev;state='results';
  const data={title:r.title,name:ev?ev.name:{race:'Neon Loop',trial:'Practice',drift:'Drift run',drag:'Main Avenue'}[mode.kind],rank:r.rank,medal:r.medal||MEDALS[r.rank]||(ev?'No medal':mode.kind==='drift'?Math.round(mode.score.total).toLocaleString('en-US'):'Done'),summary:r.summary,rows:r.rows,reward:null,buttons:[]};
  if(ev){const a=career.award(ev,r.rank,r.stat);
    if(r.ghost&&r.stat.best&&(!career.d.results[ev.id].best||r.stat.best<=career.d.results[ev.id].best+1e-6)){career.d.ghosts[ev.id]=encodeGhost(r.ghost);career.save();}
    data.reward=[`+$${a.pay.toLocaleString('en-US')}${a.first||!r.rank?'':' (repeat)'}`];if(a.repGain)data.reward.push(`+${a.repGain} reputation`);if(a.newTier)data.reward.push(`Class ${a.newTier} events open`);
    data.buttons=[{label:'Retry',act:()=>startCareerEvent(ev)},{label:'Replay',act:()=>startReplay('results')},{label:'Career',act:()=>enterHub()}];}
  else data.buttons=[{label:'Again',act:()=>startFree(session.play)},{label:'Replay',act:()=>startReplay('results')},{label:'Title',act:()=>toTitle()}];
  results.set(data);results.show();
}
function pause(on){
  if(on===(state==='pause'))return;
  if(on){state='pause';menuBack=()=>pause(false);menu.show(menuRows(false),'PAUSED');audio.suspend(true);}
  else{state='drive';menu.hide();audio.suspend(false);}
}
function swapEngine(id){sandbox.fit('engine',id);settings.engine=id;save();rebuildCar();}
function menuRows(optionsOnly){
  const opt=(id,label,desc,extra)=>Object.assign({id,label,desc},extra||{});
  const set=(k,fn)=>v=>{settings[k]=v;save();fn&&fn(v);};
  const inCareer=session.kind==='career'&&session.ev,free=session.kind==='free'&&!optionsOnly;
  const rows=[];
  if(optionsOnly)rows.push({type:'action',label:'Back',act:()=>menuBack()});
  else{rows.push({type:'action',label:'Resume',act:()=>pause(false)});
    if(recorder.frames.length>40)rows.push({type:'action',label:'Watch the replay',act:()=>{menu.hide();startReplay('pause');}});
    if(inCareer)rows.push({type:'action',label:'Restart the event',act:()=>{menu.hide();startCareerEvent(session.ev);}},{type:'action',label:'Quit to the career',act:()=>{menu.hide();enterHub();}});
    else{
      if(session.play==='loop-race')rows.push({type:'head',label:'Race'},
        {type:'choice',label:'Rivals',chips:1,get:()=>settings.rivals,set:set('rivals'),options:Object.entries(DIFFICULTY).map(([id,d])=>opt(id,d.name))},
        {type:'choice',label:'Laps',chips:1,get:()=>String(settings.laps),set:set('laps',v=>{settings.laps=+v;}),options:['3','5','8'].map(n=>opt(n,n))});
      if(mode)rows.push({type:'action',label:'Start again',act:()=>{pause(false);startMode();}});
      else rows.push({type:'action',label:'Back to the start',act:()=>{pause(false);level.spawn(car);car.pt.start();}});
      rows.push({type:'action',label:'Garage',act:()=>{menu.hide();openGarage();}});}
  }
  rows.push({type:'head',label:'Driving'},
    {type:'choice',label:'Assists',chips:1,get:()=>settings.assist,set:set('assist',v=>{car.setAssists(v);car.pt.auto=settings.gearbox==='auto';guide=level.guide(car);}),options:[
      opt('easy','Arcade Easy','The car slows for corners and steers off the walls for you, grips harder in the wet, and stays on its wheels. Handbrake drifts still work.'),
      opt('arcade','Arcade','Steering, stability and drift help. Handbrake into a corner and hold the angle with the stick.'),
      opt('sport','Sport','Less steering help, a looser stability net. The car moves around more.'),
      opt('sim','Simulation','Just the car: no steering or stability help. ABS stays on.')]},
    {type:'choice',label:'Gearbox',chips:1,get:()=>settings.gearbox,set:set('gearbox',v=>{car.pt.auto=v==='auto';}),options:[opt('auto','Automatic'),opt('manual','Manual','Q / E or the B / X buttons to shift; on a touch screen, the + and − pads.')]});
  if(COARSE||touchSeen||navigator.maxTouchPoints>0||settings.touch!=='auto'){rows.push({type:'head',label:'Touch'},
    {type:'choice',label:'Touch pads',chips:1,get:()=>settings.touch,set:set('touch'),options:[opt('auto','Auto','On when you touch the screen, off again when you press a key.'),opt('on','Always'),opt('off','Off')]},
    {type:'choice',label:'Steering',chips:1,get:()=>settings.steer,set:v=>{settings.steer=v;save();if(v==='tilt')touch.enableTilt().then(ok=>{if(!ok){settings.steer='slide';save();hud.message('NO TILT ACCESS','#ff3d5a',2);if(menu.open)menu.render();}else setTimeout(()=>{if(!touch.tilt.ok)hud.message('NO TILT DATA · SLIDE TO STEER','#ffb040',3);},1500);});},
      options:[opt('slide','Slide','Put your left thumb down anywhere on the left and slide it sideways. Past full lock the centre follows your thumb.'),opt('buttons','Buttons','Two pads, left and right; steering builds up like on a keyboard.'),opt('tilt','Tilt','Turn the phone like a steering wheel.')]});
    if(document.fullscreenEnabled||document.webkitFullscreenEnabled)rows.push({type:'action',label:document.fullscreenElement||document.webkitFullscreenElement?'Leave full screen':'Full screen',act:()=>{toggleFullscreen();setTimeout(()=>{if(menu.open)menu.render();},300);}});}
  if(free&&level.kind==='city'&&onFlats(car.p[0],-car.p[2]))rows.push({type:'action',label:'Back to Shift City',act:()=>{level.spawn(car);car.pt.start();flatsRun.restart();cam.cut=true;pause(false);}});
  if(free){rows.push({type:'head',label:'Car'},
    {type:'choice',label:'Nitrous',chips:1,get:()=>settings.nosFree,set:set('nosFree'),
      options:[opt('endless','Endless','Free roam only: the bottle never runs dry. Events always use the real bottle.'+(spec.nosKw?'':' This car has no nitrous fitted yet: add it in the garage.')),opt('normal','Normal','The bottle empties as you use it, as in events.')]},
    {type:'choice',label:'Engine',get:()=>sandbox.setup.engine,set:v=>swapEngine(v),options:ENGINE_CHOICES.concat(['street4','three','oddv6','rotary2','eight','flat6']).filter((v,i,a)=>a.indexOf(v)===i).map(id=>{const p=SIM.PRESETS.find(q=>q.id===id);return opt(id,p.name,p.tag);})},
    {type:'choice',label:'Paint',chips:1,get:()=>sandbox.setup.paint,set:v=>sandbox.paint(v),options:Object.entries(PAINTS).map(([id,p])=>opt(id,p.name,'',{swatch:`rgb(${p.col.map(c=>Math.round(Math.pow(c,1/2.2)*255)).join(',')})`}))},
    {type:'head',label:'World'},
    {type:'choice',label:'Time',chips:1,get:()=>settings.env,set:set('env',v=>{env=ENVS[v];}),options:ENV_IDS.map(id=>opt(id,ENVS[id].name))});}
  rows.push({type:'head',label:'View'},
    {type:'choice',label:'Camera',chips:1,get:()=>CAM_MODES[cam.mode],set:v=>{cam.mode=CAM_MODES.indexOf(v);cam.cut=true;settings.cam=v;save();},options:CAM_MODES.map(m=>opt(m,m[0].toUpperCase()+m.slice(1)))},
    {type:'choice',label:'Display',chips:1,get:()=>settings.display,set:set('display'),options:[opt('modern','Modern'),opt('led','LED Matrix','The whole picture on a wall of round lamps, the HyperDot way. L toggles it while driving.')]},
    {type:'choice',label:'LED density',chips:1,get:()=>settings.ledRes,set:set('ledRes'),options:[opt('classic','Classic 320 × 180'),opt('fine','Fine 480 × 270')]},
    {type:'choice',label:'Speed units',chips:1,get:()=>settings.units,set:set('units'),options:[opt('kmh','km/h'),opt('mph','mph')]},
    {type:'head',label:'Graphics'},
    {type:'choice',label:'Quality',chips:1,get:()=>settings.quality,set:v=>{settings.quality=v;save();location.reload();},options:['mobile','low','medium','high','ultra'].map(q=>opt(q,q[0].toUpperCase()+q.slice(1),q==='mobile'?'For phones and tablets: lighter shadows, haze and reflections, no motion blur, fewer cars. Changing this reloads the page.':'Changing this reloads the page.'))},
    {type:'choice',label:'Resolution',chips:1,get:()=>String(settings.scale),set:v=>{settings.scale=v==='auto'?'auto':+v;save();drs.enabled=v==='auto';if(v!=='auto')R.resize(canvas.width,canvas.height,+v);},
      options:[opt('auto','Auto','Keeps the frame rate by adjusting the render scale; TAA rebuilds full resolution.'),opt('0.5','50%'),opt('0.67','67%'),opt('0.85','85%'),opt('1','100%')]},
    {type:'choice',label:'Frame rate',chips:1,get:()=>String(settings.fps),set:set('fps'),
      options:[opt('auto','Auto'+(drs.raw.length>=24?' ('+fpsLabel(drs.divFor('auto'))+')':''),'About 60 to 100 frames a second on any screen, always on an even beat. Whatever the graphics card has left over goes into sharper resolution.'),
        ...[1,2,3].map(k=>opt(String(k),drs.raw.length>=24?fpsLabel(k)+' fps':['Every refresh','Half','Third'][k-1],['Every refresh of your screen. Smoothest, but the most work: Auto resolution drops further to keep up.','Every other refresh of your screen.','Every third refresh of your screen.'][k-1]))]},
    {type:'choice',label:'Performance readout',chips:1,get:()=>settings.perf?'on':'off',set:v=>{settings.perf=v==='on';save();},
      options:[opt('off','Off'),opt('on','On','Frame rate, where each frame\'s time goes, the resolution being drawn and the graphics chip the browser is using. P toggles it.')]},
    {type:'head',label:'Sound'},
    {type:'slider',label:'Volume',min:0,max:1,stepV:.05,get:()=>settings.volume,set:v=>{settings.volume=v;save();audio.setVolume(v);},fmt:v=>Math.round(v*100)+'%'});
  if(!optionsOnly&&!inCareer)rows.push({type:'action',label:'Quit to the title',act:()=>{menu.hide();toTitle();}});
  return rows;
}

/* ---------- replays ---------- */
const recorder=new ReplayRecorder(120);
let replay=null,replayFrom=null,replayCam=0,camBefore=0;
const REPLAY_CAMS=['tv','chase','far','bumper','orbit'];
const proxy={p:[0,0,0],q:[0,0,0,1],v:[0,0,0],accB:[0,0,0],steer:0,wheels:[],c:null,loc:null,snd:null,brkIn:0,rev:false,speed:0,vf:0};
function startReplay(from){
  if(recorder.frames.length<10)return;
  replay=new ReplayPlayer(recorder,d=>wheelLayout(CHASSIS[d]||CHASSIS.sl3));replayFrom=from;
  proxy.c=car.c;proxy.wheels=car.wheels.map(w=>({hp:w.hp.slice(),len:w.len,ang:0,front:w.front,i:w.i}));proxy.loc=null;
  hideAll();camBefore=cam.mode;replayCam=0;setReplayCam();state='replay';audio.suspend(false);audio.rivals([]);
}
function setReplayCam(){const m=REPLAY_CAMS[replayCam];cam.orbit=m==='orbit'?{yaw:2.2,pitch:.15,dist:8,fov:.7,y:.3}:null;if(m!=='orbit')cam.mode=CAM_MODES.indexOf(m);cam.cut=true;}
function endReplay(){replay=null;cam.orbit=null;cam.mode=camBefore;cam.cut=true;
  if(replayFrom==='results'){state='results';results.show();}else{state='drive';pause(true);}}
const replayUI={key:k=>{if(!replay)return false;
  if(k==='back')endReplay();else if(k==='enter'){if(replay.t>=replay.t1)replay.t=replay.t0;replay.paused=!replay.paused;}
  else if(k==='left')replay.seek(-5);else if(k==='right')replay.seek(5);
  else if(k==='up')replay.speed=Math.min(4,replay.speed*2);else if(k==='down')replay.speed=Math.max(.25,replay.speed/2);
  else if(k==='c'){replayCam=(replayCam+1)%REPLAY_CAMS.length;setReplayCam();}else return false;return true;}};

/* ---------- per-frame pieces ---------- */
function fit(){const dpr=Math.min(R.Q.dpr||2,devicePixelRatio||1),w=Math.round(innerWidth*dpr),h=Math.round(innerHeight*dpr);
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;hudC.width=w;hudC.height=h;}
  R.resize(w,h,R.iw?R.scale:(settings.scale==='auto'?drs.scale:+settings.scale));}
function carView(c=car){
  const S=owner().setup;
  return {id:1,design:AERO_DESIGN[S.aero|0]||'sl3',self:true,driver:CAM_MODES[cam.mode]!=='cockpit'||!!cam.orbit,p:c.p,q:c.q,paint:PAINTS[S.paint]||PAINTS.magenta,caliper:[.75,.03,.02],
    wheels:c.wheels.map(w=>({hp:w.hp,len:w.len,steer:w.front?c.steer:0,ang:w.ang,disc:w.disc||0})),
    lamps:[env.night>.3?1:0,env.night>.3?1:0,c.brkIn>.05?1:0,c.rev?1:0]};
}
const sc3=(a,k)=>[a[0]*k,a[1]*k,a[2]*k];
function carLights(car){
  const M=qmat(car.q),F=mcol(M,0),U=mcol(M,1),Rt=mcol(M,2),h=car.c.hcg,at=(x,y,z)=>add(car.p,mvec(M,[x,y-h,z]));
  const dyn=[],brake=car.brkIn>.05;
  for(const z of [-.66,.66])dyn.push({pos:at(-2.45,.78,z),r:brake?11:6,col:brake?[5,.12,.06]:[.9,.02,.01],type:1,dir:norm(madd(sc3(F,-1),U,-.35)),cosO:Math.cos(1.3)});
  if(car.rev)for(const z of [-.36,.36])dyn.push({pos:at(-2.45,.77,z),r:9,col:[3,2.9,2.7],type:1,dir:norm(madd(sc3(F,-1),U,-.3)),cosO:Math.cos(1.2)});
  const on=env.night>.3;
  return {dyn,headlights:on?{on:1,high:highBeam?1:0,posL:at(2.12,.6,-.62),posR:at(2.12,.6,.62),dir:norm(madd(F,U,-.035)),right:Rt,up:U,col:[1050,1090,1140],range:95}:null};
}
function flicker(t){
  /* 1-7: the neon's moods; 8-12: the five red start lights; 13: the green */
  const held=!!(mode&&mode.held&&mode.kind!=='drag'),n=mode&&mode.lights?mode.lights:0;
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
  const M=qmat(car.q),F=mcol(M,0),h=car.c.hcg,cmode=CAM_MODES[cam.mode];
  const exhaust=add(car.p,mvec(M,[-2.3,.25-h,0])),rel=sub(c.pos,exhaust),dist=len(rel);
  const right=norm([-(c.fwd[2]),0,c.fwd[0]]);const dirToCam=norm(sub(c.pos,car.p));
  let listener=0,geo={dist:Math.max(1.5,dist),pan:clamp(-dot(norm(sub(car.p,c.pos)),right)*.9,-1,1),rear:1};
  if(cam.orbit){geo.rear=clamp(.5-.5*dot(dirToCam,F),0,1)*.6+.4;}
  else if(cmode==='cockpit'){listener=1;geo={dist:1.4,pan:0,rear:.35};}
  else if(cmode==='hood'||cmode==='bumper'){geo={dist:cmode==='hood'?3.2:4.6,pan:0,rear:cmode==='hood'?.3:.15};}
  else if(cmode==='tv'){listener=2;geo.rear=.5-.5*dot(dirToCam,F);geo.jump=c.cut;}
  else geo.rear=clamp(.5-.5*dot(dirToCam,F),0,1)*.6+.4;
  /* in the garage the dyno's powertrain is the one making the noise */
  const D=state==='garage'&&garage.dyno?garage.dyno:null;
  const ep=D?D.pt.soundParams(0,D.live.speed,geo):car.pt.soundParams(listener,len(car.v),geo);
  const tunnel=level.shelter(car);
  const tA=Math.tan(car.tyre.aPk),kP=car.tyre.kPk;
  const fx={lat:car.wheels.map(w=>w.contact?Math.abs(w.tanA)/tA:0),lon:car.wheels.map(w=>w.contact?Math.abs(w.kap)/kP:0),load:car.wheels.map(w=>w.Fz),wet:env.wet,speed:D?D.live.speed*.5:len(car.v),cabin:listener===1?1:0,
    curb:car.wheels.some(w=>w.contact&&w.surf==='curb')?1:0,scrape:ev.scrape||0,vol:1,tunnel};
  const fev=[];if(ev.wall>1.2)fev.push({type:'hit',a:ev.wall/9});
  fev.push(...pendingFx.splice(0));
  /* the rivals (and the drag opponent): the nearest two get their own engine synth */
  const others=mode?mode.others():[];
  if(others.length){const cv=camLast.pos,list=[];
    const near=others.map(o=>({o,d:Math.hypot(o.car.p[0]-cv[0],o.car.p[1]-cv[1],o.car.p[2]-cv[2])})).sort((a,b)=>a.d-b.d);
    for(const {o,d} of near.slice(0,2)){const u=norm(sub(o.car.p,cv)),Fr=mcol(qmat(o.car.q),0);
      const p=o.car.pt.soundParams(2,len(o.car.v),{dist:Math.max(2,d),pan:clamp(dot(u,right),-1,1)*.85,rear:clamp(.5+.5*dot(u,Fr),0,1)*.6+.4});p.vol=listener===1?.45:.8;
      list.push({id:o.id,cfg:SIM.dspCfg(o.car.spec),p,ev:o.car.pt.takeEvents()});}
    for(const {o} of near.slice(2))o.car.pt.takeEvents();
    audio.rivals(list,{mobile:1,low:1,medium:1,high:2,ultra:2}[settings.quality]??2);}
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
      else if(e.type==='crash'&&e.far)fev.push({type:'hit',a:Math.min(1,e.speed/10)*a});}}
  if(ev.land>2.2)fev.push({type:'hit',a:ev.land/10});if(ev.ground>2)fev.push({type:'hit',a:ev.ground/8});
  audio.update(ep,D?D.pt.takeEvents():car.pt.takeEvents(),fx,fev,{tunnel,cabin:listener===1});
}
function hudState(){
  const pt=car.pt,e=spec;const g=Math.max(1,pt.gear);
  const kmh=settings.units==='mph'?.621371:1;
  const S={rpm:pt.rpm,limiter:e.limiterRpm,shiftRpm:(pt.upRpm&&pt.upRpm[g-1])||e.shiftRpm,speed:car.vf*kmh,units:settings.units==='mph'?'MPH':'KM/H',
    gear:pt.gear,rev:car.rev,auto:pt.auto,shiftLamp:pt.rpm>((pt.upRpm&&pt.upRpm[g-1])||e.shiftRpm)*.985,
    boost:pt.boost*(e.fiBoost||0),boostMax:e.turbo||e.sup?e.fiBoost:0,nos:pt.nos,nosMax:e.nosKw?1:0,nosOn:pt.nosOn,
    levelName:(session.ev?session.ev.name:level.name).toUpperCase(),laps:false,place:level.laps?null:level.place(car),mapHead:Math.atan2(-mcol(qmat(car.q),0)[2],mcol(qmat(car.q),0)[0]),
    assistName:ASSISTS[settings.assist].name.toUpperCase()+' · '+(pt.auto?'AUTO':'MANUAL'),
    tc:pt.tcOn,abs:car.absOn,esc:car.escOn,drift:car.drift.on,guide:car.aid.guide?(guide&&(guide.state.brake>.05||Math.abs(guide.state.steer)>.05)?1:.5):0,mapCar:[car.p[0],-car.p[2]],mapDots:traffic?traffic.cars.filter(t=>t.dist<520).map(t=>{const p=t.view&&t.view.p||traffic.worldPos(t);return [p[0],-p[2]];}):null,
    hint:state==='drive'&&time<6&&!mode?(touchOn()?'II FOR THE MENU · CAM CAMERA · RESET BACK ON THE ROAD':'ESC FOR THE MENU · C CAMERA · L LED MATRIX'):null};
  if(mode)Object.assign(S,mode.hud(time));
  if(freeDrift){const d=freeDrift.hud();S.freeChain=d.driftChain;S.freeMult=d.driftMult;S.freeGap=d.driftGap;}
  /* out on the flats: which way home, and the records */
  if(level.kind==='city'&&!mode&&onFlats(car.p[0],-car.p[2])){const x=car.p[0],y=-car.p[2],mph=settings.units==='mph',d=Math.hypot(x,y);
    const dirs=['EAST','NORTHEAST','NORTH','NORTHWEST','WEST','SOUTHWEST','SOUTH','SOUTHEAST'],k=((Math.round(Math.atan2(-y,-x)/(Math.PI/4))%8)+8)%8;
    S.placeSub='SHIFT CITY '+(mph?(d/1609.344).toFixed(1)+' MI':(d/1000).toFixed(1)+' KM')+' '+dirs[k];
    const u=v=>v*(mph?2.23694:3.6),R2=flatsRun.rec;
    S.flats={top:u(flatsRun.top),topBest:u(R2.top),fly:u(flatsRun.flying),flyBest:u(mph?R2.mile:R2.km),flyName:mph?'FLYING MILE':'FLYING KM',
      jump:mph?R2.jump*3.28084:R2.jump,jumpUnit:mph?'FT':'M',air:R2.air};}
  return S;
}

/* ---------- the loop ---------- */
let slowT=0,slowHinted=false;
let state='boot',time=0,acc=0,frameN=0,highBeam=false,lastInp={};
const DT=1/240;
const fmt=t=>{const m=Math.floor(t/60),s=t-m*60;return m+':'+(s<10?'0':'')+s.toFixed(3);};
let camPrev=null,liveViews=[];
function step(dt){
  const inp=input.poll(dt);lastInp=inp;
  if(inp.perf){settings.perf=!settings.perf;save();if(menu.open)menu.render();}
  /* gamepad: menus and screens */
  const ui=activeUI();if(ui&&inp.nav)for(const k of inp.nav)ui.key(k);
  if(inp.pause){if(state==='drive')pause(true);else if(state==='pause')pause(false);}
  if(cam.orbit&&state!=='drive')cam.orbit.yaw+=dt*(state==='title'?.11:.07);
  /* if this machine can't keep up even at the lowest render scale, say what to change */
  if(state==='drive'&&settings.scale==='auto'&&drs.scale<=drs.min+.001&&dt>drs.period/1000*1.45){slowT+=dt;if(slowT>6&&!slowHinted){slowHinted=true;hud.message(settings.quality==='low'||settings.quality==='mobile'?'LOW FRAME RATE':'TRY QUALITY: '+(settings.quality==='ultra'?'HIGH':settings.quality==='high'?'MEDIUM':'LOW'),'#ffb040',4);}}else slowT=Math.max(0,slowT-dt);
  if(state==='pause'||state==='boot')return {ev:{}};
  if(state==='replay'){replay.step(dt);replay.you(proxy);if(level.T){const L=level.T.locate(proxy.p[0],proxy.p[2],proxy.loc?proxy.loc.i:-1);proxy.loc=L;}return {ev:{}};}
  if(state==='drive'){
    if(inp.cam){cam.next();settings.cam=CAM_MODES[cam.mode];save();}
    if(inp.led){settings.display=settings.display==='led'?'modern':'led';save();}
    if(inp.high)highBeam=!highBeam;
    if(inp.env&&!session.ev){settings.env=ENV_IDS[(ENV_IDS.indexOf(settings.env)+1)%ENV_IDS.length];env=ENVS[settings.env];save();hud.message(env.name.toUpperCase(),'#4fe3ff',1.5);}
    if(inp.reset&&!(mode&&mode.held)){level.resetAt(car);car.pt.start();if(mode&&mode.invalidate)mode.invalidate();}
    if(inp.up)car.pt.shift(1);if(inp.down)car.pt.shift(-1);
  }
  car.wet=env.wet;
  /* who's driving: you, the title's robot, or nobody (parked in the hub and garage, coasting after the results) */
  let drive;
  if(state==='title'||Q.has('auto')&&state==='drive')drive=Object.assign({},inp,botFn(car));
  else if(state==='hub'||state==='garage')drive={thr:0,brk:.4,hb:1,steer:0};
  else if(state==='results')drive={thr:0,brk:.35,hb:0,steer:0};
  else drive=inp;
  if(state==='drive'&&car.aid.guide&&guide)drive=guide(drive);
  const pb=playerBody();if(mode&&state==='drive')drive=mode.gate(drive);
  /* free roam: the nitrous bottle never runs dry (unless you've asked for the real one) */
  if(state==='drive'&&session.kind==='free'&&!mode&&settings.nosFree!=='normal'&&spec.nosKw)car.pt.nos=1;
  acc+=dt;let n=0;while(acc>=DT&&n<24){car.step(DT,drive);if(mode)mode.stepPhysics(DT);if(traffic)traffic.stepPhysics(DT,pb);acc-=DT;n++;time+=DT;}
  if(acc>DT)acc=0;
  if(state==='garage'){garage.step(dt);if(garage.dyno){const w=garage.dyno.pt.meanW(garage.dyno.W);for(const wh of car.wheels)if(garage.dyno.pt.drv.includes(wh.i))wh.ang+=w*dt;}}
  if(traffic){traffic.wet=env.wet;traffic.update(dt,{time,player:pb,cam:camLast,night:env.night,init:trafficInit});trafficInit=false;}
  const ev=car.takeEvents();
  if(mode){mode.wet=env.wet;mode.update(dt,time,{ev});modeEvents();}
  if(state==='drive')freeDriftUpdate(dt,ev);
  if(state==='drive'&&session.kind==='free'&&!mode&&level.kind==='city')flatsUpdate(dt);
  /* everyone else on screen this frame (and into the replay) */
  liveViews=[...(mode?mode.views(env.night>.3):[]),...(traffic?traffic.views({night:env.night}):[])];
  if(state==='drive')recorder.add(time,car,carView(),liveViews,car.p);
  effects(dt);
  return {ev};
}
function render(dt,ev){
  const R1=state==='replay'&&replay,subj=R1?proxy:car;
  const c=cam.update(dt,subj,{look:!R1&&!!lastInp.look,impact:R1?0:Math.max(ev.wall||0,ev.land||0)*.25});
  const L=carLights(subj),M=qmat(subj.q),F=mcol(M,0),fw=norm([F[0],0,F[2]]);camLast={pos:c.pos,fwd:c.fwd};
  let you=carView(subj),others;
  if(R1){others=replay.others();if(env.night>.3)for(const o of others.slice(0,{mobile:0,low:0,medium:2,high:4,ultra:6}[settings.quality]??4)){if(o.ghost)continue;const Mo=qmat(o.q),Fo=mcol(Mo,0),Uo=mcol(Mo,1);L.dyn.push({pos:add(o.p,[Fo[0]*2.1,.1,Fo[2]*2.1]),r:30,col:[150,145,130],type:1,dir:[Fo[0]-Uo[0]*.08,Fo[1]-Uo[1]*.08-.04,Fo[2]-Uo[2]*.08],cosO:Math.cos(.6)});}}
  else{
    if(mode&&env.night>.3){const near=mode.others().map(o=>({o,d:Math.hypot(o.car.p[0]-c.pos[0],o.car.p[2]-c.pos[2])})).sort((a,b)=>a.d-b.d).slice(0,{mobile:0,low:0,medium:2,high:3,ultra:4}[settings.quality]??3);
      for(const {o} of near){const Mr=qmat(o.car.q),Fr=mcol(Mr,0),Ur=mcol(Mr,1),hr=o.car.c.hcg,pos=add(o.car.p,mvec(Mr,[2.1,.62-hr,0]));L.dyn.push({pos,r:30,col:[150,145,130],type:1,dir:[Fr[0]-Ur[0]*.08,Fr[1]-Ur[1]*.08-.04,Fr[2]-Ur[2]*.08],cosO:Math.cos(.6)});}}
    if(traffic)L.dyn.push(...traffic.lights({night:env.night,cam:c},Math.min(16-L.dyn.length,{mobile:0,low:0,medium:2,high:4,ultra:6}[settings.quality]??4)));
    others=liveViews;
  }
  const camVel=camPrev&&!c.cut?sub(c.pos,camPrev).map(x=>x/Math.max(dt,1e-3)):[0,0,0];camPrev=c.pos.slice();
  PS.rain.on=env.rain;PS.rain.camVel=camVel;PS.update(dt,c.pos);
  const led=settings.display==='led',showHud=state==='drive';
  const hs=showHud?hudState():R1?{replay:{t:replay.t-replay.t0,dur:replay.duration,speed:replay.speed,paused:replay.paused,cam:REPLAY_CAMS[replayCam]}}:null;
  let ledS=null;
  if(led){const res=settings.ledRes==='fine'?[480,270]:[320,180];if(ledHud.width!==res[0]){ledHud.width=res[0];ledHud.height=res[1];}
    ledHudView.pixel=true;ledHudView.draw(hs,dt);ledS={res,hud:R.hudTexture(ledHud),quant:15};}
  if(level.kind==='city')flatsView.update(c.pos);
  R.render({time:R1?replay.t:time,dt,cam:c,cut:c.cut,env,flicker:flicker(time),probePos:add(subj.p,[0,.4,0]),dyn:L.dyn,headlights:L.headlights,
    occ:[[subj.p[0],subj.p[1],subj.p[2],car.c.hcg,fw[0],fw[2],car.c.body.L/2,car.c.body.W/2]],cars:[you,...others,...extraCars],
    shutter:.5,lensRain:c.lensRain*env.rain*(1-level.shelter(subj)),led:ledS,debug:Q.get('debug'),debugGain:+(Q.get('gain')||1)});
  const th=performance.now();hud.draw(led?null:hs,dt);hudMs=performance.now()-th;
  if(R1)replaySound(c);else if(state!=='pause')soundUpdate(c,ev);
}
/* the replay's sound: your engine as it was, the road and wind at the speed you were going */
function replaySound(c){
  const S=proxy.snd||{rpm:800,load:0,gear:1,boost:0,nos:0,cutFrac:0},M=qmat(proxy.q),F=mcol(M,0);
  const right=norm([-(c.fwd[2]),0,c.fwd[0]]),d=Math.max(1.5,len(sub(c.pos,proxy.p))),dirToCam=norm(sub(c.pos,proxy.p));
  const tv=REPLAY_CAMS[replayCam]==='tv',inCar=REPLAY_CAMS[replayCam]==='bumper';
  const ep={on:1,firing:1,crank:0,crankT:0,rpm:S.rpm,load:replay.paused?0:S.load,cutFrac:S.cutFrac,boost:S.boost,nos:S.nos,speed:proxy.speed,gear:S.gear,twostep:0,antilag:0,
    view:tv?2:0,dist:inCar?4.6:d,pan:inCar?0:clamp(-dot(norm(sub(proxy.p,c.pos)),right)*.9,-1,1),rear:inCar?.15:clamp(.5-.5*dot(dirToCam,F),0,1)*.6+.4,vol:replay.paused?0:1,jump:c.cut?1:0};
  const fx={lat:[0,0,0,0],lon:[0,0,0,0],load:[0,0,0,0],wet:env.wet,speed:replay.paused?0:proxy.speed,cabin:0,curb:0,scrape:0,vol:1};
  audio.update(ep,[],fx,[],{tunnel:level.shelter(proxy),cabin:false});
}
let last=performance.now(),lastRaw=0,fps=60;
const fpsLabel=k=>{const f=drs.hz/k;return Math.abs(f-Math.round(f))<.05?String(Math.round(f)):f.toFixed(1);};
/* what each frame costs, for the performance readout */
const perfAcc={n:0,t:0,worst:0,step:0,draw:0,hud:0,gpu:0,gpuN:0,steps:0,t0:performance.now()};let perfShown=null;
function frame(dt){fit();touchUI();if(portrait.matches&&state==='drive')pause(true);
  const t0=performance.now(),acc0=time;const r=step(dt);const t1=performance.now();let t2=t1;
  /* paused, the scene stands still behind the menu: redraw it now and then (settings changes show), not every frame */
  if(state!=='pause'||frameN%8===0){
    /* draw the cars where they are between physics steps, not where the last step left them */
    interpolateVehicles(acc/DT);try{render(dt,r.ev||{});}finally{restoreVehicles();}t2=performance.now();}
  frameN++;
  if(settings.scale==='auto'){const sc=drs.update(dt*1000,R.gpuMs);if(Math.abs(sc-R.scale)>.001)R.resize(canvas.width,canvas.height,sc);}
  const P=perfAcc;P.n++;P.t+=dt*1000;P.worst=Math.max(P.worst,dt*1000);P.step+=t1-t0;P.draw+=t2-t1-hudMs;P.hud+=hudMs;P.steps+=Math.round((time-acc0)/DT);
  if(R.gpuMs>0){P.gpu+=R.gpuMs;P.gpuN++;}
  perfUpdate();}
function loop(now){requestAnimationFrame(loop);
  if(lastRaw)drs.noteVsync(now-lastRaw);lastRaw=now;
  /* show a frame only on the screen refreshes the frame-rate setting targets, so they come at an even beat */
  const k=drs.divFor(settings.fps);drs.setDivisor(k);const per=1000/drs.hz;
  if(k>1&&now-last<k*per-per*.5)return;
  const dt=Math.min(.05,(now-last)/1000);last=now;fps+=(1/Math.max(dt,1e-3)-fps)*.05;frame(dt);}
/* ---------- the performance readout ---------- */
let hudMs=0;
function perfUpdate(){
  const el=$('perf'),on=!!settings.perf&&(state==='drive'||state==='replay');if(el.hidden===on)el.hidden=!on;
  const P=perfAcc,now=performance.now();if(now-P.t0<500)return;
  if(on&&P.n){const f=x=>x.toFixed(1),q=settings.quality;
    const cpu=(P.step+P.draw+P.hud)/P.n,gpu=P.gpuN?P.gpu/P.gpuN:-1;
    el.textContent=[
      `${Math.round(1000*P.n/(now-P.t0))} FPS   target ${fpsLabel(drs.div)} (${drs.hz} Hz screen)`,
      `frame ${f(P.t/P.n)} ms   worst ${f(P.worst)} ms`,
      `CPU   ${f(cpu)} ms  (game ${f(P.step/P.n)} · draw ${f(P.draw/P.n)} · HUD ${f(P.hud/P.n)})`,
      `GPU   ${gpu>0?f(gpu)+' ms':'not reported by this browser'}`,
      `physics steps / frame ${f(P.steps/P.n)}`,
      `render ${R.iw}×${R.ih} of ${R.W}×${R.H} (${Math.round(R.iw/R.W*100)}%${settings.scale==='auto'?' auto':''})   ${q[0].toUpperCase()+q.slice(1)}`,
      `chip  ${R.gpuName}${R.software?'  (SOFTWARE: no graphics card)':''}`].join('\n');
    el.title=R.gpuRaw;}
  P.n=0;P.t=0;P.worst=0;P.step=0;P.draw=0;P.hud=0;P.gpu=0;P.gpuN=0;P.steps=0;P.t0=now;}
document.addEventListener('visibilitychange',()=>{if(document.hidden&&state==='drive')pause(true);});
makeCar();car.pt.start();makeTraffic();
window.__game={R,CR,extraCars,career,sandbox,hub,garage,results,get traffic(){return traffic;},get mode(){return mode;},get state(){return state;},
  /* park a car for tests and screenshots: design id, map x, world z, yaw, paint index */
  park:(design,x,z,yaw,paint=0,lamps=[1,1,0,0],opts={})=>{const ch=CHASSIS[design],g=level.world.ground(x,z,-1,50);
    extraCars.push(poseView(ch,Object.assign({id:100+extraCars.length,p:[x,g.y+ch.hcg,z],yaw,paint:design==='taxi'?TAXI_PAINT:TRAFFIC_PAINTS[paint%TRAFFIC_PAINTS.length],lamps},opts)));},
  get level(){return level;},get car(){return car;},cam,input,touch,frame,audio,menu,settings,pause,swapEngine,loadLevel,
  begin:()=>startFree(level.kind==='loop'?'loop-race':'city'),startFree,enterHub,openGarage,startCareerEvent,toTitle,EVENTS,
  sim:sec=>{for(let t=0;t<sec;t+=1/60)step(1/60);},setEnv:id=>{settings.env=id;env=ENVS[id];},setPaint:id=>{sandbox.paint(id);},
  stats:()=>({iw:R.iw,ih:R.ih,gpu:R.gpuMs,drawn:R.drawn,speed:car.vf,gear:car.pt.gear,rpm:car.pt.rpm,s:car.loc&&car.loc.s,d:car.loc&&car.loc.d,state,mode:mode&&mode.kind})};
/* compile every shader behind the boot screen, then show the title */
const bootMsg=$('boot').querySelector('div');
if(R.software&&!Q.has('manual'))setTimeout(()=>hud.message('NO GRAPHICS CARD IN USE','#ff3d5a',6),4000);
R.G.warmup((d,n)=>{bootMsg.innerHTML=`<b>SHIFTLIGHT</b> &nbsp;warming up the shaders ${d}/${n}`;}).then(()=>{enterTitle();window.__game.ready=true;if(!Q.has('manual'))requestAnimationFrame(loop);})
  .catch(e=>{bootMsg.textContent='Could not start the renderer: '+e.message;console.error(e);});
