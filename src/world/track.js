/* =====================================================================================
   TRACKS — centripetal Catmull-Rom through hand-placed map points, resampled every metre.
   Each sample stores position, heading, curvature, bank, slope and vertical curvature.
   Map coords: x east, y north (metres), third value = height. World: X = x, Y = up, Z = -y.
   ===================================================================================== */
import {clamp,lerp,wrapA} from '../physics/math3.js';

export const TRACK_DEFS={
  neon:{name:'Neon Loop',closed:true,hw:6.5,shL:1.4,shR:1.4,bank:.15,lanes:2,center:1,
    pts:[[0,0,0],[190,0,0],[236,10,0],[254,48,0],[256,80,0],[256,104,3.2],[256,128,0],[255,172,0],[243,206,0],[208,216,0],[126,216,0],[100,232,0],
      [95,300,0],[80,332,0],[38,342,0],[-62,340,0],[-96,326,0],[-106,290,0],[-106,192,0],[-90,160,0],[-40,148,0],[-20,128,0],[-24,60,0],[-38,22,0],[-30,4,0]]}
};

function crPoint(p0,p1,p2,p3,t){
  const d=(a,b)=>Math.pow(Math.hypot(b[0]-a[0],b[1]-a[1],(b[2]-a[2])*2)+1e-6,.5);
  const t0=0,t1=t0+d(p0,p1),t2=t1+d(p1,p2),t3=t2+d(p2,p3),tt=t1+(t2-t1)*t;
  const L=(a,b,ta,tb)=>{const k=(tt-ta)/(tb-ta);return [a[0]+(b[0]-a[0])*k,a[1]+(b[1]-a[1])*k,a[2]+(b[2]-a[2])*k];};
  const A1=L(p0,p1,t0,t1),A2=L(p1,p2,t1,t2),A3=L(p2,p3,t2,t3),B1=L(A1,A2,t0,t2),B2=L(A2,A3,t1,t3);return L(B1,B2,t1,t2);
}
function smoothArr(a,n,closed,passes=1){const N=a.length;for(let p=0;p<passes;p++){const o=new Float64Array(N);for(let i=0;i<N;i++){let s=0,c=0;for(let k=-n;k<=n;k++){let j=i+k;if(closed)j=(j+N)%N;else if(j<0||j>=N)continue;s+=a[j];c++;}o[i]=s/c;}a.set(o);}return a;}

