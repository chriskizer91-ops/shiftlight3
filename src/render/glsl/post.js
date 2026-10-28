/* =====================================================================================
   POST — everything after the scene is drawn:
   reflections (SSR) -> fog and light shafts -> composite -> TAA (upscales to native) ->
   motion blur -> bloom -> exposure -> tonemap, lens, grain -> (LED dot matrix)
   ===================================================================================== */
import {FRAME,NOISE,PACK,SKY,LIGHTING} from './common.js';

const DEPTH=`
uniform highp sampler2D uDepth;
vec3 wpos(vec2 uv,float d){vec4 q=uInvVP*vec4(uv*2.-1.,d*2.-1.,1.);return q.xyz/q.w;}
float linz(float d){float z=d*2.-1.;return 2.*uNear*uFar/(uFar+uNear-z*(uFar-uNear));}
`;

/* ---------------- screen-space reflections, half resolution ---------------- */
export const SSR_FS=FRAME+NOISE+PACK+DEPTH+`
in vec2 vT;out vec4 o;
uniform sampler2D uNrm;uniform sampler2D uPrev;uniform samplerCube uProbe;uniform float uResScale;uniform float uProbeLod;uniform float uPrevLod;uniform float uHasPrev;uniform int uSteps;
void main(){
  vec2 uv=vT;vec4 nr=texture(uNrm,uv);
  if(nr.w<=0.0){o=vec4(0);return;}
  float d=texture(uDepth,uv).r;if(d>=1.0){o=vec4(0);return;}
  vec3 P=wpos(uv,d),N=octDec(nr.xy),V=normalize(uCam-P);float rough=nr.z,a=max(rough*rough,.001);
  /* the mirror direction, nudged a little each frame so TAA smooths the edges; the gloss comes from
     reading a blurrier level of last frame's image, sized to the reflection cone where the ray lands */
  vec2 xi=vec2(ign(gl_FragCoord.xy,uFrame),ign(gl_FragCoord.xy+vec2(31.,17.),uFrame+3))-.5;
  vec3 up=abs(N.y)<.99?vec3(0,1,0):vec3(1,0,0),tx=normalize(cross(up,N)),ty=cross(N,tx);
  vec3 Nj=normalize(N+(tx*xi.x+ty*xi.y)*a*.35);
  vec3 R=reflect(-V,Nj);if(dot(R,N)<=.02)R=reflect(-V,N);
  vec3 env=textureLod(uProbe,R,rough*uProbeLod).rgb;
  /* march: steps grow as the ray gets longer */
  float t=.12+.25*ign(gl_FragCoord.xy+vec2(7.,3.),uFrame+11),dt=.2;vec2 huv=vec2(-1);float hitT=0.0;vec4 ch=vec4(1);
  for(int i=0;i<30;i++){if(i>=uSteps)break;
    vec3 X=P+R*t;vec4 c=uVP*vec4(X,1.);if(c.w<uNear)break;vec2 s=c.xy/c.w*.5+.5;
    if(any(lessThan(s,vec2(0)))||any(greaterThan(s,vec2(1))))break;
    float sz=linz(texture(uDepth,s).r),rz=c.w,th=max(.25,t*.06);
    if(rz>sz+.02&&rz-sz<th){
      /* refine between the last two steps */
      float t0=t-dt,t1=t;for(int k=0;k<5;k++){float tm=(t0+t1)*.5;vec4 cm=uVP*vec4(P+R*tm,1.);vec2 sm=cm.xy/cm.w*.5+.5;
        if(cm.w>linz(texture(uDepth,sm).r))t1=tm;else t0=tm;}
      ch=uVP*vec4(P+R*t1,1.);huv=ch.xy/ch.w*.5+.5;hitT=t1;break;}
    dt=max(.2,t*.16);t+=dt;if(t>80.)break;
  }
  vec3 col=env;
  if(huv.x>=0.0&&uHasPrev>0.0){
    /* the hit, as the last frame saw it */
    vec3 Xh=wpos(huv,texture(uDepth,huv).r);vec4 pc=uPrevVP*vec4(Xh,1.);vec2 puv=pc.xy/pc.w*.5+.5;
    vec2 e=smoothstep(0.0,.08,puv)*smoothstep(1.0,.92,puv);float conf=e.x*e.y*(1.0-smoothstep(.35,.5,rough));
    /* cone footprint at the hit, in pixels of the half-resolution pyramid */
    float rad=hitT*a*1.6,vz=max(ch.w,uNear);float px=rad*uProj[1][1]*uRes.y*.5/vz/uResScale*.5;
    float lod=clamp(log2(max(px,1.0)),0.0,uPrevLod);
    vec3 hc=textureLod(uPrev,puv,lod).rgb;
    col=mix(env,hc,conf);
  }
  o=vec4(min(col,vec3(60.)),1.0);
}`;

