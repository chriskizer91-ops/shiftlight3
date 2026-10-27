/* =====================================================================================
   CAR CONTACT — two cars touching: each body is a box (from its design's outline), tested by
   separating axes in the ground plane plus an overlap in height. The impulse goes through
   both rigid bodies at the contact point, with restitution and friction, and the boxes are
   pushed apart so they never sink into each other.
   A body here is {veh (a Vehicle), box:{cx, cy, hx, hy, hz}} where the box centre is in body
   coordinates and the half sizes are along body x (length), y (height), z (width).
   ===================================================================================== */
import {qmat,mcol,add,sub,scale,madd,dot,cross,len,norm} from './math3.js';

/* the box of a car body from its design outline */
export function carBox(dims,hcg){const {xF,xR,hw,H}=dims;return {cx:(xF+xR)/2,cy:(.2+H)/2-hcg,hx:(xF-xR)/2,hy:(H-.2)/2,hz:hw};}

function frame(b){const v=b.veh,M=qmat(v.q),F=mcol(M,0),U=mcol(M,1);
  const f=norm([F[0],0,F[2]]),r=[-f[2],0,f[0]],c=add(v.p,add(scale(F,b.box.cx),scale(U,b.box.cy)));
  return {M,f,r,c,hx:b.box.hx,hz:b.box.hz,y0:c[1]-b.box.hy,y1:c[1]+b.box.hy};}
const corners=F=>{const out=[];for(const sx of [-1,1])for(const sz of [-1,1])out.push([F.c[0]+F.f[0]*F.hx*sx+F.r[0]*F.hz*sz,F.c[2]+F.f[2]*F.hx*sx+F.r[2]*F.hz*sz]);return out;};
const inside=(F,p,m=0)=>{const dx=p[0]-F.c[0],dz=p[1]-F.c[2];return Math.abs(dx*F.f[0]+dz*F.f[2])<=F.hx+m&&Math.abs(dx*F.r[0]+dz*F.r[2])<=F.hz+m;};

/* resolve a contact between bodies A and B; returns the closing speed (0 if they don't touch) */
export function carContact(A,B,{e=.22,mu=.35}={}){
  const a=A.veh,b=B.veh;
  if((a.p[0]-b.p[0])**2+(a.p[2]-b.p[2])**2>64)return 0;
  const FA=frame(A),FB=frame(B);
  if(FA.y1<FB.y0||FB.y1<FA.y0)return 0;
  const d=[FB.c[0]-FA.c[0],FB.c[2]-FA.c[2]];
  let best=1e9,n=null;
  for(const ax of [FA.f,FA.r,FB.f,FB.r]){const pa=FA.hx*Math.abs(dot(FA.f,ax))+FA.hz*Math.abs(dot(FA.r,ax)),pb=FB.hx*Math.abs(dot(FB.f,ax))+FB.hz*Math.abs(dot(FB.r,ax));
    const dist=d[0]*ax[0]+d[1]*ax[2],o=pa+pb-Math.abs(dist);if(o<=0)return 0;if(o<best){best=o;n=dist>=0?[ax[0],0,ax[2]]:[-ax[0],0,-ax[2]];}}
  /* where they touch: the corners of each inside the other, or between the centres */
  const pts=[];for(const p of corners(FB))if(inside(FA,p,.02))pts.push(p);for(const p of corners(FA))if(inside(FB,p,.02))pts.push(p);
  let cx,cz;if(pts.length){cx=0;cz=0;for(const p of pts){cx+=p[0];cz+=p[1];}cx/=pts.length;cz/=pts.length;}
  else{cx=(FA.c[0]+FB.c[0])/2;cz=(FA.c[2]+FB.c[2])/2;}
  const cy=Math.max(FA.y0,FB.y0)+Math.min(.45,(Math.min(FA.y1,FB.y1)-Math.max(FA.y0,FB.y0))*.5);
  const P=[cx,cy,cz],rA=sub(P,a.p),rB=sub(P,b.p);
  const vA=add(a.v,cross(a.w,rA)),vB=add(b.v,cross(b.w,rB)),vr=sub(vB,vA),vn=dot(vr,n);
  /* push apart by mass */
  const ia=1/a.m,ib=1/b.m,sh=best*.85/(ia+ib);
  for(let k=0;k<3;k+=2){a.p[k]-=n[k]*sh*ia;b.p[k]+=n[k]*sh*ib;}
  if(vn>=0)return 0;
  const kA=dot(n,cross(a.invI(FA.M,cross(rA,n)),rA)),kB=dot(n,cross(b.invI(FB.M,cross(rB,n)),rB));
  const j=-(1+e)*vn/(ia+ib+kA+kB);let J=scale(n,j);
  const vt=sub(vr,scale(n,vn)),vtl=len(vt);
  if(vtl>1e-3){const t=scale(vt,1/vtl),kt=ia+ib+dot(t,cross(a.invI(FA.M,cross(rA,t)),rA))+dot(t,cross(b.invI(FB.M,cross(rB,t)),rB));J=madd(J,t,-Math.min(mu*j,vtl/kt));}
  /* J acts on B, -J on A */
  for(let k=0;k<3;k++){a.v[k]-=J[k]*ia;b.v[k]+=J[k]*ib;}
  const dwA=a.invI(FA.M,cross(rA,J)),dwB=b.invI(FB.M,cross(rB,J));
  for(let k=0;k<3;k++){a.w[k]-=dwA[k];b.w[k]+=dwB[k];}
  return -vn;
}
