/* =====================================================================================
   CAR SHADER — clearcoat over metallic flake, the lamps, grille, panel gaps and trim painted
   by position on the body, glass with its pillars and frit, tyres, rims, glowing discs.
   One program; GLASS is defined for the see-through pass.
   ===================================================================================== */
import {FRAME,NOISE,PACK,LIGHTING,SHADE} from './common.js';

export const CAR_VS=`
layout(location=0) in vec3 aPos;layout(location=1) in vec3 aNrm;layout(location=2) in vec2 aUV;layout(location=3) in uvec4 aMat;layout(location=4) in vec4 aCol;
uniform mat4 uVP;uniform mat4 uVPnj;uniform mat4 uPrevVP;uniform mat4 uModel;uniform mat4 uPrevModel;
out vec3 vP;out vec3 vL;out vec3 vN;out vec3 vNL;out vec2 vUV;flat out uvec4 vMat;out vec4 vCur;out vec4 vPrev;
void main(){vec4 w=uModel*vec4(aPos,1.0);vP=w.xyz;vL=aPos;vN=mat3(uModel)*aNrm;vNL=aNrm;vUV=aUV;vMat=aMat;
  gl_Position=uVP*w;vCur=uVPnj*w;vPrev=uPrevVP*(uPrevModel*vec4(aPos,1.0));}`;

export const CAR_DEPTH_FS=`out vec4 o;void main(){o=vec4(0);}`;