/* ---------------- fog, rain haze and light shafts, half resolution ---------------- */
export const FOG_FS=FRAME+NOISE+PACK+DEPTH+LIGHTING+`
in vec2 vT;out vec4 o;
uniform vec3 uFogAmb;uniform float uFogSteps;uniform float uFogLights;
float hg(float c,float g){float g2=g*g;return (1.0-g2)/(4.*PI*pow(1.0+g2-2.0*g*c,1.5));}
/* light from the static lights that scatters toward the eye at X (no shadows; the cones read in the haze) */
vec3 scatterLights(vec3 X,vec3 rd){
  vec3 c=vec3(0);if(uLightsOn<=0.0)return c;
  ivec2 cell=ivec2(floor((X.xz-uGridP.xy)*uGridP.z));int gw=int(uGridP.w);
  if(cell.x<0||cell.y<0||cell.x>=gw||cell.y>=gw)return c;
  uvec2 oc=texelFetch(uLGrid,cell,0).xy;int n=min(int(oc.y),int(uFogLights));
  for(int k=0;k<n;k++){int idx=int(oc.x)+k;int li=int(texelFetch(uLList,ivec2(idx&1023,idx>>10),0).x);
    vec4 A=LT(li,0),B=LT(li,1),C=LT(li,2),D=LT(li,3);int code=int(B.w+.5),type=code&7,fl=code>>3;
    vec3 Lp=A.xyz;if(type==2){vec3 ax=C.xyz;float tt=clamp(dot(X-Lp,ax)/max(dot(ax,ax),1e-4),-1.,1.);Lp+=ax*tt;}
    vec3 Lv=Lp-X;float d2=dot(Lv,Lv);if(d2>A.w*A.w)continue;vec3 L=Lv*inversesqrt(d2);
    float att=falloff(d2,A.w);if(type==1)att*=smoothstep(C.w,D.x,dot(-L,C.xyz));
    c+=B.rgb*(fl>0?uFlick[fl&15]:1.0)*att*hg(dot(rd,L),.35);}
  return c*uLightsOn;
}
float csmVis(vec3 X){if(uCSMOn<=0.0)return 1.0;
  for(int k=0;k<3;k++){vec4 q=uCSMM[k]*vec4(X,1.);vec3 p=q.xyz*.5+.5;if(all(greaterThan(p,vec3(.001)))&&all(lessThan(p,vec3(.999))))return texture(uCSM,vec4(p.xy,float(k),p.z-.0004));}
  return 1.0;}
float hlVis(vec3 X){if(uHLShOn<=0.0)return 1.0;vec4 q=uHLMat*vec4(X,1.);if(q.w<=0.0)return 0.0;vec3 p=q.xyz/q.w*.5+.5;
  if(any(lessThan(p.xy,vec2(0)))||any(greaterThan(p.xy,vec2(1))))return 0.0;return texture(uHLSh,vec3(p.xy,p.z-.0006));}
void main(){
  float d=texture(uDepth,vT).r;vec3 P=wpos(vT,min(d,.99999));vec3 rd=normalize(P-uCam);
  float tMax=d>=1.0?160.:min(length(P-uCam),160.);
  int N=int(uFogSteps);float jit=ign(gl_FragCoord.xy,uFrame);
  vec3 S=vec3(0);float Tr=1.0,tPrev=0.0;
  float sunPh=hg(dot(rd,uSunDir),.55)*.8+hg(dot(rd,uSunDir),-.2)*.2;
  vec3 hlF=uHL[2].xyz,hlR=uHL[3].xyz,hlU=cross(hlR,hlF);vec3 hlP=(uHL[0].xyz+uHL[1].xyz)*.5;
  for(int i=0;i<64;i++){if(i>=N)break;
    float f=(float(i)+jit)/float(N);float t=tMax*f*f;float dt=t-tPrev;tPrev=t;
    vec3 X=uCam+rd*t;
    float h=max(X.y,0.0);float dens=uFogDen*exp(-h*uFogFall);
    vec3 Li=uFogAmb;
    if(dot(uSunCol,uSunCol)>1e-6)Li+=uSunCol*sunPh*csmVis(X);
    if(uHL[0].w>0.0){vec3 Lv=hlP-X;float d2=dot(Lv,Lv);if(d2<uHL[4].w*uHL[4].w){vec3 L=Lv*inversesqrt(d2);float b=beam(-L,hlF,hlR,hlU,uHL[1].w);
      /* the lamps are 10 cm across, not points: no infinite glow right at the lens */
      if(b>0.0)Li+=uHL[4].rgb*b*falloff(max(d2,2.5),uHL[4].w)*hlVis(X)*hg(dot(rd,L),.45)*.5*uHL[0].w;}}
    Li+=scatterLights(X,rd)*.45;
    float ext=dens*dt;S+=Li*ext*Tr;Tr*=exp(-ext);
  }
  o=vec4(S,Tr);
}`;

