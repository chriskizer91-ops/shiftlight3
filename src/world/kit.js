/* =====================================================================================
   CITY KIT — the pieces cities are built from: buildings with lit facades and roofs, neon
   words and blade signs from the 5x7 font, rooftop billboards, street lamps, traffic
   signals, trees. Everything is written into a Chunked builder and a list of lights.
   Map coordinates in (x east, y north, h up); world is X = x, Y = h, Z = -y.
   ===================================================================================== */
import {glyphPixels} from '../ui/font.js';
import {norm,cross} from '../render/mesh.js';

export const NEON=[[1,.18,.55],[.2,.85,1],[.65,.3,1],[1,.25,.15],[1,.6,.12],[.35,1,.45],[1,.9,.3],[.95,.4,1]];
export const WORDS=['NOODLES','HOTEL','BAR','RAMEN','MOTEL','24H','ARCADE','KARAOKE','DINER','TATTOO','LIQUOR','PARTS','GARAGE','OPEN','PIZZA','SUSHI','CLUB','DANCE','CAFE','RECORDS',
  'PAWN','LAUNDRY','PHARMACY','CINEMA','BOWLING','SHIFT','TURBO','NITRO','DRIFT','REDLINE','ROOMS','VACANCY','BEER','COFFEE','DONUTS','CASINO','POOL','JAZZ','VIDEO','TAXI','TACOS','DUMPLINGS','GYM','SALON','TOYS','ARCADIA','HOSTEL','NEON'];
export const W=(x,y,h=0)=>[x,h,-y];
const STYLE_FH={0:3.3,1:3.6,2:3.9,3:3.2,4:4.2},STYLE_BW={0:2.3,1:3.1,2:1.6,3:2.5,4:3.6};
const TINTS={0:[[150,68,48],[120,58,44],[165,92,62],[96,52,44]],1:[[150,148,140],[120,120,118],[170,160,140]],2:[[60,90,110],[40,70,80],[90,110,120]],
  3:[[190,170,130],[150,165,170],[200,150,120],[120,150,130],[170,120,130],[210,200,180]],4:[[90,95,100],[110,80,60],[70,90,80]]};

