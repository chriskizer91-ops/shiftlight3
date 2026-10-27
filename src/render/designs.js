/* =====================================================================================
   CAR DESIGNS — everything that makes one body different from another, in one place:
   the side-view stations and greenhouse the mesh is lofted from, where the axles and arches
   are, the cabin, and the numbers the shader paints by (where the glass stops and the pillars
   start, panel gaps, lamps, grille). Body coordinates: x forward, y up, z right, origin at the
   centre of mass; heights here are above the ground (the mesh subtracts hcg).
     st: [x, bottom, half width, height of max width, top edge, crown], rear to front
     gh: [x, roof height, roof half width], front to back
   Shader numbers (sh):
     uTop      profile position where the side glass meets the roof
     a, c      side glass front / rear edge: x = base + slope * min(u, uTop)
     ws, rw    windscreen [rear x on the roof, front frit x]; rear glass [front x, rear x]
     b, b2     pillars in the side glass [x, half width]; glassBehind 0 = a panel van
     cab       the body top is cut open under the greenhouse: [x front, x rear, half z, min height]
     seam0     hood line x, front door x, middle door x (0 none), rear door x
     seam1     trunk line x (0 none), fuel flap x, fuel flap y, sill height
     seam2     front bumper x, rear bumper x, hood side half width, trunk half width
     head      [inner z, outer z, centre height, half height], headStyle 0 slim LED, 1 reflector
     tail0     lamp cluster [z, half z, y, half y]
     tail1     light bar y (0 none), reverse z, reverse y, plate y
     tail2     reverse half z, reverse half y, plate half width, plate half height
     grille    [half width, y0, y1, intake half width], grille2 [intake y0, intake y1]
   ===================================================================================== */

