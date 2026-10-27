/* =====================================================================================
   SHIFTLIGHT — the game page. Builds the city and the car, runs the physics at 240 Hz,
   follows the car with the camera, renders. (The HUD, menu and sound join in task #11.)
   ===================================================================================== */
import {Renderer} from '../src/render/renderer.js';
import {CarRenderer,PAINTS} from '../src/render/car.js';
import {ENVS,ENV_IDS} from '../src/render/env.js';
import {buildTrack} from '../src/world/track.js';
import {buildCity} from '../src/world/city.js';
import {TrackWorld} from '../src/world/collision.js';
import {Vehicle} from '../src/physics/vehicle.js';
import {CHASSIS,carSpec} from '../src/game/cars.js';
import {Input} from '../src/game/input.js';
import {CameraRig} from '../src/game/camera.js';
import {qmat,mcol,mvec,add,norm,clamp,madd,sub,len} from '../src/physics/math3.js';
import {Particles} from '../src/render/particles.js';
import {buildRainMask} from '../src/world/rainmask.js';
import {DRS} from '../src/render/drs.js';
import {makeBot} from '../src/game/bot.js';
import {speedProfile} from '../src/world/track.js';

const Q=new URLSearchParams(location.search);
const canvas=document.getElementById('view'),hudC=document.getElementById('hud'),hud=hudC.getContext('2d');
const R=new Renderer(canvas,{quality:Q.get('q')||'high'});
const T=buildTrack('neon'),city=buildCity(T);R.loadWorld(city,T);
const CR=new CarRenderer(R,CHASSIS.sl3);
const PS=new Particles(R,buildRainMask(T,city));
const drs=new DRS({min:.5,max:R.Q.maxScale,start:+(Q.get('scale')||.85)});if(Q.has('scale'))drs.enabled=false;
const world=new TrackWorld(T);
let engineId=Q.get('engine')||'six';
const car=new Vehicle(CHASSIS.sl3,carSpec(engineId),world);
car.setAssists(Q.get('assist')||'arcade');
const startS=T.len-14;car.placeOnTrack(T,startS,-2.2);car.pt.start();
const input=new Input(window),cam=new CameraRig(T);
let bot=null;if(Q.has('auto')){const prof=speedProfile(T,{mass:car.m,clF:car.c.clF,clR:car.c.clR,cdA:car.c.cdA,powerKw:car.spec.peak.kw},{mu:car.tyre.mu*.84});bot=makeBot(T,prof,{pace:.9});}
let envId=Q.get('env')||'rain',env=ENVS[envId];let paint=PAINTS[Q.get('paint')||'magenta'];
let debug=Q.get('debug'),debugGain=+(Q.get('gain')||1),highBeam=false,led=false,showHud=true;
if(Q.get('orbit')){const o=Q.get('orbit').split(',').map(Number);cam.orbit={yaw:o[0],pitch:o[1],dist:o[2],fov:o[3]||.7,y:o[4]||0};}
if(Q.get('cam'))cam.mode=Math.max(0,['chase','far','hood','bumper','cockpit','tv'].indexOf(Q.get('cam')));
document.getElementById('boot').hidden=true;

