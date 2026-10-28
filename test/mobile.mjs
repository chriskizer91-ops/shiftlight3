/* The game on an emulated phone: touch, landscape, a high pixel ratio.
   node test/mobile.mjs OUTDIR [W H]  -- screenshots of each screen, plus checks that the
   touch pads drive the car (multi-touch through the DevTools protocol). */
import {chromium} from '/opt/npm-tools/node_modules/playwright/index.mjs';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
const out=process.argv[2]||'test/out/mobile';mkdirSync(out,{recursive:true});
const W=+(process.argv[3]||844),H=+(process.argv[4]||390),only=process.env.ONLY||'';
const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const url='file://'+resolve('dist/shiftlight.html');
const errs=[];let fails=0;
const check=(ok,what)=>{console.log((ok?'ok   ':'FAIL ')+what);if(!ok)fails++;};
async function phone(w=W,h=H,dpr=3){
  const ctx=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:dpr,isMobile:true,hasTouch:true,
    userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'});
  await ctx.grantPermissions(['accelerometer','gyroscope']).catch(()=>{});
  const page=await ctx.newPage();page.on('console',m=>{if(m.type()==='error')errs.push(m.text());});page.on('pageerror',e=>errs.push('pageerror: '+e.message));
  const cdp=await ctx.newCDPSession(page);
  return {ctx,page,cdp};
}
const shot=async(page,name)=>{await raf(page);return page.screenshot({path:`${out}/${name}.png`,scale:'css',timeout:180000});};
/* headless Chrome's stand-in audio output eats both cores once a tap starts the synths: keep it off */
const quiet=page=>page.evaluate(()=>{window.__game.audio.start=()=>Promise.resolve();});
/* step the game: logic only for long stretches, then draw two. Every drawn frame queues seconds of work on the
   software GPU, and a backlog of them stalls everything after (screenshots, evaluate) for minutes */
const frames=(page,n)=>page.evaluate(n=>{const g=window.__game;if(n>2)g.sim((n-2)/60);for(let i=0;i<Math.min(n,2);i++)g.frame(1/60);},n);
const rect=(page,sel)=>page.evaluate(s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height};},sel);
/* multi-touch: the full list of fingers down each time */
/* (finger moves are delivered with the next animation frame, and manual stepping draws none, so ask for one) */
let curPage=null;
const raf=page=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r()))));
const touches=async(cdp,type,pts)=>{await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts.map((p,i)=>({x:p.x,y:p.y,id:p.id??i,radiusX:8,radiusY:8,force:1}))});if(curPage&&type==='touchMove')await raf(curPage);};

