/* =====================================================================================
   WORLD SHADER — every static surface of the city in one program, chosen per vertex by
   material id. Everything is procedural: no textures, so the city costs nothing to download.
   ids: 0 track road  1 curb  2 gutter  3 sidewalk  4 concrete  5 facade  6 roof
        7 emissive (neon, lamps)  8 metal  9 shop glass  10 lit sign box  11 side street
        12 catch fence  13 matte dark  14 rail  15 traffic signal
   ===================================================================================== */
import {FRAME,NOISE,PACK,SKY,LIGHTING,SHADE} from './common.js';

export const WORLD_VS=`
layout(location=0) in vec3 aPos;layout(location=1) in vec3 aNrm;layout(location=2) in vec2 aUV;layout(location=3) in uvec4 aMat;layout(location=4) in vec4 aCol;
uniform mat4 uVP;uniform mat4 uVPnj;uniform mat4 uPrevVP;
out vec3 vP;out vec3 vN;out vec2 vUV;flat out uvec4 vMat;out vec4 vCol;out vec4 vCur;out vec4 vPrev;
void main(){vP=aPos;vN=aNrm;vUV=aUV;vMat=aMat;vCol=aCol;vec4 w=vec4(aPos,1.0);
  gl_Position=uVP*w;vCur=uVPnj*w;vPrev=uPrevVP*w;}`;

/* depth-only, for shadow maps */
export const DEPTH_VS=`
layout(location=0) in vec3 aPos;layout(location=3) in uvec4 aMat;uniform mat4 uVP;uniform mat4 uModel;flat out uint vId;
void main(){vId=aMat.x;gl_Position=uVP*(uModel*vec4(aPos,1.0));}`;
export const DEPTH_FS=`flat in uint vId;out vec4 o;void main(){if(vId==7u||vId==12u)discard;o=vec4(0);}`;

