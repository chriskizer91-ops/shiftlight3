/* Parts and tuning: each part does what it says, the index ranks cars sensibly, and every
   build still drives.  node test/setup.mjs */
import {build,PARTS,STOCK_SETUP,ENGINE_PRICES,fits} from '../src/game/setup.js';
import {Vehicle} from '../src/physics/vehicle.js';
import {makeLevel} from '../src/game/levels.js';
let fails=0;const check=(ok,name,info)=>{console.log((ok?'PASS ':'FAIL ')+name+'  '+info);if(!ok)fails++;};
const show=b=>`${b.kw.toFixed(0)} kW, ${b.kg.toFixed(0)} kg, est. lap ${b.lap.toFixed(1)} s, PI ${b.pi} (${b.cls})`;
const stock=build(STOCK_SETUP);console.log('stock:',show(stock));
check(stock.cls==='D','a stock car is class D',show(stock));
/* every part on its own, against stock */
for(const cat of Object.keys(PARTS)){const opts=PARTS[cat].opts;const row=[];
  for(let i=0;i<opts.length;i++){if(!fits(STOCK_SETUP,cat,i)){row.push(opts[i].name+': n/a');continue;}const b=build(Object.assign({},STOCK_SETUP,{[cat]:i}));row.push(`${opts[i].name} ${b.pi}`);}
  console.log('  '+PARTS[cat].name+': '+row.join(' · '));}
const up=(cat,i)=>build(Object.assign({},STOCK_SETUP,{[cat]:i})).pi;
check(up('exhaust',3)>stock.pi&&up('cams',3)>stock.pi&&up('induction',2)>up('induction',1),'power parts raise the index',`exhaust ${up('exhaust',3)}, cams ${up('cams',3)}, small turbo ${up('induction',1)}, big turbo ${up('induction',2)}`);
check(up('tyres',3)>up('tyres',2)&&up('tyres',2)>stock.pi&&up('tyres',0)<stock.pi,'grip ranks street < sport < semi < slick',`${up('tyres',0)} ${stock.pi} ${up('tyres',2)} ${up('tyres',3)}`);
check(up('weight',3)>stock.pi,'lighter is faster',`${up('weight',3)}`);
const engines=Object.keys(ENGINE_PRICES).map(id=>{const b=build(Object.assign({},STOCK_SETUP,{engine:id}));return [id,b.pi,b.kw,ENGINE_PRICES[id]];}).sort((a,b)=>a[1]-b[1]);
console.log('  engines by index: '+engines.map(([id,pi,kw,pr])=>`${id} ${pi} (${kw.toFixed(0)} kW, $${pr})`).join(', '));
const max={engine:'v10',exhaust:3,intake:3,cams:2,ecu:2,induction:0,nitrous:2,flywheel:2,gearbox:3,diff:3,drive:1,tyres:3,brakes:2,suspension:2,weight:3,aero:2,tune:{}};
const mb=build(max);console.log('a full build:',show(mb));
check(mb.cls==='S','a full build is class S',show(mb));
/* every build drives: 0-100 and a top speed run on the expressway */
const level=makeLevel('city');
for(const [name,S] of [['stock',STOCK_SETUP],['full',max],['blown + slicks',Object.assign({},STOCK_SETUP,{engine:'blown',tyres:3,gearbox:2})],['awd turbo six',Object.assign({},STOCK_SETUP,{engine:'six',drive:1,induction:6})]]){
  const b=build(S),car=new Vehicle(b.chassis,b.spec,level.world);car.setAssists('arcade');car.pt.auto=true;level.botStart(car);car.pt.start();
  let t=0,t100=null,vmax=0;for(let i=0;i<240*30;i++){car.step(1/240,{steer:0,thr:t>1.2?1:0,brk:0,hb:0});t+=1/240;if(t100===null&&car.vf>27.78)t100=t-1.2;vmax=Math.max(vmax,car.vf);}
  check(t100!==null&&t100<15,`${name} drives`,`0-100 km/h ${t100?t100.toFixed(2):'-'} s, ${Math.round(vmax*3.6)} km/h after 30 s`);}
console.log(fails?fails+' FAILED':'all passed');process.exit(fails?1:0);
