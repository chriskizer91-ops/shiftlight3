/* =====================================================================================
   MESH BUILDER — procedural geometry on the CPU.
   One vertex format for everything (36 bytes):
     pos   3 x f32      world or model metres
     nrm   3 x i16n     (+2 bytes pad)
     uv    2 x f32      material coordinates, usually metres (road: s,d; facade: u,v)
     mat   4 x u8 int   material id and three parameters
     col   4 x u8n      colour, alpha often carries baked occlusion
   A Chunked builder sorts triangles into ground-plane tiles so whole tiles can be culled.
   ===================================================================================== */
export const STRIDE=36;
export const LAYOUT=[
  {name:'aPos',loc:0,size:3,type:'f32',offset:0},
  {name:'aNrm',loc:1,size:3,type:'i16n',offset:12},
  {name:'aUV',loc:2,size:2,type:'f32',offset:20},
  {name:'aMat',loc:3,size:4,type:'u8i',offset:28},
  {name:'aCol',loc:4,size:4,type:'u8n',offset:32}
];

export class MeshBuilder{
  constructor(cap=4096){this.buf=new ArrayBuffer(cap*STRIDE);this.f=new Float32Array(this.buf);this.s=new Int16Array(this.buf);this.b=new Uint8Array(this.buf);
    this.nv=0;this.idx=[];this.m=[0,0,0,0];this.c=[255,255,255,255];this.mn=[1e9,1e9,1e9];this.mx=[-1e9,-1e9,-1e9];}
  grow(){const nb=new ArrayBuffer(this.buf.byteLength*2);new Uint8Array(nb).set(this.b);this.buf=nb;this.f=new Float32Array(nb);this.s=new Int16Array(nb);this.b=new Uint8Array(nb);}
  mat(id,p1=0,p2=0,p3=0){this.m=[id,p1|0,p2|0,p3|0];return this;}
  col(r,g,b,a=255){this.c=[r|0,g|0,b|0,a|0];return this;}
  /* add a vertex; returns its index */
  v(p,n,u=0,w=0,ao){
    if((this.nv+1)*STRIDE>this.buf.byteLength)this.grow();
    const o=this.nv*9,os=this.nv*18,ob=this.nv*STRIDE;
    this.f[o]=p[0];this.f[o+1]=p[1];this.f[o+2]=p[2];
    const nl=Math.hypot(n[0],n[1],n[2])||1;
    this.s[os+6]=Math.round(n[0]/nl*32767);this.s[os+7]=Math.round(n[1]/nl*32767);this.s[os+8]=Math.round(n[2]/nl*32767);this.s[os+9]=0;
    this.f[o+5]=u;this.f[o+6]=w;
    const m=this.m,c=this.c;this.b[ob+28]=m[0];this.b[ob+29]=m[1];this.b[ob+30]=m[2];this.b[ob+31]=m[3];
    this.b[ob+32]=c[0];this.b[ob+33]=c[1];this.b[ob+34]=c[2];this.b[ob+35]=ao===undefined?c[3]:Math.round(ao*255);
    for(let k=0;k<3;k++){if(p[k]<this.mn[k])this.mn[k]=p[k];if(p[k]>this.mx[k])this.mx[k]=p[k];}
    return this.nv++;
  }
  tri(a,b,c){this.idx.push(a,b,c);}
  quad(a,b,c,d){this.idx.push(a,b,c,a,c,d);}
  /* a flat quad from four corners (counter-clockwise seen from the front) with uv corners */
  quadP(p0,p1,p2,p3,uv=[[0,0],[1,0],[1,1],[0,1]],n){
    if(!n){const e1=sub(p1,p0),e2=sub(p3,p0);n=cross(e1,e2);}
    const a=this.v(p0,n,uv[0][0],uv[0][1]),b=this.v(p1,n,uv[1][0],uv[1][1]),c=this.v(p2,n,uv[2][0],uv[2][1]),d=this.v(p3,n,uv[3][0],uv[3][1]);
    this.quad(a,b,c,d);
  }
  /* an oriented box: centre c, unit axes ax/ay/az, half sizes h; uv in metres per face. faces: bitmask skip */
  box(c,ax,ay,az,h,skip=0,uvMode=0){
    /* the faces assume a right-handed basis; mirror the third axis if it isn't (the box is symmetric) */
    if(dot(cross(ax,ay),az)<0){az=neg(az);if(skip&48)skip=(skip&~48)|((skip&16)?32:0)|((skip&32)?16:0);}
    const P=(sx,sy,sz)=>[c[0]+ax[0]*h[0]*sx+ay[0]*h[1]*sy+az[0]*h[2]*sz,c[1]+ax[1]*h[0]*sx+ay[1]*h[1]*sy+az[1]*h[2]*sz,c[2]+ax[2]*h[0]*sx+ay[2]*h[1]*sy+az[2]*h[2]*sz];
    const F=[
      [ax,[ 1,-1, 1],[ 1,-1,-1],[ 1, 1,-1],[ 1, 1, 1],h[2],h[1]],
      [neg(ax),[-1,-1,-1],[-1,-1, 1],[-1, 1, 1],[-1, 1,-1],h[2],h[1]],
      [ay,[-1, 1, 1],[ 1, 1, 1],[ 1, 1,-1],[-1, 1,-1],h[0],h[2]],
      [neg(ay),[-1,-1,-1],[ 1,-1,-1],[ 1,-1, 1],[-1,-1, 1],h[0],h[2]],
      [az,[-1,-1, 1],[ 1,-1, 1],[ 1, 1, 1],[-1, 1, 1],h[0],h[1]],
      [neg(az),[ 1,-1,-1],[-1,-1,-1],[-1, 1,-1],[ 1, 1,-1],h[0],h[1]]];
    F.forEach((f,i)=>{if(skip&(1<<i))return;const [n,a,b,cc,d,su,sv]=f;
      this.quadP(P(...a),P(...b),P(...cc),P(...d),[[0,0],[2*su,0],[2*su,2*sv],[0,2*sv]],n);});
  }
  /* a tube between two points: radius r, n sides, optional end caps */
  tube(a,b,r,n=6,caps=true,r2=r){
    const d=sub(b,a),L=Math.hypot(...d);if(L<1e-5)return;const t=d.map(x=>x/L);
    const ref=Math.abs(t[1])<.9?[0,1,0]:[1,0,0],u=norm(cross(t,ref)),w=cross(t,u);
    const ring=[];
    for(let i=0;i<=n;i++){const ang=i/n*Math.PI*2,cs=Math.cos(ang),sn=Math.sin(ang),nn=[u[0]*cs+w[0]*sn,u[1]*cs+w[1]*sn,u[2]*cs+w[2]*sn];
      ring.push([this.v([a[0]+nn[0]*r,a[1]+nn[1]*r,a[2]+nn[2]*r],nn,i/n,0),this.v([b[0]+nn[0]*r2,b[1]+nn[1]*r2,b[2]+nn[2]*r2],nn,i/n,L)]);}
    for(let i=0;i<n;i++)this.quad(ring[i][0],ring[i+1][0],ring[i+1][1],ring[i][1]);
    if(caps){const ca=this.v(a,neg(t),0,0),cb=this.v(b,t,0,L);
      for(let i=0;i<n;i++){const ang0=i/n*Math.PI*2,ang1=(i+1)/n*Math.PI*2;
        const p=(ang,rr,o)=>[o[0]+(u[0]*Math.cos(ang)+w[0]*Math.sin(ang))*rr,o[1]+(u[1]*Math.cos(ang)+w[1]*Math.sin(ang))*rr,o[2]+(u[2]*Math.cos(ang)+w[2]*Math.sin(ang))*rr];
        const a0=this.v(p(ang0,r,a),neg(t)),a1=this.v(p(ang1,r,a),neg(t));this.tri(ca,a1,a0);
        const b0=this.v(p(ang0,r2,b),t),b1=this.v(p(ang1,r2,b),t);this.tri(cb,b0,b1);}}
  }
  /* a small sphere (for neon tube joints and lamp bulbs) */
  sphere(c,r,seg=6,rings=4){
    const ix=[];for(let j=0;j<=rings;j++){const ph=j/rings*Math.PI,row=[];for(let i=0;i<=seg;i++){const th=i/seg*Math.PI*2,n=[Math.sin(ph)*Math.cos(th),Math.cos(ph),Math.sin(ph)*Math.sin(th)];
      row.push(this.v([c[0]+n[0]*r,c[1]+n[1]*r,c[2]+n[2]*r],n,i/seg,j/rings));}ix.push(row);}
    for(let j=0;j<rings;j++)for(let i=0;i<seg;i++)this.quad(ix[j][i],ix[j][i+1],ix[j+1][i+1],ix[j+1][i]);
  }
  /* append another builder's geometry */
  append(B){const base=this.nv;while((this.nv+B.nv)*STRIDE>this.buf.byteLength)this.grow();
    this.b.set(B.b.subarray(0,B.nv*STRIDE),this.nv*STRIDE);this.nv+=B.nv;for(const i of B.idx)this.idx.push(i+base);
    for(let k=0;k<3;k++){this.mn[k]=Math.min(this.mn[k],B.mn[k]);this.mx[k]=Math.max(this.mx[k],B.mx[k]);}}
  vertexData(){return new Uint8Array(this.buf,0,this.nv*STRIDE);}
  indexData(){return this.nv>65535?new Uint32Array(this.idx):new Uint16Array(this.idx);}
  /* transform all vertices by a 3x3 (row-major, columns = axes) and offset */
  transform(R,t){for(let i=0;i<this.nv;i++){const o=i*9,os=i*18,x=this.f[o],y=this.f[o+1],z=this.f[o+2];
      this.f[o]=R[0]*x+R[1]*y+R[2]*z+t[0];this.f[o+1]=R[3]*x+R[4]*y+R[5]*z+t[1];this.f[o+2]=R[6]*x+R[7]*y+R[8]*z+t[2];
      const nx=this.s[os+6],ny=this.s[os+7],nz=this.s[os+8];
      this.s[os+6]=Math.round(R[0]*nx+R[1]*ny+R[2]*nz);this.s[os+7]=Math.round(R[3]*nx+R[4]*ny+R[5]*nz);this.s[os+8]=Math.round(R[6]*nx+R[7]*ny+R[8]*nz);}
    this.mn=[1e9,1e9,1e9];this.mx=[-1e9,-1e9,-1e9];for(let i=0;i<this.nv;i++)for(let k=0;k<3;k++){const v=this.f[i*9+k];this.mn[k]=Math.min(this.mn[k],v);this.mx[k]=Math.max(this.mx[k],v);}}
}

