/* =====================================================================================
   DYNAMIC RESOLUTION — keeps the frame rate by trading render scale (TAA rebuilds the
   native image from whatever scale the scene was drawn at). Uses the GPU timer when the
   browser offers one; otherwise frame-to-frame time, which can only tell "too slow".
   ===================================================================================== */
export class DRS{
  constructor({min=.5,max=1,start=.8}={}){this.min=min;this.max=max;this.scale=start;this.period=1000/60;this.hist=[];this.cool=0;this.okT=0;this.enabled=true;this.gpuSm=-1;}
  /* learn the display's refresh period from the steadiest frame deltas */
  noteFrame(ms){this.hist.push(ms);if(this.hist.length>90)this.hist.shift();
    if(this.hist.length>=30){const s=[...this.hist].sort((a,b)=>a-b),p=s[Math.floor(s.length*.2)];
      const hz=[60,75,90,100,120,144,165,240].reduce((b,h)=>Math.abs(1000/h-p)<Math.abs(1000/b-p)?h:b,60);this.period=1000/Math.min(hz,120);}}
  update(frameMs,gpuMs){
    if(!this.enabled)return this.scale;
    this.noteFrame(frameMs);if(this.cool>0){this.cool--;return this.scale;}
    const budget=this.period*.88;let s=this.scale;
    if(gpuMs>0){this.gpuSm=this.gpuSm<0?gpuMs:this.gpuSm*.85+gpuMs*.15;
      /* GPU time scales roughly with pixel count, i.e. with scale squared */
      const want=s*Math.sqrt(budget/Math.max(this.gpuSm,.5));
      if(want<s*.97||want>s*1.05)s=s+(want-s)*.35;}
    else{
      /* without a GPU timer: drop on slow frames, creep back up slowly, and don't climb back to a scale that was too slow recently */
      if(frameMs>this.period*1.3){this.bad=this.scale;this.badT=900;s-=frameMs>this.period*2?.1:.05;this.okT=0;}
      else{this.okT++;if(this.okT>120){const cap=this.badT>0?this.bad-.05:this.max;if(s+.05<=cap+1e-6)s+=.05;this.okT=0;}}
      if(this.badT>0)this.badT--;
    }
    s=Math.round(Math.max(this.min,Math.min(this.max,s))*20)/20;
    if(s!==this.scale){this.scale=s;this.cool=20;}
    return this.scale;
  }
}