/* ---------------- composite: reflections and fog onto the lit scene ---------------- */
export const COMP_FS=FRAME+`
in vec2 vT;out vec4 o;
uniform sampler2D uCol;uniform sampler2D uNrm;uniform sampler2D uSSR;uniform sampler2D uFog;uniform highp sampler2D uDepth;uniform vec2 uHalf;
void main(){
  vec3 c=texture(uCol,vT).rgb;vec4 n=texture(uNrm,vT);
  if(n.w>0.0)c+=texture(uSSR,vT).rgb*n.w;
  vec4 f=texture(uFog,vT);
  c=c*f.a+f.rgb;
  o=vec4(max(c,vec3(0)),1.0);
}`;

/* ---------------- temporal anti-aliasing, reconstructing native resolution ---------------- */
export const TAA_FS=`#define saturate(x) clamp(x,0.0,1.0)
in vec2 vT;out vec4 o;
uniform sampler2D uCur;uniform sampler2D uHist;uniform sampler2D uVel;uniform highp sampler2D uDepth;
uniform vec2 uInRes;uniform vec2 uOutRes;uniform vec2 uJit;uniform float uReset;uniform float uSharp;
vec3 toY(vec3 c){return vec3(.25*c.r+.5*c.g+.25*c.b,.5*c.r-.5*c.b,-.25*c.r+.5*c.g-.25*c.b);}
vec3 fromY(vec3 c){return vec3(c.x+c.y-c.z,c.x+c.z,c.x-c.y-c.z);}
vec3 tm(vec3 c){return c/(1.0+max(max(c.r,c.g),c.b));}
vec3 itm(vec3 c){return c/max(1.0-max(max(c.r,c.g),c.b),1e-4);}
/* history read with a 5-tap Catmull-Rom so it stays sharp */
vec3 histCR(vec2 uv){vec2 sp=uv*uOutRes,tp=floor(sp-.5)+.5,f=sp-tp,f2=f*f,f3=f2*f;
  vec2 w0=f2-.5*(f3+f),w1=1.5*f3-2.5*f2+1.,w3=.5*(f3-f2),w2=1.-w0-w1-w3,w12=w1+w2;
  vec2 t0=(tp-1.)/uOutRes,t3=(tp+2.)/uOutRes,t12=(tp+w2/w12)/uOutRes;
  vec3 c=texture(uHist,vec2(t12.x,t0.y)).rgb*w12.x*w0.y+texture(uHist,vec2(t0.x,t12.y)).rgb*w0.x*w12.y+texture(uHist,t12).rgb*w12.x*w12.y
    +texture(uHist,vec2(t3.x,t12.y)).rgb*w3.x*w12.y+texture(uHist,vec2(t12.x,t3.y)).rgb*w12.x*w3.y;
  float w=w12.x*w0.y+w0.x*w12.y+w12.x*w12.y+w3.x*w12.y+w12.x*w3.y;return max(c/w,vec3(0));}
void main(){
  vec2 p=vT*uInRes;ivec2 ip=ivec2(floor(p+uJit));
  float scale=uOutRes.x/uInRes.x;
  vec3 sum=vec3(0);float wsum=0.0,wmax=0.0;vec3 m1=vec3(0),m2=vec3(0);float nd=1.0;ivec2 best=ip;
  for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){
    ivec2 q=clamp(ip+ivec2(i,j),ivec2(0),ivec2(uInRes)-1);
    vec3 c=tm(texelFetch(uCur,q,0).rgb);
    vec2 sp=vec2(q)+.5-uJit;vec2 dd=(p-sp)*scale;float w=exp(-2.29*dot(dd,dd));
    sum+=c*w;wsum+=w;wmax=max(wmax,w);
    vec3 y=toY(c);m1+=y;m2+=y*y;
    float z=texelFetch(uDepth,q,0).r;if(z<nd){nd=z;best=q;}
  }
  vec3 cur=sum/max(wsum,1e-4);
  vec2 vel=texelFetch(uVel,best,0).xy;
  vec2 huv=vT-vel;
  if(uReset>0.0||any(lessThan(huv,vec2(0)))||any(greaterThan(huv,vec2(1)))){o=vec4(itm(cur),1.0);return;}
  vec3 hist=tm(histCR(huv));
  vec3 mu=m1/9.,sg=sqrt(max(m2/9.-mu*mu,vec3(0)));
  float speed=length(vel*uOutRes);
  float g=mix(1.25,.85,saturate(speed/25.));
  vec3 mn=mu-sg*g,mx=mu+sg*g;
  /* clip the history toward the neighbourhood's centre */
  vec3 hy=toY(hist),cy=clamp(mu,mn,mx),rd=hy-cy;vec3 ext=(mx-mn)*.5+1e-4;vec3 rr=abs(rd/ext);float m=max(rr.x,max(rr.y,rr.z));
  if(m>1.0)hy=cy+rd/m;hist=fromY(hy);
  float a=clamp(.1*wmax*1.3/max(scale*scale*.6+.4,1.0),.035,.2)+saturate(speed/40.)*.12;
  vec3 c=mix(hist,cur,a);
  o=vec4(itm(max(c,vec3(0))),1.0);
}`;