export const DESIGNS={
  sl3:{id:'sl3',name:'SL-3 Fastback',
    st:[[-2.30,.30,.74,.55,.80,.02],[-2.27,.25,.84,.55,.89,.03],[-2.20,.22,.90,.56,.94,.04],[-2.05,.19,.935,.58,.952,.04],[-1.80,.17,.957,.60,.948,.04],
        [-1.45,.16,.966,.60,.942,.04],[-1.15,.155,.958,.60,.932,0],[-0.80,.15,.935,.60,.918,0],[-0.40,.145,.92,.60,.905,0],[0.00,.145,.917,.60,.895,0],
        [0.40,.15,.92,.60,.885,.02],[0.70,.152,.925,.60,.87,.035],[1.00,.155,.932,.60,.84,.05],[1.32,.16,.935,.60,.80,.06],[1.65,.165,.93,.58,.76,.06],
        [1.95,.17,.912,.55,.72,.05],[2.10,.18,.875,.52,.69,.04],[2.19,.20,.81,.48,.665,.03],[2.25,.23,.70,.45,.64,.02]],
    gh:[[0.66,.88,.80],[0.45,.965,.74],[0.18,1.10,.67],[-0.08,1.215,.625],[-0.32,1.272,.603],[-0.70,1.282,.60],[-1.00,1.252,.603],[-1.30,1.172,.62],[-1.60,1.062,.66],[-1.85,.982,.72],[-1.97,.952,.76]],
    axF:1.32,axR:-1.32,R:.335,archR:.405,mirror:[.30,.985,.925],rim:'ten',tyreW:.245,rimR:.2413,
    exhaust:[[-2.24,.255,-.635,.042],[-2.24,.255,-.485,.042],[-2.24,.255,.485,.042],[-2.24,.255,.635,.042]],
    cab:{tub:[-1.75,.62,.22,.86,.86],seat:-.28,dy:0,rear:-1.12,dash:.42,wheel:[.10,.80,-.38],tilt:.55,dials:true},
    sh:{uTop:.42,a:[.40,-.62],c:[-1.22,.55],ws:[-.10,.62],rw:[-.98,-1.92],b:[-.385,.016],b2:[0,0],glassBehind:1,
      cab:[.64,-1.95,.8,.78],seam0:[.69,.87,0,-.47],seam1:[-1.985,-1.62,.79,.255],seam2:[1.99,-2.02,.80,.70],
      head:[.38,.86,.60,.032],headStyle:0,tail0:[.67,.15,.78,.045],tail1:[.818,.36,.775,.49],tail2:[.06,.022,.26,.065],
      grille:[.52,.31,.52,.74],grille2:[.20,.29],taxi:0,van:0}},

  /* a mid-size four-door saloon */
  meridian:{id:'meridian',name:'Meridian Sedan',
    st:[[-2.70,.40,.76,.62,.92,.02],[-2.67,.33,.85,.62,1.00,.03],[-2.60,.29,.89,.63,1.03,.04],[-2.40,.25,.912,.64,1.04,.04],[-2.10,.22,.918,.64,1.035,.04],
        [-1.70,.20,.918,.64,1.02,.03],[-1.30,.19,.915,.64,1.0,0],[-0.80,.19,.91,.64,.99,0],[-0.30,.19,.91,.64,.985,0],[0.20,.19,.91,.64,.98,0],
        [0.70,.19,.91,.64,.975,.02],[1.00,.20,.91,.64,.95,.04],[1.40,.21,.905,.63,.91,.05],[1.75,.22,.89,.62,.88,.05],[1.98,.24,.86,.60,.85,.04],
        [2.08,.27,.81,.57,.82,.03],[2.15,.32,.72,.54,.76,.02]],
    gh:[[0.80,.985,.80],[0.55,1.10,.745],[0.25,1.26,.69],[0.00,1.385,.66],[-0.25,1.44,.645],[-0.70,1.455,.64],[-1.05,1.43,.645],[-1.30,1.34,.665],[-1.50,1.20,.70],[-1.65,1.075,.75],[-1.74,1.03,.78]],
    axF:1.20,axR:-1.65,R:.325,archR:.395,mirror:[.62,1.06,.955],rim:'five',tyreW:.215,rimR:.2032,
    exhaust:[[-2.62,.30,-.55,.034]],
    cab:{tub:[-1.62,.72,.24,.98,.84],seat:-.08,dy:.06,rear:-1.05,dash:.56,wheel:[.24,.90,-.38],tilt:.6,dials:false},
    sh:{uTop:.42,a:[.62,-1.6],c:[-1.38,.95],ws:[-.15,.77],rw:[-1.05,-1.68],b:[-.33,.045],b2:[0,0],glassBehind:1,
      cab:[.80,-1.72,.78,.88],seam0:[.86,.72,-.33,-1.22],seam1:[-1.80,-2.05,.86,.27],seam2:[1.90,-2.42,.78,.72],
      head:[.45,.80,.70,.05],headStyle:1,tail0:[.70,.17,.86,.07],tail1:[0,.56,.86,.79],tail2:[.03,.03,.26,.06],
      grille:[.46,.48,.63,.62],grille2:[.30,.40],taxi:0,van:0}},

  /* a small five-door hatchback */
  pip:{id:'pip',name:'Pip Hatch',
    st:[[-2.20,.40,.74,.62,.95,.02],[-2.17,.33,.82,.62,1.0,.03],[-2.10,.28,.85,.63,1.02,.03],[-1.90,.24,.855,.64,1.02,.03],[-1.55,.21,.855,.64,1.0,0],
        [-1.00,.20,.85,.64,.98,0],[-0.40,.20,.85,.64,.965,0],[0.20,.20,.85,.64,.95,.01],[0.55,.21,.85,.64,.93,.03],[0.90,.22,.845,.63,.89,.05],
        [1.25,.23,.83,.61,.85,.05],[1.50,.25,.80,.59,.81,.04],[1.65,.28,.76,.56,.77,.03],[1.75,.33,.68,.53,.72,.02]],
    gh:[[0.62,.935,.74],[0.40,1.06,.69],[0.15,1.24,.65],[-0.10,1.40,.625],[-0.40,1.47,.615],[-1.00,1.48,.615],[-1.55,1.47,.62],[-1.85,1.42,.64],[-2.00,1.32,.67],[-2.10,1.18,.71],[-2.16,1.04,.76],[-2.18,1.005,.78]],
    axF:.95,axR:-1.55,R:.30,archR:.37,mirror:[.46,1.0,.885],rim:'cap',tyreW:.185,rimR:.1905,
    exhaust:[[-2.12,.30,-.50,.03]],
    cab:{tub:[-1.75,.56,.24,.95,.78],seat:-.18,dy:.08,rear:-1.08,dash:.40,wheel:[.08,.90,-.36],tilt:.62,dials:false},
    sh:{uTop:.42,a:[.45,-1.6],c:[-1.75,.25],ws:[-.25,.59],rw:[-1.90,-2.13],b:[-.45,.04],b2:[-1.32,.05],glassBehind:1,
      cab:[.62,-2.10,.74,.84],seam0:[.66,.50,-.45,-1.16],seam1:[0,-1.70,.80,.27],seam2:[1.52,-2.02,.70,.0],
      head:[.42,.72,.66,.055],headStyle:1,tail0:[.70,.13,.84,.08],tail1:[0,.52,.84,.62],tail2:[.04,.03,.24,.06],
      grille:[.35,.52,.60,.55],grille2:[.34,.44],taxi:0,van:0}},

  /* a high-roof panel van */
  courier:{id:'courier',name:'Courier Van',
    st:[[-2.65,.42,.90,.70,1.05,0],[-2.63,.36,.96,.70,1.10,0],[-2.55,.32,.985,.72,1.12,0],[-2.30,.30,.99,.74,1.12,0],[-1.65,.29,.99,.74,1.11,0],
        [-0.80,.29,.99,.74,1.10,0],[0.20,.29,.99,.74,1.10,0],[0.90,.30,.985,.73,1.09,.02],[1.35,.31,.975,.72,1.06,.04],[1.80,.33,.96,.70,1.0,.05],
        [2.10,.35,.93,.67,.94,.05],[2.24,.38,.88,.62,.89,.04],[2.30,.42,.80,.58,.84,.02]],
    gh:[[1.40,1.07,.90],[1.15,1.32,.86],[0.90,1.62,.835],[0.70,1.86,.825],[0.50,1.97,.82],[0.0,2.0,.82],[-1.0,2.0,.82],[-2.0,2.0,.82],[-2.50,1.99,.82],[-2.58,1.95,.83],[-2.61,1.60,.86],[-2.63,1.20,.88],[-2.64,1.12,.89]],
    axF:1.35,axR:-1.65,R:.34,archR:.41,mirror:[1.28,1.30,1.06],rim:'cap',tyreW:.215,rimR:.2032,
    exhaust:[[-2.40,.32,-.70,.034]],
    cab:{tub:[-.85,1.32,.30,1.10,.92],seat:.30,dy:.16,rear:null,dash:1.12,wheel:[.78,1.12,-.42],tilt:.35,dials:false},
    sh:{uTop:.42,a:[1.25,-1.55],c:[-2.5,0],ws:[.55,1.37],rw:[-99,-99],b:[.35,.05],b2:[0,0],glassBehind:0,
      cab:[1.42,-2.62,.86,1.0],seam0:[1.46,1.20,.30,-.90],seam1:[0,-1.20,.90,.34],seam2:[2.04,-2.40,.86,0],
      head:[.55,.86,.80,.06],headStyle:1,tail0:[.90,.07,.90,.18],tail1:[0,.90,.68,.56],tail2:[.06,.04,.26,.065],
      grille:[.50,.56,.72,.62],grille2:[.40,.50],taxi:0,van:1,bumper:.53}}
};
/* the SL-3 with its aero parts on */
DESIGNS.sl3_lip=Object.assign({},DESIGNS.sl3,{id:'sl3_lip',lip:true});
DESIGNS.sl3_wing=Object.assign({},DESIGNS.sl3,{id:'sl3_wing',wing:true});
/* the taxi: a Meridian with a roof sign and a checker band */
DESIGNS.taxi=Object.assign({},DESIGNS.meridian,{id:'taxi',name:'Meridian Cab',roofSign:true,sh:Object.assign({},DESIGNS.meridian.sh,{taxi:1})});