export function makeKit(C,R,lights){
  const K={C,R,lights};
  K.light=L=>{lights.push(Object.assign({type:0,r:12,col:[1,1,1],dir:[0,-1,0],cosO:-1,cosI:-1,axis:[0,0,0],flick:0,src:.05},L));};
  /* ---------- neon letters: runs of lit pixels become glass tubes ---------- */
  K.neonText=(text,origin,right,up,px,col,fl=0)=>{
    C.mat(7,Math.round(52+R()*16),fl,0).col(col[0]*255,col[1]*255,col[2]*255);
    const B=C.at(origin[0],origin[2]),rad=px*.17;
    const P=(x,y)=>[origin[0]+right[0]*x*px+up[0]*y*px,origin[1]+right[1]*x*px+up[1]*y*px,origin[2]+right[2]*x*px+up[2]*y*px];
    let cx=0;
    for(const ch of text){const pix=glyphPixels(ch),on=new Set(pix.map(([c,r])=>c+','+r)),has=(c,r)=>on.has(c+','+r),used=new Set();
      for(let r=0;r<7;r++){let c=0;while(c<5){if(has(c,r)&&has(c+1,r)){let e=c;while(has(e+1,r))e++;B.tube(P(cx+c,6-r),P(cx+e,6-r),rad,5,true);for(let k=c;k<=e;k++)used.add(k+','+r);c=e+1;}else c++;}}
      for(let c=0;c<5;c++){let r=0;while(r<7){if(has(c,r)&&has(c,r+1)){let e=r;while(has(c,e+1))e++;B.tube(P(cx+c,6-r),P(cx+c,6-e),rad,5,true);for(let k=r;k<=e;k++)used.add(c+','+k);r=e+1;}else r++;}}
      for(const [c,r] of pix){for(const dc of [-1,1])if(has(c+dc,r+1)&&!has(c+dc,r)&&!has(c,r+1)){B.tube(P(cx+c,6-r),P(cx+c+dc,6-r-1),rad,5,true);used.add(c+','+r);used.add((c+dc)+','+(r+1));}}
      for(const [c,r] of pix)if(!used.has(c+','+r))B.tube(P(cx+c-.3,6-r),P(cx+c+.3,6-r),rad,5,true);
      cx+=6;}
  };
  /* ---------- buildings ---------- */
  /* lot: {x0,y0,x1,y1,h,style,seed,street:{n,s,e,w},tower}; extras(face) decorates street faces at ground level */
  K.building=(lot,extras)=>{
    const {x0,y0,x1,y1}=lot,H=lot.h,style=lot.style,seed=lot.seed;
    const fh=STYLE_FH[style]+R()*.3,bw0=STYLE_BW[style]+R()*.4,tint=TINTS[style][Math.floor(R()*TINTS[style].length)];
    const fhc=Math.max(0,Math.min(15,Math.round((fh-3)/.1))),store=H>7&&style!==4&&!lot.noStore;
    const faceSet=(fx0,fy0,fx1,fy1,h0,h1,storeOK,fidx0)=>{
      const F=[[[fx0,fy0],[fx1,fy0],[0,0,1],'s'],[[fx1,fy1],[fx0,fy1],[0,0,-1],'n'],[[fx1,fy0],[fx1,fy1],[1,0,0],'e'],[[fx0,fy1],[fx0,fy0],[-1,0,0],'w']];
      F.forEach(([bl,br,n,side],k)=>{const Wd=Math.hypot(br[0]-bl[0],br[1]-bl[1]),nb=Math.max(1,Math.round(Wd/bw0)),bw=Wd/nb,al=Math.max(0,Math.min(255,Math.round((bw-1)/3*255)));
        const st=storeOK&&lot.street[side]?1:0;C.mat(5,style,seed,st|(fhc<<4)).col(tint[0],tint[1],tint[2],al);
        const u0=(fidx0+k)*64*bw,a=W(bl[0],bl[1],h0),b=W(br[0],br[1],h0),c=W(br[0],br[1],h1),d=W(bl[0],bl[1],h1);
        C.at((bl[0]+br[0])/2,-(bl[1]+br[1])/2).quadP(a,b,c,d,[[u0,h0],[u0+Wd,h0],[u0+Wd,h1],[u0,h1]],n);
        if(st&&h0<1&&extras)extras({bl,br,n,Wd,side,lot});});
    };
    let rx0=x0,ry0=y0,rx1=x1,ry1=y1;
    if(lot.tower){const hp=lot.tower.podium,ins=lot.tower.inset;faceSet(x0,y0,x1,y1,0,hp,store,0);K.roof(x0,y0,x1,y1,hp,false);
      rx0=x0+ins;ry0=y0+ins;rx1=x1-ins;ry1=y1-ins;faceSet(rx0,ry0,rx1,ry1,hp,H,false,4);}
    else faceSet(x0,y0,x1,y1,0,H,store,0);
    K.roof(rx0,ry0,rx1,ry1,H,true);
    if(lot.tower&&R()<.75){const ax=(rx0+rx1)/2,ay=(ry0+ry1)/2,ah=6+R()*14;C.mat(8,100,230).col(80,80,85);C.at(ax,-ay).tube(W(ax,ay,H),W(ax,ay,H+ah),.12,5,true,.05);
      C.mat(7,60,7).col(255,30,20);C.at(ax,-ay).sphere(W(ax,ay,H+ah+.15),.18,6,3);K.light({pos:W(ax,ay,H+ah+.4),r:8,col:[4,.4,.2],flick:7});}
  };
  K.roof=(x0,y0,x1,y1,H,props)=>{
    C.mat(6).col(255,0,0,255);const B=C.at((x0+x1)/2,-(y0+y1)/2);
    B.quadP(W(x0,y0,H-.05),W(x1,y0,H-.05),W(x1,y1,H-.05),W(x0,y1,H-.05),[[x0,-y0],[x1,-y0],[x1,-y1],[x0,-y1]],[0,1,0]);
    C.mat(4,0).col(255,0,0,255);const pt=.3,ph=1.0;
    for(const [ax,ay,bx,by] of [[x0,y0,x1,y0+pt],[x0,y1-pt,x1,y1],[x0,y0,x0+pt,y1],[x1-pt,y0,x1,y1]])
      C.at((ax+bx)/2,-(ay+by)/2).box(W((ax+bx)/2,(ay+by)/2,H-.05+ph/2),[1,0,0],[0,1,0],[0,0,1],[(bx-ax)/2,ph/2,(by-ay)/2],8);
    if(!props)return;
    const n=1+Math.floor(R()*3);for(let k=0;k<n;k++){const w=1.2+R()*2.5,l=1.2+R()*3,h=.8+R()*1.6,px=x0+2+R()*Math.max(.1,x1-x0-4-w),py=y0+2+R()*Math.max(.1,y1-y0-4-l);
      C.mat(8,150,150).col(120,122,125);C.at(px,-py).box(W(px+w/2,py+l/2,H+h/2-.05),[1,0,0],[0,1,0],[0,0,1],[w/2,h/2,l/2],8);}
    if(R()<.3&&x1-x0>8&&y1-y0>8){const px=x0+3+R()*(x1-x0-6),py=y0+3+R()*(y1-y0-6);C.mat(13,230).col(120,80,55);
      C.at(px,-py).tube(W(px,py,H+2.2),W(px,py,H+5.5),1.4,10,true);
      C.mat(8,200,0).col(60,60,60);for(const [ox,oy] of [[-1,-1],[1,-1],[1,1],[-1,1]])C.at(px,-py).tube(W(px+ox,py+oy,H),W(px+ox,py+oy,H+2.3),.08,4,false);}
  };
  /* ---------- signs on a street face: neon word, blade sign, outline; dens 0..1 ---------- */
  K.signs=(f,dens=.6,spill=true)=>{
    const {bl,br,n,Wd}=f,mx=(bl[0]+br[0])/2,my=(bl[1]+br[1])/2,nm=[n[0],-n[2]],rt=[(br[0]-bl[0])/Wd,(br[1]-bl[1])/Wd];
    if(spill)for(let u=4;u<Wd-2;u+=14){const px=bl[0]+rt[0]*u+nm[0]*1.4,py=bl[1]+rt[1]*u+nm[1]*1.4,hs=R();
      K.light({pos:W(px,py,2.4),r:7,col:(hs<.55?[1,.7,.42]:hs<.85?[.8,.9,1]:[1,.55,.8]).map(v=>v*1.5),src:.4});}
    if(Wd<7||R()>dens)return;
    const r=R();
    if(r<.6){const word=WORDS[Math.floor(R()*WORDS.length)],px=.13+R()*.05,len=word.length*6*px-px;if(len>Wd-1.5)return;
      const u0=1+R()*(Wd-1.5-len),col=NEON[Math.floor(R()*NEON.length)],h0=5.15+R()*.6,o=[bl[0]+rt[0]*u0+nm[0]*.32,bl[1]+rt[1]*u0+nm[1]*.32];
      C.mat(13,140).col(30,30,34);C.at(mx,-my).box(W(o[0]+rt[0]*len/2-nm[0]*.12,o[1]+rt[1]*len/2-nm[1]*.12,h0+3*px),[rt[0],0,-rt[1]],[0,1,0],[nm[0],0,-nm[1]],[len/2+.25,3.5*px+.2,.08]);
      const fl=R()<.18?1+Math.floor(R()*5):0;K.neonText(word,W(o[0],o[1],h0),[rt[0],0,-rt[1]],[0,1,0],px,col,fl);
      K.light({type:2,pos:W(o[0]+rt[0]*len/2+nm[0]*.5,o[1]+rt[1]*len/2+nm[1]*.5,h0+3*px),axis:[rt[0]*len/2,0,-rt[1]*len/2],r:13,col:col.map(v=>v*2.6),flick:fl,src:.15});}
    else if(r<.9){const word=WORDS[Math.floor(R()*WORDS.length)].slice(0,7),px=.15,lh=9*px,len=word.length*lh;
      const u0=R()<.5?1.2:Wd-1.2,col=NEON[Math.floor(R()*NEON.length)],h0=7+R()*3,base=[bl[0]+rt[0]*u0,bl[1]+rt[1]*u0],out=1.9,thick=.18;
      C.mat(13,120).col(25,25,30);const c0=[base[0]+nm[0]*(out/2+.3),base[1]+nm[1]*(out/2+.3)];
      C.at(mx,-my).box(W(c0[0],c0[1],h0+len/2),[nm[0],0,-nm[1]],[0,1,0],[rt[0],0,-rt[1]],[out/2,len/2+.2,thick/2]);
      C.mat(8,90,230).col(60,60,64);for(const hh of [h0+.3,h0+len-.3])C.at(mx,-my).tube(W(base[0],base[1],hh),W(base[0]+nm[0]*.4,base[1]+nm[1]*.4,hh),.04,4,false);
      const fl=R()<.2?1+Math.floor(R()*5):0;
      for(const sgn of [1,-1])for(let k=0;k<word.length;k++){const hh=h0+len-(k+1)*lh+px,rs=sgn>0?-1:1;
        const fp=[c0[0]+rt[0]*sgn*(thick/2+.04)-nm[0]*rs*2.5*px,c0[1]+rt[1]*sgn*(thick/2+.04)-nm[1]*rs*2.5*px];
        K.neonText(word[k],W(fp[0],fp[1],hh),[nm[0]*rs,0,-nm[1]*rs],[0,1,0],px,col,fl);}
      K.light({type:2,pos:W(c0[0],c0[1],h0+len/2),axis:[0,len/2,0],r:14,col:col.map(v=>v*3),flick:fl,src:.2});}
    else{const col=NEON[Math.floor(R()*NEON.length)];C.mat(7,70,0).col(col[0]*255,col[1]*255,col[2]*255);
      const a=[bl[0]+rt[0]*.6+nm[0]*.12,bl[1]+rt[1]*.6+nm[1]*.12],b=[br[0]-rt[0]*.6+nm[0]*.12,br[1]-rt[1]*.6+nm[1]*.12];
      C.at(mx,-my).tube(W(a[0],a[1],4.55),W(b[0],b[1],4.55),.03,5,true);
      K.light({type:2,pos:W((a[0]+b[0])/2+nm[0]*.4,(a[1]+b[1])/2+nm[1]*.4,4.5),axis:[(b[0]-a[0])/2,0,-(b[1]-a[1])/2],r:9,col:col.map(v=>v*1.6),src:.1});}
  };
  /* a lit billboard on a roof edge, facing (nx, ny) */
  K.billboard=(bl,br,nx,ny,H)=>{
    const Wd=Math.hypot(br[0]-bl[0],br[1]-bl[1]);if(Wd<9)return;const w=Math.min(Wd-2,14),h=w*.38,rt=[(br[0]-bl[0])/Wd,(br[1]-bl[1])/Wd];
    const cx=(bl[0]+br[0])/2-nx*1.5,cy=(bl[1]+br[1])/2-ny*1.5,y0=H+1.2;
    C.mat(8,140,220).col(60,60,62);for(const o of [-w/3,w/3])C.at(cx,-cy).tube(W(cx+rt[0]*o,cy+rt[1]*o,H),W(cx+rt[0]*o,cy+rt[1]*o,y0+.2),.1,5,false);
    const col=NEON[Math.floor(R()*NEON.length)].map(v=>v*.55+.25);
    C.mat(10,28).col(col[0]*255,col[1]*255,col[2]*255);
    const fa=W(cx+rt[0]*-w/2+nx*.2,cy+rt[1]*-w/2+ny*.2,y0),fb=W(cx+rt[0]*w/2+nx*.2,cy+rt[1]*w/2+ny*.2,y0);
    C.at(cx,-cy).quadP(fa,fb,[fb[0],y0+h,fb[2]],[fa[0],y0+h,fa[2]],[[0,0],[1,0],[1,1],[0,1]],[nx,0,-ny]);
    C.mat(13,150).col(30,30,30);C.at(cx,-cy).box(W(cx,cy,y0+h/2),[rt[0],0,-rt[1]],[0,1,0],[nx,0,-ny],[w/2+.15,h/2+.15,.15]);
    const word=WORDS[Math.floor(R()*WORDS.length)],px=Math.min(h*.7/7,(w-1)/(word.length*6)),len=word.length*6*px-px;
    K.neonText(word,W(cx-rt[0]*len/2+nx*.35,cy-rt[1]*len/2+ny*.35,y0+(h-7*px)/2),[rt[0],0,-rt[1]],[0,1,0],px,NEON[Math.floor(R()*NEON.length)],0);
    K.light({type:2,pos:W(cx+nx*3,cy+ny*3,y0+h/2),axis:[rt[0]*w/2,0,-rt[1]*w/2],r:26,col:col.map(v=>v*7),src:.5});
  };
  /* ---------- street furniture ---------- */
  /* a street lamp at (px, py) on the ground at h0, its arm reaching dir (unit, map) */
  K.lamp=(px,py,h0,dir,{arm=2.2,height=7.4,col=[230,128,52],led=false}={})=>{
    const p=W(px,py,h0),head=W(px+dir[0]*arm,py+dir[1]*arm,h0+height);
    C.mat(8,140,230).col(58,60,64);const B=C.at(px,-py);B.tube(p,[p[0],h0+height+.1,p[2]],.09,5,true,.06);B.tube([p[0],h0+height+.1,p[2]],head,.05,4,false);
    C.mat(7,led?110:90,0,1).col(...(led?[235,242,255]:[255,180,100]));B.box([head[0],head[1]-.1,head[2]],[1,0,0],[0,1,0],[0,0,1],[.3,.03,.18]);
    K.light({type:1,pos:[head[0],head[1]-.3,head[2]],r:24+height*.6,col:led?[230,250,290].map(v=>v*.8):col,dir:[0,-1,0],cosO:Math.cos(1.2),cosI:Math.cos(.6),src:.2});
  };
  /* a traffic signal mast at a corner: heads facing approaching traffic along both roads.
     id: the intersection's phase offset (0..255); the shader runs the same cycle the traffic does */
  K.signal=(px,py,armX,armY,id)=>{
    C.mat(8,150,230).col(45,48,40);const B=C.at(px,-py);B.tube(W(px,py,.15),W(px,py,6.2),.11,6,true);
    for(const [dx,dy,axis] of [[armX,0,1],[0,armY,0]]){const L=Math.hypot(dx,dy);if(!L)continue;const ux=dx/L,uy=dy/L;
      C.mat(8,150,230).col(45,48,40);B.tube(W(px,py,5.9),W(px+dx,py+dy,5.9),.07,5,false);
      /* heads hang along the arm, facing the traffic that comes toward them (perpendicular to the arm) */
      for(const t of [.55,.92]){const hx=px+dx*t,hy=py+dy*t,face=[-uy*Math.sign(axis?1:-1),ux*Math.sign(axis?1:-1)];
        C.mat(8,160,100).col(30,32,26);B.box(W(hx,hy,5.25),[1,0,0],[0,1,0],[0,0,1],[.18,.48,.18]);
        for(let l=0;l<3;l++){C.mat(15,l,axis,id).col(255,255,255);B.sphere(W(hx+face[0]*.19,hy+face[1]*.19,5.6-l*.33),.1,6,3);
          C.mat(15,l,axis,id).col(255,255,255);B.sphere(W(hx-face[0]*.19,hy-face[1]*.19,5.6-l*.33),.1,6,3);}}}
  };
  /* a tree: a trunk and a few overlapping crowns */
  K.tree=(px,py,h0,size=1)=>{
    const s=size*(.8+R()*.5),B=C.at(px,-py);C.mat(13,240).col(70,50,36);B.tube(W(px,py,h0),W(px,py,h0+2.4*s),.14*s,6,false,.09*s);
    C.mat(16,Math.floor(R()*255)).col(40+R()*30,70+R()*40,30+R()*20);
    for(let k=0;k<4;k++){const a=R()*6.28,r=(k?1.1:0)*s,hh=h0+(k?3.4:4.2)*s+R()*.6*s;B.sphere(W(px+Math.cos(a)*r,py+Math.sin(a)*r,hh),(1.5+R()*.7)*s*(k?.85:1),8,5);}
  };
  return K;
}
