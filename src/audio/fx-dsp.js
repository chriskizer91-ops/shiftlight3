/* =====================================================================================
   FX SYNTH — everything that isn't the engine, made live per sample:
   - tyre squeal: one voice per tyre, only when that tyre is really sliding sideways (past
     its peak slip angle) or spinning/locking hard. Normal hard driving stays quiet.
     Wet tyres don't squeal.
   - tyre roar: a steady band of road noise that rises with speed, quiet; a soft hiss when wet
   - curb rumble: low, soft thumps as the stripes pass
   - wind
   - impacts (a thud and a crunch) and grinding along a barrier (grains of grit, not static)
   - the traffic: up to four nearby cars, each an engine hum (its firing note and a couple of
     harmonics, Doppler-shifted by the caller) over its own tyre noise; and their horns
   Self-contained so it can be stringified into an AudioWorklet, like the engine synth.
   ===================================================================================== */
export function makeFX(){
  const TAU=Math.PI*2;
  const ss=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
  /* a two-pole band-pass (constant peak gain), for shaping noise */
  class BP{constructor(){this.x1=0;this.x2=0;this.y1=0;this.y2=0;this.set(500,1,44100);}
    set(f,q,sr){const w=TAU*Math.min(f,sr*.45)/sr,al=Math.sin(w)/(2*q),a0=1+al;this.b0=al/a0;this.a1=-2*Math.cos(w)/a0;this.a2=(1-al)/a0;}
    run(x){const y=this.b0*x-this.b0*this.x2-this.a1*this.y1-this.a2*this.y2;this.x2=this.x1;this.x1=x;this.y2=this.y1;this.y1=y;return y;}}
  class FX{
    constructor(sr){this.sr=sr;this.p={lat:[0,0,0,0],lon:[0,0,0,0],load:[0,0,0,0],wet:0,speed:0,cabin:0,curb:0,scrape:0,vol:1};
      this.g={sq:[0,0,0,0],rd:0,hiss:0,wind:0,curb:0,scr:0};
      this.sq=[0,1,2,3].map(i=>({bp:new BP(),bp2:new BP(),drift:0,f:0}));
      this.road=new BP();this.road.set(260,.7,sr);this.road2=new BP();this.road2.set(700,.9,sr);
      this.hissF=new BP();this.hissF.set(2200,.9,sr);this.windF=new BP();this.windF.set(520,.6,sr);
      this.grit=new BP();this.grit.set(900,2.2,sr);this.gritLo=new BP();this.gritLo.set(180,1.2,sr);
      this.seed=22222;this.b=[0,0,0];this.curbPh=0;this.thumpE=0;this.thumpLp=0;this.hits=[];this.grainE=0;this.grainA=0;this.hitLp=0;this.k=0;
      this.tv=[0,1,2,3].map(()=>({g:0,f:30,pan:0,ph:0,lp:0,rd:0,bp:new BP()}));this.horns=[];this.beeps=[];}
    set(p){this.p=p;}
    event(e){if(e.type==='hit')this.hits.push({t:0,a:Math.min(1.4,e.a),f:58+Math.random()*24});
      else if(e.type==='beep')this.beeps.push({t:0,f:e.f||880,len:e.len||.18,a:e.a||.5,ph:0});
      else if(e.type==='horn'&&this.horns.length<4)this.horns.push({t:0,a:Math.min(1,e.a),len:e.len||.4,f:e.f||420,pan:e.pan||0,ph1:0,ph2:0});}
    rnd(){let s=this.seed;s^=s<<13;s^=s>>>17;s^=s<<5;this.seed=s;return (s>>>0)/4294967296*2-1;}
    process(L,R,n){
      const p=this.p,g=this.g,sr=this.sr,k=1-Math.exp(-1/(sr*.05)),sp=p.speed||0,cab=p.cabin?1:0,wet=p.wet||0;
      const lat=p.lat||[0,0,0,0],lon=p.lon||[0,0,0,0];
      /* how hard each tyre is really sliding */
      const sqT=[0,1,2,3].map(i=>{const side=ss(1.25,2.1,lat[i]),spin=ss(2.8,5.5,lon[i]);
        return Math.max(side*ss(2,6,sp),spin*.8*ss(.5,3,sp+lon[i]))*Math.min(1.2,(p.load[i]||0)/3600)*(1-.95*wet);});
      const rdT=ss(1,45,sp)*.22,hissT=wet*ss(4,30,sp)*.07,windT=Math.min(1.2,(sp/55)**2)*.35,curbT=p.curb?ss(3,15,sp):0,scrT=ss(1,12,p.scrape||0);
      /* retune the tyre voices once per block: pitch rises a little with slide angle */
      for(let w=0;w<4;w++){const v=this.sq[w];v.drift+=(this.rnd()*.4-v.drift*.05)*.15;
        const f=(720+w*31)*(1+.08*v.drift)*(1+.12*Math.min(1,Math.max(0,lat[w]-1.25)));v.bp.set(f,16,sr);v.bp2.set(f*2.02,14,sr);}
      for(let i=0;i<n;i++){
        for(let w=0;w<4;w++)g.sq[w]+=(sqT[w]-g.sq[w])*k;
        g.rd+=(rdT-g.rd)*k;g.hiss+=(hissT-g.hiss)*k;g.wind+=(windT-g.wind)*k;g.curb+=(curbT-g.curb)*k;g.scr+=(scrT-g.scr)*k*2;
        const wn=this.rnd();
        const b=this.b;b[0]=.99765*b[0]+wn*.099046;b[1]=.963*b[1]+wn*.2965164;b[2]=.57*b[2]+wn*1.0526913;const pink=(b[0]+b[1]+b[2]+wn*.1848)*.12;
        let l=0,r=0;
        /* tyre squeal: a narrow, steady band of noise per tyre with its octave, panned by side */
        for(let w=0;w<4;w++){const a=g.sq[w];if(a<1e-4)continue;const v=this.sq[w];
          const s=(v.bp.run(wn)*1.0+v.bp2.run(wn)*.35)*a*.55;if(w%2===0){l+=s*1.1;r+=s*.7;}else{l+=s*.7;r+=s*1.1;}}
        /* steady tyre roar, and a soft hiss when the road is wet */
        const road=(this.road.run(pink)*1.6+this.road2.run(pink)*.6)*g.rd*(cab?.7:1)+this.hissF.run(pink*3)*g.hiss*(cab?.3:1);l+=road;r+=road;
        /* wind */
        const wind=this.windF.run(pink)*g.wind*(cab?.45:1);l+=wind*1.05;r+=wind*.95;
        /* curb: a soft low thud each stripe */
        if(g.curb>1e-3){this.curbPh+=Math.max(sp,1)/2.0/sr;if(this.curbPh>=1){this.curbPh-=1;this.thumpE=1;}
          this.thumpE*=Math.exp(-1/(sr*.03));this.thumpPh=(this.thumpPh||0)+46/sr;this.thumpLp+=(wn-this.thumpLp)*.01;
          const th=(Math.sin(TAU*this.thumpPh)*.5+this.thumpLp*3)*this.thumpE*g.curb*.18;l+=th;r+=th;}
        /* grinding along a wall: grains of grit at a rate set by the sliding speed, plus a low rub */
        if(g.scr>1e-3){if(Math.random()<(30+p.scrape*6)/sr){this.grainE=1;this.grainA=.4+Math.random()*.6;}
          this.grainE*=Math.exp(-1/(sr*.006));const gr=this.grit.run(wn)*this.grainE*this.grainA*.9+this.gritLo.run(pink)*.9;
          const sc=gr*g.scr*.45;l+=sc;r+=sc;}
        /* impacts */
        for(let h=this.hits.length-1;h>=0;h--){const H=this.hits[h];H.t+=1/sr;const e=Math.exp(-H.t*14)*H.a;
          this.hitLp+=(wn-this.hitLp)*.15;const s=(Math.sin(TAU*H.f*H.t*(1-H.t*1.5))*.9+this.hitLp*1.5*Math.exp(-H.t*30)+wn*.25*Math.exp(-H.t*80))*e;l+=s;r+=s;if(H.t>.6)this.hits.splice(h,1);}
        /* the traffic around you */
        const TV=p.traffic;if(TV)for(let j=0;j<4;j++){const T=TV[j],V=this.tv[j];const tg=T?T.g:0;V.g+=(tg-V.g)*k*.5;if(V.g<1e-4)continue;
          if(T){V.f+=(T.f-V.f)*k;V.pan+=(T.pan-V.pan)*k;V.rd+=((T.rd||0)-V.rd)*k;}
          V.ph+=V.f/sr;if(V.ph>1)V.ph-=1;const ph=TAU*V.ph;
          let e=Math.sin(ph)*.6+Math.sin(2*ph+.4)*.32+Math.sin(3*ph+1.1)*.14+Math.sin(.5*ph)*.18;V.lp+=(e-V.lp)*.25;
          if(i===0)V.bp.set(380+V.rd*900,.8,sr);const tyre=V.bp.run(pink)*V.rd*1.4;
          const x=(V.lp*.7+tyre)*V.g,pl=Math.min(1,1-V.pan),pr=Math.min(1,1+V.pan);l+=x*pl;r+=x*pr;}
        /* horns: two notes a third apart, a buzzy reed */
        for(let h=this.horns.length-1;h>=0;h--){const H=this.horns[h];H.t+=1/sr;const env=Math.min(1,H.t/.012)*(H.t>H.len?Math.exp(-(H.t-H.len)*40):1);
          H.ph1+=H.f/sr;H.ph2+=H.f*1.26/sr;const sq=x=>{x-=Math.floor(x);return (x<.5?1:-1)*.7+Math.sin(TAU*x)*.3;};
          const hs=(sq(H.ph1)+sq(H.ph2))*.5*env*H.a*.32,pl=Math.min(1,1-H.pan),pr=Math.min(1,1+H.pan);l+=hs*pl;r+=hs*pr;if(H.t>H.len+.2)this.horns.splice(h,1);}
        /* the start lights' beeps */
        for(let h=this.beeps.length-1;h>=0;h--){const B=this.beeps[h];B.t+=1/sr;B.ph+=B.f/sr;const env=Math.min(1,B.t/.004)*(B.t>B.len?Math.exp(-(B.t-B.len)*60):1);
          const x=(Math.sin(TAU*B.ph)*.8+Math.sin(TAU*B.ph*2)*.15)*env*B.a*.35;l+=x;r+=x;if(B.t>B.len+.1)this.beeps.splice(h,1);}
        const v=(p.vol??1)*.55;L[i]=l*v;R[i]=r*v;
      }
    }
  }
  return FX;
}