/* geometry sorted into square tiles on the ground; each tile becomes one draw range */
export class Chunked{
  constructor(size=64){this.size=size;this.tiles=new Map();this.cur=null;this.m=[0,0,0,0];this.c=[255,255,255,255];}
  /* pick the tile for geometry centred at (x, z); returns that tile's builder with the current material */
  at(x,z){const k=Math.floor(x/this.size)+','+Math.floor(z/this.size);let B=this.tiles.get(k);if(!B){B=new MeshBuilder(2048);this.tiles.set(k,B);}
    B.m=this.m.slice();B.c=this.c.slice();return B;}
  mat(id,p1=0,p2=0,p3=0){this.m=[id,p1|0,p2|0,p3|0];return this;}
  col(r,g,b,a=255){this.c=[r|0,g|0,b|0,a|0];return this;}
  /* pack every tile into one vertex/index buffer with per-tile ranges and bounds */
  pack(){
    const tiles=[...this.tiles.values()].filter(B=>B.idx.length);let nv=0,ni=0;for(const B of tiles){nv+=B.nv;ni+=B.idx.length;}
    const vb=new Uint8Array(nv*STRIDE),ib=new Uint32Array(ni),ranges=[];let ov=0,oi=0;
    for(const B of tiles){vb.set(B.vertexData(),ov*STRIDE);for(let i=0;i<B.idx.length;i++)ib[oi+i]=B.idx[i]+ov;
      ranges.push({first:oi,count:B.idx.length,mn:B.mn.slice(),mx:B.mx.slice()});ov+=B.nv;oi+=B.idx.length;}
    return {vb,ib,ranges,nv,ni};
  }
}

export const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
export const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
export const scl=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
export const neg=a=>[-a[0],-a[1],-a[2]];
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export const norm=a=>{const l=Math.hypot(a[0],a[1],a[2])||1;return [a[0]/l,a[1]/l,a[2]/l];};
export const mixv=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
/* a small deterministic random generator so the city is the same every time */
export function rng(seed=1){let s=seed>>>0||1;return ()=>{s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;return s/4294967296;};}
