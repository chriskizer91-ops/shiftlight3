/* Small 3D math for the physics: vectors are [x,y,z], quaternions are [x,y,z,w].
   World: x east, y up, z south. Car body: +X forward, +Y up, +Z right. */
export const clamp=(v,a,b)=>v<a?a:v>b?b:v;
export const lerp=(a,b,t)=>a+(b-a)*t;
export const sstep=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
export const sgn=v=>v<0?-1:v>0?1:0;
export const TAU=Math.PI*2;
export const wrapA=a=>{while(a>Math.PI)a-=TAU;while(a<-Math.PI)a+=TAU;return a;};

export const v3=(x=0,y=0,z=0)=>[x,y,z];
export const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
export const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
export const scale=(a,k)=>[a[0]*k,a[1]*k,a[2]*k];
export const madd=(a,b,k)=>[a[0]+b[0]*k,a[1]+b[1]*k,a[2]+b[2]*k];
export const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const len=a=>Math.hypot(a[0],a[1],a[2]);
export const norm=a=>{const l=Math.hypot(a[0],a[1],a[2])||1;return [a[0]/l,a[1]/l,a[2]/l];};
export const lerp3=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];

/* quaternions */
export const qmul=(a,b)=>[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
export const qnorm=q=>{const l=Math.hypot(q[0],q[1],q[2],q[3])||1;return [q[0]/l,q[1]/l,q[2]/l,q[3]/l];};
export const qaxis=(ax,ang)=>{const s=Math.sin(ang/2),n=norm(ax);return [n[0]*s,n[1]*s,n[2]*s,Math.cos(ang/2)];};
/* rotate vector v by unit quaternion q */
export function qrot(q,v){const x=q[0],y=q[1],z=q[2],w=q[3],tx=2*(y*v[2]-z*v[1]),ty=2*(z*v[0]-x*v[2]),tz=2*(x*v[1]-y*v[0]);
  return [v[0]+w*tx+y*tz-z*ty,v[1]+w*ty+z*tx-x*tz,v[2]+w*tz+x*ty-y*tx];}
export const qinvrot=(q,v)=>qrot([-q[0],-q[1],-q[2],q[3]],v);
/* integrate orientation by world angular velocity w over dt */
export function qint(q,w,dt){const d=[w[0]*dt*.5,w[1]*dt*.5,w[2]*dt*.5,0],r=qmul(d,q);return qnorm([q[0]+r[0],q[1]+r[1],q[2]+r[2],q[3]+r[3]]);}
/* rotation matrix rows (body axes in world): [fwd, up, right] = columns of R */
export function qmat(q){const x=q[0],y=q[1],z=q[2],w=q[3];
  return [1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w), 2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w), 2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)];}
export const mcol=(m,i)=>[m[i],m[3+i],m[6+i]];
export const mvec=(m,v)=>[m[0]*v[0]+m[1]*v[1]+m[2]*v[2],m[3]*v[0]+m[4]*v[1]+m[5]*v[2],m[6]*v[0]+m[7]*v[1]+m[8]*v[2]];
export const mtvec=(m,v)=>[m[0]*v[0]+m[3]*v[1]+m[6]*v[2],m[1]*v[0]+m[4]*v[1]+m[7]*v[2],m[2]*v[0]+m[5]*v[1]+m[8]*v[2]];
/* quaternion that rotates body axes onto a given forward/up */
export function qlook(fwd,up){
  const f=norm(fwd),r=norm(cross(f,up)),u=cross(r,f);
  /* matrix with columns f,u,r -> quaternion */
  const m00=f[0],m01=u[0],m02=r[0],m10=f[1],m11=u[1],m12=r[1],m20=f[2],m21=u[2],m22=r[2],tr=m00+m11+m22;let x,y,z,w;
  if(tr>0){const s=Math.sqrt(tr+1)*2;w=.25*s;x=(m21-m12)/s;y=(m02-m20)/s;z=(m10-m01)/s;}
  else if(m00>m11&&m00>m22){const s=Math.sqrt(1+m00-m11-m22)*2;w=(m21-m12)/s;x=.25*s;y=(m01+m10)/s;z=(m02+m20)/s;}
  else if(m11>m22){const s=Math.sqrt(1+m11-m00-m22)*2;w=(m02-m20)/s;x=(m01+m10)/s;y=.25*s;z=(m12+m21)/s;}
  else{const s=Math.sqrt(1+m22-m00-m11)*2;w=(m10-m01)/s;x=(m02+m20)/s;y=(m12+m21)/s;z=.25*s;}
  return qnorm([x,y,z,w]);
}
