/* =====================================================================================
   SHIFT CITY — the map. Pure data: roads, intersections, the elevated highway and its
   ramps, blocks and lots with their districts. Physics, drawing and traffic are all built
   from this, so changing the town happens here.

   The town: a 9 x 9 grid of streets 120 m apart inside a ring boulevard with rounded
   corners. An elevated highway runs over the ring boulevard 9 m up; at the middle of each
   side an off-ramp and an on-ramp for each direction split from (or join) its outer lane and
   touch down on the boulevard. Map coordinates: x east, y north, h up.
   ===================================================================================== */
import {makeRibbon} from './ribbon.js';
import {rng} from '../render/mesh.js';

export const GRID=[-480,-360,-240,-120,0,120,240,360,480];
export const RING=480,CORNER=120,DECK_H=9;
/* road classes: half width of the roadway, lanes each way, lane width, median half width, sidewalk */
export const ROADS={
  ring:{hw:16,lanes:3,lw:3.5,med:1.6,side:5,name:'Ring Boulevard'},
  main:{hw:8,lanes:2,lw:3.4,med:1.2,side:5,name:'Avenue'},
  ave:{hw:7,lanes:2,lw:3.4,med:0,side:4.5,name:'Avenue'},
  street:{hw:5.5,lanes:1,lw:3.6,med:0,side:4,name:'Street'}
};
export const HWY={hw:8.8,lanes:2,lw:3.6,lane1:2.4,lane2:6.0,medHalf:.3,barrier:.4};
const STREET_NAMES={x:{'-480':'West Ring','-360':'Harbor St','-240':'Eighth Ave','-120':'Mercer St','0':'Central Ave','120':'Lantern St','240':'Third Ave','360':'Foundry St','480':'East Ring'},
  y:{'-480':'South Ring','-360':'Canal St','-240':'Fifth Ave','-120':'Neon Row','0':'Main Ave','120':'Tower St','240':'Park Ave','360':'Garden St','480':'North Ring'}};
export const classOf=v=>Math.abs(v)===RING?'ring':v===0?'main':Math.abs(v)===240?'ave':'street';
export const hwOf=v=>ROADS[classOf(v)].hw;

/* the ring's centre line: a rounded rectangle, clockwise from the north side's west end */
export function ringPath(step=1,R=RING,C=CORNER,h=0){
  const pts=[],S=R-C;
  const line=(x0,y0,x1,y1)=>{const n=Math.max(1,Math.round(Math.hypot(x1-x0,y1-y0)/step));for(let i=0;i<n;i++)pts.push([x0+(x1-x0)*i/n,y0+(y1-y0)*i/n,h]);};
  const arc=(cx,cy,a0,a1)=>{const n=Math.max(2,Math.round(Math.abs(a1-a0)*C/step));for(let i=0;i<n;i++){const a=a0+(a1-a0)*i/n;pts.push([cx+Math.cos(a)*C,cy+Math.sin(a)*C,h]);}};
  line(-S,R,S,R);arc(S,S,Math.PI/2,0);line(R,S,R,-S);arc(S,-S,0,-Math.PI/2);line(S,-R,-S,-R);arc(-S,-S,-Math.PI/2,-Math.PI);line(-R,-S,-R,S);arc(-S,S,Math.PI,Math.PI/2);
  return pts;
}
const ss=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};