export function buildTrack(id){
  const D=TRACK_DEFS[id],pts=D.pts,closed=D.closed,np=pts.length;
  const P=i=>{if(closed)return pts[(i+np)%np];if(i<0){const a=pts[0],b=pts[1];return [2*a[0]-b[0],2*a[1]-b[1],2*a[2]-b[2]];}if(i>=np){const a=pts[np-1],b=pts[np-2];return [2*a[0]-b[0],2*a[1]-b[1],2*a[2]-b[2]];}return pts[i];};
  const dense=[],segs=closed?np:np-1;
  for(let i=0;i<segs;i++){const p0=P(i-1),p1=P(i),p2=P(i+1),p3=P(i+2);for(let k=0;k<64;k++)dense.push(crPoint(p0,p1,p2,p3,k/64));}
  dense.push(closed?dense[0].slice():pts[np-1].slice());
  const cum=[0];for(let i=1;i<dense.length;i++)cum.push(cum[i-1]+Math.hypot(dense[i][0]-dense[i-1][0],dense[i][1]-dense[i-1][1]));
  const total=cum[cum.length-1],N=closed?Math.round(total):Math.floor(total)+1,ds=closed?total/N:1;
  const mx=new Float64Array(N),my=new Float64Array(N),Y=new Float64Array(N);
  let j=0;for(let i=0;i<N;i++){const s=i*ds;while(j<cum.length-2&&cum[j+1]<s)j++;const t=(s-cum[j])/Math.max(1e-6,cum[j+1]-cum[j]),a=dense[j],b=dense[j+1];mx[i]=a[0]+(b[0]-a[0])*t;my[i]=a[1]+(b[1]-a[1])*t;Y[i]=a[2]+(b[2]-a[2])*t;}
  smoothArr(Y,8,closed,2);
  const T={id,def:D,name:D.name,closed,N,ds,len:closed?N*ds:(N-1)*ds,hw:D.hw,shL:D.shL,shR:D.shR,lanes:D.lanes||2,center:D.center||0,mx,my,Y};
  const idx=i=>closed?((i%N)+N)%N:clamp(i,0,N-1);T.idx=idx;
  const TH=new Float64Array(N),K=new Float64Array(N),BK=new Float64Array(N),SL=new Float64Array(N),YY=new Float64Array(N);
  for(let i=0;i<N;i++){const a=idx(i-1),b=idx(i+1);TH[i]=Math.atan2(my[b]-my[a],mx[b]-mx[a]);}
  for(let i=0;i<N;i++){const a=idx(i-2),b=idx(i+2);K[i]=wrapA(TH[b]-TH[a])/(4*ds);}
  smoothArr(K,3,closed,2);
  for(let i=0;i<N;i++)BK[i]=clamp(K[i]*D.bank*9,-.09,.09);
  smoothArr(BK,12,closed,2);
  for(let i=0;i<N;i++){const a=idx(i-2),b=idx(i+2);SL[i]=(Y[b]-Y[a])/(4*ds);}
  for(let i=0;i<N;i++){const a=idx(i-3),b=idx(i+3);YY[i]=(Y[b]-2*Y[i]+Y[a])/(9*ds*ds);}
  Object.assign(T,{TH,K,BK,SL,YY});
  /* curbs on the inside of real corners */
  const curb=new Uint8Array(N);for(let i=0;i<N;i++)if(Math.abs(K[i])>1/90)for(let k=-14;k<=14;k++)curb[idx(i+k)]|=K[i]>0?1:2;
  T.curb=curb;
  T.wl=D.hw+D.shL+.35;T.wr=D.hw+D.shR+.35;     /* barrier faces, measured from the centreline */
  const lerpA=(A,s)=>{let f=s/ds,i=Math.floor(f);f-=i;const a=idx(i),b=idx(i+1);return A[a]+(A[b]-A[a])*f;};
  T.at=lerpA;
  T.kap=s=>lerpA(K,s);T.slope=s=>lerpA(SL,s);T.bank=s=>lerpA(BK,s);T.yAt=s=>lerpA(Y,s);
  T.headAt=s=>{let f=s/ds,i=Math.floor(f);f-=i;const a=idx(i),b=idx(i+1);return TH[a]+wrapA(TH[b]-TH[a])*f;};
  T.wrapS=s=>closed?((s%T.len)+T.len)%T.len:clamp(s,0,T.len);
  /* world position of (s, d): d is metres to the LEFT of the centreline, banked */
  T.pos=(s,d,h=0)=>{let f=s/ds,i=Math.floor(f);f-=i;const a=idx(i),b=idx(i+1);const x=mx[a]+(mx[b]-mx[a])*f,y=my[a]+(my[b]-my[a])*f,yy=Y[a]+(Y[b]-Y[a])*f;
    const th=TH[a]+wrapA(TH[b]-TH[a])*f,bk=BK[a]+(BK[b]-BK[a])*f,nx=-Math.sin(th),ny=Math.cos(th),cb=Math.cos(bk);
    return [x+nx*d*cb,yy-d*Math.sin(bk)+h,-(y+ny*d*cb)];};
  /* frame at s: forward, left and up in world */
  T.frame=s=>{const th=T.headAt(s),bk=T.bank(s),sl=T.slope(s),f=[Math.cos(th),sl,-Math.sin(th)],fl=Math.hypot(f[0],f[1],f[2]);f[0]/=fl;f[1]/=fl;f[2]/=fl;
    const l0=[-Math.sin(th),0,-Math.cos(th)],cb=Math.cos(bk),sb=Math.sin(bk),l=[l0[0]*cb,-sb,l0[2]*cb];
    const u=[f[1]*l[2]-f[2]*l[1],f[2]*l[0]-f[0]*l[2],f[0]*l[1]-f[1]*l[0]];return {f,l,u};};   /* up = forward x left */
  /* surface under a track-frame point: height and normal */
  T.surf=(s,d)=>{const p=T.pos(s,d),fr=T.frame(s);let u=fr.u;if(u[1]<0)u=[-u[0],-u[1],-u[2]];return {y:p[1],n:u};};
  /* nearest-sample spatial hash, plus a local search warm-started from the last index */
  const B=24,hash=new Map();
  for(let i=0;i<N;i++){const k=Math.floor(mx[i]/B)+','+Math.floor(my[i]/B);let a=hash.get(k);if(!a)hash.set(k,a=[]);a.push(i);}
  const d2=(i,x,y)=>(mx[i]-x)**2+(my[i]-y)**2;
  T.nearest=(x,y,r=2)=>{const bx=Math.floor(x/B),by=Math.floor(y/B);let best=1e18,bi=-1;
    for(let a=-r;a<=r;a++)for(let b=-r;b<=r;b++){const L=hash.get((bx+a)+','+(by+b));if(!L)continue;for(const q of L){const v=d2(q,x,y);if(v<best){best=v;bi=q;}}}return bi;};
  /* world (x,z) -> track (s, d, i). hint: a sample index near the answer */
  T.locate=(X,Z,hint=-1)=>{
    const x=X,y=-Z;let i=hint;
    if(i<0||d2(i,x,y)>900){i=T.nearest(x,y,2);if(i<0)i=T.nearest(x,y,8);if(i<0)return null;}
    for(let it=0;it<64;it++){const a=idx(i-1),b=idx(i+1),di=d2(i,x,y);if(d2(a,x,y)<di&&a!==i)i=a;else if(d2(b,x,y)<di&&b!==i)i=b;else break;}
    /* project onto the segment to the next sample */
    const a=i,b=idx(i+1),ex=mx[b]-mx[a],ey=my[b]-my[a],el=ex*ex+ey*ey||1;let t=((x-mx[a])*ex+(y-my[a])*ey)/el;
    let i0=a;if(t<0&&(closed||i>0)){i0=idx(i-1);const ex2=mx[a]-mx[i0],ey2=my[a]-my[i0];t=((x-mx[i0])*ex2+(y-my[i0])*ey2)/(ex2*ex2+ey2*ey2||1);}
    t=clamp(t,0,1);const s=(i0+t)*ds,th=T.headAt(s),px=lerp(mx[i0],mx[idx(i0+1)],t),py=lerp(my[i0],my[idx(i0+1)],t);
    const dd=-(x-px)*Math.sin(th)+(y-py)*Math.cos(th);
    return {s,d:dd/Math.cos(T.bank(s)),i:i0};
  };
  T.curbAt=(s,d)=>{const i=idx(Math.round(s/ds));return d>0?(curb[i]&1):(curb[i]&2);};
  let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;for(let i=0;i<N;i++){x0=Math.min(x0,mx[i]);x1=Math.max(x1,mx[i]);y0=Math.min(y0,my[i]);y1=Math.max(y1,my[i]);}
  T.bb=[x0,y0,x1,y1];
  T.startS=0;
  racingLine(T);
  return T;
}
/* minimum-curvature racing line: an elastic band relaxed inside the road edges (multi-scale) */
function racingLine(T){
  const N=T.N,d=new Float64Array(N),lim=T.hw-1.5;
  const nx=new Float64Array(N),ny=new Float64Array(N);for(let i=0;i<N;i++){nx[i]=-Math.sin(T.TH[i]);ny[i]=Math.cos(T.TH[i]);}
  const px=new Float64Array(N),py=new Float64Array(N);
  for(const [k,it] of [[48,60],[24,80],[12,90],[6,90]]){
    for(let n=0;n<it;n++){
      for(let i=0;i<N;i++){px[i]=T.mx[i]+nx[i]*d[i];py[i]=T.my[i]+ny[i]*d[i];}
      for(let i=0;i<N;i++){if(!T.closed&&(i<k||i>=N-k))continue;const a=T.idx(i-k),b=T.idx(i+k);const mxp=(px[a]+px[b])/2,myp=(py[a]+py[b])/2;
        const tgt=(mxp-T.mx[i])*nx[i]+(myp-T.my[i])*ny[i];d[i]=clamp(d[i]+(tgt-d[i])*.5,-lim,lim);}
    }
  }
  smoothArr(d,4,T.closed,2);
  for(let i=0;i<N;i++){px[i]=T.mx[i]+nx[i]*d[i];py[i]=T.my[i]+ny[i]*d[i];}
  const lk=new Float64Array(N);
  for(let i=0;i<N;i++){const a=T.idx(i-2),b=T.idx(i+2),c=i;const t1=Math.atan2(py[c]-py[a],px[c]-px[a]),t2=Math.atan2(py[b]-py[c],px[b]-px[c]);
    const l=(Math.hypot(px[c]-px[a],py[c]-py[a])+Math.hypot(px[b]-px[c],py[b]-py[c]))/2;lk[i]=wrapA(t2-t1)/Math.max(.5,l);}
  smoothArr(lk,3,T.closed,2);
  T.line=d;T.lineK=lk;T.lineAt=s=>T.at(d,s);
}
/* speed the car can carry along the racing line (m/s per sample), from grip, power and brakes */
export function speedProfile(T,car,{mu=1,aMax=null,brake=null,vmax=95}={}){
  const N=T.N,v=new Float64Array(N),g=9.81,m=car.mass,ds=T.ds;
  const aLat=vv=>mu*(g+.5*1.2*(car.clF+car.clR)*vv*vv/m);
  for(let i=0;i<N;i++){const k=Math.abs(T.lineK[i])+1e-5;let vv=10;for(let it=0;it<12;it++)vv=Math.sqrt(aLat(vv)/k);v[i]=Math.min(vmax,vv);}
  const acc=aMax||(vv=>Math.min(car.powerKw*1000/Math.max(vv,5)/m,mu*g*.7)-.5*1.2*car.cdA*vv*vv/m);
  const brk=brake||mu*g*.92;
  for(let p=0;p<2;p++){
    for(let i=0;i<N;i++){const j=T.idx(i+1),vv=v[i],lat=vv*vv*Math.abs(T.lineK[i]),cap=Math.sqrt(Math.max(0,1-Math.min(1,lat/aLat(vv))**2));
      const nv=Math.sqrt(Math.max(4,vv*vv+2*Math.max(.3,acc(vv)*Math.max(.15,cap)-g*T.SL[i])*ds));if(nv<v[j])v[j]=nv;}
    for(let i=N-1;i>=0;i--){const j=T.idx(i+1),vv=v[j],lat=vv*vv*Math.abs(T.lineK[i]),cap=Math.sqrt(Math.max(0,1-Math.min(1,lat/aLat(vv))**2));
      const nv=Math.sqrt(Math.max(1,vv*vv+2*Math.max(.5,brk*Math.max(.2,cap)+.5*1.2*car.cdA*vv*vv/m+g*T.SL[i])*ds));if(nv<v[i])v[i]=nv;}
  }
  return v;
}