/* plain copies and downsamples */
export const COPY_FS=`in vec2 vT;out vec4 o;uniform sampler2D uSrc;uniform float uLod;void main(){o=textureLod(uSrc,vT,uLod);}`;
export const DOWN4_FS=`in vec2 vT;out vec4 o;uniform sampler2D uSrc;uniform vec2 uPx;
void main(){vec3 c=texture(uSrc,vT+uPx*vec2(-.5,-.5)).rgb+texture(uSrc,vT+uPx*vec2(.5,-.5)).rgb+texture(uSrc,vT+uPx*vec2(-.5,.5)).rgb+texture(uSrc,vT+uPx*vec2(.5,.5)).rgb;o=vec4(min(c*.25,vec3(200.)),1.0);}`;

/* ---------------- motion blur from the velocity buffer ---------------- */
export const MB_FS=`#define saturate(x) clamp(x,0.0,1.0)
in vec2 vT;out vec4 o;
uniform sampler2D uSrc;uniform sampler2D uVel;uniform highp sampler2D uDepth;uniform float uShutter;uniform vec2 uOutRes;uniform float uNear;uniform float uFar;uniform int uFrame;
float linz(float d){float z=d*2.-1.;return 2.*uNear*uFar/(uFar+uNear-z*(uFar-uNear));}
float ign(vec2 px,int fr){px+=5.588238*float(fr&63);return fract(52.9829189*fract(.06711056*px.x+.00583715*px.y));}
void main(){
  vec3 c0=texture(uSrc,vT).rgb;
  vec2 v=texture(uVel,vT).xy*uShutter;float vl=length(v*uOutRes);
  float maxL=uOutRes.x*.035;if(vl>maxL){v*=maxL/vl;vl=maxL;}
  if(vl<.75){o=vec4(c0,1.0);return;}
  float z0=linz(texture(uDepth,vT).r);
  int N=int(clamp(vl*.5,4.,14.));float j=ign(gl_FragCoord.xy,uFrame)-.5;
  vec3 s=c0;float ws=1.0;
  for(int i=0;i<14;i++){if(i>=N)break;float t=(float(i)+.5+j)/float(N)-.5;vec2 uv=vT+v*t;
    float z=linz(texture(uDepth,uv).r);vec2 sv=texture(uVel,uv).xy*uShutter;float sl=length(sv*uOutRes);float dist=abs(t)*vl;
    float fg=saturate(1.0-(z-z0)*2.);float bg=saturate(1.0-(z0-z)*2.);
    float w=fg*saturate(1.0-dist/max(sl,1.))+bg*saturate(1.0-dist/max(vl,1.))+saturate(1.0-dist/max(min(sl,vl),1.))*2.0*min(fg,bg);
    s+=texture(uSrc,uv).rgb*w;ws+=w;}
  o=vec4(s/ws,1.0);
}`;

