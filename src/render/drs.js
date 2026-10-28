/* =====================================================================================
   DYNAMIC RESOLUTION — keeps the frame rate by trading render scale (TAA rebuilds the
   native image from whatever scale the scene was drawn at). Uses the GPU timer when the
   browser offers one; otherwise frame-to-frame time, which can only tell "too slow".

   The frame-rate target is the screen's refresh rate divided by a whole number (every
   refresh, every other one, every third), so frames always arrive at an even pace: on a
   144 Hz screen, 72 fps lands on every second refresh, where 60 fps would alternate two- and
   three-refresh gaps and judder. The game shows a frame only on the refreshes it targets.
   ===================================================================================== */
const RATES=[48,50,60,75,90,100,120,144,165,180,200,240,280,360];
export class DRS{
  constructor({min=.5,max=1,start=.8}={}){
    this.min=min;this.max=max;this.scale=start;this.hz=60;this.div=1;this.period=1000/60;
    this.raw=[];this.coolMs=0;this.okMs=0;this.enabled=true;this.gpuSm=-1;this.bad=1;this.badMs=0;}
  /* learn the display's refresh rate from the shortest steady gaps between animation callbacks */
  noteVsync(ms){if(!(ms>2&&ms<60))return;this.raw.push(ms);if(this.raw.length>120)this.raw.shift();
    if(this.raw.length>=24){const s=[...this.raw].sort((a,b)=>a-b),p=s[Math.floor(s.length*.15)];
      this.hz=RATES.reduce((b,h)=>Math.abs(1000/h-p)<Math.abs(1000/b-p)?h:b,60);this.period=1000/this.hz*this.div;}}
  /* the frame-rate setting: 'auto' aims for 60-100 fps on any screen; 1, 2, 3 = every, every other, every third refresh */
  divFor(set){if(set==='auto'||!set)return Math.max(1,Math.floor(this.hz/60+1e-6));return Math.max(1,Math.min(4,+set|0||1));}
  setDivisor(k){this.div=k;this.period=1000/this.hz*k;}
  get target(){return this.hz/this.div;}
  update(frameMs,gpuMs){
    if(!this.enabled)return this.scale;
    if(this.coolMs>0){this.coolMs-=frameMs;return this.scale;}
    const budget=this.period*.88;let s=this.scale;const old=s;
    if(gpuMs>0){this.gpuSm=this.gpuSm<0?gpuMs:this.gpuSm*.9+gpuMs*.1;
      /* GPU time scales roughly with pixel count, i.e. with scale squared */
      const want=s*Math.sqrt(budget/Math.max(this.gpuSm,.5));
      if(want<s*.95||want>s*1.07)s=s+(want-s)*.35;}
    else{
      /* without a GPU timer: one late frame is usually the CPU or the browser, not the picture, so only a run of
         them lowers the scale; climb back slowly, and not straight back to a scale that was too slow */
      if(frameMs>this.period*1.3){this.slowMs=(this.slowMs||0)+frameMs;this.okMs=0;
        if(this.slowMs>350){this.bad=this.scale;this.badMs=15000;s-=frameMs>this.period*2?.1:.05;this.slowMs=0;}}
      else{this.slowMs=Math.max(0,(this.slowMs||0)-frameMs*.5);this.okMs+=frameMs;
        if(this.okMs>2000){const cap=this.badMs>0?this.bad-.05:this.max;if(s+.05<=cap+1e-6)s+=.05;this.okMs=0;}}
      if(this.badMs>0)this.badMs-=frameMs;
    }
    s=Math.round(Math.max(this.min,Math.min(this.max,s))*20)/20;
    /* every change reallocates the render targets, so hold each one a while: shorter going down than up */
    if(s!==this.scale){this.scale=s;this.coolMs=s<old?500:1500;}
    return this.scale;
  }
}
