/* =====================================================================================
   PARTICLES — rain streaks and splashes made entirely on the GPU from the instance number
   and the time; spray, tyre smoke and steam from a small pool on the CPU. All are lit at
   their position by the same lights as the city (lamps, neon, headlights), and depth-tested
   by hand against the scene so they fade softly into whatever they touch.
   ===================================================================================== */
import {FRAME,NOISE,LIGHTING} from './common.js';

/* light arriving at a point in the air, for something small and translucent */
const POINT_LIGHT=`
uniform vec3 uFogAmb;
/* returns scattered radiance for a thin, mostly forward-scattering medium */
vec3 lightAt(vec3 X,vec3 V){
  vec3 c=mix(uAmbDn,uAmbUp,.6)*1.2+uFogAmb*4.;
  if(dot(uSunCol,uSunCol)>1e-6)c+=uSunCol*(.25+.75*pow(saturate(dot(-V,uSunDir)),4.));
  if(uLightsOn>0.0){ivec2 cell=ivec2(floor((X.xz-uGridP.xy)*uGridP.z));int gw=int(uGridP.w);
    if(cell.x>=0&&cell.y>=0&&cell.x<gw&&cell.y<gw){uvec2 oc=texelFetch(uLGrid,cell,0).xy;int n=min(int(oc.y),12);
      for(int k=0;k<n;k++){int idx=int(oc.x)+k;int li=int(texelFetch(uLList,ivec2(idx&1023,idx>>10),0).x);
        vec4 A=LT(li,0),B=LT(li,1),C=LT(li,2),D=LT(li,3);int code=int(B.w+.5),type=code&7,fl=code>>3;
        vec3 Lp=A.xyz;if(type==2){vec3 ax=C.xyz;Lp+=ax*clamp(dot(X-Lp,ax)/max(dot(ax,ax),1e-4),-1.,1.);}
        vec3 Lv=Lp-X;float d2=dot(Lv,Lv);if(d2>A.w*A.w)continue;vec3 L=Lv*inversesqrt(d2);
        float att=falloff(d2,A.w);if(type==1)att*=smoothstep(C.w,D.x,dot(-L,C.xyz));
        /* drops light up most when the light is behind them */
        c+=B.rgb*(fl>0?uFlick[fl&15]:1.0)*att*(.025+.11*pow(saturate(dot(-V,L)),3.))*uLightsOn;}}}
  for(int i=0;i<uNDyn;i++){vec4 A=uDyn[i*3],B=uDyn[i*3+1],C=uDyn[i*3+2];vec3 Lv=A.xyz-X;float d2=dot(Lv,Lv);if(d2>A.w*A.w)continue;vec3 L=Lv*inversesqrt(d2);
    float att=falloff(d2,A.w);if(int(B.w+.5)==1)att*=smoothstep(C.w,C.w+.12,dot(-L,C.xyz));c+=B.rgb*att*(.025+.11*pow(saturate(dot(-V,L)),3.));}
  if(uHL[0].w>0.0){vec3 F=uHL[2].xyz,Rt=uHL[3].xyz,Up=cross(Rt,F);vec3 hp=(uHL[0].xyz+uHL[1].xyz)*.5;vec3 Lv=hp-X;float d2=dot(Lv,Lv);
    if(d2<uHL[4].w*uHL[4].w){vec3 L=Lv*inversesqrt(d2);float b=beam(-L,F,Rt,Up,uHL[1].w);c+=uHL[4].rgb*b*falloff(d2,uHL[4].w)*(.02+.13*pow(saturate(dot(-V,L)),3.))*uHL[0].w;}}
  return c;
}`;
const SOFT=`
uniform highp sampler2D uDepth;uniform vec2 uOutRes;
float linz(float d){float z=d*2.-1.;return 2.*uNear*uFar/(uFar+uNear-z*(uFar-uNear));}
float soft(float vz,float range){float sz=linz(texture(uDepth,gl_FragCoord.xy/uOutRes).r);return saturate((sz-vz)/range);}
`;
const MASK=`uniform sampler2D uMask;uniform vec4 uMaskP;vec2 maskAt(vec2 xz){return texture(uMask,(xz-uMaskP.xy)*uMaskP.z).rg;}`;