export function buildCityMap(seed=777){
  const R=rng(seed),M={grid:GRID,ring:RING,corner:CORNER,deckH:DECK_H,names:STREET_NAMES};
  /* ---------- intersections and the street segments between them ---------- */
  const nodes=[],nodeAt=new Map(),key=(x,y)=>x+','+y;
  const inCorner=(x,y)=>Math.abs(x)===RING&&Math.abs(y)===RING;
  for(const x of GRID)for(const y of GRID){
    if(inCorner(x,y))continue;
    if(Math.abs(x)===RING&&Math.abs(y)>RING-CORNER)continue;   /* swallowed by the rounded corners */
    if(Math.abs(y)===RING&&Math.abs(x)>RING-CORNER)continue;
    const n={id:nodes.length,x,y,cx:classOf(x),cy:classOf(y),hx:hwOf(x),hy:hwOf(y),links:[]};
    n.ring=Math.abs(x)===RING||Math.abs(y)===RING;n.signal=true;
    nodes.push(n);nodeAt.set(key(x,y),n);}
  M.nodes=nodes;
  const segs=[];
  const addSeg=(a,b,axis,line)=>{const cls=classOf(line),s={id:segs.length,a:a.id,b:b.id,axis,line,cls,...ROADS[cls]};
    s.x0=a.x;s.y0=a.y;s.x1=b.x;s.y1=b.y;s.len=Math.hypot(b.x-a.x,b.y-a.y);segs.push(s);a.links.push(s.id);b.links.push(s.id);return s;};
  /* along lines of constant x (running north) and constant y (running east) */
  for(const x of GRID){const col=GRID.map(y=>nodeAt.get(key(x,y))).filter(Boolean);for(let i=0;i<col.length-1;i++)addSeg(col[i],col[i+1],'y',x);}
  for(const y of GRID){const row=GRID.map(x=>nodeAt.get(key(x,y))).filter(Boolean);for(let i=0;i<row.length-1;i++)addSeg(row[i],row[i+1],'x',y);}
  /* the four rounded corners of the ring boulevard join its straight sides */
  const S=RING-CORNER;M.corners=[];
  for(const [sx,sy] of [[1,1],[1,-1],[-1,-1],[-1,1]]){
    const a=nodeAt.get(key(sx*S,sy*RING)),b=nodeAt.get(key(sx*RING,sy*S));
    const c={id:segs.length,a:a.id,b:b.id,axis:'arc',cls:'ring',...ROADS.ring,cx:sx*S,cy:sy*S,r:CORNER,
      a0:Math.atan2(a.y-sy*S,a.x-sx*S),a1:Math.atan2(b.y-sy*S,b.x-sx*S),len:Math.PI/2*CORNER};
    /* the short way round (atan2 jumps at +-pi) */
    if(c.a1-c.a0>Math.PI)c.a1-=2*Math.PI;else if(c.a1-c.a0<-Math.PI)c.a1+=2*Math.PI;
    c.x0=a.x;c.y0=a.y;c.x1=b.x;c.y1=b.y;segs.push(c);a.links.push(c.id);b.links.push(c.id);M.corners.push(c);}
  M.segs=segs;
  /* ---------- the highway and its ramps ---------- */
  const hwy=makeRibbon(ringPath(1,RING,CORNER,DECK_H),{closed:true,hw:HWY.hw,id:0,name:'Ring Expressway'});
  M.hwy=hwy;M.ramps=[];
  /* the middle of each side, going clockwise; t runs 0..1 along each ramp in its direction of travel */
  const sides=[{c:[0,RING],f:[1,0]},{c:[RING,0],f:[0,-1]},{c:[0,-RING],f:[-1,0]},{c:[-RING,0],f:[0,1]}];
  const L=150,GAP=50,OFF=12.6;
  sides.forEach((sd,si)=>{
    /* clockwise travel along f has its right-hand side (where exits are) at (f.y, -f.x): inside the ring; counter-clockwise, outside */
    for(const dir of [1,-1]){
      const f=[sd.f[0]*dir,sd.f[1]*dir],right=[f[1],-f[0]];
      const mk=(kind)=>{
        /* off: diverges from the deck GAP+L before the centre and lands GAP before it; on: the mirror after it */
        const a0=kind==='off'?-(GAP+L):GAP,pts=[];
        for(let i=0;i<=L;i++){const t=i/L,along=a0+i;
          let off,h;
          if(kind==='off'){off=HWY.lane2+(OFF-HWY.lane2)*ss(0,.36,t);h=DECK_H*(1-ss(.32,1,t));}
          else{off=OFF+(HWY.lane2-OFF)*ss(.64,1,t);h=DECK_H*ss(0,.68,t);}
          pts.push([sd.c[0]+f[0]*along+right[0]*off,sd.c[1]+f[1]*along+right[1]*off,h]);}
        const rib=makeRibbon(pts,{closed:false,hw:3.4,id:1+M.ramps.length,name:(kind==='off'?'Exit ':'Entrance ')+(si*2+(dir>0?0:1)+1)});
        rib.kind=kind;rib.side=si;rib.dir=dir;rib.f=f;rib.right=right;rib.center=sd.c;rib.a0=a0;
        M.ramps.push(rib);return rib;};
      mk('off');mk('on');
    }
  });
  M.ribbons=[hwy,...M.ramps];
  /* where along the highway each ramp leaves or joins (for gaps in the deck barrier and for traffic) */
  for(const r of M.ramps){const L0=hwy.locate(r.mx[0],-r.my[0],-1),L1=hwy.locate(r.mx[r.N-1],-r.my[r.N-1],-1);r.hs0=L0.s;r.hs1=L1.s;
    /* the stretch where the ramp is still attached to the deck */
    const attach=r.kind==='off'?[0,.38]:[.62,1];
    const s0=hwy.locate(r.mx[Math.round(attach[0]*(r.N-1))],-r.my[Math.round(attach[0]*(r.N-1))],-1).s,s1=hwy.locate(r.mx[Math.round(attach[1]*(r.N-1))],-r.my[Math.round(attach[1]*(r.N-1))],-1).s;
    r.gap={s0:Math.min(s0,s1),s1:Math.max(s0,s1),side:Math.sign(hwy.locate(r.mx[r.N>>1],-r.my[r.N>>1],-1).d)};r.attach=attach;}
  /* ---------- blocks, districts, lots ---------- */
  const district=(cx,cy)=>{const ax=Math.abs(cx),ay=Math.abs(cy);
    if(cx>120&&cx<240&&cy>120&&cy<240)return 'park';
    if(ax<=240&&ay<=240)return 'downtown';
    if(cx<-120&&cx>-480&&cy<0&&cy>-300)return 'neon';
    if(cx>240&&cy<-120)return 'industrial';
    if(cx<-240&&cy>120)return 'residential';
    return ax<360&&ay<360?'mixed':'edge';};
  M.district=district;
  const blocks=[];
  for(let i=0;i<GRID.length-1;i++)for(let j=0;j<GRID.length-1;j++){
    const xa=GRID[i],xb=GRID[i+1],ya=GRID[j],yb=GRID[j+1];
    const b={x0:xa+hwOf(xa),x1:xb-hwOf(xb),y0:ya+hwOf(ya),y1:yb-hwOf(yb),sw:{w:ROADS[classOf(xa)].side,e:ROADS[classOf(xb)].side,s:ROADS[classOf(ya)].side,n:ROADS[classOf(yb)].side}};
    b.cx=(b.x0+b.x1)/2;b.cy=(b.y0+b.y1)/2;b.district=district(b.cx,b.cy);
    /* the corner blocks are cut by the ring's rounded corners */
    b.corner=Math.abs(b.cx)>S&&Math.abs(b.cy)>S;
    blocks.push(b);}
  /* outside the ring: a band of warehouses and towers before the skyline */
  const OUT0=RING+ROADS.ring.hw,OUT1=RING+170;
  M.outer={r0:OUT0,r1:OUT1};
  M.blocks=blocks;
  /* lots: each block cut into buildings that front its streets; the park gets none */
  const lots=[];
  const STY={downtown:()=>R()<.55?2:R()<.6?1:0,neon:()=>R()<.45?3:R()<.6?0:1,residential:()=>R()<.6?0:3,industrial:()=>R()<.75?4:1,mixed:()=>[0,1,3,3,2][Math.floor(R()*5)],edge:()=>[0,1,4,3][Math.floor(R()*4)]};
  const HGT={downtown:()=>R()<.35?55+R()*95:18+R()*30,neon:()=>9+R()*14,residential:()=>13+R()*9,industrial:()=>8+R()*6,mixed:()=>10+Math.pow(R(),1.5)*28,edge:()=>9+Math.pow(R(),1.5)*22};
  for(const b of blocks){
    if(b.district==='park')continue;
    const zx0=b.x0+b.sw.w,zx1=b.x1-b.sw.e,zy0=b.y0+b.sw.s,zy1=b.y1-b.sw.n;
    const dz=b.district,wMin=dz==='downtown'?20:dz==='industrial'?28:dz==='neon'?9:12,wMax=dz==='downtown'?44:dz==='industrial'?52:dz==='neon'?16:26;
    const rows=zy1-zy0>40?2:1;const cols=[];let x=zx0;
    while(x<zx1-6){let w=wMin+R()*(wMax-wMin);if(zx1-(x+w)<wMin*.7)w=zx1-x;cols.push([x,Math.min(zx1,x+w)]);x+=w;}
    cols.forEach(([cx0,cx1],ci)=>{for(let r=0;r<rows;r++){
      const depth=rows===1?zy1-zy0:Math.min((zy1-zy0)/2,dz==='downtown'?(zy1-zy0)/2:14+R()*14);
      const ly0=rows===1?zy0:r===0?zy0:zy1-depth,ly1=rows===1?zy1:r===0?zy0+depth:zy1;
      const gap=R()<.25?1.5:0,lx0=cx0+(ci>0?gap/2:0),lx1=cx1-(ci<cols.length-1?gap/2:0);
      /* keep the rounded corners of the ring clear */
      if(b.corner){const S=RING-CORNER,far=Math.hypot(Math.max(Math.abs(lx0),Math.abs(lx1))-S,Math.max(Math.abs(ly0),Math.abs(ly1))-S);
        if(Math.abs(lx0)>S||Math.abs(lx1)>S)if(Math.abs(ly0)>S||Math.abs(ly1)>S)if(far>CORNER-ROADS.ring.hw-ROADS.ring.side-1)continue;}
      const street={n:rows===1||r===1,s:rows===1||r===0,w:ci===0,e:ci===cols.length-1};
      const h=HGT[dz](),tower=dz==='downtown'&&h>50&&lx1-lx0>22&&ly1-ly0>22;
      lots.push({x0:lx0,y0:ly0,x1:lx1,y1:ly1,h,style:STY[dz](),district:dz,street,tower:tower?{podium:12+R()*8,inset:3+R()*3}:null,seed:Math.floor(R()*255)});
    }});
  }
  /* the band outside the ring: deep lots facing the boulevard */
  const o0=M.outer.r0+5;
  for(const [ax,sg] of [['y',1],['y',-1],['x',1],['x',-1]]){
    let t=-(RING-CORNER)+10;while(t<RING-CORNER-10){const w=24+R()*30,t1=Math.min(RING-CORNER-10,t+w),d=40+R()*50,h=12+Math.pow(R(),1.4)*50;
      const lot=ax==='y'?{x0:t,x1:t1,y0:sg>0?o0:-o0-d,y1:sg>0?o0+d:-o0}:{y0:t,y1:t1,x0:sg>0?o0:-o0-d,x1:sg>0?o0+d:-o0};
      Object.assign(lot,{h,style:R()<.4?4:R()<.5?1:0,district:'edge',street:ax==='y'?{s:sg>0,n:sg<0,w:false,e:false}:{w:sg>0,e:sg<0,s:false,n:false},tower:null,seed:Math.floor(R()*255),outer:true});
      lots.push(lot);t=t1+(R()<.4?4:1);}}
  M.lots=lots;
  return M;
}

/* the height of the ground (not counting ramps and the deck) at a map point: streets at 0,
   blocks and sidewalks at 0.15. Also says which: 'road' or 'walk'. */
export function baseGround(M,x,y){
  const ax=Math.abs(x),ay=Math.abs(y),S=RING-CORNER;
  /* the rounded corners of the ring boulevard */
  if(ax>S&&ay>S){const d=Math.hypot(ax-S,ay-S);if(Math.abs(d-CORNER)<ROADS.ring.hw)return 0;return .15;}
  if(Math.abs(ax-RING)<ROADS.ring.hw&&ay<=S+1)return 0;
  if(Math.abs(ay-RING)<ROADS.ring.hw&&ax<=S+1)return 0;
  if(ax>RING||ay>RING)return .15;
  for(const g of GRID){if(Math.abs(x-g)<hwOf(g))return 0;if(Math.abs(y-g)<hwOf(g))return 0;}
  return .15;
}
