/* =====================================================================================
   ENVIRONMENTS — time of day and weather. Every number the lighting needs, per preset.
   Radiance scale: a street lamp's pool on the sidewalk sits near 0.4, a neon tube near 30,
   the clear noon sky near 1.5. Auto exposure brings each to the screen.
   ===================================================================================== */
const N=v=>{const l=Math.hypot(...v);return v.map(x=>x/l);};
export const ENVS={
  rain:{name:'Midnight Rain',night:1,sunDir:N([.3,.55,-.4]),sunCol:[0,0,0],sunSize:.012,
    ambUp:[.010,.012,.022],ambDn:[.006,.005,.006],
    skyZen:[.004,.005,.009],skyHor:[.016,.015,.022],skyGlow:[.05,.026,.018],cloud:1,stars:0,
    fogCol:[.02,.016,.02],fogDen:.0065,fogFall:.045,fogAmb:[.008,.007,.010],
    wet:1,rain:1,puddles:1,lightsOn:1,lit:.55,key:.11,expoRange:[.8,40],bloom:.075,grade:[1.08,1.04]},
  night:{name:'Clear Night',night:1,sunDir:N([-.35,.6,-.3]),sunCol:[.022,.028,.04],sunSize:.014,
    ambUp:[.008,.011,.02],ambDn:[.005,.005,.006],
    skyZen:[.002,.004,.012],skyHor:[.012,.014,.024],skyGlow:[.03,.018,.014],cloud:.25,stars:1,
    fogCol:[.02,.018,.022],fogDen:.004,fogFall:.04,fogAmb:[.006,.006,.009],
    wet:.35,rain:0,puddles:.45,lightsOn:1,lit:.5,key:.1,expoRange:[.8,40],bloom:.065,grade:[1.05,1.04]},
  dusk:{name:'Golden Hour',night:.6,sunDir:N([-.8,.09,.25]),sunCol:[3.4,1.75,.75],sunSize:.02,
    ambUp:[.22,.24,.36],ambDn:[.09,.07,.06],
    skyZen:[.12,.2,.42],skyHor:[1.25,.75,.45],skyGlow:[.08,.04,.03],cloud:.35,stars:0,
    fogCol:[.55,.38,.3],fogDen:.0035,fogFall:.03,fogAmb:[.16,.11,.09],
    wet:0,rain:0,puddles:0,lightsOn:.7,lit:.25,key:.14,expoRange:[.05,8],bloom:.05,grade:[1.1,1.06]},
  day:{name:'High Noon',night:0,sunDir:N([.45,.62,.38]),sunCol:[6.2,5.8,5.2],sunSize:.0095,
    ambUp:[.32,.42,.62],ambDn:[.12,.11,.1],
    skyZen:[.18,.36,.95],skyHor:[.75,.88,1.1],skyGlow:[0,0,0],cloud:.25,stars:0,
    fogCol:[.6,.7,.88],fogDen:.0011,fogFall:.02,fogAmb:[.18,.22,.3],
    wet:0,rain:0,puddles:0,lightsOn:0,lit:.04,key:.16,expoRange:[.02,3],bloom:.035,grade:[1.04,1.03]}
};
export const ENV_IDS=Object.keys(ENVS);
