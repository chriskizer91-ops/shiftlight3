/* =====================================================================================
   GAME AUDIO — the engine synth (from the Engine Lab, unchanged) and the effects synth, each
   in its own AudioWorklet, through two reverbs (the street between the buildings, and the
   tunnel) that cross-fade with where the car is. Falls back to the main thread if worklets
   can't load. Starts on the first key press or click (browsers require a gesture).
   ===================================================================================== */
import {makeDSP} from './engine-dsp.js';
import {makeFX} from './fx-dsp.js';

function roomIR(ctx,kind){
  const sr=ctx.sampleRate,n=Math.round(sr*{street:.9,tunnel:2.4}[kind]),b=ctx.createBuffer(2,n,sr);let seed=1234567;
  const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647*2-1;};
  for(let ch=0;ch<2;ch++){const X=b.getChannelData(ch);let lp=0;
    if(kind==='tunnel'){
      for(let k=1;k<44;k++){const i=Math.round((k*.036+(k&1?ch*.011:0)+rnd()*.0015)*sr);if(i>=n)break;const a=Math.pow(.8,k)*(((k+ch)&1)?.55:1);
        for(let q=0;q<90&&i+q<n;q++)X[i+q]+=a*Math.exp(-q/(5+k*1.4))*(q?rnd()*.6:1);}
      for(let i=0;i<n;i++){const t=i/sr;lp+=.3*(rnd()-lp);X[i]+=lp*.55*Math.exp(-t*2.5)*Math.min(1,t/.03);}
    }else{
      /* a street canyon: the ground, then slaps off the buildings either side, then a short tail */
      X[Math.round((.0045+ch*.0006)*sr)]+=.5;
      for(const [t,a,d] of [[.052,.3,10],[.071,.24,12],[.118,.16,16],[.176,.1,20],[.25,.06,26]]){const s=Math.round((t+ch*.006)*sr);for(let q=0;q<90;q++)X[s+q]+=a*Math.exp(-q/d)*rnd();}
      for(let i=0;i<n;i++){const t=i/sr;lp+=.25*(rnd()-lp);X[i]+=lp*.16*Math.exp(-t*6)*Math.min(1,t/.02);}
    }}
  return b;
}
const ENGINE_SRC=()=>`const EngineDSP=(${makeDSP.toString()})();
class ShiftlightEngine extends AudioWorkletProcessor{
  constructor(){super();this.d=new EngineDSP(sampleRate);this.port.onmessage=e=>{const m=e.data;if(m.t==='cfg')this.d.configure(m.cfg);else if(m.t==='p')this.d.set(m.p);else if(m.t==='ev')this.d.event(m.ev);};}
  process(i,o){const out=o[0];this.d.process(out[0],out[1]||out[0],out[0].length);return true;}}
registerProcessor('shiftlight-engine',ShiftlightEngine);
const FXDSP=(${makeFX.toString()})();
class ShiftlightFX extends AudioWorkletProcessor{
  constructor(){super();this.d=new FXDSP(sampleRate);this.port.onmessage=e=>{const m=e.data;if(m.t==='p')this.d.set(m.p);else if(m.t==='ev')this.d.event(m.ev);};}
  process(i,o){const out=o[0];this.d.process(out[0],out[1]||out[0],out[0].length);return true;}}
registerProcessor('shiftlight-fx',ShiftlightFX);`;