export const WORLD_FS=FRAME+NOISE+PACK+SKY+LIGHTING+SHADE+`
in vec3 vP;in vec3 vN;in vec2 vUV;flat in uvec4 vMat;in vec4 vCol;in vec4 vCur;in vec4 vPrev;
layout(location=0) out vec4 oCol;
#ifndef PROBE
layout(location=1) out vec4 oNrm;layout(location=2) out vec2 oVel;
#endif
uniform samplerCube uProbe;uniform float uProbeLod;
uniform vec4 uRoad;       /* half width, lanes, track length, puddles */
uniform float uXw[8];     /* crosswalks across the track, at these distances */
uniform float uLit;       /* fraction of windows lit */
uniform float uSignal;    /* flashing amber phase */

/* the cotangent frame turns a height gradient in uv metres into a bent normal */
vec3 bump(vec3 N,vec3 P,vec2 uv,vec2 g){
  vec3 dp1=dFdx(P),dp2=dFdy(P);vec2 du1=dFdx(uv),du2=dFdy(uv);
  vec3 d2p=cross(dp2,N),d1p=cross(N,dp1);
  vec3 T=d2p*du1.x+d1p*du2.x,B=d2p*du1.y+d1p*du2.y;
  float im=inversesqrt(max(max(dot(T,T),dot(B,B)),1e-12));
  return normalize(N-(T*g.x+B*g.y)*im);
}
vec3 envBRDF(vec3 F0,float NoV,float r){const vec4 c0=vec4(-1,-.0275,-.572,.022),c1=vec4(1,.0425,1.04,-.04);vec4 rr=r*c0+c1;
  float a=min(rr.x*rr.x,exp2(-9.28*NoV))*rr.x+rr.y;vec2 AB=vec2(-1.04,1.04)*a+rr.zw;return F0*AB.x+AB.y;}
/* raindrops landing in standing water: expanding rings */
vec2 ripples(vec2 p,float t){
  vec2 g=vec2(0);
  for(int k=0;k<2;k++){vec2 q=p*(k==0?2.6:3.9)+float(k)*17.3;vec2 id=floor(q);
    for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){vec2 c=id+vec2(i,j);vec2 o=h22(c);float ph=fract(t*(.9+.5*o.x)+o.y*7.);
      vec2 dv=q-c-o;float dl=length(dv);float r=ph*.55;float x=dl-r;
      float w=sin(x*38.)*(1.0-ph)*(1.0-ph)*smoothstep(.09,.0,abs(x));g+=w*dv/max(dl,1e-3);}}
  return g*.09;
}
float aaStep(float e,float x){float w=fwidth(x)*.75+1e-4;return smoothstep(e-w,e+w,x);}

/* ---------------- materials ---------------- */
void water(inout Surf s,inout vec2 g,inout float ssr,vec2 wp,float porous,float shelter,float pudBias){
  float wet=uWet*shelter;if(wet<=0.0)return;
  float n=vn(wp*1.7);
  s.diff*=mix(1.0,.5+.25*(1.0-porous),wet*porous);
  s.rough=mix(s.rough,.06+.14*n,wet*.9);
  /* standing water in the low spots */
  float pm=fbm(wp*.09+11.3)*.8+vn(wp*.55)*.2+pudBias;
  float pud=smoothstep(.66,.70,pm+uRoad.w*.18-.12)*wet*uRoad.w;
  if(pud>0.0){s.diff*=1.0-.6*pud;s.rough=mix(s.rough,.012,pud);g*=1.0-pud;}
  /* rings finer than a pixel would only sparkle: fade them with the pixel footprint */
  float fp=length(fwidth(wp));float near=saturate(1.0-fp*22.);
  if(uRain>0.0&&near>0.0)g+=ripples(wp,uTime)*(pud+.25*wet)*uRain*near;
  ssr=max(ssr,wet*.85+pud);
}
void matRoad(inout Surf s,inout vec3 em,inout float ssr,inout vec2 g,vec2 uv,uvec4 m){
  float sx=uv.x,d=uv.y,ad=abs(d),hw=uRoad.x;
  vec3 gr=vnd(uv*13.);float g2=fbm(uv*vec2(.06,.2));
  vec3 alb=vec3(.075,.075,.08)*(.75+.5*gr.x)*(.82+.36*g2);float rough=.86-.14*gr.x;
  float fpr=length(fwidth(uv));g+=gr.yz*13.*.0012*saturate(1.0-fpr*9.);
  /* polished wheel tracks in each lane */
  float lc=mod(ad,3.25)-1.625,trk=exp(-pow((abs(lc)-.85)/.38,2.));
  alb*=1.0-.22*trk;rough-=.14*trk;
  /* resurfaced patches */
  float seg=floor(sx/31.),pa=h11(seg*3.1);
  if(pa>.55){float d0=(h11(seg*5.7)-.5)*2.*hw,w=1.5+h11(seg*9.1)*3.5,s0=h11(seg*2.3)*20.,l=4.+h11(seg*4.4)*9.;
    float bx=max(abs(d-d0)-w*.5,abs(mod(sx,31.)-s0-l*.5)-l*.5);
    if(bx<0.0){alb*=.78;rough=.8;}
    float edge=1.0-smoothstep(.02,.06,abs(bx));alb=mix(alb,vec3(.02),edge*.85);rough=mix(rough,.35,edge);}
  /* tar-sealed seams and cracks */
  float tar=1.0-smoothstep(.015,.05,abs(ad-3.25+.05*sin(sx*.27)));
  float ts=floor(sx/23.),tp=h11(ts*7.1)*23.;
  float tc=abs(mod(sx,23.)-tp+.3*sin(d*1.1+ts)+.08*sin(d*5.3));
  tar=max(tar,(1.0-smoothstep(.012,.04,tc))*step(.3,h11(ts*3.3)));
  vec3 vc=voro(uv*1.3);float alli=smoothstep(.6,.7,fbm(uv*.04+3.));
  tar=max(tar,(1.0-smoothstep(.008,.035,vc.y))*alli);
  alb=mix(alb,vec3(.018,.018,.02),tar*.9);rough=mix(rough,.32,tar);g+=vec2(0,0)*tar;
  /* oil drips down the middle of each lane */
  float oil=smoothstep(.55,.85,vn(uv*vec2(.8,3.)))*exp(-pow(lc/.35,2.))*.6;alb*=1.0-oil*.5;rough-=oil*.25;
  /* manhole covers */
  float ms=floor(sx/41.),mp=h11(ms*1.9)*41.,md=(h11(ms*8.3)>.5?1.0:-1.0)*(1.625+(h11(ms*6.1)-.5)*1.2);
  vec2 mv=vec2(mod(sx,41.)-mp,d-md);float mr=length(mv);
  if(mr<.36){float rings=step(.5,fract(mr*18.))*step(mr,.31)+step(.5,fract((mv.x+mv.y)*9.))*step(mr,.2);
    alb=vec3(.05,.045,.04)*(1.0+.4*rings);rough=.45+.2*rings;s.F0=vec3(.05);g+=vec2(rings*.002);}
  else if(mr<.42){alb=vec3(.03);rough=.6;}
  /* paint: centre double yellow, dashed lane lines, edge lines, crosswalks, start line */
  vec3 pc=vec3(0);float pa1=0.0;
  float cy=min(abs(d-.13),abs(d+.13));float y1=1.0-aaStep(.065,cy);
  float dash=step(fract(sx/9.),.34),wl=(1.0-aaStep(.07,abs(ad-3.25)))*dash;
  float el=1.0-aaStep(.08,abs(ad-(hw-.32)));
  float L=uRoad.z;float xw=0.0;
  for(int i=0;i<8;i++){float x=uXw[i];if(x<0.0)continue;float ds=mod(sx-x+L*.5,L)-L*.5;if(abs(ds)<2.){xw=max(xw,step(.5,fract(d/1.1))*(1.0-aaStep(1.8,abs(ds)))*step(ad,hw-.6));}}
  float ds0=mod(sx+L*.5,L)-L*.5;
  float chk=(ds0>-1.6&&ds0<0.0)?step(.5,fract(floor(d/.4)*.5+floor(ds0/.4)*.5)):0.0;
  float start=(ds0>=0.0&&ds0<.5)?1.0:0.0;
  float grid=0.0;if(ds0<-4.&&ds0>-60.){float gs=mod(-ds0,8.),side=d>0.0?1.0:-1.0;
    grid=(1.0-aaStep(.06,abs(gs-1.)))*step(abs(ad-3.2),1.3)+(1.0-aaStep(.06,abs(ad-1.9)))*step(gs,2.2)*step(1.0,gs)*step(0.0,d*side);}
  float white=max(max(wl,el),max(xw,max(start,max(chk,grid))));
  float wear=smoothstep(.25,.75,fbm(uv*vec2(1.1,3.))+.35*trk*(1.0-start));
  float py=y1*(1.0-wear*.8),pw=white*(1.0-wear*.85);
  if(py+pw>0.0){vec3 c=py>pw?vec3(.62,.45,.06):vec3(.72);float a=max(py,pw);
    alb=mix(alb,c,a);rough=mix(rough,.55,a);s.ao=1.0;g+=gr.yz*13.*.0004*a;s.spec=mix(s.spec,1.0,a);em+=vec3(0);
    s.clear=-a;  /* marks the paint as retroreflective for the headlights */
  }
  s.diff=alb;s.rough=rough;
  water(s,g,ssr,s.P.xz,1.0,vCol.r,smoothstep(hw-1.,hw+.5,ad)*.35+(1.0-trk)*.03);
}
/* city streets: markings by road class. uv = (metres along from the start, metres left of centre).
   cls 0 ring, 1 main avenue, 2 avenue, 3 street, 4 junction box. p2 = length*2; p3 bit 0: no crossings at the ends */
void matCityRoad(inout Surf s,inout float ssr,inout vec2 g,vec2 uv,uvec4 m){
  int cls=int(m.y);float along=uv.x,d=uv.y,ad=abs(d),L=float(m.z)*.5;bool ends=(m.w&1u)==0u&&cls<4;
  vec2 wp=s.P.xz;vec3 gr=vnd(wp*13.);float g2=fbm(wp*.06);
  vec3 alb=vec3(.072,.072,.077)*(.75+.5*gr.x)*(.82+.36*g2);float rough=.86-.14*gr.x;
  float fpr=length(fwidth(wp));g+=gr.yz*13.*.0012*saturate(1.0-fpr*9.);
  /* patches and sealed cracks */
  vec3 vc=voro(wp*.9);float crk=(1.0-smoothstep(.008,.03,vc.y))*smoothstep(.62,.72,fbm(wp*.03+5.));alb=mix(alb,vec3(.02),crk*.9);rough=mix(rough,.35,crk);
  float pt=smoothstep(.7,.72,vn(floor(wp/vec2(5.,3.))*.37+2.));alb*=1.0-.2*pt;
  float paint=0.0,yel=0.0;
  if(cls<4){
    float med=cls==0?1.6:cls==1?1.2:0.0,lw=cls==0?3.5:cls==3?3.6:3.4,lanes=cls==0?3.:cls==3?1.:2.,hw=cls==0?16.:cls==1?8.:cls==2?7.:5.5;
    if(med==0.0)yel=max(yel,1.0-aaStep(.065,min(abs(d-.13),abs(d+.13))));
    else yel=max(yel,1.0-aaStep(.07,abs(ad-med-.15)));
    for(float k=1.;k<3.;k++){if(k>=lanes)break;float dl=med+lw*k;paint=max(paint,(1.0-aaStep(.07,abs(ad-dl)))*step(fract(along/12.),.27));}
    float edge=med+lw*lanes+.12;paint=max(paint,1.0-aaStep(.075,abs(ad-edge)));
    /* parking bays beyond the edge line */
    if(ad>edge+.2&&ad<hw-.3&&cls!=1&&cls!=2)paint=max(paint,(1.0-aaStep(.06,abs(fract(along/6.5)-.5)*6.5))*step(ad,hw-.4));
    if(ends){float e=min(along,L-along);
      /* zebra crossings at both ends, stop lines for the lanes coming in */
      if(e<3.6)paint=max(paint,step(.5,fract(d/1.1))*step(.35,e)*step(ad,hw-.2)*step(med+.2,ad));
      float inb=along<L*.5?step(med,d):step(med,-d);
      paint=max(paint,(1.0-aaStep(.2,abs(e-4.3)))*inb*step(ad,hw-.2));}
  }
  float wear=smoothstep(.3,.75,fbm(wp*vec2(.9,1.7)));
  float py=yel*(1.0-wear*.7),pw=paint*(1.0-wear*.8);
  if(py+pw>0.0){vec3 c=py>pw?vec3(.62,.45,.06):vec3(.72);float a=max(py,pw);alb=mix(alb,c,a);rough=mix(rough,.55,a);s.clear=-a;}
  s.diff=alb;s.rough=rough;
  water(s,g,ssr,wp,1.0,vCol.r,smoothstep(.6,1.,ad/max(1.,float(cls==0?16.:cls==1?8.:cls==2?7.:5.5)))*.3);
}
/* the expressway deck (kind 0) and ramps (kind 1): smoother asphalt, expansion joints, lane paint */
void matDeck(inout Surf s,inout float ssr,inout vec2 g,vec2 uv,uvec4 m){
  float sx=uv.x,d=uv.y,ad=abs(d);int kind=int(m.y);vec2 wp=s.P.xz;
  vec3 gr=vnd(uv*12.);vec3 alb=vec3(.085,.085,.09)*(.8+.4*gr.x)*(.85+.3*fbm(uv*vec2(.08,.3)));float rough=.82-.12*gr.x;
  g+=gr.yz*12.*.001*saturate(1.0-length(fwidth(uv))*9.);
  float joint=1.0-aaStep(.04,abs(fract(sx/30.)-.5)*30.);alb=mix(alb,vec3(.03),joint*.8);
  float lc=mod(ad,3.6)-1.8,trk=exp(-pow((abs(lc)-.85)/.38,2.));alb*=1.0-.18*trk;rough-=.12*trk;
  float paint=0.0,yel=0.0;
  if(kind==0){yel=1.0-aaStep(.07,abs(ad-.75));paint=max((1.0-aaStep(.07,abs(ad-4.2)))*step(fract(sx/12.),.3),1.0-aaStep(.08,abs(ad-7.85)));}
  else paint=1.0-aaStep(.08,abs(ad-2.95));
  float wear=smoothstep(.35,.8,fbm(uv*vec2(.8,2.)));paint*=1.0-wear*.7;yel*=1.0-wear*.6;
  if(paint+yel>0.0){vec3 c=yel>paint?vec3(.62,.45,.06):vec3(.72);float a=max(paint,yel);alb=mix(alb,c,a);rough=mix(rough,.5,a);s.clear=-a;}
  s.diff=alb;s.rough=rough;water(s,g,ssr,wp,1.0,1.0,smoothstep(5.5,8.5,ad)*.3);
}
void matSidewalk(inout Surf s,inout float ssr,inout vec2 g,vec2 uv){
  vec2 p=uv/1.2,f=fract(p),id=floor(p);float j=min(min(f.x,1.-f.x),min(f.y,1.-f.y));
  float jo=1.0-smoothstep(.01,.03,j);float sv=h12(id);
  vec3 alb=vec3(.36,.35,.34)*(.8+.3*sv)*(.85+.3*vn(uv*4.));
  alb*=1.0-jo*.55;float spots=smoothstep(.78,.82,vn(uv*6.3+sv*9.));alb*=1.0-spots*.35;
  s.diff=alb;s.rough=.82-.1*sv;g+=vec2(f.x<.5?-1.:1.,f.y<.5?-1.:1.)*jo*.02*(j<.03?1.:0.);
  water(s,g,ssr,uv,.8,vCol.r,-.15);
}
void matConcrete(inout Surf s,inout float ssr,inout vec2 g,vec2 uv,uvec4 m){
  int v=int(m.y);float n=fbm(uv*vec2(.7,1.4)),n2=vn(uv*9.);
  vec3 alb=vec3(.42,.41,.39)*(.75+.35*n)*(.9+.2*n2);float rough=.88;
  if(v==1){/* jersey barrier: road grime at the foot, joints every 4 m, reflectors */
    alb*=mix(.45,1.0,smoothstep(.0,.55,uv.y));float jn=abs(fract(uv.x/4.)-.5)*4.;
    alb*=1.0-(1.0-smoothstep(.01,.03,jn))*.6;
    float rf=step(abs(fract(uv.x/8.)-.5)*8.,.12)*step(abs(uv.y-.62),.05);
    if(rf>0.0){alb=vec3(.9,.7,.1);rough=.3;s.clear=-1.0;}
    /* rain runs down the face */
    alb*=1.0-.25*uWet*smoothstep(.4,.9,vn(vec2(uv.x*3.,uv.y*.3)));
  }else if(v==2){/* tunnel wall: glazed tiles above a grimy dado */
    vec2 t=uv/vec2(.3,.15);vec2 tf=fract(t);float tj=min(min(tf.x,1.-tf.x)*2.,min(tf.y,1.-tf.y));
    float dado=step(uv.y,1.2);
    vec3 tc=mix(vec3(.78,.78,.72),vec3(.32,.36,.3),dado)*(.85+.15*h12(floor(t)));
    tc*=mix(1.0,.55,smoothstep(1.5,.0,uv.y)*(.6+.4*n));
    alb=mix(tc,vec3(.15),1.0-smoothstep(.02,.06,tj));rough=mix(.18,.7,dado)+.3*(1.0-smoothstep(.02,.06,tj));
  }else if(v==3){/* painted concrete pillar band */
    alb=mix(alb,vec3(.5,.42,.12),step(fract(uv.y/1.2),.5)*step(uv.y,1.2));
  }
  s.diff=alb;s.rough=rough;g+=vec2(n2-.5)*.004;
  if(s.N.y>.5)water(s,g,ssr,uv,.6,vCol.r,-.2);else{s.diff*=1.0-.35*uWet;s.rough=mix(s.rough,.5,uWet*.5);}
}
/* building facades: floors, bays, windows lit at night, storefronts at street level */
void matFacade(inout Surf s,inout vec3 em,inout float ssr,inout vec2 g,vec2 uv,uvec4 m,vec4 col){
  int style=int(m.y);float sd=float(m.z);int fl=int(m.w)&15;float fh=3.0+float(int(m.w)>>4)*.1;
  float bw=1.0+col.a*3.0;vec3 tint=col.rgb;
  float u=uv.x,v=uv.y;float gf=(fl&1)!=0?4.8:0.0;
  vec3 alb=tint;float rough=.85;float glass=0.0;vec3 wcol=vec3(0);
  float nB=vn(uv*vec2(.5,.25)+sd);
  if(v<gf){
    /* storefront: units of four bays; glass, a door, a sign band, closed ones shuttered */
    float uw=bw*4.,ui=floor(u/uw),uf=fract(u/uw)*uw;float hs=h12(vec2(ui,sd*3.1));
    float open=step(.25,hs);
    vec3 shop=vec3(1.0,.72,.42);if(hs>.6)shop=vec3(.85,.95,1.);if(hs>.85)shop=vec3(1.,.55,.85);
    float side=min(uf,uw-uf);float frame=1.0-step(.25,side);
    if(v<.35){alb=vec3(.3,.29,.28);rough=.7;}
    else if(v<3.3){
      if(frame>0.0){alb=vec3(.04);rough=.4;}
      else{
        if(open>0.0){glass=1.0;float glow=.5+.5*smoothstep(.4,3.2,v);float shelves=step(.5,fract(v*1.6))*step(v,2.2)*.35;
          wcol=shop*(1.6*glow-shelves)*uNight*(.7+.6*hs);
          if(abs(fract(uf/1.9)-.5)>.48){glass=0.0;alb=vec3(.05);rough=.35;wcol=vec3(0);}}
        else{float rib=abs(fract(v*6.)-.5);alb=vec3(.38,.38,.4)*(.7+.3*rib)*(.7+.3*vn(uv*vec2(2.,.5)+hs*9.));rough=.5;g+=vec2(0,(rib-.25))*.0;
          /* tags on the shutters */
          float tag=smoothstep(.55,.6,fbm(uv*vec2(.9,1.4)+hs*13.))*step(.6,v)*step(v,2.6);alb=mix(alb,.5+.5*cos(6.28*(hs+vec3(0,.33,.67))+fbm(uv*2.)*3.),tag*.8);}
      }
    }
    else if(v<4.4){/* the sign band */
      float sb=step(.3,side)*step(3.45,v)*step(v,4.3);
      vec3 sc=.5+.5*cos(6.28*(hs*1.7+vec3(0,.33,.67)));
      if(sb>0.0&&open>0.0){vec2 cc=vec2((uf-.3)/.32,(v-3.55)/.1);vec2 ci=floor(cc);float on=step(.45,h12(ci+hs*31.))*step(0.,cc.y)*step(cc.y,7.)*step(.15,fract(cc.x/6.))*step(ci.x,(uw-.6)/.32-1.);
        alb=sc*.35;em+=mix(sc*.25,vec3(1.,.95,.85),on)*(1.5+on*2.5)*uNight*(.4+.6*h12(vec2(hs,3.)));rough=.4;}
      else{alb=vec3(.12,.11,.1);rough=.6;}
    }else{alb=tint*.8;}
    if(v>=4.4&&v<4.8){alb=vec3(.2);rough=.5;}
  }else{
    float vv=v-gf;float fi=floor(vv/fh),fv=fract(vv/fh)*fh;float bi=floor(u/bw),bu=fract(u/bw)*bw;
    float r1=h12(vec2(bi,fi)+sd*13.71),r2=h12(vec2(fi,bi*1.7)+sd*5.3);
    if(style==0){/* brick with punched windows */
      vec2 bk=vec2(u/.25+step(.5,fract(v/.15))*.5,v/.075);vec2 bf=fract(bk);float mort=1.0-smoothstep(.06,.12,min(min(bf.x,1.-bf.x)*3.3,min(bf.y,1.-bf.y)));
      float fade=saturate(1.0-length(fwidth(bk))*.6);
      alb=tint*(.75+.4*h12(floor(bk)))*mix(1.0,.6+.4*nB,1.0)*(1.0-mort*.45*fade);g+=vec2(0,mort*.0)*fade;rough=.9;
      float wx=abs(bu-bw*.5),wy=fv-fh*.5+.15;float ww=bw*.27,wh=fh*.3;
      if(wx<ww+.08&&abs(wy)<wh+.08){alb=vec3(.42,.4,.36);rough=.7;}
      if(wy<-wh-.04&&wy>-wh-.16&&wx<ww+.15){alb=vec3(.5,.48,.44);rough=.6;}
      if(wx<ww&&abs(wy)<wh){glass=1.0;}
    }else if(style==1){/* concrete with ribbon windows */
      alb=tint*(.8+.25*nB);rough=.85;float jn=min(abs(fv-.02),abs(bu-.01));alb*=1.0-(1.0-smoothstep(.0,.03,jn))*.4;
      if(fv>fh*.38&&fv<fh*.9&&abs(bu-bw*.5)<bw*.46)glass=1.0;
    }else if(style==2){/* glass curtain wall */
      float mx=min(bu,bw-bu),my=min(fv,fh-fv);
      if(mx<.05||my<.05){alb=vec3(.08,.085,.09);rough=.35;s.F0=vec3(.5);s.diff=vec3(0);}
      else if(fv<fh*.22){alb=tint*.3;rough=.2;glass=.6;}
      else glass=1.0;
    }else if(style==3){/* painted stucco, tall windows with frames */
      alb=tint*(.82+.25*nB)*(.92+.08*vn(uv*7.));rough=.88;
      float wx=abs(bu-bw*.5),wy=fv-fh*.52;float ww=bw*.24,wh=fh*.33;
      if(wx<ww+.07&&abs(wy)<wh+.07){alb=vec3(.85,.84,.8);rough=.5;}
      if(wx<ww&&abs(wy)<wh)glass=1.0;
      if(wx>ww+.07&&wx<ww+.42&&abs(wy)<wh&&r2>.55){alb=tint*.55;rough=.6;}
    }else{/* corrugated metal */
      float rib=abs(fract(u*4.)-.5);alb=tint*(.7+.3*rib)*(.75+.3*nB);rough=.45;s.F0=vec3(.35);g+=vec2((rib-.25)*.03,0);
      if(fv>fh*.55&&fv<fh*.85&&r1<.25)glass=1.0;
    }
    /* night: some windows lit; offices light whole floors */
    if(glass>0.0){
      float fr=uLit*(style==2?.55:1.0);
      bool on=(style==2)?(h11(fi+sd*7.)<fr*.7?r1<.88:r1<fr*.25):(r1<fr);
      if(on){vec3 wc=mix(vec3(1.,.62,.3),vec3(.8,.9,1.),step(.62,r2))*mix(.55,1.,h11(r1*91.));if(r2>.94)wc=vec3(.45,.6,1.)*(.6+.4*sin(uTime*7.+r1*40.)*sin(uTime*3.1));
        float blinds=r2>.3&&r2<.5?.55+.45*step(.4,fract(fv*9.)):1.0;
        float grad=mix(.55,1.15,saturate(fv/fh*1.3));
        wcol=wc*blinds*grad*(.35+.65*r1/max(fr,.05))*.7;}
    }
    /* rain stains under the sills */
    alb*=1.0-uWet*.2*smoothstep(.5,.8,vn(vec2(u*2.1,v*.15+sd)));
  }
  s.diff=alb;s.rough=rough;
  if(glass>0.0){s.diff=mix(s.diff,vec3(.012,.014,.016),glass);s.rough=mix(s.rough,.04,glass);s.F0=mix(s.F0,vec3(.045),glass);
    em+=wcol*glass;ssr=max(ssr,glass);}
  else if(uWet>0.0){s.diff*=1.0-.25*uWet;s.rough=mix(s.rough,.45,uWet*.5);}
}

void main(){
  vec3 N=normalize(vN);if(!gl_FrontFacing)N=-N;
  Surf s;s.P=vP;s.V=normalize(uCam-vP);s.N=N;s.diff=vec3(.5);s.F0=vec3(.04);s.rough=.8;s.ao=1.0;s.clear=0.0;s.clearR=.05;s.Nc=N;s.spec=1.0;s.trans=0.0;
  vec3 em=vec3(0);float ssr=0.0;vec2 g=vec2(0);uint id=vMat.x;vec2 uv=vUV;
  float vd=length(uCam-vP);
  if(id==0u)matRoad(s,em,ssr,g,uv,vMat);
  else if(id==1u){float st=step(.5,fract(uv.x/2.));s.diff=mix(vec3(.5,.07,.05),vec3(.62),st)*(.8+.3*vn(uv*7.));s.rough=.6;water(s,g,ssr,s.P.xz,.4,vCol.r,-.3);}
  else if(id==2u){s.diff=vec3(.3,.3,.29)*(.8+.3*fbm(uv*2.));s.rough=.8;water(s,g,ssr,s.P.xz,.8,vCol.r,.3);}
  else if(id==3u)matSidewalk(s,ssr,g,uv);
  else if(id==4u)matConcrete(s,ssr,g,uv,vMat);
  else if(id==5u)matFacade(s,em,ssr,g,uv,vMat,vCol);
  else if(id==6u){s.diff=vec3(.16,.155,.15)*(.7+.5*fbm(uv*.8));s.rough=.92;s.diff*=1.0-.3*uWet;}
  else if(id==7u){
    float I=float(vMat.y)*.5;int fc=int(vMat.z);float f=fc>0?uFlick[fc&7]:1.0;float on=vMat.w==1u?uNight:1.0;
    float NoV=saturate(dot(N,s.V));vec3 c=vCol.rgb;
    em=mix(c,mix(c,vec3(1),.45),pow(NoV,2.))*I*f*on;
    s.diff=c*.2;s.rough=.25;
  }
  else if(id==8u){float r=float(vMat.y)/255.,mt=float(vMat.z)/255.;vec3 c=vCol.rgb;
    s.diff=c*(1.0-mt);s.F0=mix(vec3(.04),c,mt);s.rough=r;
    if(vMat.w==1u){vec2 rv=fract(uv*vec2(2.5,4.));float rv1=1.0-smoothstep(.06,.1,length(rv-.5));g+=(rv-.5)*rv1*.02;s.diff*=.9+.2*vn(uv*3.);}
    s.diff*=1.0-.3*uWet;s.rough=mix(s.rough,max(.1,s.rough*.5),uWet*.6);}
  else if(id==9u){s.diff=vec3(.01);s.F0=vec3(.045);s.rough=.03;em=vCol.rgb*float(vMat.y)*.05*uNight;ssr=1.0;}
  else if(id==10u){vec3 c=vCol.rgb;float I=float(vMat.y)*.1;em=c*I*(.75+.25*vn(uv*3.))*uNight;s.diff=c*.3;s.rough=.25;}
  else if(id==11u){float n=vn(uv*11.),f=fbm(uv*.12);s.diff=vec3(.07,.07,.075)*(.75+.4*n)*(.8+.4*f);s.rough=.86;
    float cl=(1.0-aaStep(.06,abs(uv.y)))*step(fract(uv.x/6.),.5)*(1.0-.6*smoothstep(.3,.7,fbm(uv*1.3)));s.diff=mix(s.diff,vec3(.6,.46,.08),cl);
    water(s,g,ssr,s.P.xz,1.0,vCol.r,.1);}
  else if(id==12u){vec2 q=uv*vec2(14.,14.);vec2 f=abs(fract(vec2(q.x+q.y,q.x-q.y)*.5)-.5);float w=min(f.x,f.y);
    if(w>.07)discard;s.diff=vec3(.25);s.F0=vec3(.6);s.rough=.4;}
  else if(id==13u){s.diff=vCol.rgb*.2;s.rough=float(vMat.y)/255.;}
  else if(id==14u){s.diff=vCol.rgb;s.F0=vec3(.5);s.rough=.25;}
  else if(id==15u){/* signals: 36 s cycle, the same one the traffic obeys; axis 2 flashes amber */
    int lamp=int(vMat.y),ax=int(vMat.z);float on=0.0;
    if(ax==2)on=lamp==1?step(.5,fract(uSignal)):0.0;
    else{float t=mod(uTime+float(vMat.w)/256.*36.+(ax==1?18.:0.),36.);int st=t<14.?2:t<17.?1:0;on=st==lamp?1.0:0.0;}
    vec3 c=lamp==0?vec3(1.,.08,.05):lamp==1?vec3(1.,.55,.05):vec3(.1,1.,.5);
    em=c*(on*14.+.08);s.diff=vec3(.02);s.rough=.2;}
  else if(id==16u){/* foliage */
    vec3 n3=vnd(s.P.xz*3.1+s.P.y*2.3);float v=h11(float(vMat.y));s.diff=vCol.rgb*.42*(.6+.6*n3.x)*(.85+.3*v);s.rough=.75;s.trans=.35;
    g+=n3.yz*.08;s.diff*=1.0-.25*uWet;s.rough=mix(s.rough,.4,uWet*.6);}
  else if(id==17u)matCityRoad(s,ssr,g,uv,vMat);
  else if(id==18u)matDeck(s,ssr,g,uv,vMat);
  else if(id==19u){vec2 wp=uv;float n=fbm(wp*.7),n2=vn(wp*9.);s.diff=vec3(.05,.09,.03)*(.6+.6*n)*(.8+.4*n2);s.rough=.9;s.diff*=1.0-.3*uWet;water(s,g,ssr,s.P.xz,.6,1.0,-.35);}
  s.ao*=vCol.a>0.0&&id!=5u?vCol.a:1.0;
  if(dot(g,g)>0.0)s.N=bump(s.N,s.P,uv,g);
  /* specular anti-aliasing: widen the lobe where the normal changes within a pixel */
  {vec3 dx=dFdx(s.N),dy=dFdy(s.N);float var=.25*(dot(dx,dx)+dot(dy,dy));float a2=s.rough*s.rough;s.rough=sqrt(sqrt(saturate(a2*a2+min(2.*var,.2))));}
  float retro=0.0;if(s.clear<0.0){retro=-s.clear;s.clear=0.0;}
  float occ=carOcc(s.P);s.ao*=occ;
  vec3 col=em;
  if(id!=7u){
    col+=directAll(s,gl_FragCoord.xy,vd)*mix(1.0,occ,.7)+ambient(s);
    /* retroreflective paint glows back at the headlights */
    if(retro>0.0&&uHL[0].w>0.0){vec3 hp=(uHL[0].xyz+uHL[1].xyz)*.5;vec3 L=normalize(hp-s.P);float b=beam(-L,uHL[2].xyz,uHL[3].xyz,cross(uHL[3].xyz,uHL[2].xyz),uHL[1].w);
      col+=s.diff*uHL[4].rgb*b*retro*pow(saturate(dot(L,s.V)),40.)*falloff(dot(hp-s.P,hp-s.P),uHL[4].w)*4.0;}
    float NoV=max(dot(s.N,s.V),1e-3);vec3 ew=envBRDF(s.F0,NoV,s.rough);
    float so=saturate(pow(NoV+s.ao,exp2(-16.*s.rough-1.))-1.+s.ao);
#ifdef PROBE
    vec3 R=reflect(-s.V,s.N);col+=skyCol(R,false)*ew*so*s.spec*.6;
#else
    if(ssr<=0.0||s.rough>.45){vec3 R=reflect(-s.V,s.N);col+=textureLod(uProbe,R,s.rough*uProbeLod).rgb*ew*so*s.spec;ssr=0.0;}
#endif
    ssr=ssr>0.0?lum(ew)*so:0.0;
  }
#ifdef PROBE
  float fogT=exp(-uFogDen*vd);col=col*fogT+uFogCol*(1.0-fogT);
  oCol=vec4(col,1.0);
#else
  oCol=vec4(col,1.0);
  oNrm=vec4(octEnc(s.N),s.rough,ssr);
  oVel=(vCur.xy/vCur.w-vPrev.xy/vPrev.w)*.5;
#endif
}`;

/* the sky behind everything (and in the probe) */
export const SKY_FS=FRAME+NOISE+PACK+SKY+`
in vec2 vT;layout(location=0) out vec4 oCol;
#ifndef PROBE
layout(location=1) out vec4 oNrm;layout(location=2) out vec2 oVel;
#endif
void main(){
  vec4 q=uInvVP*vec4(vT*2.-1.,1.,1.);vec3 d=normalize(q.xyz/q.w-uCam);
  vec3 c=skyCol(d,true);
  float fogT=exp(-uFogDen*900.*saturate(1.0-d.y*2.));c=c*mix(1.0,fogT,.85)+uFogCol*(1.0-fogT)*.85;
  oCol=vec4(c,1.0);
#ifndef PROBE
  oNrm=vec4(0,0,1,0);
  vec4 cp=uVPnj*vec4(uCam+d*5000.,1.),pp=uPrevVP*vec4(uCam+d*5000.,1.);
  oVel=(cp.xy/cp.w-pp.xy/pp.w)*.5;
#endif
}`;
export const FS_VS=`out vec2 vT;void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));vT=p;gl_Position=vec4(p*2.0-1.0,1.0,1.0);}`;
