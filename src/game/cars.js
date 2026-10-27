/* The car. One body for the slice, with any of the Engine Lab's engines dropped in. */
import {SIM} from '../engine/engine-sim.js';

export const CHASSIS={
  sl3:{name:'SL-3 Fastback',mass:1420,wb:2.64,wf:.5,hcg:.48,trackF:1.6,trackR:1.62,R:.335,Iw:1.3,rcH:.1,
    susp:{rest:.3,travel:.12,kF:56000,kR:60000,cbF:3800,crF:5400,cbR:4000,crR:5800,arbF:30000,arbR:15000},
    body:{L:4.55,W:1.9,H:1.28},
    tyre:{mu:1.18,kPk:.11,aPk:.14,slide:.8,slideW:.6,loadSens:.12},
    brake:5800,bias:.66,hbTorque:3400,lock:.58,cdA:.66,clF:.28,clR:.42,diff:{pre:40,acc:.35,dec:.15}}
};
/* the engine options shown in the garage: the lab's presets that suit a road car */
export const ENGINE_CHOICES=['six','flatplane','muscle','v10','v12','screamer','boxer','five','rotary3','v6tt','blown','gp'];
export function carSpec(presetId){
  const p=SIM.PRESETS.find(q=>q.id===presetId)||SIM.PRESETS.find(q=>q.id==='six');
  return SIM.makeSpec(Object.assign({},p,{mass:CHASSIS.sl3.mass}));
}
