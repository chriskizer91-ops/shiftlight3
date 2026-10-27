/* Render the sound of a robot lap the way the game would hear it from the chase camera. */
import {writeFileSync,mkdirSync} from 'node:fs';
import {makeDSP} from '../src/audio/engine-dsp.js';
import {makeFX} from '../src/audio/fx-dsp.js';
import {Vehicle} from '../src/physics/vehicle.js';
import {TrackWorld} from '../src/world/collision.js';
import {buildTrack,speedProfile} from '../src/world/track.js';
import {CHASSIS,carSpec} from '../src/game/cars.js';
import {SIM} from '../src/engine/engine-sim.js';
import {makeBot} from '../src/game/bot.js';
const out=process.argv[2]||'test/out',eng=process.argv[3]||'six',secs=+(process.argv[4]||30),wet=+(process.argv[5]||1);mkdirSync(out,{recursive:true});
const sr=44100,T=buildTrack('neon'),car=new Vehicle(CHASSIS.sl3,carSpec(eng),new TrackWorld(T));car.wet=wet;
car.placeOnTrack(T,T.len-14,-2.2);car.pt.start();
const prof=speedProfile(T,{mass:car.m,clF:car.c.clF,clR:car.c.clR,cdA:car.c.cdA,powerKw:car.spec.peak.kw},{mu:car.tyre.mu*.84});const bot=makeBot(T,prof,{pace:.95});
const E=new (makeDSP())(sr),F=new (makeFX())(sr);E.configure(SIM.dspCfg(car.spec));
const n=Math.round(sr*secs),L=new Float32Array(n),R=new Float32Array(n),tl=new Float32Array(735),tr=new Float32Array(735);
let o=0,maxSq=0;const len=v=>Math.hypot(...v);
while(o<n){
  for(let k=0;k<4;k++)car.step(1/240,o<sr*2?{}:bot(car));
  const ev=car.takeEvents();
  E.set(car.pt.soundParams(0,len(car.v),{dist:5.2,pan:0,rear:1}));for(const e of car.pt.takeEvents())E.event(e);
  const tA=Math.tan(car.tyre.aPk),kP=car.tyre.kPk;
  const fx={lat:car.wheels.map(w=>w.contact?Math.abs(w.tanA)/tA:0),lon:car.wheels.map(w=>w.contact?Math.abs(w.kap)/kP:0),load:car.wheels.map(w=>w.Fz),wet,speed:len(car.v),cabin:0,curb:car.wheels.some(w=>w.contact&&w.surf==='curb')?1:0,scrape:ev.scrape||0,vol:1};
  maxSq=Math.max(maxSq,...fx.lat);
  F.set(fx);if(ev.wall>1.2)F.event({type:'hit',a:ev.wall/9});
  const m=Math.min(735,n-o);E.process(L.subarray(o,o+m),R.subarray(o,o+m),m);F.process(tl,tr,m);for(let i=0;i<m;i++){L[o+i]+=tl[i];R[o+i]+=tr[i];}o+=m;
}
let pk=0,s2=0;for(let i=0;i<n;i++){pk=Math.max(pk,Math.abs(L[i]),Math.abs(R[i]));s2+=L[i]*L[i];}
const b=Buffer.alloc(44+n*4);b.write('RIFF',0);b.writeUInt32LE(36+n*4,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(2,22);b.writeUInt32LE(sr,24);b.writeUInt32LE(sr*4,28);b.writeUInt16LE(4,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n*4,40);
for(let i=0;i<n;i++){b.writeInt16LE(Math.round(Math.max(-1,Math.min(1,L[i]))*32767),44+i*4);b.writeInt16LE(Math.round(Math.max(-1,Math.min(1,R[i]))*32767),46+i*4);}
writeFileSync(`${out}/lap_${eng}.wav`,b);
console.log(`lap_${eng}.wav: peak ${pk.toFixed(2)}, rms ${Math.sqrt(s2/n).toFixed(3)}, max lateral slip ${maxSq.toFixed(2)}x peak, reached s=${car.loc&&car.loc.s.toFixed(0)}`);
