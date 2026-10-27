/* =====================================================================================
   RIBBON — a road surface that follows a centre line: the elevated highway, the ramps.
   Built from a dense list of map points [x, y, height] about a metre apart. Answers the same
   questions as the circuit's track: where is a point along it (s, d), what is the surface
   height and normal there, where is (s, d) in the world.
   Map coordinates are x east, y north; the world is X = x, Z = -y.
   ===================================================================================== */
import {clamp,wrapA} from '../physics/math3.js';

export function makeRibbon(pts,{closed=false,hw=4,id=0,name=''}={}){
  /* resample to an even spacing */
  const cum=[0];for(let i=1;i<pts.length;i++)cum.push(cum[i-1]+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]));
  if(closed)cum.push(cum[cum.length-1]+Math.hypot(pts[0][0]-pts[pts.length-1][0],pts[0][1]-pts[pts.length-1][1]));
  const P=closed?[...pts,pts[0]]:pts,total=cum[cum.length-1];
  const N=closed?Math.max(8,Math.round(total)):Math.max(2,Math.floor(total)+1),ds=closed?total/N:total/(N-1);
  const mx=new Float64Array(N),my=new Float64Array(N),Y=new Float64Array(N);
  let j=0;for(let i=0;i<N;i++){const s=i*ds;while(j<cum.length-2&&cum[j+1]<s)j++;const t=clamp((s-cum[j])/Math.max(1e-6,cum[j+1]-cum[j]),0,1),a=P[j],b=P[j+1];
    mx[i]=a[0]+(b[0]-a[0])*t;my[i]=a[1]+(b[1]-a[1])*t;Y[i]=a[2]+(b[2]-a[2])*t;}
  const R={id,name,closed,N,ds,len:closed?N*ds:(N-1)*ds,hw,mx,my,Y};
  const idx=i=>closed?((i%N)+N)%N:clamp(i,0,N-1);R.idx=idx;
  const TH=new Float64Array(N),SL=new Float64Array(N);
  for(let i=0;i<N;i++){const a=idx(i-1),b=idx(i+1);TH[i]=Math.atan2(my[b]-my[a],mx[b]-mx[a]);}
  for(let i=0;i<N;i++){const a=idx(i-2),b=idx(i+2);SL[i]=(Y[b]-Y[a])/(Math.max(1,(b-a+(b<a?N:0)))*ds);}
  R.TH=TH;R.SL=SL;
  const lerpA=(A,s)=>{let f=s/ds,i=Math.floor(f);f-=i;const a=idx(i),b=idx(i+1);return A[a]+(A[b]-A[a])*f;};
  R.at=lerpA;R.yAt=s=>lerpA(Y,s);R.slope=s=>lerpA(SL,s);
  R.headAt=s=>{let f=s/ds,i=Math.floor(f);f-=i;const a=idx(i),b=idx(i+1);return TH[a]+wrapA(TH[b]-TH[a])*f;};
  R.wrapS=s=>closed?((s%R.len)+R.len)%R.len:clamp(s,0,R.len);
  /* world position of (s, d): d metres to the left of the centre line, h above the surface */
  R.pos=(s,d,h=0)=>{const th=R.headAt(s),x=lerpA(mx,s),y=lerpA(my,s);return [x-Math.sin(th)*d,lerpA(Y,s)+h,-(y+Math.cos(th)*d)];};
  R.frame=s=>{const th=R.headAt(s),sl=R.slope(s),fl=Math.hypot(1,sl),f=[Math.cos(th)/fl,sl/fl,-Math.sin(th)/fl],l=[-Math.sin(th),0,-Math.cos(th)];
    const u=[f[1]*l[2]-f[2]*l[1],f[2]*l[0]-f[0]*l[2],f[0]*l[1]-f[1]*l[0]];return {f,l,u};};
  /* nearest sample via a coarse hash, then a local walk and a projection onto the segment */
  const B=20,hash=new Map();
  for(let i=0;i<N;i++){const k=Math.floor(mx[i]/B)+','+Math.floor(my[i]/B);let a=hash.get(k);if(!a)hash.set(k,a=[]);a.push(i);}
  R.cells=[...hash.keys()];
  const d2=(i,x,y)=>(mx[i]-x)**2+(my[i]-y)**2;
  R.nearest=(x,y,r=1)=>{const bx=Math.floor(x/B),by=Math.floor(y/B);let best=1e18,bi=-1;
    for(let a=-r;a<=r;a++)for(let b=-r;b<=r;b++){const L=hash.get((bx+a)+','+(by+b));if(!L)continue;for(const q of L){const v=d2(q,x,y);if(v<best){best=v;bi=q;}}}return bi;};
  R.locate=(X,Z,hint=-1)=>{const x=X,y=-Z;let i=hint;
    if(i<0||i>=N||d2(i,x,y)>400){i=R.nearest(x,y,1);if(i<0)i=R.nearest(x,y,3);if(i<0)return null;}
    for(let it=0;it<48;it++){const a=idx(i-1),b=idx(i+1),di=d2(i,x,y);if(d2(a,x,y)<di&&a!==i)i=a;else if(d2(b,x,y)<di&&b!==i)i=b;else break;}
    const a=i,b=idx(i+1);let i0=a,ex=mx[b]-mx[a],ey=my[b]-my[a];let t=((x-mx[a])*ex+(y-my[a])*ey)/(ex*ex+ey*ey||1);
    if(t<0&&(closed||i>0)){i0=idx(i-1);ex=mx[a]-mx[i0];ey=my[a]-my[i0];t=((x-mx[i0])*ex+(y-my[i0])*ey)/(ex*ex+ey*ey||1);}
    const along=i0*ds+clamp(t,0,1)*ds;
    /* past the open ends: report how far beyond */
    let s=along;if(!closed){if(i0===0&&t<0)s=t*ds;if(i0>=N-2&&t>1)s=(N-2+t)*ds;}
    const tc=clamp(t,0,1),px=mx[i0]+ex*tc,py=my[i0]+ey*tc,th=R.headAt(clamp(s,0,R.len));
    return {s,d:-(x-px)*Math.sin(th)+(y-py)*Math.cos(th),i:i0};};
  return R;
}
