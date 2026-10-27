/* =====================================================================================
   SHARED GLSL — frame uniforms, noise, packing, the BRDF, every kind of light, shadows,
   the sky. Shaders paste the pieces they need.
   Units: radiance in "scene units" where a lit street at night sits near 0.05 and a neon tube
   near 20; exposure and the tonemapper bring it to the screen.
   ===================================================================================== */
export const FRAME=`
#define PI 3.14159265
#define saturate(x) clamp(x,0.0,1.0)
uniform mat4 uVP;uniform mat4 uPrevVP;uniform mat4 uView;uniform mat4 uProj;uniform mat4 uInvVP;uniform mat4 uVPnj;
uniform vec3 uCam;uniform float uTime;uniform vec2 uRes;uniform vec2 uJit;uniform int uFrame;uniform float uNear;uniform float uFar;
uniform vec3 uSunDir;uniform vec3 uSunCol;uniform vec3 uAmbUp;uniform vec3 uAmbDn;
uniform vec3 uFogCol;uniform float uFogDen;uniform float uFogFall;
uniform float uWet;uniform float uRain;uniform float uNight;
uniform vec3 uSkyZen;uniform vec3 uSkyHor;uniform vec3 uSkyGlow;uniform float uCloud;uniform float uStars;uniform float uSunSize;
`;

export const NOISE=`
float h11(float p){p=fract(p*.1031);p*=p+33.33;p*=p+p;return fract(p);}
float h12(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
vec2 h22(vec2 p){vec3 q=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973));q+=dot(q,q.yzx+33.33);return fract((q.xx+q.yz)*q.zy);}
float h13(vec3 p){p=fract(p*.1031);p+=dot(p,p.zyx+31.32);return fract((p.x+p.y)*p.z);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);
  return mix(mix(h12(i),h12(i+vec2(1,0)),u.x),mix(h12(i+vec2(0,1)),h12(i+vec2(1,1)),u.x),u.y);}
float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<4;i++){s+=a*vn(p);p=mat2(1.6,1.2,-1.2,1.6)*p+vec2(1.7,9.2);a*=.5;}return s;}
float fbm2(vec2 p){return vn(p)*.65+vn(p*2.13+3.1)*.35;}
/* value noise with its gradient (for bump mapping without a second lookup) */
vec3 vnd(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f),du=6.*f*(1.-f);
  float a=h12(i),b=h12(i+vec2(1,0)),c=h12(i+vec2(0,1)),d=h12(i+vec2(1,1));
  return vec3(a+(b-a)*u.x+(c-a)*u.y+(a-b-c+d)*u.x*u.y,du*(vec2(b-a,c-a)+(a-b-c+d)*u.yx));}
/* cellular noise: x = distance to the nearest feature, y = distance to the cell edge, z = cell id */
vec3 voro(vec2 p){vec2 n=floor(p),f=fract(p);vec2 mg,mr;float md=8.,id=0.;
  for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){vec2 g=vec2(i,j),o=h22(n+g),r=g+o-f;float d=dot(r,r);if(d<md){md=d;mr=r;mg=g;id=h12(n+g);}}
  float ed=8.;for(int j=-2;j<=2;j++)for(int i=-2;i<=2;i++){vec2 g=mg+vec2(i,j),o=h22(n+g),r=g+o-f;if(dot(mr-r,mr-r)>1e-5)ed=min(ed,dot(.5*(mr+r),normalize(r-mr)));}
  return vec3(sqrt(md),ed,id);}
/* interleaved gradient noise, animated with the frame (for dithered marches) */
float ign(vec2 px,int fr){px+=5.588238*float(fr&63);return fract(52.9829189*fract(.06711056*px.x+.00583715*px.y));}
`;

