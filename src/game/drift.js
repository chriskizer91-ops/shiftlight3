/* =====================================================================================
   DRIFT — scoring a slide.
   You're drifting when the car's slip angle is past ten degrees at speed with the wheels on
   the road. Points flow at a rate set by speed and angle; holding a drift raises the
   multiplier, a clean switch from one direction to the other raises it more, and running
   close to a wall pays extra. Drifts link into a chain while the gaps between them are
   short. A chain is banked when you straighten up and stay straight; touching a wall or
   spinning loses the whole chain.
   ===================================================================================== */
const DEG=180/Math.PI;

export class DriftScore{
  constructor({wallDist=null}={}){this.wallDist=wallDist;this.reset();}
  reset(){this.total=0;this.chain=0;this.mult=1;this.on=false;this.gap=0;this.hold=0;this.dir=0;this.angle=0;this.msg=[];this.best=0;this.near=0;this.chainT=0;this.lost=0;}
  /* car: a Vehicle; ev: its collision events this frame */
  update(dt,car,ev){
    const v=Math.max(0,car.speed),b=car.beta||0,deg=Math.abs(b)*DEG,grounded=car.wheels.filter(w=>w.contact).length>=3;
    this.angle=deg*Math.sign(b);
    /* lose the chain: a wall, or a spin */
    if(this.chain>0&&((ev&&ev.wall>2.2)||deg>110&&v>3)){this.msg.push({t:'lost',why:ev&&ev.wall>2.2?'WALL':'SPUN',pts:this.chain});this.lost+=this.chain;this.chain=0;this.mult=1;this.on=false;this.hold=0;this.gap=9;return;}
    const sliding=grounded&&deg>10&&deg<100&&v>7&&car.vf>3;
    if(sliding){
      if(!this.on){this.on=true;this.hold=0;if(this.chain===0){this.mult=1;this.chainT=0;}}
      const d=Math.sign(b);
      if(this.dir&&d!==this.dir&&this.gap<1.2){this.mult=Math.min(6,this.mult+.5);this.msg.push({t:'switch'});}
      this.dir=d;this.hold+=dt;this.gap=0;this.chainT+=dt;
      /* every 2.5 s held, a little more multiplier */
      if(this.hold>2.5){this.hold-=2.5;this.mult=Math.min(6,this.mult+.25);}
      let rate=v*(Math.min(deg,55)-8)*.9;
      /* close to a wall */
      const wd=this.wallDist?this.wallDist(car):99;this.near=wd<1.6?1:0;if(this.near)rate*=1.35;
      this.chain+=rate*this.mult*dt;
    }else{
      this.on=false;
      if(this.chain>0){this.gap+=dt;if(this.gap>1.6){this.bank();}}
    }
  }
  bank(){if(this.chain<=0)return;const p=Math.round(this.chain);this.total+=p;this.best=Math.max(this.best,p);this.msg.push({t:'bank',pts:p,mult:this.mult});this.chain=0;this.mult=1;this.dir=0;this.gap=9;}
  takeMessages(){const m=this.msg;this.msg=[];return m;}
  hud(){return {driftTotal:Math.round(this.total),driftChain:Math.round(this.chain),driftMult:this.mult,driftAngle:this.angle,driftOn:this.on,driftNear:this.near,driftGap:this.chain>0&&!this.on?Math.min(1,this.gap/1.6):0};}
}