/* ---------------- bloom: a 13-tap down chain and a tent-filtered way back up ---------------- */
export const BLOOM_DOWN_FS=`
in vec2 vT;out vec4 o;uniform sampler2D uSrc;uniform vec2 uPx;uniform float uFirst;
vec3 S(vec2 o2){return texture(uSrc,vT+uPx*o2).rgb;}
float kw(vec3 c){return 1.0/(1.0+max(max(c.r,c.g),c.b)*.5);}
void main(){
  vec3 a=S(vec2(-2,-2)),b=S(vec2(0,-2)),c=S(vec2(2,-2)),d=S(vec2(-1,-1)),e=S(vec2(1,-1)),f=S(vec2(-2,0)),g=S(vec2(0)),h=S(vec2(2,0)),i=S(vec2(-1,1)),j=S(vec2(1,1)),k=S(vec2(-2,2)),l=S(vec2(0,2)),m=S(vec2(2,2));
  vec3 g0=(d+e+i+j)*.25,g1=(a+b+f+g)*.25,g2=(b+c+g+h)*.25,g3=(f+g+k+l)*.25,g4=(g+h+l+m)*.25;
  if(uFirst>0.0){float w0=kw(g0)*.5,w1=kw(g1)*.125,w2=kw(g2)*.125,w3=kw(g3)*.125,w4=kw(g4)*.125;
    o=vec4(min((g0*w0+g1*w1+g2*w2+g3*w3+g4*w4)/(w0+w1+w2+w3+w4),vec3(500.)),1.0);}
  else o=vec4(g0*.5+(g1+g2+g3+g4)*.125,1.0);
}`;
export const BLOOM_UP_FS=`
in vec2 vT;out vec4 o;uniform sampler2D uSrc;uniform vec2 uPx;uniform float uW;
void main(){vec3 c=texture(uSrc,vT).rgb*4.;
  c+=(texture(uSrc,vT+uPx*vec2(-1,0)).rgb+texture(uSrc,vT+uPx*vec2(1,0)).rgb+texture(uSrc,vT+uPx*vec2(0,-1)).rgb+texture(uSrc,vT+uPx*vec2(0,1)).rgb)*2.;
  c+=texture(uSrc,vT+uPx*vec2(-1,-1)).rgb+texture(uSrc,vT+uPx*vec2(1,-1)).rgb+texture(uSrc,vT+uPx*vec2(-1,1)).rgb+texture(uSrc,vT+uPx*vec2(1,1)).rgb;
  o=vec4(c/16.*uW,1.0);}`;

