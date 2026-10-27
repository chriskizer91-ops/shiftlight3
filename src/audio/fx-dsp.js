/* =====================================================================================
   FX SYNTH — everything that isn't the engine, made live per sample:
   - tyre squeal: four resonant voices (one per tyre) driven by how far past peak grip each is
   - road: rumble and tyre roar that rise with speed, the hiss of tyres on a wet road
   - curb rumble: thumps at the rate the stripes go by
   - wind, and rain (a hiss outside, drumming on the roof from inside)
   - impacts (a thud and a crunch) and scraping along a barrier
   Self-contained so it can be stringified into an AudioWorklet, like the engine synth.
   ===================================================================================== */
export function makeFX(){
  const TAU=Math.PI*2;
  class FX{
    constructor(sr){this.sr=sr;this.p={slip:[0,0,0,0],load:[0,0,0,0],wet:0,rain:0,speed:0,cabin:0,curb:0,scrape:0,air:0,vol:1,tunnel:0};
      this.g={sq:[0,0,0,0],rd:0,hiss:0,wind:0,rain:0,curb:0,scr:0,cab:0};
      this.sq=[0,1,2,3].map(i=>({f:700+i*37,y1:0,y2:0,ph:Math.random(),drift:0}));
      this.seed=22222;this.b=[0,0,0,0,0,0,0];this.lp=[0,0,0,0,0,0,0,0];this.curbPh=0;this.thumpE=0;this.hits=[];this.dropT=0;this.drops=[];}
    set(p){this.p=p;}
    event(e){if(e.type==='hit')this.hits.push({t:0,a:Math.min(1.5,e.a),f:60+Math.random()*25});}
    rnd(){let s=this.seed;s^=s<<13;s^=s>>>17;s^=s<<5;this.seed=s;return (s>>>0)/4294967296*2-1;}
    process(L,R,n){
      const p=this.p,g=this.g,sr=this.sr,k=1-Math.exp(-1/(sr*.04)),sp=p.speed||0;
      const cab=p.cabin?1:0;
      /* targets */
      const sqT=p.slip.map((s,i)=>{const sl=Math.max(0,s);const a=Math.max(0,Math.min(1,(sl-.8)/.55))*(1-Math.max(0,Math.min(1,(sl-4)/3)));
        return a*Math.min(1.2,(p.load[i]||0)/3600)*(1-.75*p.wet)*Math.min(1,sp/3);});
      const rdT=Math.min(1,sp/45)*.5,hissT=p.wet*Math.min(1,sp/30)*.7,windT=Math.min(1.2,(sp/55)**2)*.6,rainT=p.rain*.35*(1-.6*p.tunnel),curbT=p.curb?Math.min(1,sp/20):0,scrT=Math.min(1,p.scrape/10);
      const wcab=cab?.35:1;
      for(let i=0;i<n;i++){
        for(let w=0;w<4;w++)g.sq[w]+=(sqT[w]-g.sq[w])*k;
        g.rd+=(rdT-g.rd)*k;g.hiss+=(hissT-g.hiss)*k;g.wind+=(windT-g.wind)*k;g.rain+=(rainT-g.rain)*k;g.curb+=(curbT-g.curb)*k;g.scr+=(scrT-g.scr)*k*3;g.cab+=(cab-g.cab)*k;
        const wn=this.rnd();
        /* pink-ish noise (Paul Kellet's economy filter) and brown noise */
        const b=this.b;b[0]=.99765*b[0]+wn*.099046;b[1]=.963*b[1]+wn*.2965164;b[2]=.57*b[2]+wn*1.0526913;const pink=(b[0]+b[1]+b[2]+wn*.1848)*.12;
        b[3]=(b[3]+.02*wn)/1.02;const brown=b[3]*3.5;
        let l=0,r=0;
        /* tyres: a resonant voice each, wandering in pitch, panned by side */
        for(let w=0;w<4;w++){const a=g.sq[w];if(a<1e-4)continue;const v=this.sq[w];
          v.drift+=(this.rnd()*.5-v.drift*.002)*.02;const f=(640+v.drift*90+w*23+60*a)*(1+.04*Math.sin(v.ph));v.ph+=TAU*27/sr;
          const q=.012,w0=TAU*f/sr,rr=1-q*w0,c=2*rr*Math.cos(w0);const y=wn*(1-rr)*2.2+c*v.y1-rr*rr*v.y2;v.y2=v.y1;v.y1=y;
          const out=y*a*.9*(.7+.3*Math.sin(v.ph*.37));if(w%2===0)l+=out*1.15,r+=out*.75;else l+=out*.75,r+=out*1.15;}
        /* road roar and the wet hiss */
        const lp=this.lp;lp[0]+=(brown-lp[0])*(.02+g.rd*.05);lp[1]+=(pink-lp[1])*.25;const hissS=pink-lp[1];
        const road=lp[0]*g.rd*1.4+hissS*g.hiss*(cab?.25:.9)*1.6;l+=road;r+=road;
        /* wind */
        lp[2]+=(pink-lp[2])*(.04+g.wind*.04);const wind=(lp[2]-lp[3])*g.wind*(cab?.5:1.1);lp[3]+=(lp[2]-lp[3])*.005;l+=wind*1.1;r+=wind*.9;
        /* rain: hiss outside, drops drumming on the roof inside */
        if(g.rain>1e-4){lp[4]+=(pink-lp[4])*.35;const rh=(pink-lp[4])*g.rain*(cab?.25:1.8);l+=rh;r+=rh;
          if(cab&&Math.random()<g.rain*.02)this.drops.push({t:0,a:.15+Math.random()*.25,f:900+Math.random()*1600,pan:Math.random()});
          if(!cab&&Math.random()<g.rain*.004)this.drops.push({t:0,a:.05+Math.random()*.08,f:2500+Math.random()*3000,pan:Math.random()});}
        for(let d=this.drops.length-1;d>=0;d--){const D=this.drops[d];D.t+=1/sr;const e=Math.exp(-D.t*300)*D.a;const s=Math.sin(TAU*D.f*D.t)*e*(1+this.rnd()*.3);l+=s*(1-D.pan);r+=s*D.pan;if(D.t>.03)this.drops.splice(d,1);}
        /* curb: a thump every time a stripe goes under the tyres */
        if(g.curb>1e-3){this.curbPh+=Math.max(sp,1)/1.0/sr;if(this.curbPh>=1){this.curbPh-=1;this.thumpE=1;}
          this.thumpE*=Math.exp(-1/(sr*.018));lp[5]+=(brown*4-lp[5])*.06;const t=(Math.sin(TAU*55*this.thumpE)*.6+lp[5])*this.thumpE*g.curb*.35;l+=t;r+=t;}
        /* scraping along the wall */
        if(g.scr>1e-3){lp[6]+=(wn-lp[6])*.5;const sc=(wn-lp[6])*g.scr*(.5+.5*Math.sin(TAU*this.curbPh*7))*.5;l+=sc;r+=sc;}
        /* impacts */
        for(let h=this.hits.length-1;h>=0;h--){const H=this.hits[h];H.t+=1/sr;const e=Math.exp(-H.t*14)*H.a;
          lp[7]+=(wn-lp[7])*.15;const s=(Math.sin(TAU*H.f*H.t*(1-H.t*1.5))*.9+lp[7]*1.5*Math.exp(-H.t*30)+wn*.3*Math.exp(-H.t*60))*e;l+=s;r+=s;if(H.t>.6)this.hits.splice(h,1);}
        const v=(p.vol??1)*.55;L[i]=l*v;R[i]=r*v;
      }
    }
  }
  return FX;
}