export const CAR_FS=FRAME+NOISE+PACK+LIGHTING+SHADE+`
in vec3 vP;in vec3 vL;in vec3 vN;in vec3 vNL;in vec2 vUV;flat in uvec4 vMat;in vec4 vCur;in vec4 vPrev;
layout(location=0) out vec4 oCol;
#ifndef GLASS
layout(location=1) out vec4 oNrm;layout(location=2) out vec2 oVel;
#endif
uniform samplerCube uProbe;uniform float uProbeLod;
uniform vec3 uPaint;uniform float uMetal;uniform float uPaintR;uniform float uFlake;uniform vec3 uRoof;
uniform vec4 uLamps;       /* headlights, tail, brake, reverse */
uniform vec4 uArch;        /* axle x, axle y (body), arch radius, ride */
uniform float uHcg;uniform float uDisc;uniform vec3 uCaliper;uniform float uSpin;uniform float uDirt;
float aa(float d,float w){float f=fwidth(d)*.8+1e-5;return 1.0-smoothstep(w-f,w+f,d);}
vec3 envBRDF(vec3 F0,float NoV,float r){const vec4 c0=vec4(-1,-.0275,-.572,.022),c1=vec4(1,.0425,1.04,-.04);vec4 rr=r*c0+c1;
  float a=min(rr.x*rr.x,exp2(-9.28*NoV))*rr.x+rr.y;vec2 AB=vec2(-1.04,1.04)*a+rr.zw;return F0*AB.x+AB.y;}
vec3 env(vec3 R,float r){return textureLod(uProbe,R,r*uProbeLod).rgb;}
/* the colour of hot iron */
vec3 heat(float t){return vec3(1.,.28,.05)*smoothstep(.25,.6,t)*6.+vec3(1.,.55,.15)*smoothstep(.6,1.,t)*14.;}

/* the greenhouse: glass or not, from the profile position u (0 at the belt, 1 on the roof centre) and x */
void ghClass(float u,float x,out bool top,out float glass,out float frit){
  top=u>.42;glass=0.0;frit=0.0;
  float aEdge=.40-.62*min(u,.42),cEdge=-1.22+.55*min(u,.42);
  if(top){if(x>-.10&&x<.62){glass=1.0;frit=max(aa(u-.42,.035),aa(.62-x,.03));}
    else if(x<-.98&&x>-1.92){glass=1.0;frit=max(max(aa(u-.42,.05),aa(-.98-x,.05)),aa(x+1.92,.04));}}
  else if(u>.03&&x<aEdge&&x>cEdge){glass=1.0;frit=max(aa(aEdge-x,.012),aa(x-cEdge,.012));if(abs(x+.385)<.016)frit=1.0;}
}
struct M{vec3 alb;float metal;float rough;float clear;float clearR;vec3 em;float flake;vec2 g;float spec;};
/* panel gaps: distance to the seams, in body metres */
float seams(vec3 L,vec3 N,float yg){
  float d=1.0;float az=abs(L.z);
  if(abs(N.z)>.3){
    if(yg>.2&&yg<.9){d=min(d,abs(L.x-.87-.07*(yg-.55)));d=min(d,abs(L.x+.47-.11*(yg-.55)));}
    if(L.x<.87&&L.x>-.47)d=min(d,abs(yg-.255));
    if(yg>.3&&yg<.72)d=min(d,abs(L.x-1.99));
    if(yg>.33&&yg<.8)d=min(d,abs(L.x+2.02));
    if(L.z>0.0)d=min(d,abs(length(vec2(L.x+1.62,yg-.79))-.085));
  }
  if(N.y>.45){
    if(az<.83)d=min(d,abs(L.x-.69));
    if(L.x>.69&&L.x<2.06)d=min(d,abs(az-.80+.04*(L.x-.69)));
    if(az<.70&&L.x<-1.9)d=min(d,abs(L.x+1.985));
    if(L.x<-1.985)d=min(d,abs(az-.71));
  }
  return d;
}
void paint(inout M m,vec3 L,vec3 N,float yg,vec3 V){
  m.alb=uPaint;m.metal=uMetal;m.rough=uPaintR;m.clear=1.0;m.clearR=.035;m.flake=uFlake;
  float az=abs(L.z);
  /* rocker, lower valance, diffuser: satin black */
  if(yg<.215||(L.x>2.12&&yg<.3)||(L.x<-2.18&&yg<.33)){m.alb=vec3(.02);m.metal=0.;m.rough=.5;m.clear=.3;m.flake=0.;
    if(L.x<-2.18&&yg<.33){float fin=step(.5,fract(L.z*7.));m.alb*=1.0+fin*.5;}}
  /* front: grille and intakes */
  if(N.x>.55&&L.x>2.1){
    if(az<.52&&yg>.31&&yg<.52){vec2 h=vec2(L.z*42.,yg*42.);h.x+=step(.5,fract(h.y*.5))*.5;vec2 f=abs(fract(h)-.5);float web=step(.38,max(f.x,f.y));
      m.alb=vec3(.012)+web*.03;m.metal=web*.5;m.rough=.35;m.clear=0.;m.flake=0.;
      float sur=aa(abs(max(az-.52,max(.31-yg,yg-.52))),.012);if(az>.5||yg<.33||yg>.5){m.alb=vec3(.6);m.metal=1.;m.rough=.15;}}
    else if(az<.74&&yg>.2&&yg<.29){m.alb=vec3(.01);m.metal=0.;m.rough=.6;m.clear=0.;m.flake=0.;}
    /* plate */
  }
  /* headlamps: slim, swept back, LED projectors and a running-light strip */
  if(L.x>1.86&&N.x>-.1&&az>.38&&az<.86){
    float t=(az-.38)/.48;float yc=.60-.055*t-.04*smoothstep(.0,1.,(2.2-L.x)/.34);float hh=.032-.01*t;
    if(abs(yg-yc)<hh){
      vec2 q=vec2(az,yg-yc);m.clear=1.0;m.clearR=.01;m.flake=0.;m.metal=1.;m.alb=vec3(.12);m.rough=.18;
      float p1=length(vec2(az-.52,yg-yc+.004)),p2=length(vec2(az-.65,yg-yc+.004));
      float proj=max(aa(p1,.021),aa(p2,.019));
      if(proj>0.0){m.alb=mix(m.alb,vec3(.02),proj);m.rough=mix(m.rough,.05,proj);m.em+=vec3(.9,.95,1.)*proj*uLamps.x*90.;}
      float drl=aa(abs(yg-(yc+hh-.007)),.0035)*step(.4,az);
      m.em+=vec3(.95,.97,1.)*drl*(uLamps.x>0.0?40.:25.);
      m.alb*=1.0-drl*.6;
      m.g=vec2(0);
    }
  }
  /* rear: a full-width light bar, red lens clusters, reverse lamps, the plate */
  if(L.x<-2.1&&N.x<.2){
    float bar=aa(abs(yg-.818),.009)*step(az,.82);
    float clus=aa(max(abs(az-.67)-.15,abs(yg-.78)-.045),.0);
    float rev=aa(max(abs(az-.36)-.06,abs(yg-.775)-.022),.0);
    float plate=aa(max(az-.26,abs(yg-.49)-.065),.0);
    if(bar+clus>0.0){m.alb=mix(m.alb,vec3(.25,.01,.01),max(bar,clus));m.metal=mix(m.metal,0.,max(bar,clus));m.flake=0.;m.clearR=.01;
      float leds=clus*aa(abs(fract((yg-.735)/.03)-.5),.18);
      m.em+=vec3(1.,.03,.02)*(bar*(uLamps.y*6.+uLamps.z*30.)+leds*(uLamps.y*5.+uLamps.z*36.)+clus*.15);}
    if(rev>0.0){m.alb=mix(m.alb,vec3(.6),rev);m.metal=0.;m.em+=vec3(1.,.97,.9)*rev*uLamps.w*30.;}
    if(plate>0.0){vec2 pc=vec2((L.z+.22)/.44*7.,(yg-.44)/.1*5.);vec2 ci=floor(pc);float ch=step(.45,h12(ci+3.))*step(0.,pc.x)*step(pc.x,7.)*step(.6,pc.y)*step(pc.y,4.4)*step(.2,fract(pc.x));
      m.alb=mix(m.alb,mix(vec3(.75,.75,.7),vec3(.02),ch),plate);m.metal=0.;m.flake=0.;m.clear=.6;m.em+=vec3(.9,.9,.8)*plate*(1.0-ch)*uLamps.y*.6;}
  }
  /* panel gaps */
  float sd=seams(L,N,yg);float gp=aa(sd,.0032);
  if(gp>0.0){m.alb=mix(m.alb,vec3(.004),gp);m.clear*=1.0-gp;m.flake*=1.0-gp;m.rough=mix(m.rough,.7,gp);}
  /* water beads on the clear coat */
  if(uWet>0.0&&m.clear>.5){vec3 v3=voro(vec2(L.x+L.y*.3,L.z+L.y*.7)*55.);float bead=aa(v3.x,.26)*step(.45,v3.z)*uWet*saturate(1.0-length(fwidth(L))*120.);
    m.clearR=mix(m.clearR,.012,bead);m.alb*=1.0-bead*.15;}
}
void main(){
  vec3 N=normalize(vN);if(!gl_FrontFacing)N=-N;vec3 NL=normalize(vNL);
  vec3 V=normalize(uCam-vP);uint id=vMat.x;float yg=vL.y+uHcg;
  M m;m.alb=vec3(.5);m.metal=0.;m.rough=.5;m.clear=0.;m.clearR=.05;m.em=vec3(0);m.flake=0.;m.g=vec2(0);m.spec=1.0;
  float alpha=1.0;
  /* the wheel arches are cut out of the body */
  if(id==0u){vec2 aw=vec2(abs(vL.x)-uArch.x,vL.y-uArch.y);if(length(aw)<uArch.z&&abs(vL.z)>.6)discard;
    /* the body shell is closed at the beltline; under the greenhouse it opens into the cabin */
    if(vL.x<.64&&vL.x>-1.95&&abs(vL.z)<.8&&NL.y>.3&&yg>.78)discard;}
  if(id==0u)paint(m,vL,NL,yg,V);
  else if(id==1u){
    float u=vUV.x,x=vL.x;bool top;float glass,frit;ghClass(u,x,top,glass,frit);
    float ag=glass*(1.0-frit);
#ifdef GLASS
    if(ag<.02)discard;
    m.alb=vec3(0);m.metal=0.;m.rough=.02;
#else
    if(ag>.98)discard;
    if(frit>0.0&&glass>0.0){m.alb=vec3(.008);m.rough=.25;m.clear=.0;}
    else if(top&&x<=-.10&&x>=-.98){m.alb=uRoof;m.metal=uMetal;m.rough=uPaintR;m.clear=1.0;m.clearR=.035;m.flake=uFlake;}
    else if(u<.03){m.alb=vec3(.015);m.rough=.2;m.clear=1.0;m.clearR=.02;}
    else if(x>=.40-.62*min(u,.42)&&!top){m.alb=vec3(.012);m.rough=.15;m.clear=1.0;m.clearR=.02;}
    else{m.alb=uPaint;m.metal=uMetal;m.rough=uPaintR;m.clear=1.0;m.clearR=.035;m.flake=uFlake;}
#endif
  }
  else if(id==2u){m.alb=vec3(.018);m.rough=float(vMat.y)/255.;m.clear=.3;}
  else if(id==3u){m.alb=vec3(.9);m.metal=1.;m.rough=.08;}
  else if(id==4u){/* tyre: tread blocks on the crown, lettering on the outer wall */
    float v=vUV.y,a=vUV.x;m.alb=vec3(.022);m.rough=.82;
    float tread=step(.32,v)*step(v,.68);
    if(tread>0.0){float gr=aa(abs(fract(v*7.)-.5),.06);float sl=aa(abs(fract(a*90.+v*3.)-.5),.06)*step(abs(v-.5),.12);m.alb*=1.0-.6*max(gr,sl);m.rough=mix(.75,.95,gr);}
    if(v>.8&&v<.92){float ch=step(.55,h12(floor(vec2(a*260.,(v-.8)*40.))))*step(.25,fract(a*26.))*step(fract(a*2.),.4);m.alb+=vec3(.08)*ch;}
    m.rough=mix(m.rough,.35,uWet*.8);m.alb*=1.0-.3*uWet;
  }
  else if(id==5u){uint k=vMat.y;
    if(k==0u){m.alb=vec3(.07,.072,.08);m.metal=1.;m.rough=.32;m.clear=.6;m.clearR=.05;}
    else if(k==1u){m.alb=vec3(.03);m.metal=.6;m.rough=.5;}
    else if(k==2u){m.alb=vec3(.85);m.metal=1.;m.rough=.18;}
    else{m.alb=vec3(.05);m.rough=.3;float r=length(vL.xy);m.em+=uPaint*aa(abs(r-.017),.002)*.5;}
  }
  else if(id==6u){float r=vUV.y,a=vUV.x;m.alb=vec3(.28,.27,.26);m.metal=1.;m.rough=.38;
    float holes=aa(length(vec2(fract(a*14.)-.5,(r-.14)*28.)),.17)*step(.11,r)*step(r,.17);m.alb*=1.0-holes*.95;
    float grooves=aa(abs(fract(a*6.+r*9.)-.5),.03)*.4;m.alb*=1.0-grooves;
    m.em+=heat(uDisc)*(1.0-holes);}
  else if(id==7u){m.alb=uCaliper;m.rough=.3;m.clear=.8;m.clearR=.06;}
  else if(id==8u){m.alb=vec3(float(vMat.y)/255.*.12);m.rough=.85;}
  else if(id==14u){bool tp;float gl,fr;ghClass(vUV.x,vL.x,tp,gl,fr);if(gl*(1.0-fr)>.5)discard;m.alb=vec3(.035);m.rough=.9;}
  else if(id==9u){m.alb=vec3(.01);m.rough=.2;
    if(vMat.y==0u){/* two dials: tachometer and speed, their needles driven by uSpin and uDirt */
      vec2 q=vec2((vL.z+.38)/.075,(yg-.905)/.07);vec2 d1=q-vec2(-1.05,0.),d2=q-vec2(1.05,0.);
      float r1=length(d1),r2=length(d2);float ring=aa(abs(r1-.85),.05)+aa(abs(r2-.85),.05);
      float ticks=(aa(abs(fract(atan(d1.y,d1.x)*1.59)-.5),.08)*step(.62,r1)*step(r1,.8))+(aa(abs(fract(atan(d2.y,d2.x)*1.59)-.5),.08)*step(.62,r2)*step(r2,.8));
      m.em+=vec3(.25,.85,1.)*(ring*.9+ticks*.7)*.9;m.em+=vec3(1.,.25,.1)*aa(abs(r1-.85),.05)*step(1.2,atan(d1.y,-d1.x)+1.6)*.8;}
    else m.em+=vec3(.15,.3,.7)*.6;}
  else if(id==10u){float t=saturate(-vL.x-2.18)*6.;m.alb=mix(vec3(.85,.85,.88),vec3(.5,.35,.6),saturate(t*.7));m.metal=1.;m.rough=.12;}
  else if(id==11u){m.alb=vec3(.012);m.rough=.8;}
  else if(id==12u){m.alb=vec3(.01);m.rough=.9;}
  else if(id==13u){m.alb=vec3(.9);m.metal=1.;m.rough=.01;}
  /* ---------- light it ---------- */
  Surf s;s.P=vP;s.V=V;s.N=N;s.Nc=N;s.ao=1.0;s.spec=1.0;s.trans=0.0;
  vec3 flakeN=N;
  if(m.flake>0.0){float fp=length(fwidth(vL))*900.;vec3 c=floor(vL*700.);vec3 r=vec3(h13(c),h13(c+17.1),h13(c+31.7))-.5;flakeN=normalize(N+r*.45*m.flake*saturate(1.0-fp));}
  s.N=flakeN;
  s.diff=m.alb*(1.0-m.metal);s.F0=mix(vec3(.04),m.alb,m.metal);s.rough=m.rough;s.clear=m.clear;s.clearR=m.clearR;
  float NoV=max(dot(N,V),1e-3);
  vec3 col=m.em;
#ifdef GLASS
  /* glass: reflections on top, the cabin seen through a tint */
  float F=F_Sch(vec3(.04),NoV).x;
  vec3 R=reflect(-V,N);vec3 refl=env(R,.02);
  Surf sg=s;sg.diff=vec3(0);sg.F0=vec3(.04);sg.rough=.04;sg.clear=0.0;
  col+=directAll(sg,gl_FragCoord.xy,length(uCam-vP))+refl*F;
  float tr=vL.x>-.10&&vUV.x>.42?.78:.42;
  alpha=1.0-(1.0-F)*tr;
  /* rain on the glass */
  oCol=vec4(col,alpha);
#else
  /* inside the cabin the roof and doors block most light; no light here casts shadows, so shade it down */
  bool inside=id==8u||id==9u||id==14u;float cab=inside?.22:1.0;
  col+=directAll(s,gl_FragCoord.xy,length(uCam-vP))*cab;
  /* ambient from the probe: what surrounds the car, blurred */
  vec3 amb=textureLod(uProbe,N,uProbeLod).rgb;
  float occ=(1.0-.55*saturate(-N.y)-.25*saturate(1.0-(yg-.15)*3.))*(inside?.15:1.0);
  col+=s.diff*amb*occ;
  /* reflections: the base layer, then the clear coat over it */
  vec3 Rb=reflect(-V,flakeN);vec3 eb=envBRDF(s.F0,NoV,s.rough);
  vec3 base=env(Rb,s.rough)*eb*occ;
  if(s.clear>0.0){float Fc=F_Sch(vec3(.04),NoV).x*s.clear;vec3 Rc=reflect(-V,N);col=col*(1.0-Fc)+base*(1.0-Fc)+env(Rc,s.clearR)*Fc;}
  else col+=base;
  oCol=vec4(col,1.0);
  oNrm=vec4(octEnc(N),s.rough,0.0);
  oVel=(vCur.xy/vCur.w-vPrev.xy/vPrev.w)*.5;
#endif
}`;