/* ---------- rain streaks ---------- */
export const RAIN_VS=FRAME+NOISE+LIGHTING+POINT_LIGHT+MASK+`
uniform vec3 uBox;uniform vec3 uFall;uniform vec3 uCamVel;uniform float uStreak;uniform float uDensity;
out vec2 vQ;out vec3 vC;out float vA;out float vZ;
void main(){
  int id=gl_InstanceID,v=gl_VertexID;
  float fi=float(id);vec3 h=vec3(h11(fi*.1031+.13),h11(fi*.7311+.37),h11(fi*.3771+.71));
  if(h11(fi*.917+.5)>uDensity){gl_Position=vec4(2,2,2,1);return;}
  vec3 fall=uFall*(.85+.3*h11(fi*.21));
  vec3 p=uCam+(fract((h*uBox-uCam+fall*uTime)/uBox)-.5)*uBox;
  vec2 m=maskAt(p.xz);if(m.y<.5&&p.y<m.x+12.){gl_Position=vec4(2,2,2,1);return;}
  if(p.y<m.x){gl_Position=vec4(2,2,2,1);return;}
  vec3 rel=fall-uCamVel;vec3 tail=p-rel*uStreak;
  vec4 a=uVP*vec4(p,1.),b=uVP*vec4(tail,1.);
  if(a.w<.2||b.w<.2){gl_Position=vec4(2,2,2,1);return;}
  vec2 sa=a.xy/a.w,sb=b.xy/b.w;vec2 d=(sb-sa)*uRes;float L=length(d);vec2 dir=L>1e-3?d/L:vec2(0,1);vec2 nr=vec2(-dir.y,dir.x);
  /* a drop is about 2 mm wide: draw at least one pixel and fade instead */
  float wpx=.0025*uProj[1][1]*uRes.y*.5/a.w;float w=max(wpx,.75);vA=min(1.,wpx/.75);
  int c=v<3?v:(v==3?2:(v==4?1:3));
  vec2 corner=vec2(float(c&1),float(c>>1));
  vec4 P=mix(a,b,corner.y);vec2 off=nr*(corner.x*2.-1.)*w/uRes*2.*P.w;
  gl_Position=vec4(P.xy+off,P.zw);
  vQ=vec2(corner.x*2.-1.,corner.y);
  vec3 V=normalize(uCam-p);
  vC=lightAt(p,V);vZ=a.w;
  vA*=smoothstep(.8,3.,a.w)*(1.0-smoothstep(uBox.x*.35,uBox.x*.5,length(p.xz-uCam.xz)))*min(1.,30./max(L,1.)+.3);
}`;
export const RAIN_FS=FRAME+SOFT+`
in vec2 vQ;in vec3 vC;in float vA;in float vZ;out vec4 o;
void main(){float e=1.0-vQ.x*vQ.x;float a=e*vA*(.35+.65*sin(vQ.y*3.14))*.55*soft(vZ,.4);
  if(a<.002)discard;o=vec4(vC*a*5.,a*.2);}`;