const DT=1/240;let acc=0,time=0,frameN=0;
function fit(){const dpr=Math.min(2,devicePixelRatio||1),w=Math.round(innerWidth*dpr),h=Math.round(innerHeight*dpr);
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;hudC.width=w;hudC.height=h;}R.resize(w,h,R.iw?R.scale:drs.scale);}
/* the car as the renderer sees it */
function carView(){
  const W=car.wheels;
  return {id:1,self:true,p:car.p,q:car.q,paint,caliper:[.75,.03,.02],
    wheels:W.map(w=>({hp:w.hp,len:w.len,steer:w.front?car.steer:0,ang:w.ang,disc:w.disc})),
    lamps:[env.night>.3?1:0,env.night>.3?1:.0,car.brkIn>.05?1:0,car.rev?1:0]};
}
function carLights(){
  const M=qmat(car.q),F=mcol(M,0),U=mcol(M,1),Rt=mcol(M,2),h=car.c.hcg;const at=(x,y,z)=>add(car.p,mvec(M,[x,y-h,z]));
  const dyn=[];const brake=car.brkIn>.05;
  /* tail and brake lamps: red light thrown backwards onto the road */
  for(const z of [-.66,.66]){const p=at(-2.45,.78,z);dyn.push({pos:p,r:brake?11:6,col:brake?[5,.12,.06]:[.9,.02,.01],type:1,dir:norm(madd(scale3(F,-1),U,-.35)),cosO:Math.cos(1.3)});}
  if(car.rev)for(const z of [-.36,.36])dyn.push({pos:at(-2.45,.77,z),r:9,col:[3,2.9,2.7],type:1,dir:norm(madd(scale3(F,-1),U,-.3)),cosO:Math.cos(1.2)});
  const on=env.night>.3?1:0;
  const pitch=-.035;const dir=norm(madd(F,U,pitch));
  const headlights=on?{on:1,high:highBeam?1:0,posL:at(2.12,.6,-.62),posR:at(2.12,.6,.62),dir,right:Rt,up:U,col:[1050,1090,1140],range:95}:null;
  return {dyn,headlights};
}
const scale3=(a,k)=>[a[0]*k,a[1]*k,a[2]*k];
function flicker(t){return [1,.9+.1*Math.sin(t*37),Math.random()<.04?.15:1,(Math.sin(t*3.1)>.96)?.25:1,.88+.12*Math.sin(t*61),.6+.4*Math.sin(t*1.3),Math.sin(t*5.6)>0?1:0,Math.sin(t*3)>.9?1:.03];}

