/* Offline render of every preset through a scripted drive: start, idle, blips, limiter, overrun,
   then a launch and a pull through the gears. Writes WAVs and prints health metrics. */
const fs=require('fs'),path=require('path');
const {makeDSP}=require('../src/audio/engine-dsp.js');const SIM=require('../src/engine/engine-sim.js');
const EngineDSP=makeDSP(),SR=48000,FPS=60,SPF=SR/FPS;
const out=process.argv[2]||path.join(__dirname,'out');fs.mkdirSync(out,{recursive:true});
const only=process.argv[3];

function wav(file,L,R){const n=L.length,b=Buffer.alloc(44+n*4);b.write('RIFF',0);b.writeUInt32LE(36+n*4,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(2,22);
  b.writeUInt32LE(SR,24);b.writeUInt32LE(SR*4,28);b.writeUInt16LE(4,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n*4,40);
  for(let i=0;i<n;i++){b.writeInt16LE(Math.max(-32767,Math.min(32767,Math.round(L[i]*32767))),44+i*4);b.writeInt16LE(Math.max(-32767,Math.min(32767,Math.round(R[i]*32767))),46+i*4);}fs.writeFileSync(file,b);}

/* script: list of [seconds, {thr,brk,nos,mode,listener,action}] */
function script(p){
  return [
    [0,{action:'start',mode:'free'}],[2.2,{}],
    [2.2,{thr:1}],[2.45,{thr:0}],[3.3,{thr:1}],[3.55,{thr:0}],[4.4,{thr:.5}],[5.2,{thr:1}],[7.4,{thr:0}],[9.0,{}],
    [9.0,{mode:'drive',brk:1}],[9.4,{brk:1,thr:1}],[10.9,{brk:0,thr:1,nos:1}],[19.5,{thr:0,nos:0}],[22,{brk:.6}],[24,{}]
  ];
}
const res=[];
for(const pre of SIM.PRESETS){
  if(only&&pre.id!==only)continue;
  const spec=SIM.makeSpec(pre),sim=new SIM.EngineSim(spec),dsp=new EngineDSP(SR);dsp.configure(SIM.dspCfg(spec));
  const sc=script(pre),T=sc[sc.length-1][0],N=Math.round(T*SR),L=new Float32Array(N),R=new Float32Array(N);
  let inp={thr:0,brk:0,nos:0},si=0,cpu=0,maxRpm=0,maxV=0,gears=new Set(),bovs=0,pops=0,nan=0;
  const seg={idle:[2.0,2.2],wot:[5.4,7.3],over:[7.5,8.9],drive:[11.5,19]};const rms={};
  const tl=[];
  for(let f=0;f*SPF<N;f++){
    const t=f/FPS;
    while(si<sc.length&&sc[si][0]<=t){const a=sc[si][1];if(a.action==='start')sim.start();if(a.mode){sim.mode=a.mode;if(a.mode==='free'){sim.gear=0;sim.v=0;sim.ww=0;}}inp={thr:a.thr||0,brk:a.brk||0,nos:!!a.nos};si++;}
    for(let k=0;k<4;k++)sim.step(1/FPS/4,inp);
    for(const e of sim.takeEvents()){dsp.event(e);if(e.type==='bov')bovs++;}
    dsp.set(sim.params(0,1));
    const o=Math.round(f*SPF),n=Math.min(SPF,N-o);if(n<=0)break;
    const bl=new Float32Array(n),br=new Float32Array(n),t0=process.hrtime.bigint();dsp.process(bl,br,n);cpu+=Number(process.hrtime.bigint()-t0)/1e9;
    L.set(bl,o);R.set(br,o);
    maxRpm=Math.max(maxRpm,sim.rpm);maxV=Math.max(maxV,sim.v);if(sim.mode==='drive')gears.add(sim.gear);
    const s=dsp.takeStats();if(s)pops+=s.pops;
    if(f%6===0)tl.push([+t.toFixed(2),Math.round(sim.rpm),sim.gear,+(sim.v*3.6).toFixed(0),sim.clutch,+sim.boost.toFixed(2),+sim.load.toFixed(2)]);
  }
  let pk=0;for(let i=0;i<N;i++){const a=Math.abs(L[i]),b=Math.abs(R[i]);if(!isFinite(a)||!isFinite(b))nan++;pk=Math.max(pk,a,b);}
  for(const k in seg){const [a,b]=seg[k];let s=0,c=0;for(let i=Math.round(a*SR);i<Math.round(b*SR);i++){s+=L[i]*L[i]+R[i]*R[i];c+=2;}rms[k]=+(20*Math.log10(Math.sqrt(s/c)+1e-9)).toFixed(1);}
  wav(path.join(out,pre.id+'.wav'),L,R);
  fs.writeFileSync(path.join(out,pre.id+'.timeline.json'),JSON.stringify(tl));
  res.push({id:pre.id,nan,peak:+pk.toFixed(3),rms,cpuRT:+(cpu/T).toFixed(3),maxRpm:Math.round(maxRpm),limiter:spec.limiterRpm,topKmh:Math.round(maxV*3.6),gears:[...gears].join(''),bovs,pops,hp:Math.round(spec.peak.hp)});
}
console.table(res.map(r=>({id:r.id,nan:r.nan,peak:r.peak,idle:r.rms.idle,wot:r.rms.wot,over:r.rms.over,drive:r.rms.drive,cpuRT:r.cpuRT,maxRpm:r.maxRpm,lim:r.limiter,kmh:r.topKmh,gears:r.gears,bov:r.bovs,pops:r.pops,hp:r.hp})));
