/* =====================================================================================
   TOUCH — on-screen controls for phones and tablets, multi-touch.
     left thumb:  steer. "Slide": put a thumb down anywhere on the left half and slide it
                  sideways (the anchor follows if you go past full lock, so reversing is instant).
                  "Buttons": two big pads, steering ramps like the keyboard. "Tilt": turn the
                  phone like a wheel (the gravity direction in the screen plane).
     right thumb: gas, brake (and reverse), handbrake, nitrous; slide between pedals without
                  lifting. Shift paddles appear with the manual gearbox.
     top right:   camera, reset, pause.
   Every pad is a positioned element; the overlay hit-tests them itself so a finger that
   started on one pedal can roll onto another.
   ===================================================================================== */
const HELD=new Set(['thr','brk','hb','nos','left','right']),PEDALS=['thr','brk','hb','nos'];
const PADS=[['pause','II','tb'],['cam','CAM','tb'],['reset','RESET','tb'],
  ['thr','GAS','pd'],['brk','BRAKE','pd'],['hb','HAND','pd'],['nos','N2O','pd'],['up','+','pd sh'],['down','−','pd sh'],
  ['left','◀','st'],['right','▶','st']];

export class TouchControls{
  constructor(root){
    this.root=root;this.visible=false;this.ptr=new Map();this.taps=new Set();this.cfg={nos:false,manual:false,steer:'slide'};
    this.steerV=0;this.steerOn=false;this.tilt={on:false,roll:0,ok:false};this.used=false;
    root.innerHTML=PADS.map(([k,l,c])=>`<div class="b ${c} k-${k}" data-k="${k}"><span>${l}</span></div>`).join('')+
      '<div class="knob" hidden><i></i></div><div class="shint">SLIDE TO STEER</div>';
    this.el={};for(const d of root.querySelectorAll('[data-k]'))this.el[d.dataset.k]=d;
    this.knob=root.querySelector('.knob');this.nub=this.knob.querySelector('i');this.hintEl=root.querySelector('.shint');
    const opt={passive:false};
    root.addEventListener('pointerdown',e=>this.down(e),opt);
    root.addEventListener('pointermove',e=>this.move(e),opt);
    for(const t of ['pointerup','pointercancel','lostpointercapture'])root.addEventListener(t,e=>this.up(e),opt);
    root.addEventListener('contextmenu',e=>e.preventDefault());
    addEventListener('resize',()=>{this.rects=null;});
  }
  /* what to show: nitrous only if the car has it, the paddles only with the manual gearbox */
  configure(c){Object.assign(this.cfg,c);
    this.el.nos.hidden=!this.cfg.nos;this.el.up.hidden=this.el.down.hidden=!this.cfg.manual;
    const btn=this.cfg.steer==='buttons';this.el.left.hidden=this.el.right.hidden=!btn;
    this.hintEl.hidden=!this.slides();
    this.root.dataset.steer=this.cfg.steer;this.root.classList.toggle('manual',this.cfg.manual);this.rects=null;}
  show(on){if(on===this.visible)return;this.visible=on;this.root.hidden=!on;if(!on)this.release();this.rects=null;}
  release(){for(const id of this.ptr.keys()){try{this.root.releasePointerCapture(id);}catch(e){}}this.ptr.clear();this.steerOn=false;this.knob.hidden=true;this.paint();}
  /* pad rectangles, measured when the layout may have changed */
  layout(){if(this.rects)return this.rects;this.rects=[];
    for(const [k] of PADS){const d=this.el[k];if(d.hidden)continue;const r=d.getBoundingClientRect();if(r.width>0)this.rects.push({k,r});}
    return this.rects;}
  hit(x,y,keys,m=0){let best=null,bd=1e9;
    for(const {k,r} of this.layout()){if(keys&&!keys.includes(k))continue;
      const dx=Math.max(r.left-x,0,x-r.right),dy=Math.max(r.top-y,0,y-r.bottom),d=Math.hypot(dx,dy);if(d<=m&&d<bd){bd=d;best=k;}}
    return best;}
  steerRange(){return Math.max(44,Math.min(80,innerWidth*.075));}
  /* slide steering, also while tilt has no sensor data (some embedded pages never get motion events) */
  slides(){return this.cfg.steer==='slide'||this.cfg.steer==='tilt'&&!this.tilt.ok;}
  down(e){e.preventDefault();this.used=true;
    try{this.root.setPointerCapture(e.pointerId);}catch(err){}
    const x=e.clientX,y=e.clientY,k=this.hit(x,y,null,6);
    if(k){const P={role:'pad',k};this.ptr.set(e.pointerId,P);if(!HELD.has(k))this.taps.add(k);if(navigator.vibrate&&!HELD.has(k))try{navigator.vibrate(8);}catch(err){}}
    else if(this.slides()&&x<innerWidth*.55){
      /* one steering thumb at a time: a second one takes over */
      for(const [id,p] of this.ptr)if(p.role==='steer')this.ptr.delete(id);
      this.ptr.set(e.pointerId,{role:'steer',x0:x,y0:y,x});this.steerOn=true;this.hintEl.classList.add('gone');
      this.knob.hidden=false;this.knob.style.transform=`translate(${x}px,${y}px)`;}
    else this.ptr.set(e.pointerId,{role:'none'});
    this.paint();}
  move(e){const P=this.ptr.get(e.pointerId);if(!P)return;e.preventDefault();const x=e.clientX,y=e.clientY;
    if(P.role==='steer'){const R=this.steerRange();let dx=x-P.x0;if(Math.abs(dx)>R){P.x0=x-Math.sign(dx)*R;dx=Math.sign(dx)*R;this.knob.style.transform=`translate(${P.x0}px,${P.y0}px)`;}P.x=x;
      this.nub.style.transform=`translateX(${dx}px)`;}
    else if(P.role==='pad'&&PEDALS.includes(P.k)){const k=this.hit(x,y,PEDALS,22);if(k&&k!==P.k){P.k=k;this.paint();}}
    else if(P.role==='pad'&&(P.k==='left'||P.k==='right')){const k=this.hit(x,y,['left','right'],30);if(k&&k!==P.k){P.k=k;this.paint();}}}
  up(e){const P=this.ptr.get(e.pointerId);if(!P)return;this.ptr.delete(e.pointerId);
    if(P.role==='steer'){this.steerOn=[...this.ptr.values()].some(p=>p.role==='steer');if(!this.steerOn){this.knob.hidden=true;this.nub.style.transform='';}}
    this.paint();}
  held(k){for(const p of this.ptr.values())if(p.role==='pad'&&p.k===k)return true;return false;}
  paint(){for(const k of HELD)this.el[k].classList.toggle('on',this.held(k));}
  /* ---- tilt: needs a tap to ask permission on iOS ---- */
  async enableTilt(){
    if(this.tilt.listening)return true;
    try{if(typeof DeviceMotionEvent!=='undefined'&&DeviceMotionEvent.requestPermission){const r=await DeviceMotionEvent.requestPermission();if(r!=='granted')return false;}}catch(e){return false;}
    this.tilt.listening=true;
    addEventListener('devicemotion',e=>{const g=e.accelerationIncludingGravity;if(!g||g.x===null)return;
      const ang=(screen.orientation&&typeof screen.orientation.angle==='number')?screen.orientation.angle:(typeof window.orientation==='number'?window.orientation:0);
      /* gravity in the screen's plane: right and down, from the device's portrait axes */
      const ux=-g.x,uy=-g.y;let r,d;const a=((ang%360)+360)%360;
      if(a===90){r=uy;d=ux;}else if(a===270){r=-uy;d=-ux;}else if(a===180){r=-ux;d=uy;}else{r=ux;d=-uy;}
      if(Math.hypot(r,d)<1.5)return;   /* lying nearly flat: the wheel angle is undefined, hold the last one */
      let roll=Math.atan2(r,d);if(roll>Math.PI/2)roll-=Math.PI;else if(roll<-Math.PI/2)roll+=Math.PI;
      this.tilt.roll+=(roll-this.tilt.roll)*.35;this.tilt.ok=true;});
    return true;}
  /* ---- read for this frame ---- */
  poll(){
    const out={active:this.visible,steer:null,thr:this.held('thr'),brk:this.held('brk'),hb:this.held('hb'),nos:this.held('nos'),left:this.held('left'),right:this.held('right'),
      up:this.taps.has('up'),down:this.taps.has('down'),cam:this.taps.has('cam'),reset:this.taps.has('reset'),pause:this.taps.has('pause')};
    this.taps.clear();
    if(!this.visible)return out;
    if(this.slides()&&this.steerOn){const R=this.steerRange();let t=0;for(const p of this.ptr.values())if(p.role==='steer')t=Math.max(-1,Math.min(1,(p.x-p.x0)/R));
      out.steer=Math.sign(t)*Math.pow(Math.abs(t),1.25);}
    else if(this.cfg.steer==='tilt'&&this.tilt.ok){const deg=this.tilt.roll*57.3,dz=2,full=26;const v=Math.abs(deg)<dz?0:(deg-Math.sign(deg)*dz)/(full-dz);
      out.steer=Math.max(-1,Math.min(1,v));}
    return out;
  }
}