if(!only||only==='drive'){
  /* ---- driving with the pads (manual frame stepping), real multi-touch through the protocol ---- */
  const {ctx,page,cdp}=await phone();curPage=page;
  await page.goto(url+'?manual&notraffic');
  await page.waitForFunction(()=>window.__game&&window.__game.ready,null,{timeout:300000});await quiet(page);
  await frames(page,4);
  const info=await page.evaluate(()=>{const g=window.__game;return {q:g.settings.quality,device:g.settings.device,dpr:g.R.Q.dpr,cw:document.getElementById('view').width,ch:document.getElementById('view').height,
    vis:g.touch.visible,cls:document.documentElement.className,iw:g.R.iw,ih:g.R.ih};});
  console.log(JSON.stringify(info));
  check(info.q==='mobile','first run on a touch screen picks the mobile tier');
  check(info.cw===Math.round(W*1.25),'a 3x phone screen renders at 1.25 device pixels per CSS pixel ('+info.cw+'x'+info.ch+')');
  check(info.vis&&/touch/.test(info.cls),'touch pads shown while driving');
  await shot(page,'drive-idle');
  await frames(page,150);   /* the engine cranks and catches first */
  const thr=await rect(page,'#touch .k-thr');
  await touches(cdp,'touchStart',[{x:thr.x,y:thr.y,id:1}]);
  await frames(page,150);
  let st=await page.evaluate(()=>window.__game.stats());
  check(st.speed>5,'holding GAS drives the car ('+st.speed.toFixed(1)+' m/s)');
  /* a second finger steers: down on the left, slide right */
  await touches(cdp,'touchStart',[{x:thr.x,y:thr.y,id:1},{x:160,y:H-90,id:2}]);
  await touches(cdp,'touchMove',[{x:thr.x,y:thr.y,id:1},{x:230,y:H-90,id:2}]);
  await frames(page,20);
  const inp=await page.evaluate(()=>{const g=window.__game;return {steer:g.input.steer,thr:g.input.thr};});
  check(inp.steer>.6&&inp.thr>.9,'slide steers while the other thumb holds the gas (steer '+inp.steer.toFixed(2)+')');
  /* roll the gas thumb onto the brake */
  const brk=await rect(page,'#touch .k-brk');
  await touches(cdp,'touchMove',[{x:brk.x,y:brk.y,id:1},{x:230,y:H-90,id:2}]);
  await frames(page,10);
  const rb=await page.evaluate(()=>({brk:window.__game.input.brk,thr:window.__game.input.thr,on:document.querySelector('#touch .k-brk').classList.contains('on')}));
  check(rb.brk>.5&&rb.on,'a thumb rolled from GAS onto BRAKE brakes');
  await touches(cdp,'touchEnd',[]);
  await frames(page,30);
  const rel=await page.evaluate(()=>({steer:window.__game.input.steer,brk:window.__game.input.brk}));
  check(Math.abs(rel.steer)<.2&&rel.brk<.1,'letting go springs the steering back and lifts the pedals');
  /* a picture with two thumbs down (headless screenshots wait out a held protocol touch, so press the pads by hand) */
  await page.evaluate(({W,H})=>{const T=window.__game.touch,ev=(id,cx,cy)=>({pointerId:id,clientX:cx,clientY:cy,preventDefault(){}});
    const r=T.el.thr.getBoundingClientRect();T.down(ev(91,r.left+r.width/2,r.top+r.height/2));T.down(ev(92,150,H-100));T.move(ev(92,205,H-100));},{W,H});
  await frames(page,90);
  await shot(page,'drive-steer');
  /* tilt: the phone turned like a wheel, right side down, steers right (portrait axes, any screen angle) */
  const tilt=await page.evaluate(async()=>{const g=window.__game,T=g.touch;T.up({pointerId:91,preventDefault(){}});T.up({pointerId:92,preventDefault(){}});
    g.settings.steer='tilt';T.configure({steer:'tilt'});const before=T.slides(),okP=await T.enableTilt();
    const ang=screen.orientation?screen.orientation.angle:0,a=24*Math.PI/180,G=9.8;
    /* gravity's reaction ("up") in device axes for the screen's right edge dipped by 24 degrees */
    const rs={0:[1,0],90:[0,-1],180:[-1,0],270:[0,1]}[ang]||[1,0],ds={0:[0,-1],90:[-1,0],180:[0,1],270:[1,0]}[ang]||[0,-1];
    const ux=G*(Math.sin(a)*rs[0]+Math.cos(a)*ds[0]),uy=G*(Math.sin(a)*rs[1]+Math.cos(a)*ds[1]);
    for(let i=0;i<20;i++)window.dispatchEvent(new DeviceMotionEvent('devicemotion',{accelerationIncludingGravity:{x:-ux,y:-uy,z:0}}));
    g.sim(.3);const st=g.input.steer;g.settings.steer='slide';T.configure({steer:'slide'});return {before,st,ang,okP};});
  check(tilt.before&&tilt.st>.6,'tilt: slide steers until the sensor answers, then dipping the right side steers right (steer '+tilt.st.toFixed(2)+', screen '+tilt.ang+'°, permission '+tilt.okP+')');
  /* the II pad opens the menu and the pads go away */
  await page.evaluate(()=>{const T=window.__game.touch,r=T.el.pause.getBoundingClientRect();
    T.down({pointerId:93,clientX:r.left+r.width/2,clientY:r.top+r.height/2,preventDefault(){}});T.up({pointerId:93,preventDefault(){}});});
  await frames(page,2);
  const ps=await page.evaluate(()=>({state:window.__game.state,menu:!document.getElementById('menu').hidden,pads:!document.getElementById('touch').hidden}));
  check(ps.state==='pause'&&ps.menu&&!ps.pads,'II pauses, the menu shows and the pads hide');
  await shot(page,'pause');
  await ctx.close();
}