/* ---------------- exposure: the eye adapting, on the GPU ---------------- */
export const EXPO_FS=`
in vec2 vT;out vec4 o;uniform sampler2D uSrc;uniform sampler2D uPrev;uniform float uDt;uniform float uKey;uniform vec2 uRange;uniform float uReset;
void main(){
  float s=0.0,w=0.0;
  for(int j=0;j<8;j++)for(int i=0;i<8;i++){vec2 uv=(vec2(i,j)+.5)/8.;vec2 q=uv-.5;float cw=exp(-dot(q,q)*5.);
    vec3 c=texture(uSrc,uv).rgb;s+=log2(max(dot(c,vec3(.2126,.7152,.0722)),1e-4))*cw;w+=cw;}
  float avg=exp2(s/w);
  float target=clamp(uKey/max(avg,1e-4),uRange.x,uRange.y);
  float prev=texture(uPrev,vec2(.5)).r;
  float k=uReset>0.0?1.0:1.0-exp(-uDt*(target>prev?1.6:2.6));
  o=vec4(prev+(target-prev)*k,avg,0,1);
}`;

/* ---------------- the final image: exposure, tonemap, grade, lens ---------------- */
export const FINAL_FS=FRAME+NOISE+`
in vec2 vT;out vec4 o;
uniform sampler2D uSrc;uniform sampler2D uBloom;uniform sampler2D uExpo;uniform sampler2D uDirt;
uniform float uBloomK;uniform vec2 uGrade;uniform float uExpoBias;uniform float uLensRain;uniform float uVig;uniform float uGrain;uniform vec2 uOutRes;uniform float uCA;
/* Stephen Hill's fit of the ACES reference transform */
vec3 aces(vec3 c){mat3 m1=mat3(.59719,.07600,.02840,.35458,.90834,.13383,.04823,.01566,.83777);mat3 m2=mat3(1.60475,-.10208,-.00327,-.53108,1.10813,-.07276,-.07367,-.00605,1.07602);
  vec3 v=m1*c;vec3 a=v*(v+.0245786)-.000090537,b=v*(.983729*v+.4329510)+.238081;return clamp(m2*(a/b),0.,1.);}
vec3 srgb(vec3 c){return mix(c*12.92,1.055*pow(c,vec3(1./2.4))-.055,step(.0031308,c));}
/* raindrops on the lens: a few sizes of drops, some sliding */
vec3 drops(vec2 uv,float t){
  vec2 asp=vec2(uOutRes.x/uOutRes.y,1.);vec3 acc=vec3(0);
  for(int k=0;k<3;k++){float sc=k==0?5.:k==1?9.:16.;vec2 p=uv*asp*sc;vec2 id=floor(p);vec2 f=fract(p)-.5;
    vec2 r=h22(id+float(k)*31.);if(r.x>.18*uLensRain+(k==2?.08:0.))continue;
    float life=fract(t*.12*(1.+r.y)+r.x*9.);float slide=k==0?smoothstep(.55,1.,life):0.;
    vec2 c=(h22(id+7.)-.5)*.5+vec2(0,-slide*.9);vec2 d=f-c;float rad=(.07+.06*r.y)*(k==0?1.:.7);
    float m=1.0-smoothstep(rad*.7,rad,length(d*vec2(1.,1.15)));float fade=smoothstep(0.,.06,life)*(1.0-smoothstep(.85,1.,life));
    if(m*fade>acc.z)acc=vec3(d/rad,m*fade);}
  return acc;}
void main(){
  vec2 uv=vT;vec3 lr=vec3(0);
  if(uLensRain>0.0){lr=drops(uv,uTime);uv-=lr.xy*lr.z*.02;}
  float ex=texture(uExpo,vec2(.5)).r*uExpoBias;
  vec2 cq=uv-.5;vec3 c;
  if(uCA>0.0){vec2 sh=cq*dot(cq,cq)*uCA*.012;c=vec3(texture(uSrc,uv-sh).r,texture(uSrc,uv).g,texture(uSrc,uv+sh).b);}else c=texture(uSrc,uv).rgb;
  vec3 b=texture(uBloom,uv).rgb;
  c=c+b*uBloomK;
  if(lr.z>0.0)c=mix(c,textureLod(uBloom,uv-lr.xy*.05,0.).rgb*1.3+c*.25,lr.z*.4);
  c*=ex;
  c=aces(c*1.0);
  float l=dot(c,vec3(.2126,.7152,.0722));c=mix(vec3(l),c,uGrade.x);c=clamp((c-.5)*uGrade.y+.5,0.,1.);
  c=srgb(c);
  float e=dot(cq,cq);c*=1.0-e*uVig;
  c+=(h12(gl_FragCoord.xy+fract(uTime*7.3)*97.)-.5)*uGrain;
  o=vec4(c,1.0);
}`;

