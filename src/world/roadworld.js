/* =====================================================================================
   ROAD WORLD — physics for an open city with more than one level.
   - the ground: streets at 0, blocks and sidewalks 15 cm up (a kerb you can bump over)
   - ribbons: the highway deck and the ramps, each a surface at its own height
   - walls: buildings, barriers, embankments under low ramps, pillars, posts — oriented
     boxes and circles with a height range, in a spatial hash
   A surface counts for a point only if it is not far above it, so a car under the deck
   drives on the street and a car on the deck drives on the deck.
   Same interface as the circuit's TrackWorld: locate, ground, raycast, wall.
   ===================================================================================== */
import {baseGround,HWY,DECK_H,RING,CORNER,ROADS,GRID} from './citymap.js';
import {onFlats,flatsHeight,skylineBlocks,FLATS} from './flats.js';

const UP=[0,1,0],CELL=16;
export class RoadWorld{
  constructor(M){
    this.M=M;this.ribbons=M.ribbons;this.hints=new Int32Array(M.ribbons.length).fill(-1);
    /* which ribbons pass through each cell */
    this.rcell=new Map();
    M.ribbons.forEach((R,ri)=>{for(let i=0;i<R.N;i+=2){const x=R.mx[i],y=R.my[i],r=R.hw+2;
      for(const [dx,dy] of [[-r,-r],[r,-r],[-r,r],[r,r],[0,0]]){const k=Math.floor((x+dx)/CELL)+','+Math.floor((y+dy)/CELL);let a=this.rcell.get(k);if(!a)this.rcell.set(k,a=[]);if(!a.includes(ri))a.push(ri);}}});
    this.walls=[];this.wcell=new Map();
    this.buildWalls();
  }
  /* ---------- walls ---------- */
  addBox(cx,cy,ax,hx,hy,y0,y1,kind='wall'){/* map centre, unit axis (x of the box), half sizes, height range */
    const w={t:0,cx,cy,ax:ax[0],ay:ax[1],hx,hy,y0,y1,kind};this.insert(w,Math.abs(ax[0])*hx+Math.abs(ax[1])*hy,Math.abs(ax[1])*hx+Math.abs(ax[0])*hy);return w;}
  addCircle(cx,cy,r,y0,y1,kind='post'){const w={t:1,cx,cy,r,y0,y1,kind};this.insert(w,r,r);return w;}
  insert(w,ex,ey){this.walls.push(w);
    for(let i=Math.floor((w.cx-ex)/CELL);i<=Math.floor((w.cx+ex)/CELL);i++)for(let j=Math.floor((w.cy-ey)/CELL);j<=Math.floor((w.cy+ey)/CELL);j++){
      const k=i+','+j;let a=this.wcell.get(k);if(!a)this.wcell.set(k,a=[]);a.push(w);}}
  buildWalls(){
    const M=this.M;
    /* buildings */
    for(const L of M.lots)this.addBox((L.x0+L.x1)/2,(L.y0+L.y1)/2,[1,0],(L.x1-L.x0)/2,(L.y1-L.y0)/2,-1,L.h,'building');
    /* the towers out on the flats are solid too */
    for(const b of skylineBlocks())this.addBox(b.cx,b.cy,[1,0],b.w/2,b.l/2,-1,b.H,'building');
    /* barriers along a ribbon: one box every 4 m, skipping gaps; d is the barrier's centre offset */
    const barrier=(R,d,s0,s1,hTop,skip,yLow)=>{
      for(let s=s0;s<s1-.01;s+=4){const se=Math.min(s1,s+4),sm=(s+se)/2;if(skip&&skip(sm))continue;
        const th=R.headAt(sm),p=R.pos(sm,d),h=R.yAt(sm);
        this.addBox(p[0],-p[2],[Math.cos(th),Math.sin(th)],(se-s)/2+.05,HWY.barrier/2,yLow!==undefined?yLow:h-.6,h+hTop,'barrier');}};
    const hwy=M.hwy,gaps=M.ramps.map(r=>r.gap);
    const inGap=(sm,side)=>gaps.some(g=>g.side===side&&sm>g.s0-1&&sm<g.s1+1);
    barrier(hwy,HWY.hw+HWY.barrier/2,0,hwy.len,1.1,sm=>inGap(sm,1));
    barrier(hwy,-HWY.hw-HWY.barrier/2,0,hwy.len,1.1,sm=>inGap(sm,-1));
    barrier(hwy,0,0,hwy.len,.9);
    for(const r of M.ramps){
      /* the outer barrier all along where the ramp is up; the inner one once it has left the deck */
      /* exits and entrances sit to the right of the traffic on them, so a ramp's outer edge is its own right side */
      const sideOut=-1,dOut=sideOut*(r.hw+HWY.barrier/2),dIn=-dOut;
      const [a0,a1]=r.attach,sAtt0=a0*r.len,sAtt1=a1*r.len;
      const up=sm=>r.yAt(sm)<.35;
      barrier(r,dOut,0,r.len,1.0,up);
      barrier(r,dIn,0,r.len,1.0,sm=>up(sm)||(sm>sAtt0-2&&sm<sAtt1+2));
      /* low parts of a ramp sit on a solid embankment: walls on both sides from the ground up */
      for(let s=0;s<r.len-.01;s+=4){const sm=s+2,h=r.yAt(sm);if(h<.3||h>4.3)continue;const th=r.headAt(sm);
        for(const d of [r.hw+.2,-r.hw-.2]){if(sm>sAtt0-2&&sm<sAtt1+2&&Math.sign(d)===-sideOut)continue;const p=r.pos(sm,d);this.addBox(p[0],-p[2],[Math.cos(th),Math.sin(th)],2.05,.3,-1,h,'embankment');}}
      /* pillars where it is high */
      for(let s=12;s<r.len;s+=24){const h=r.yAt(s);if(h<4.6)continue;if(s>sAtt0-6&&s<sAtt1+6)continue;const p=r.pos(s,0);this.addCircle(p[0],-p[2],.55,-1,h-.9,'pillar');}
    }
    /* the deck's own columns stand in the boulevard's median, clear of the junctions */
    const ringNodes=M.nodes.filter(n=>n.ring);this.deckPillars=[];
    for(let s=8;s<hwy.len;s+=32){const p=hwy.pos(s,0),mx=p[0],my=-p[2];if(ringNodes.some(n=>Math.hypot(n.x-mx,n.y-my)<24))continue;
      this.addCircle(mx,my,1.0,-1,DECK_H-1.1,'pillar');this.deckPillars.push({s,x:mx,y:my});}
  }
  /* ---------- queries ---------- */
  locate(){return null;}
  /* the surface under (x, z), the highest one not more than half a metre above yRef */
  ground(x,z,hint=-1,yRef){
    const mx=x,my=-z;
    /* out on the flats: the lakebed and its jumps, one height field */
    if(onFlats(mx,my)){const y=flatsHeight(mx,my);let n=UP;
      if(y>FLATS.y+1e-4){const e=.2,gx=(flatsHeight(mx+e,my)-flatsHeight(mx-e,my))/(2*e),gy=(flatsHeight(mx,my+e)-flatsHeight(mx,my-e))/(2*e),l=Math.hypot(gx,1,gy);n=[-gx/l,1/l,gy/l];}
      return {y,n,surf:'road',i:-1};}let y=baseGround(this.M,mx,my),n=UP,surf=y>.1?'walk':'road',ri=-1;
    const list=this.rcell.get(Math.floor(mx/CELL)+','+Math.floor(my/CELL));
    if(list)for(const k of list){const R=this.ribbons[k];const L=R.locate(x,z,this.hints[k]);if(!L)continue;this.hints[k]=L.i;
      if(L.s<0||L.s>R.len||Math.abs(L.d)>R.hw+.6)continue;
      const h=R.yAt(L.s);if(yRef!==undefined&&h>yRef+.5)continue;
      if(h>y){y=h;n=R.frame(L.s).u;surf='road';ri=k;}}
    return {y,n,surf,i:ri};
  }
  raycast(o,dir,maxT){
    let t=0,g=null;
    for(let k=0;k<4;k++){const x=o[0]+dir[0]*t,z=o[2]+dir[2]*t;g=this.ground(x,z,-1,o[1]+dir[1]*t+.05);
      const den=dir[0]*g.n[0]+dir[1]*g.n[1]+dir[2]*g.n[2];if(den>-1e-4)return null;
      const nt=((x-o[0])*g.n[0]+(g.y-o[1])*g.n[1]+(z-o[2])*g.n[2])/den;if(Math.abs(nt-t)<1e-4){t=nt;break;}t=nt;}
    if(t<0||t>maxT)return null;
    return {t,p:[o[0]+dir[0]*t,o[1]+dir[1]*t,o[2]+dir[2]*t],n:g.n,surf:g.surf,i:g.i};
  }
  /* the deepest wall a point is inside, and the way out */
  wall(P){
    const mx=P[0],my=-P[2],list=this.wcell.get(Math.floor(mx/CELL)+','+Math.floor(my/CELL));if(!list)return null;
    let best=null;
    for(const w of list){if(P[1]<w.y0||P[1]>w.y1)continue;
      const dx=mx-w.cx,dy=my-w.cy;
      if(w.t===1){const d=Math.hypot(dx,dy);if(d>=w.r)continue;const pen=w.r-d;if(!best||pen>best.pen){const nx=d>1e-6?dx/d:1,ny=d>1e-6?dy/d:0;best={pen,n:[nx,0,-ny],kind:w.kind};}continue;}
      const lx=dx*w.ax+dy*w.ay,ly=-dx*w.ay+dy*w.ax;const px=w.hx-Math.abs(lx),py=w.hy-Math.abs(ly);if(px<=0||py<=0)continue;
      let pen,nx,ny;if(px<py){pen=px;const s=Math.sign(lx)||1;nx=w.ax*s;ny=w.ay*s;}else{pen=py;const s=Math.sign(ly)||1;nx=-w.ay*s;ny=w.ax*s;}
      if(!best||pen>best.pen)best={pen,n:[nx,0,-ny],kind:w.kind};}
    return best;
  }
}