if(!only||only==='screens'){
  /* ---- the screens, with the real frame loop, tapped through ---- */
  const {ctx,page}=await phone();
  await page.goto(url);
  await page.waitForFunction(()=>window.__game&&window.__game.ready,null,{timeout:300000});await quiet(page);
  await page.waitForTimeout(1500);
  await shot(page,'title');
  const tap=async sel=>{const r=await rect(page,sel);await page.touchscreen.tap(r.x,r.y);await page.waitForTimeout(500);};
  await tap('#titleMenu [data-i="0"]');
  check(await page.evaluate(()=>window.__game.state==='hub'),'tap Career opens the hub');
  await shot(page,'hub');
  await tap('#screen [data-act="g"]');
  check(await page.evaluate(()=>window.__game.state==='garage'),'tap Garage opens the garage');
  await shot(page,'garage');
  await tap('#screen [data-c="1"]');await shot(page,'garage-parts');
  await tap('#screen [data-act="done"]');
  check(await page.evaluate(()=>window.__game.state==='hub'),'Done closes the garage');
  await tap('#screen [data-act="back"]');
  check(await page.evaluate(()=>window.__game.state==='title'),'Back returns to the title');
  await tap('#titleMenu [data-i="1"]');
  check(await page.evaluate(()=>window.__game.state==='drive'),'tap Free roam starts driving');
  await page.waitForTimeout(2500);
  await shot(page,'roam');
  /* a results screen and the replay bar */
  await page.evaluate(()=>window.__game.startFree('loop-drift'));
  await page.waitForTimeout(1500);
  await shot(page,'drift-hud');
  await page.evaluate(()=>{const g=window.__game;g.mode.done=true;});
  /* game time crawls on a software GPU (a frame is clamped to 50 ms): wait for the screen, not the clock */
  await page.waitForFunction(()=>window.__game.state==='results',null,{timeout:240000}).catch(()=>{});
  await page.waitForTimeout(500);
  await shot(page,'results');
  const st=await page.evaluate(()=>window.__game.state);
  if(st==='results'){await tap('#screen [data-b="1"]');
    check(await page.waitForFunction(()=>window.__game.state==='replay'&&!document.getElementById('rtouch').hidden,null,{timeout:60000}).then(()=>true,()=>false),'Replay shows the touch replay bar');
    await page.waitForTimeout(800);await shot(page,'replay');
    await tap('#rtouch [data-r="back"]');
    check(await page.evaluate(()=>window.__game.state==='results'),'EXIT leaves the replay');}
  else check(false,'results screen ('+st+')');
  await page.evaluate(()=>window.__game.startFree('drag'));await page.waitForTimeout(1500);
  await shot(page,'drag');
  await page.evaluate(()=>window.__game.startFree('loop-race'));await page.waitForTimeout(6000);
  await shot(page,'race');
  await ctx.close();
}

if(!only||only==='portrait'){
  const {ctx,page}=await phone(H,W);
  await page.goto(url+'?manual');
  await page.waitForFunction(()=>window.__game&&window.__game.ready,null,{timeout:300000});await quiet(page);
  await frames(page,4);
  check(await page.evaluate(()=>getComputedStyle(document.getElementById('rotate')).display!=='none'),'portrait shows "turn your phone sideways"');
  check(await page.evaluate(()=>window.__game.state==='pause'),'portrait pauses the drive');
  await shot(page,'portrait');
  await ctx.close();
}
if(errs.length)console.log('page errors:\n'+[...new Set(errs)].slice(0,20).join('\n'));
console.log(fails?fails+' FAILED':'all passed');
await b.close();
process.exit(fails?1:0);