export const PACK=`
vec2 octWrap(vec2 v){return (1.0-abs(v.yx))*vec2(v.x>=0.0?1.0:-1.0,v.y>=0.0?1.0:-1.0);}
vec2 octEnc(vec3 n){n/=(abs(n.x)+abs(n.y)+abs(n.z));n.xy=n.z>=0.0?n.xy:octWrap(n.xy);return n.xy;}
vec3 octDec(vec2 f){vec3 n=vec3(f,1.0-abs(f.x)-abs(f.y));float t=saturate(-n.z);n.x+=n.x>=0.0?-t:t;n.y+=n.y>=0.0?-t:t;return normalize(n);}
float lum(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
`;

/* ---------- sky: night city haze, dusk, day. Used for the backdrop and for reflections. ---------- */
export const SKY=`
vec3 skyCol(vec3 d,bool clouds){
  float y=d.y;
  float hz=1.0-saturate(y*1.6);
  vec3 c=mix(uSkyZen,uSkyHor,pow(hz,2.2));
  /* the city's own light under the cloud deck, strongest near the horizon */
  c+=uSkyGlow*exp(-max(y,0.)*7.0);
  /* sun or moon: disc and halo */
  float sd=dot(d,uSunDir);
  float disc=smoothstep(cos(uSunSize*1.15),cos(uSunSize),sd);
  float halo=pow(saturate(sd),24.)*.06+pow(saturate(sd),280.)*.35;
  c+=uSunCol*(disc*(uNight>.5?6.:60.)*(1.0-uCloud*.85)+halo*(1.0-uCloud*.4));
  /* stars on clear nights */
  if(uStars>0.&&y>0.){vec2 g=d.xz/(y+.35)*90.;vec2 id=floor(g);float h=h12(id);if(h>.985){vec2 o=h22(id)-.5;float s=1.-smoothstep(0.,.12,length(fract(g)-.5-o*.6));
      c+=vec3(.8,.85,1.)*s*uStars*(h-.985)*60.*(.6+.4*sin(uTime*3.+h*90.))*saturate(y*4.);}}
  /* a cloud deck: thick in the rain, broken otherwise; lit from below by the city at night */
  if(clouds&&uCloud>0.&&y>-.02){vec2 uv=d.xz/(max(y,.01)+.12)*1.4+vec2(uTime*.006,uTime*.002);
    float n=fbm(uv*1.2)*.65+fbm(uv*3.7+7.)*.35;float cov=smoothstep(1.0-uCloud*.95,1.25-uCloud*.6,n+.25*uCloud);
    vec3 cc=mix(uSkyGlow*2.2+uSkyZen*.8,uSunCol*.35+uSkyHor*1.2,1.0-uNight)*(.55+.6*n);
    cc+=uSunCol*pow(saturate(sd),6.)*(1.0-uNight)*.5;
    c=mix(c,cc,cov*saturate(y*8.+.2));}
  if(y<0.)c=mix(c,uAmbDn*.6,saturate(-y*4.));
  return c;
}`;

