/* =====================================================================================
   INPUT — keyboard and gamepad, merged into one set of driving controls.
   Keyboard steering ramps like a hand on a wheel (and springs back faster than it turns in);
   triggers and sticks are read as they are, with a small dead zone. On-screen touch controls
   (src/ui/touch.js) feed in here too: their pedals and steer pads ramp like keys, a sliding
   thumb or a tilted phone steers directly.
   ===================================================================================== */
const KEYS={
  thr:['ArrowUp','KeyW'],brk:['ArrowDown','KeyS'],left:['ArrowLeft','KeyA'],right:['ArrowRight','KeyD'],
  hb:['Space'],nos:['ShiftLeft','ShiftRight','KeyN'],up:['KeyE','KeyX'],down:['KeyQ','KeyZ'],
  cam:['KeyC'],reset:['KeyR'],pause:[],led:['KeyL'],high:['KeyH'],look:['KeyB'],env:['KeyT'],hud:['KeyU'],perf:['KeyP']
};
export class Input{
  constructor(target=window,touch=null){
    this.touch=touch;this.down=new Set();this.pressed=new Set();this.steer=0;this.thr=0;this.brk=0;this.pad=null;this.usingPad=false;
    target.addEventListener('keydown',e=>{if(e.repeat)return;this.down.add(e.code);this.pressed.add(e.code);if(e.code.startsWith('Arrow')||e.code==='Space')e.preventDefault();this.usingPad=false;});
    target.addEventListener('keyup',e=>{this.down.delete(e.code);});
    target.addEventListener('blur',()=>this.down.clear());
  }
  key(k){return KEYS[k].some(c=>this.down.has(c));}
  /* true once per press */
  hit(k){let h=false;for(const c of KEYS[k])if(this.pressed.has(c))h=true;return h;}
  /* read everything for this frame */
  poll(dt){
    const pads=navigator.getGamepads?navigator.getGamepads():[];let gp=null;for(const p of pads)if(p&&p.connected){gp=p;break;}
    const out={steer:0,thr:0,brk:0,hb:0,nos:false,up:false,down:false,cam:false,reset:false,pause:false,led:false,high:false,look:false,env:false,hud:false,perf:false};
    /* keyboard */
    const T=this.touch?this.touch.poll():null;
    const kl=this.key('left')||T&&T.left,kr=this.key('right')||T&&T.right,tgt=(kr?1:0)-(kl?1:0);
    if(T&&T.steer!==null){/* a thumb or the tilt steers directly, lightly smoothed */this.steer+=(T.steer-this.steer)*Math.min(1,dt*28);}
    else{const rate=tgt===0?6.5:(Math.sign(tgt)!==Math.sign(this.steer)&&this.steer!==0?9:3.2);
      this.steer+=Math.max(-rate*dt,Math.min(rate*dt,tgt-this.steer));}
    const kt=this.key('thr')||T&&T.thr?1:0,kb=this.key('brk')||T&&T.brk?1:0;
    this.thr+=Math.max(-8*dt,Math.min(6*dt,kt-this.thr));this.brk+=Math.max(-10*dt,Math.min(8*dt,kb-this.brk));
    out.steer=this.steer;out.thr=this.thr;out.brk=this.brk;out.hb=this.key('hb')||T&&T.hb?1:0;out.nos=this.key('nos')||!!(T&&T.nos);
    for(const k of ['up','down','cam','reset','pause','led','high','look','env','hud','perf'])out[k]=this.hit(k)||!!(T&&T[k]);
    if(this.key('look'))out.look=true;
    /* gamepad (standard mapping): left stick steers, triggers drive, A handbrake, B/X shifts */
    if(gp){
      const dz=(v,d=.08)=>Math.abs(v)<d?0:(v-Math.sign(v)*d)/(1-d);
      const sx=dz(gp.axes[0]||0),rt=gp.buttons[7]?gp.buttons[7].value:0,lt=gp.buttons[6]?gp.buttons[6].value:0;
      const any=Math.abs(sx)>0||rt>.02||lt>.02||gp.buttons.some(b=>b.pressed);
      if(any)this.usingPad=true;
      if(this.usingPad){out.steer=Math.sign(sx)*Math.pow(Math.abs(sx),1.35);out.thr=rt;out.brk=lt;out.hb=gp.buttons[0]&&gp.buttons[0].pressed?1:out.hb;
        out.nos=out.nos||!!(gp.buttons[5]&&gp.buttons[5].pressed);}
      const prev=this.padPrev||[];const press=i=>gp.buttons[i]&&gp.buttons[i].pressed&&!prev[i];
      /* menu navigation: d-pad or stick, A to choose, B to back out (with key-repeat on hold) */
      const now=performance.now(),ay=gp.axes[1]||0,ax0=gp.axes[0]||0;
      const dir=gp.buttons[12]&&gp.buttons[12].pressed||ay<-.6?'up':gp.buttons[13]&&gp.buttons[13].pressed||ay>.6?'down':gp.buttons[14]&&gp.buttons[14].pressed||ax0<-.6?'left':gp.buttons[15]&&gp.buttons[15].pressed||ax0>.6?'right':null;
      out.nav=[];if(dir){if(dir!==this.navDir||now>this.navT){out.nav.push(dir);this.navT=now+(dir!==this.navDir?380:110);}}this.navDir=dir;
      if(press(0))out.nav.push('enter');if(press(1))out.nav.push('back');
      if(press(1))out.up=true;if(press(2))out.down=true;if(press(3))out.cam=true;if(press(9))out.pause=true;if(press(8))out.reset=true;if(press(4))out.look=true;
      this.padPrev=gp.buttons.map(b=>b.pressed);
    }
    this.pressed.clear();
    return out;
  }
}
