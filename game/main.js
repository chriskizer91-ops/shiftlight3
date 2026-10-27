/* Shiftlight — the game page. (Bootstrapping the renderer; the car and the game join next.) */
import {Renderer} from '../src/render/renderer.js';
import {ENVS} from '../src/render/env.js';
import {buildTrack} from '../src/world/track.js';
import {buildCity} from '../src/world/city.js';

const Q=new URLSearchParams(location.search);
const canvas=document.getElementById('view');
const R=new Renderer(canvas,{quality:Q.get('q')||'high'});
const T=buildTrack('neon');
const city=buildCity(T);
R.loadWorld(city,T);
document.getElementById('boot').hidden=true;
let env=ENVS[Q.get('env')||'rain'];let debug=Q.get('debug'),debugGain=+(Q.get('gain')||1);
const cam={pos:[20,1.6,3],fwd:[1,0,0],up:[0,1,0],fov:1.1};
function setCam(p,yaw,pitch=0){cam.pos=p;cam.fwd=[Math.cos(pitch)*Math.cos(yaw),Math.sin(pitch),-Math.cos(pitch)*Math.sin(yaw)];}
if(Q.get('cam')){const v=Q.get('cam').split(',').map(Number);setCam([v[0],v[1],v[2]],v[3]||0,v[4]||0);}
function fit(){const dpr=Math.min(2,devicePixelRatio||1),w=Math.round(innerWidth*dpr),h=Math.round(innerHeight*dpr);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}R.resize(w,h,+(Q.get('scale')||1));}
let t0=performance.now(),last=t0;
function frame(dt){
  fit();
  const t=(performance.now()-t0)/1000;
  const fl=[1,.9+.1*Math.sin(t*37),Math.random()<.04?.1:1,(Math.sin(t*3)>.95)?.2:1,.85+.15*Math.sin(t*61),.6+.4*Math.sin(t*1.3),Math.sin(t*5.6)>0?1:0,Math.sin(t*3)>.9?1:.05];
  R.render({time:t,dt,cam,env,flicker:fl,probePos:[cam.pos[0],cam.pos[1]+.5,cam.pos[2]],dyn:[],occ:[],shutter:.5,debug,debugGain});
}
function loop(now){frame(Math.min(.1,(now-last)/1000));last=now;requestAnimationFrame(loop);}
window.__game={R,T,city,cam,setCam,frame,setEnv:id=>{env=ENVS[id];},setDebug:(d,g=1)=>{debug=d;debugGain=g;},stats:()=>({lights:R.lights.stats,drawn:R.drawn,iw:R.iw,ih:R.ih,gpu:R.gpuMs})};
if(!Q.has('manual'))requestAnimationFrame(loop);