/* the taxi sign's lower edge (it sits on the roof at x = -0.55) */
function signBase(D){if(!D.roofSign)return 0;const g=D.gh,x=-.55;for(let i=0;i<g.length-1;i++){const a=g[i],b=g[i+1];if(x<=a[0]&&x>=b[0]){const f=(x-a[0])/(b[0]-a[0]);return a[1]+(b[1]-a[1])*f+.03;}}return 0;}
/* the shader's per-design numbers, packed into vec4s in the order glsl/car.js reads them */
export const DESIGN_VEC4=18;
export function designUniforms(D,hcg){
  const s=D.sh,st=D.st,xF=st[st.length-1][0],xR=st[0][0],hw=Math.max(...st.map(q=>q[2]));
  const belt=st[Math.floor(st.length/2)][4];
  const v=[
    [xF,xR,hw,belt],                                  /* 0 dims */
    [D.axF,D.axR,D.archR,D.R-hcg],                    /* 1 arch */
    s.cab,                                            /* 2 cabin cut */
    [s.a[0],s.a[1],s.c[0],s.c[1]],                    /* 3 side glass */
    [s.ws[0],s.ws[1],s.rw[0],s.rw[1]],                /* 4 windscreen, rear glass */
    [s.uTop,s.b[0],s.b[1],s.glassBehind],             /* 5 */
    [s.b2[0],s.b2[1],s.taxi,s.van],                   /* 6 */
    s.seam0,s.seam1,s.seam2,                          /* 7 8 9 */
    s.head,                                           /* 10 */
    [s.headStyle,s.bumper||0,0,0],                    /* 11: lamp style, plastic bumper height */
    s.tail0,s.tail1,s.tail2,                          /* 12 13 14 */
    s.grille,[s.grille2[0],s.grille2[1],0,0],         /* 15 16 */
    [hcg,D.cab.dials?1:0,signBase(D),0]               /* 17 */
  ];
  const out=new Float32Array(DESIGN_VEC4*4);v.forEach((q,i)=>out.set(q,i*4));return out;
}
