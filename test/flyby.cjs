const {makeDSP}=require('../src/audio/engine-dsp.js');const SIM=require('../src/engine/engine-sim.js');
const D=makeDSP(),SR=48000,spec=SIM.makeSpec(SIM.PRESETS.find(p=>p.id==='v10')),sim=new SIM.EngineSim(spec),dsp=new D(SR);dsp.configure(SIM.dspCfg(spec));
sim.start();sim.mode='drive';const N=SR*26,L=new Float32Array(N),R=new Float32Array(N);let jumps=[],maxStep=0,nan=0;
for(let f=0;f*800<N;f++){const t=f/60,inp={thr:t>2.5?1:0,brk:0};for(let k=0;k<4;k++)sim.step(1/240,inp);for(const e of sim.takeEvents())dsp.event(e);
  const p=sim.params(t>4?2:0,1);if(p.jump)jumps.push(f*800);dsp.set(p);const l=new Float32Array(800),r=new Float32Array(800);dsp.process(l,r,800);L.set(l,f*800);R.set(r,f*800);}
for(let i=1;i<N;i++){if(!isFinite(L[i]))nan++;maxStep=Math.max(maxStep,Math.abs(L[i]-L[i-1]));}
/* pitch near the pass: zero-crossing-free estimate via spectrum peak before/after closest approach */
console.log('nan',nan,'max sample step',maxStep.toFixed(3),'wraps at',jumps.map(j=>(j/SR).toFixed(1)+'s').join(' '),'final kmh',(sim.v*3.6).toFixed(0));
const fs=require('fs');const b=Buffer.alloc(44+N*4);b.write('RIFF',0);b.writeUInt32LE(36+N*4,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(2,22);b.writeUInt32LE(SR,24);b.writeUInt32LE(SR*4,28);b.writeUInt16LE(4,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(N*4,40);
for(let i=0;i<N;i++){b.writeInt16LE(Math.round(Math.max(-1,Math.min(1,L[i]))*32767),44+i*4);b.writeInt16LE(Math.round(Math.max(-1,Math.min(1,R[i]))*32767),46+i*4);}
fs.writeFileSync(process.argv[2]+'/flyby.wav',b);