/* ---------- splashes where drops land ---------- */
export const SPLASH_VS=FRAME+NOISE+LIGHTING+POINT_LIGHT+MASK+`
uniform float uRadius;uniform float uDensity;
out vec2 vQ;out vec3 vC;out float vA;out float vZ;out float vAge;
void main(){
  int id=gl_InstanceID,v=gl_VertexID;float fi=float(id);
  float per=.35+.4*h11(fi*.37);float ph=h11(fi*.71);float cyc=floor(uTime/per+ph);float age=fract(uTime/per+ph);
  if(age>.22||h11(fi*.53+cyc*.17)>uDensity){gl_Position=vec4(2,2,2,1);return;}
  vec2 r=vec2(h11(fi*.113+cyc*.731),h11(fi*.419+cyc*.297));float ang=r.x*6.2831,rad=sqrt(r.y)*uRadius;
  vec2 xz=uCam.xz+vec2(cos(ang),sin(ang))*rad;vec2 m=maskAt(xz);if(m.y<.5){gl_Position=vec4(2,2,2,1);return;}
  vec3 p=vec3(xz.x,m.x+.01,xz.y);
  vec3 V=normalize(uCam-p);vec3 rt=normalize(cross(vec3(0,1,0),V));
  float sz=(.05+.11*age/.22)*(.7+.6*h11(fi*.9));
  int c=v<3?v:(v==3?2:(v==4?1:3));vec2 corner=vec2(float(c&1),float(c>>1));
  vec3 P=p+rt*(corner.x*2.-1.)*sz+vec3(0,1,0)*corner.y*sz*1.2;
  vec4 cp=uVP*vec4(P,1.);gl_Position=cp;vZ=cp.w;
  vQ=vec2(corner.x*2.-1.,corner.y);vAge=age/.22;
  vC=lightAt(p+vec3(0,.05,0),V);vA=(1.0-smoothstep(uRadius*.6,uRadius,rad))*smoothstep(1.,3.,cp.w);
}`;
export const SPLASH_FS=FRAME+NOISE+SOFT+`
in vec2 vQ;in vec3 vC;in float vA;in float vZ;in float vAge;out vec4 o;
void main(){
  vec2 q=vQ*vec2(1.,1.);float r=length(vec2(q.x,q.y*1.4));
  /* a crown: a thin rim that rises and spreads, flung droplets above it */
  float rim=smoothstep(.15,0.,abs(q.y-(.15+.25*vAge)*(1.0-q.x*q.x*.8)))*step(q.y,.6)*(1.0-abs(q.x));
  vec2 dq=fract(q*vec2(3.,2.5)+vec2(0,-vAge))-.5;float drops=smoothstep(.18,.0,length(dq))*step(.3,q.y)*(1.0-vAge);
  float a=max(rim,drops)*(1.0-vAge)*vA*.7*soft(vZ,.15);
  if(a<.003)discard;o=vec4(vC*a*4.,a*.25);}`;

/* ---------- spray, smoke and steam (CPU-simulated, drawn as soft sprites) ---------- */
export const PUFF_VS=FRAME+NOISE+LIGHTING+POINT_LIGHT+`
layout(location=0) in vec4 iP;   /* position, size */
layout(location=1) in vec4 iD;   /* alpha, kind, seed, age */
out vec2 vQ;out vec3 vC;out float vA;out float vZ;out vec2 vS;
void main(){
  int v=gl_VertexID;int c=v<3?v:(v==3?2:(v==4?1:3));vec2 corner=vec2(float(c&1),float(c>>1))*2.-1.;
  vec3 p=iP.xyz;float sz=iP.w;vec3 V=normalize(uCam-p);vec3 rt=normalize(cross(vec3(0,1,0),V)),up=cross(V,rt);
  float rot=iD.z*6.2831+iD.w*.6;vec2 cr=vec2(cos(rot)*corner.x-sin(rot)*corner.y,sin(rot)*corner.x+cos(rot)*corner.y);
  vec3 P=p+(rt*cr.x+up*cr.y)*sz;vec4 cp=uVP*vec4(P,1.);gl_Position=cp;vZ=cp.w;
  vQ=corner;vS=vec2(iD.y,iD.z);
  vC=lightAt(p,V);vA=iD.x;
}`;
export const PUFF_FS=FRAME+NOISE+SOFT+`
in vec2 vQ;in vec3 vC;in float vA;in float vZ;in vec2 vS;out vec4 o;
void main(){
  float r=length(vQ);if(r>1.)discard;
  float n=fbm(vQ*1.7+vS.y*37.)*.7+.3;
  float a=smoothstep(1.,.2,r)*n*vA*soft(vZ,.6);
  int kind=int(vS.x+.5);
  vec3 tint=kind==1?vec3(.82,.84,.88):kind==2?vec3(.9):vec3(.75,.8,.86);
  if(a<.002)discard;o=vec4(vC*tint*a*.5,a);}`;