export class GameAudio{
  /* ctx: AudioContext options; phones get a lower sample rate and a roomier buffer so the synths keep up */
  constructor({ctx={}}={}){this.ready=false;this.starting=null;this.vol=.8;this.muted=false;this.cfg=null;this.tunnel=0;this.ctxOpts=ctx;}
  /* call from a user gesture */
  start(){
    if(this.starting)return this.starting;
    this.starting=(async()=>{
      const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
      let ctx;try{ctx=new AC(Object.assign({latencyHint:'interactive'},this.ctxOpts));}catch(e){ctx=new AC();}this.ctx=ctx;
      const master=ctx.createGain();master.gain.value=this.muted?0:this.vol;this.master=master;
      const comp=ctx.createDynamicsCompressor();comp.threshold.value=-10;comp.knee.value=6;comp.ratio.value=4;comp.attack.value=.003;comp.release.value=.2;
      master.connect(comp);comp.connect(ctx.destination);
      const dry=ctx.createGain();dry.connect(master);
      const mk=k=>{const send=ctx.createGain();send.gain.value=0;const cv=ctx.createConvolver();cv.buffer=roomIR(ctx,k);send.connect(cv);cv.connect(master);return send;};
      this.sendS=mk('street');this.sendT=mk('tunnel');
      const bus=ctx.createGain();bus.connect(dry);bus.connect(this.sendS);bus.connect(this.sendT);
      try{
        if(!ctx.audioWorklet)throw new Error('no worklet');
        const src=ENGINE_SRC();
        try{await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([src],{type:'application/javascript'})));}
        catch(e1){await ctx.audioWorklet.addModule('data:application/javascript;charset=utf-8,'+encodeURIComponent(src));}
        const eng=new AudioWorkletNode(ctx,'shiftlight-engine',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2]});
        const fx=new AudioWorkletNode(ctx,'shiftlight-fx',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2]});
        eng.connect(bus);fx.connect(bus);
        this.eng={post:m=>eng.port.postMessage(m)};this.fx={post:m=>fx.port.postMessage(m)};this.kind='worklet';
        /* rivals' engines: more instances of the same synth, made when a race needs them */
        this.mkEngine=()=>{const n=new AudioWorkletNode(ctx,'shiftlight-engine',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2]});n.connect(bus);return {post:m=>n.port.postMessage(m),cfgId:null};};
      }catch(err){
        const D=makeDSP(),F=makeFX(),d=new D(ctx.sampleRate),f=new F(ctx.sampleRate);
        const node=ctx.createScriptProcessor(1024,1,2),tmpL=new Float32Array(1024),tmpR=new Float32Array(1024);
        const src=ctx.createConstantSource?ctx.createConstantSource():null;if(src){src.offset.value=0;src.connect(node);src.start();}
        node.onaudioprocess=ev=>{const b=ev.outputBuffer,L=b.getChannelData(0),R=b.getChannelData(1),n=b.length;d.process(L,R,n);f.process(tmpL,tmpR,n);for(let i=0;i<n;i++){L[i]+=tmpL[i];R[i]+=tmpR[i];}};
        node.connect(bus);
        this.eng={post:m=>{if(m.t==='cfg')d.configure(m.cfg);else if(m.t==='p')d.set(m.p);else if(m.t==='ev')d.event(m.ev);}};
        this.fx={post:m=>{if(m.t==='p')f.set(m.p);else if(m.t==='ev')f.event(m.ev);}};this.kind='main thread';
      }
      if(ctx.state!=='running')await ctx.resume();
      if(this.cfg)this.eng.post({t:'cfg',cfg:this.cfg});
      this.ready=true;
    })();
    return this.starting;
  }
  configure(cfg){this.cfg=cfg;if(this.ready)this.eng.post({t:'cfg',cfg});}
  /* the nearest rivals' engines: [{id, cfg, p, ev}], up to max voices; missing ones fall silent */
  rivals(list,max=2){
    if(!this.ready||!this.mkEngine)return;this.rv=this.rv||[];
    for(let i=0;i<max;i++){const r=list[i];let v=this.rv[i];
      if(!r){if(v&&v.on){v.post({t:'p',p:Object.assign({},v.last,{vol:0,on:0})});v.on=false;}continue;}
      if(!v)v=this.rv[i]=this.mkEngine();
      if(v.cfgId!==r.id){v.post({t:'cfg',cfg:r.cfg});v.cfgId=r.id;}
      for(const e of r.ev||[])v.post({t:'ev',ev:e});v.post({t:'p',p:r.p});v.last=r.p;v.on=true;}
  }
  setVolume(v){this.vol=v;if(this.master)this.master.gain.setTargetAtTime(this.muted?0:v,this.ctx.currentTime,.05);}
  setMuted(m){this.muted=m;this.setVolume(this.vol);}
  suspend(on){if(!this.ctx)return;if(on)this.ctx.suspend();else this.ctx.resume();}
  /* once per frame */
  update(engineP,engineEvents,fxP,fxEvents,{tunnel=0,cabin=false}={}){
    if(!this.ready)return;
    for(const e of engineEvents)this.eng.post({t:'ev',ev:e});this.eng.post({t:'p',p:engineP});
    for(const e of fxEvents)this.fx.post({t:'ev',ev:e});this.fx.post({t:'p',p:fxP});
    const t=this.ctx.currentTime,c=cabin?.4:1;
    this.tunnel+=(tunnel-this.tunnel)*.08;
    this.sendS.gain.setTargetAtTime(.32*c*(1-this.tunnel),t,.08);this.sendT.gain.setTargetAtTime(.85*c*this.tunnel,t,.08);
  }
}