/* ---------- BRDF and lights ---------- */
export const LIGHTING=`
struct Surf{vec3 P;vec3 N;vec3 V;vec3 diff;vec3 F0;float rough;float ao;float clear;float clearR;vec3 Nc;float spec;float trans;};
float D_GGX(float NoH,float a){float a2=a*a;float f=(NoH*a2-NoH)*NoH+1.0;return a2/(PI*f*f+1e-7);}
float V_GGX(float NoV,float NoL,float a){float a2=a*a;float gv=NoL*sqrt(NoV*NoV*(1.0-a2)+a2),gl=NoV*sqrt(NoL*NoL*(1.0-a2)+a2);return .5/max(gv+gl,1e-5);}
vec3 F_Sch(vec3 f0,float c){float p=1.0-c;float p2=p*p;return f0+(1.0-f0)*(p2*p2*p);}
/* one light arriving from direction L (unit, toward the light) with radiance E; aN widens the lobe for area lights */
vec3 brdfL(Surf s,vec3 L,vec3 E,float aN){
  float NoL=dot(s.N,L);
  vec3 c=vec3(0);
  if(NoL>0.0){
    vec3 H=normalize(L+s.V);float NoH=saturate(dot(s.N,H)),VoH=saturate(dot(s.V,H)),NoV=max(dot(s.N,s.V),1e-3);
    float a=max(s.rough*s.rough,.002);float an=max(a,aN);
    vec3 F=F_Sch(s.F0,VoH);
    vec3 sp=D_GGX(NoH,an)*(a*a)/(an*an)*V_GGX(NoV,NoL,a)*F*s.spec;
    c=(s.diff*(1.0-F)*(1.0/PI)+sp)*NoL;
    /* light passing through thin things (leaves, glass) */
  }
  if(s.trans>0.0)c+=s.diff*s.trans*saturate(-NoL)*(1.0/PI);
  if(s.clear>0.0){
    float NoLc=dot(s.Nc,L);
    if(NoLc>0.0){vec3 H=normalize(L+s.V);float NoH=saturate(dot(s.Nc,H)),VoH=saturate(dot(s.V,H)),NoV=max(dot(s.Nc,s.V),1e-3);
      float a=max(s.clearR*s.clearR,.002),an=max(a,aN);float Fc=F_Sch(vec3(.04),VoH).x*s.clear;
      c=c*(1.0-Fc)+D_GGX(NoH,an)*(a*a)/(an*an)*V_GGX(NoV,NoLc,a)*Fc*NoLc;}
  }
  return c*E;
}
/* smooth windowed inverse-square falloff */
float falloff(float d2,float r){float x=d2/(r*r);float w=saturate(1.0-x*x);return w*w/(d2+.25);}

/* ---- the clustered static lights: a world-space grid of cells, each with its list of lights ---- */
uniform highp sampler2D uLights;uniform highp usampler2D uLGrid;uniform highp usampler2D uLList;
uniform vec4 uGridP;uniform float uFlick[8];uniform float uLightsOn;
uniform vec4 uDyn[48];uniform int uNDyn;
vec4 LT(int i,int k){return texelFetch(uLights,ivec2((i*4+k)&1023,(i*4+k)>>10),0);}
/* evaluate one light record. Types: 0 point, 1 spot, 2 tube (line) */
vec3 evalRec(Surf s,vec4 A,vec4 B,vec4 C,vec4 D){
  int code=int(B.w+.5),type=code&7,fl=code>>3;
  vec3 Lc=A.xyz;float r=A.w;
  vec3 col=B.rgb*(fl>0?uFlick[fl&7]:1.0);
  if(type==2){
    /* tube light: representative point on the segment for the highlight, closest point for the diffuse */
    vec3 ax=C.xyz,P0=Lc-ax-s.P,Ld=2.0*ax;
    vec3 R=reflect(-s.V,s.N);float rd=dot(R,Ld);
    float t=saturate((dot(R,P0)*rd-dot(P0,Ld))/max(dot(Ld,Ld)-rd*rd,1e-4));
    float tc=saturate(-dot(P0,Ld)/max(dot(Ld,Ld),1e-4));
    vec3 Ls=P0+Ld*t,Lcl=P0+Ld*tc;float d2s=dot(Ls,Ls),d2c=dot(Lcl,Lcl);
    float len2=length(ax)*2.0,dc=sqrt(d2c);float spread=(2.0*dc/max(len2,.01))*atan(len2/(2.0*dc+1e-3));
    vec3 Lsn=Ls*inversesqrt(d2s),Lcn=Lcl/max(dc,1e-4);
    Surf sd=s;sd.spec=0.0;sd.clear=0.0;Surf ss=s;ss.diff=vec3(0);ss.trans=0.0;
    vec3 c=brdfL(sd,Lcn,col*falloff(d2c,r)*spread,0.0);
    c+=brdfL(ss,Lsn,col*falloff(d2s,r)*spread,D.y/(2.0*sqrt(d2s)+1e-3));
    return c;
  }
  vec3 Lv=Lc-s.P;float d2=dot(Lv,Lv);if(d2>r*r)return vec3(0);
  vec3 L=Lv*inversesqrt(d2);float att=falloff(d2,r);
  if(type==1){float cd=dot(-L,C.xyz);att*=smoothstep(C.w,D.x,cd);if(att<=0.0)return vec3(0);}
  return brdfL(s,L,col*att,D.y/(2.0*sqrt(d2)+1e-3));
}
vec3 clusterLights(Surf s){
  vec3 c=vec3(0);if(uLightsOn<=0.0)return c;
  ivec2 cell=ivec2(floor((s.P.xz-uGridP.xy)*uGridP.z));int gw=int(uGridP.w);
  if(cell.x<0||cell.y<0||cell.x>=gw||cell.y>=gw)return c;
  uvec2 oc=texelFetch(uLGrid,cell,0).xy;int o=int(oc.x),n=int(oc.y);
  for(int k=0;k<n;k++){int idx=o+k;int li=int(texelFetch(uLList,ivec2(idx&1023,idx>>10),0).x);
    c+=evalRec(s,LT(li,0),LT(li,1),LT(li,2),LT(li,3));}
  return c*uLightsOn;
}
/* dynamic lights (car lamps): three vec4 each [pos,r] [col,type] [dir,cosOuter] */
vec3 dynLights(Surf s){vec3 c=vec3(0);for(int i=0;i<uNDyn;i++){vec4 A=uDyn[i*3],B=uDyn[i*3+1],C=uDyn[i*3+2];c+=evalRec(s,A,B,C,vec4(C.w+.12,.03,0,0));}return c;}

/* ---- headlights: two lamps share one shadow map; the beam has a real low-beam cut-off ---- */
uniform vec4 uHL[5];  /* [posL,on] [posR,high] [dir,0] [right,0] [col,range] */
uniform mat4 uHLMat;uniform highp sampler2DShadow uHLSh;uniform float uHLShOn;
float beam(vec3 d,vec3 F,vec3 Rt,vec3 Up,float high){
  float z=dot(d,F);if(z<=.05)return 0.0;
  float x=dot(d,Rt)/z,y=dot(d,Up)/z;
  /* low beam: a sharp horizontal cut just below the horizon, kicked up on the kerb side */
  float cut=-.012+.022*smoothstep(-.02,.12,x);
  float lo=smoothstep(cut+.006,cut-.01,y);
  float hot=exp(-pow((x-.04)/.13,2.)-pow((y+.035)/.045,2.))*2.6;
  float wide=exp(-pow(x/.62,2.)-pow((y+.05)/.16,2.))*.8;
  float fore=exp(-pow(x/1.1,2.)-pow((y+.25)/.25,2.))*.25;
  float b=(hot+wide+fore)*lo;
  float hi=exp(-pow(x/.32,2.)-pow(y/.09,2.))*3.0+exp(-pow(x/.8,2.)-pow(y/.2,2.))*.6;
  b=mix(b,max(b,hi),high);
  return b*smoothstep(.05,.2,z);
}
float hlShadow(vec3 P,vec3 N){
  if(uHLShOn<=0.0)return 1.0;
  vec4 q=uHLMat*vec4(P+N*.05,1.0);if(q.w<=0.0)return 1.0;vec3 p=q.xyz/q.w*.5+.5;
  if(any(lessThan(p.xy,vec2(0)))||any(greaterThan(p.xy,vec2(1))))return 1.0;
  float b=.0004;vec2 tx=vec2(1.0/1024.0);float s=0.0;
  s+=texture(uHLSh,vec3(p.xy+tx*vec2(-.7,-.3),p.z-b));s+=texture(uHLSh,vec3(p.xy+tx*vec2(.3,-.7),p.z-b));
  s+=texture(uHLSh,vec3(p.xy+tx*vec2(.7,.3),p.z-b));s+=texture(uHLSh,vec3(p.xy+tx*vec2(-.3,.7),p.z-b));
  return s*.25;
}
vec3 headlights(Surf s){
  if(uHL[0].w<=0.0)return vec3(0);
  vec3 c=vec3(0);vec3 F=uHL[2].xyz,Rt=uHL[3].xyz,Up=cross(Rt,F);float range=uHL[4].w;
  float sh=hlShadow(s.P,s.N);if(sh<=0.0)return c;
  for(int i=0;i<2;i++){vec3 Lp=uHL[i].xyz,Lv=Lp-s.P;float d2=dot(Lv,Lv);vec3 L=Lv*inversesqrt(d2);
    float b=beam(-L,F,Rt,Up,uHL[1].w);if(b<=0.0)continue;
    c+=brdfL(s,L,uHL[4].rgb*b*falloff(d2,range),0.0);}
  return c*sh*uHL[0].w;
}

/* ---- sun / moon: cascaded shadow maps ---- */
uniform highp sampler2DArrayShadow uCSM;uniform mat4 uCSMM[3];uniform vec4 uCSMS;uniform float uCSMOn;
float csmLayer(vec3 P,vec3 N,int k,float rot){
  vec4 q=uCSMM[k]*vec4(P+N*(.02+.03*float(k)*float(k)),1.0);vec3 p=q.xyz*.5+.5;
  if(any(lessThan(p,vec3(0.002)))||any(greaterThan(p,vec3(.998))))return -1.0;
  float b=.0002*(1.0+float(k)*1.5);float tx=uCSMS.w;float s=0.0;
  float cs=cos(rot),sn=sin(rot);mat2 R=mat2(cs,sn,-sn,cs);
  vec2 o0=R*vec2(-1.2,-.4)*tx,o1=R*vec2(.4,-1.2)*tx,o2=R*vec2(1.2,.4)*tx,o3=R*vec2(-.4,1.2)*tx;
  s+=texture(uCSM,vec4(p.xy+o0,float(k),p.z-b));s+=texture(uCSM,vec4(p.xy+o1,float(k),p.z-b));
  s+=texture(uCSM,vec4(p.xy+o2,float(k),p.z-b));s+=texture(uCSM,vec4(p.xy+o3,float(k),p.z-b));
  return s*.25;
}
float sunShadow(vec3 P,vec3 N,float vd,vec2 px){
  if(uCSMOn<=0.0)return 1.0;
  float rot=ign(px,uFrame)*6.283;
  int k=vd<uCSMS.x?0:vd<uCSMS.y?1:2;
  float s=csmLayer(P,N,k,rot);
  if(s<0.0&&k<2)s=csmLayer(P,N,k+1,rot);
  if(s<0.0)return 1.0;
  /* fade the last cascade out at its far edge */
  if(k==2)s=mix(s,1.0,smoothstep(uCSMS.z*.8,uCSMS.z,vd));
  return s;
}
/* ---- soft occlusion under cars: a rounded box on the ground per car ---- */
uniform vec4 uOcc[16];uniform int uNOcc;
float carOcc(vec3 P){
  float o=1.0;
  for(int i=0;i<uNOcc;i++){vec4 A=uOcc[i*2],B=uOcc[i*2+1];vec3 d=P-A.xyz;
    float h=d.y+A.w;if(h>1.3||h<-.4)continue;
    vec2 l=vec2(dot(d.xz,B.xy),dot(d.xz,vec2(-B.y,B.x)));
    vec2 q=abs(l)-B.zw*.82;float sd=length(max(q,0.))+min(max(q.x,q.y),0.);
    float k=1.0-smoothstep(-.5,.9+h*.6,sd);o*=1.0-k*.8*saturate(1.2-h);}
  return o;
}
`;

/* a ready-made fragment helper: everything that lights a surface except the environment */
export const SHADE=`
vec3 directAll(Surf s,vec2 px,float vd){
  vec3 c=vec3(0);
  if(dot(uSunCol,uSunCol)>1e-6){float sh=sunShadow(s.P,s.N,vd,px);if(sh>0.0)c+=brdfL(s,uSunDir,uSunCol*sh,.003);}
  c+=clusterLights(s)+dynLights(s)+headlights(s);
  return c;
}
vec3 ambient(Surf s){
  float up=s.N.y*.5+.5;return mix(uAmbDn,uAmbUp,up)*s.diff*s.ao;
}
`;