function step(dt){
  const inp=input.poll(dt);
  if(inp.cam)cam.next();
  if(inp.led)led=!led;if(inp.high)highBeam=!highBeam;if(inp.hud)showHud=!showHud;
  if(inp.env){envId=ENV_IDS[(ENV_IDS.indexOf(envId)+1)%ENV_IDS.length];env=ENVS[envId];}
  if(inp.reset){const s=car.loc?car.loc.s:startS;car.placeOnTrack(T,s,T.lineAt(s));}
  if(inp.up)car.pt.shift(1);if(inp.down)car.pt.shift(-1);
  car.wet=env.wet;
  acc+=dt;let n=0;while(acc>=DT&&n<24){car.step(DT,bot?Object.assign({},inp,bot(car)):inp);acc-=DT;n++;time+=DT;}
  effects(dt);
  const ev=car.takeEvents();
  return {inp,ev};
}
/* spray off wet tyres, smoke off sliding dry ones, steam from the manholes */
function effects(dt){
  const M=qmat(car.q),F=mcol(M,0),U=mcol(M,1),Rt=mcol(M,2),wet=env.wet,sp=len(car.v);
  car.wheels.forEach((w,i)=>{if(!w.contact)return;
    const back=w.front?.25:.4;
    if(wet>.2&&sp>4){PS.emit('sp'+i,wet*(sp-4)*(w.front?1.5:4),dt,()=>{const r=()=>Math.random()-.5;
      const p=madd(madd(w.cp,F,-back-.1*Math.random()),U,.12);const side=(w.left?-1:1)*(.6+Math.random());
      PS.spawn(0,p,[car.v[0]*.55-F[0]*sp*.06+Rt[0]*side*.8+r()*.8,1.1+Math.random()*1.4+sp*.02,car.v[2]*.55-F[2]*sp*.06+Rt[2]*side*.8+r()*.8],.55+Math.random()*.7,.22,1.2+sp*.012,.05+.03*wet);});}
    if(wet<.4&&w.slipV>3.5){PS.emit('sm'+i,(w.slipV-3.5)*w.Fz/2500*5,dt,()=>{const p=madd(w.cp,U,.15);
      PS.spawn(1,p,[car.v[0]*.3+(Math.random()-.5),.4+Math.random()*.5,car.v[2]*.3+(Math.random()-.5)],1.8+Math.random()*1.6,.35,3.2,.22);});}
  });
  for(const s of city.steam){const dx=s.pos[0]-car.p[0],dz=s.pos[2]-car.p[2];if(dx*dx+dz*dz>90*90)continue;
    PS.emit(s,s.rate*4,dt,()=>PS.spawn(2,[s.pos[0]+(Math.random()-.5)*.4,s.pos[1]+.05,s.pos[2]+(Math.random()-.5)*.4],[.3+(Math.random()-.5)*.3,.7+Math.random()*.4,.15+(Math.random()-.5)*.3],3.5+Math.random()*2,.4,2.6,.1));}
}
let camPrev=null;
function render(dt,ev){
  const c=cam.update(dt,car,{look:!!(lastInp&&lastInp.look),impact:Math.max(ev.wall||0,ev.land||0)*.25});
  const L=carLights();const M=qmat(car.q),F=mcol(M,0),fw=norm([F[0],0,F[2]]);
  const camVel=camPrev&&!c.cut?sub(c.pos,camPrev).map(x=>x/Math.max(dt,1e-3)):[0,0,0];camPrev=c.pos.slice();
  PS.rain.on=env.rain;PS.rain.camVel=camVel;PS.update(dt,c.pos);
  R.render({time,dt,cam:c,cut:c.cut,env,flicker:flicker(time),probePos:add(car.p,[0,.4,0]),dyn:L.dyn,headlights:L.headlights,
    occ:[[car.p[0],car.p[1],car.p[2],car.c.hcg,fw[0],fw[2],car.c.body.L/2,car.c.body.W/2]],cars:[carView()],
    shutter:.5,lensRain:c.lensRain*env.rain,led:null,debug,debugGain});
  drawHud();
}
let lastInp=null;
function drawHud(){
  const W=hudC.width,H=hudC.height,s=H/1080;hud.clearRect(0,0,W,H);if(!showHud)return;
  hud.font=`700 ${Math.round(56*s)}px ui-monospace,Menlo,Consolas,monospace`;hud.fillStyle='rgba(255,255,255,.92)';hud.textAlign='right';
  hud.fillText(Math.round(Math.abs(car.vf)*3.6)+'',W-60*s,H-70*s);
  hud.font=`600 ${Math.round(20*s)}px ui-monospace,Menlo,Consolas,monospace`;hud.fillStyle='rgba(255,255,255,.6)';
  hud.fillText('KM/H   '+(car.rev?'R':car.pt.gear)+'   '+Math.round(car.pt.rpm)+' RPM',W-60*s,H-40*s);
  hud.textAlign='left';hud.fillText(`${env.name}  ·  ${cam.name}  ·  ${R.iw}x${R.ih}  ·  ${fps.toFixed(0)} fps`,40*s,50*s);
}
let fps=60,last=performance.now();
function frame(dt){fit();const r=step(dt);lastInp=r.inp;render(dt,r.ev);frameN++;
  const sc=drs.update(dt*1000,R.gpuMs);if(Math.abs(sc-R.scale)>.001)R.resize(canvas.width,canvas.height,sc);}
function loop(now){const dt=Math.min(.05,(now-last)/1000);last=now;fps+=(1/Math.max(dt,1e-3)-fps)*.05;frame(dt);requestAnimationFrame(loop);}
window.__game={R,T,city,car,cam,input,frame,sim:(sec)=>{for(let t=0;t<sec;t+=1/60)step(1/60);},setEnv:id=>{envId=id;env=ENVS[id];},setPaint:id=>{paint=PAINTS[id];},setDebug:(d,g=1)=>{debug=d;debugGain=g;},
  stats:()=>({iw:R.iw,ih:R.ih,gpu:R.gpuMs,drawn:R.drawn,speed:car.vf,gear:car.pt.gear,rpm:car.pt.rpm,s:car.loc&&car.loc.s,d:car.loc&&car.loc.d})};
if(!Q.has('manual'))requestAnimationFrame(loop);