/* ---------------- LED dot-matrix view (the HyperDot look) ---------------- */
export const LED_FS=`
in vec2 vT;out vec4 o;
uniform sampler2D uSrc;uniform sampler2D uHud;uniform vec2 uRes;uniform float uGain;uniform float uQuant;
const float BY[16]=float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
void main(){
  vec2 cell=vT*uRes;vec2 id=floor(cell);vec2 f=fract(cell)-.5;vec2 tc=(id+.5)/uRes;
  vec3 sc=texture(uSrc,tc).rgb;sc=pow(sc,vec3(2.2));
  vec4 hu=texture(uHud,vec2(tc.x,1.-tc.y));
  vec3 c=mix(sc,pow(hu.rgb,vec3(2.2))*1.2,hu.a);
  if(uQuant>0.){int bi=(int(mod(id.y,4.))<<2)|int(mod(id.x,4.));float d=(BY[bi]+.5)/16.;vec3 q=sqrt(max(c,0.));q=floor(q*uQuant+d)/uQuant;c=q*q;}
  float r=.43,fw=max(fwidth(cell.x),fwidth(cell.y)),dd=length(f);
  float dm=1.0-smoothstep(r-fw*.6-.03,r+fw*.6,dd),hot=1.0-smoothstep(0.0,r,dd),far=smoothstep(.38,.95,fw);
  float m=mix(dm*(.74+.48*hot),.58,far);
  vec3 col=(c*uGain+vec3(.52,.5,.62)*.016)*m;
  o=vec4(pow(col,vec3(1./2.2)),1.0);
}`;

/* debug: show any buffer */
export const DEBUG_FS=`in vec2 vT;out vec4 o;uniform sampler2D uSrc;uniform float uMode;uniform float uGain;
void main(){vec4 c=texture(uSrc,vT);vec3 r=c.rgb;
  if(uMode==1.)r=vec3(c.xy*.5+.5,0.);else if(uMode==2.)r=vec3(c.z,c.w,0.);else if(uMode==3.)r=vec3(c.a);else if(uMode==4.)r=vec3(abs(c.xy)*50.,0.);else if(uMode==5.)r=vec3(pow(c.r,64.));
  r*=uGain;o=vec4(pow(r/(1.+r),vec3(1./2.2)),1.);}`;
