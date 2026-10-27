/* =====================================================================================
   LIGHT GRID — the city's static lights binned into 8 m cells on the ground plane.
   A fragment looks up its cell and loops over that cell's list only. Lights are records of
   four RGBA32F texels: [pos, radius] [colour, type+8*flicker] [dir or half-axis, cos outer]
   [cos inner, source radius, 0, 0]. Each cell keeps its strongest lights first.
   ===================================================================================== */
export class LightGrid{
  constructor(G,lights,{x0=-340,z0=-600,size=860,cell=8,maxPer=28}={}){
    const gl=G.gl;this.G=G;this.n=lights.length;
    const gw=Math.ceil(size/cell);this.params=[x0,z0,1/cell,gw];
    /* records */
    const rows=Math.max(1,Math.ceil(lights.length*4/1024)),rec=new Float32Array(1024*rows*4);
    lights.forEach((L,i)=>{const o=i*16;
      rec.set([L.pos[0],L.pos[1],L.pos[2],L.r],o);
      rec.set([L.col[0],L.col[1],L.col[2],L.type+8*(L.flick||0)],o+4);
      const v=L.type===2?L.axis:L.dir;rec.set([v[0],v[1],v[2],L.cosO],o+8);
      rec.set([L.cosI,L.src||.05,0,0],o+12);});
    this.tex=G.texture(1024,rows,'rgba32f',{filter:'nearest',data:rec});
    /* bin */
    const cells=Array.from({length:gw*gw},()=>[]);
    lights.forEach((L,i)=>{
      const ext=L.type===2?Math.hypot(L.axis[0],L.axis[2]):0,r=L.r+ext;
      const i0=Math.max(0,Math.floor((L.pos[0]-r-x0)/cell)),i1=Math.min(gw-1,Math.floor((L.pos[0]+r-x0)/cell));
      const j0=Math.max(0,Math.floor((L.pos[2]-r-z0)/cell)),j1=Math.min(gw-1,Math.floor((L.pos[2]+r-z0)/cell));
      const I=Math.max(L.col[0],L.col[1],L.col[2]);
      for(let j=j0;j<=j1;j++)for(let k=i0;k<=i1;k++){
        const cx=x0+(k+.5)*cell,cz=z0+(j+.5)*cell;
        const dx=Math.max(0,Math.abs(cx-L.pos[0])-cell/2-ext),dz=Math.max(0,Math.abs(cz-L.pos[2])-cell/2-ext);
        const d2=dx*dx+dz*dz;if(d2>L.r*L.r)continue;
        cells[j*gw+k].push([i,I/(d2+4)]);}
    });
    let total=0,maxN=0;for(const c of cells){c.sort((a,b)=>b[1]-a[1]);if(c.length>maxPer)c.length=maxPer;total+=c.length;maxN=Math.max(maxN,c.length);}
    const lrows=Math.max(1,Math.ceil(total/1024)),list=new Uint32Array(1024*lrows),grid=new Uint32Array(gw*gw*2);
    let o=0;cells.forEach((c,ci)=>{grid[ci*2]=o;grid[ci*2+1]=c.length;for(const [i] of c)list[o++]=i;});
    this.grid=G.texture(gw,gw,'rg32ui',{filter:'nearest',data:grid});
    this.list=G.texture(1024,lrows,'r32ui',{filter:'nearest',data:list});
    this.stats={lights:lights.length,entries:total,maxPerCell:maxN,avg:total/cells.filter(c=>c.length).length};
  }
  bindings(){return {uLights:this.tex,uLGrid:this.grid,uLList:this.list};}
}
