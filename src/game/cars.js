/* The cars: the SL-3 you drive (with any of the Engine Lab's engines dropped in) and the
   everyday cars that share the city with you. Each chassis names the body design it wears
   (render/designs.js); the axles there and the wheelbase and weight split here agree. */
import {SIM} from '../engine/engine-sim.js';

export const CHASSIS={
  sl3:{name:'SL-3 Fastback',design:'sl3',mass:1420,wb:2.64,wf:.5,hcg:.48,trackF:1.6,trackR:1.62,R:.335,Iw:1.3,rcH:.1,
    susp:{rest:.3,travel:.12,kF:56000,kR:60000,cbF:3800,crF:5400,cbR:4000,crR:5800,arbF:30000,arbR:15000},
    body:{L:4.55,W:1.9,H:1.28},
    tyre:{mu:1.18,kPk:.11,aPk:.14,slide:.8,slideW:.6,loadSens:.12},
    brake:5800,bias:.66,hbTorque:3400,lock:.58,cdA:.66,clF:.28,clR:.42,diff:{pre:40,acc:.35,dec:.15}},
  meridian:{name:'Meridian Sedan',design:'meridian',mass:1480,wb:2.85,wf:1.65/2.85,hcg:.55,trackF:1.57,trackR:1.56,R:.325,Iw:1.0,rcH:.1,
    susp:{rest:.32,travel:.14,kF:36000,kR:34000,cbF:3000,crF:4300,cbR:2900,crR:4100,arbF:18000,arbR:8000},
    body:{L:4.85,W:1.84,H:1.46},
    tyre:{mu:1.0,kPk:.12,aPk:.15,slide:.8,slideW:.6,loadSens:.14},
    brake:4800,bias:.68,hbTorque:2600,lock:.6,cdA:.68,clF:.04,clR:.06,diff:{pre:0,acc:0,dec:0}},
  pip:{name:'Pip Hatch',design:'pip',mass:1150,wb:2.5,wf:1.55/2.5,hcg:.53,trackF:1.48,trackR:1.46,R:.30,Iw:.8,rcH:.1,
    susp:{rest:.30,travel:.13,kF:30000,kR:26000,cbF:2600,crF:3800,cbR:2400,crR:3500,arbF:16000,arbR:9000},
    body:{L:3.95,W:1.72,H:1.48},
    tyre:{mu:.98,kPk:.12,aPk:.15,slide:.8,slideW:.6,loadSens:.14},
    brake:3800,bias:.7,hbTorque:2200,lock:.6,cdA:.62,clF:.04,clR:.06,diff:{pre:0,acc:0,dec:0}},
  courier:{name:'Courier Van',design:'courier',mass:2100,wb:3.0,wf:1.65/3.0,hcg:.74,trackF:1.70,trackR:1.70,R:.34,Iw:1.4,rcH:.12,
    susp:{rest:.33,travel:.15,kF:52000,kR:62000,cbF:4200,crF:6000,cbR:4600,crR:6800,arbF:26000,arbR:9000},
    body:{L:4.95,W:1.98,H:2.0},
    tyre:{mu:.95,kPk:.13,aPk:.16,slide:.8,slideW:.6,loadSens:.15},
    brake:6400,bias:.66,hbTorque:3000,lock:.62,cdA:1.15,clF:.03,clR:.05,diff:{pre:0,acc:0,dec:0}}
};
CHASSIS.taxi=Object.assign({},CHASSIS.meridian,{name:'Meridian Cab',design:'taxi'});

/* the engine options shown in the garage: the lab's presets that suit a road car */
export const ENGINE_CHOICES=['six','flatplane','muscle','v10','v12','screamer','boxer','five','rotary3','v6tt','blown','gp'];
/* what the everyday cars run: mild versions of the lab's engines */
export const TRAFFIC_ENGINES={
  meridian:{base:'street4',over:{name:'2.4 L Four',disp:2.4,redline:6400,tq:225,ex:0,crackle:0,drv:'FWD'}},
  taxi:{base:'street4',over:{name:'2.4 L Four',disp:2.4,redline:6200,tq:220,ex:0,crackle:0,drv:'FWD'}},
  pip:{base:'street4',over:{name:'1.2 L Three',layout:'I3',disp:1.2,redline:6400,tq:118,ex:0,crackle:0,drv:'FWD'}},
  courier:{base:'street4',over:{name:'2.5 L Four',disp:2.5,redline:4800,idle:760,tq:330,cP:.38,cW:.55,ex:0,crackle:0,drv:'RWD'}}
};
export function carSpec(presetId,chassisId='sl3'){
  const p=SIM.PRESETS.find(q=>q.id===presetId)||SIM.PRESETS.find(q=>q.id==='six');
  return SIM.makeSpec(Object.assign({},p,{mass:CHASSIS[chassisId].mass}));
}
export function trafficSpec(chassisId){
  const t=TRAFFIC_ENGINES[chassisId]||TRAFFIC_ENGINES.meridian,p=SIM.PRESETS.find(q=>q.id===t.base);
  return SIM.makeSpec(Object.assign({},p,t.over,{mass:CHASSIS[chassisId].mass}));
}
