/* =====================================================================================
   GHOSTS — a lap recorded as poses at 20 Hz (position, orientation, steering, wheel spin),
   played back as a see-through car that drives your best line beside you. Stored compactly
   (Float32 in base64) so a career's worth fits in the browser.
   ===================================================================================== */
const HZ=20,STRIDE=9;   /* p(3) q(4) steer spin */

export class GhostRecorder{
  constructor(){this.data=[];this.t=0;this.next=0;}
  reset(){this.data=[];this.t=0;this.next=0;}
  /* call every frame with the time since the lap started */
  add(t,car){const w=car.wheels[0];
    /* on a fixed 20 Hz grid, so playback runs at the speed it was driven */
    while(t>=this.next){this.next+=1/HZ;this.data.push(car.p[0],car.p[1],car.p[2],car.q[0],car.q[1],car.q[2],car.q[3],car.steer||0,w?w.ang:0);}}
  take(time){return {time,hz:HZ,data:Float32Array.from(this.data)};}
}
/* a recorded lap you can ask "where were you at time t" */
export class Ghost{
  constructor(g){this.g=g;this.n=Math.floor(g.data.length/STRIDE);this.view=null;}
  get time(){return this.g.time;}
  pose(t){const d=this.g.data,f=Math.max(0,Math.min(this.n-1.001,t*this.g.hz)),i=Math.floor(f),a=f-i,o=i*STRIDE,o2=o+STRIDE;
    const L=(k)=>d[o+k]+(d[o2+k]-d[o+k])*a;
    let q=[d[o+3],d[o+4],d[o+5],d[o+6]],q2=[d[o2+3],d[o2+4],d[o2+5],d[o2+6]];if(q[0]*q2[0]+q[1]*q2[1]+q[2]*q2[2]+q[3]*q2[3]<0)q2=q2.map(v=>-v);
    const qq=q.map((v,k)=>v+(q2[k]-v)*a),l=Math.hypot(...qq)||1;
    return {p:[L(0),L(1),L(2)],q:qq.map(v=>v/l),steer:L(7),spin:L(8)};}
  /* the renderer's car view for time t */
  viewAt(t,layout,paint){const P=this.pose(t);let v=this.view;
    if(!v)v=this.view={id:777,design:'sl3',ghost:1,paint,lamps:[0,0,0,0],driver:false,wheels:layout.map(w=>({hp:w.hp,len:w.len,steer:0,ang:0,disc:0}))};
    v.p=P.p;v.q=P.q;v.wheels.forEach((w,i)=>{w.steer=layout[i].front?P.steer:0;w.ang=P.spin;});return v;}
}
export function encodeGhost(g){const b=new Uint8Array(g.data.buffer,g.data.byteOffset,g.data.byteLength);let s='';for(let i=0;i<b.length;i+=8192)s+=String.fromCharCode.apply(null,b.subarray(i,i+8192));
  return {time:g.time,hz:g.hz,b64:btoa(s)};}
export function decodeGhost(o){if(!o||!o.b64)return null;const s=atob(o.b64),b=new Uint8Array(s.length);for(let i=0;i<s.length;i++)b[i]=s.charCodeAt(i);return {time:o.time,hz:o.hz,data:new Float32Array(b.buffer)};}
