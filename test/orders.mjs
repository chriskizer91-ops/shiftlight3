/* Hold each layout at a steady 3000 rpm and measure its order spectrum: energy at multiples of
   the crank cycle frequency (rpm/120). Even-firing engines put their energy on the firing order;
   uneven ones (cross-plane V8, odd-fire, boxer, inline-5) spread it into the orders in between. */
import {makeDSP} from '../src/audio/engine-dsp.js';import {SIM} from '../src/engine/engine-sim.js';
const EngineDSP=makeDSP(),SR=48000;
function fftMag(x){const n=x.length,re=Float64Array.from(x),im=new Float64Array(n);
  for(let i=1,j=0;i<n;i++){let b=n>>1;for(;j&b;b>>=1)j^=b;j^=b;if(i<j){[re[i],re[j]]=[re[j],re[i]];}}
  for(let len=2;len<=n;len<<=1){const a=-2*Math.PI/len,wr=Math.cos(a),wi=Math.sin(a);for(let i=0;i<n;i+=len){let cr=1,ci=0;for(let k=0;k<len/2;k++){const ur=re[i+k],ui=im[i+k],vr=re[i+k+len/2]*cr-im[i+k+len/2]*ci,vi=re[i+k+len/2]*ci+im[i+k+len/2]*cr;re[i+k]=ur+vr;im[i+k]=ui+vi;re[i+k+len/2]=ur-vr;im[i+k+len/2]=ui-vi;const t=cr*wr-ci*wi;ci=cr*wi+ci*wr;cr=t;}}}
  const m=new Float64Array(n/2);for(let i=0;i<n/2;i++)m[i]=Math.hypot(re[i],im[i]);return m;}
const rows=[];
for(const id of SIM.LAYOUT_IDS){
  const spec=SIM.makeSpec({layout:id,disp:4,redline:8000,idle:900,tq:400,cP:.6,cW:.5,cA:.5,Ie:.15,ex:2,intake:0,cam:0,crackle:0});
  const dsp=new EngineDSP(SR);const cfg=SIM.dspCfg(spec);cfg.ch=Object.assign({},cfg.ch,{scatter:0});cfg.lope=0;dsp.configure(cfg);
  const rpm=3000;dsp.set({on:1,firing:1,rpm,load:.7,cutFrac:0,boost:0,view:0,dist:3,rear:1,vol:1});
  const warm=new Float32Array(SR),wr=new Float32Array(SR);dsp.process(warm,wr,SR);
  const N=1<<16,L=new Float32Array(N),R=new Float32Array(N);dsp.process(L,R,N);
  const x=new Float64Array(N);for(let i=0;i<N;i++){const w=.5-.5*Math.cos(2*Math.PI*i/N);x[i]=(L[i]+R[i])*.5*w;}
  const m=fftMag(x),df=SR/N,fc=rpm/120,nOrd=Math.round(1000/fc);
  /* energy at each cycle order k*fc (k=1..), summed over +-2 bins */
  const ord=[];for(let k=1;k<=nOrd;k++){const b=Math.round(k*fc/df);let s=0;for(let q=-2;q<=2;q++)s+=m[b+q]**2;ord.push(s);}
  const firing=SIM.LAYOUTS[id].fire.length;   /* pulses per cycle: the firing order is the k that's a multiple of this */
  let onF=0,off=0;ord.forEach((e,i)=>{if((i+1)%firing===0)onF+=e;else off+=e;});
  const top=ord.map((e,i)=>[i+1,e]).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([k])=>(k*fc).toFixed(0)+'Hz');
  rows.push({layout:id,pulses:firing,firingHz:(firing*fc).toFixed(0),offFiringShare:(off/(onF+off)*100).toFixed(1)+'%',strongest:top.join(' ')});
}
console.table(rows);
