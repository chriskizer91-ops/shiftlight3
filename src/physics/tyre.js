/* Tyre: similarity-method combined slip. sigma = |(kappa/kPk, tan(alpha)/tan(aPk))|; the
   force mu*Fz*f(sigma) is shared between the longitudinal and lateral directions, so a tyre
   spinning or locked has little left for cornering. f rises to a peak at sigma=1 and falls to
   a sliding plateau. Load sensitivity: grip per newton drops as the load grows.
   Returns forces along the wheel's forward (fx) and right (fy) axes, plus dFx/dkappa (dk)
   for the wheel's implicit spin update. */
export const TYRE_DEFAULT={mu:1.1,kPk:.11,aPk:.15,slide:.78,slideW:.55,loadSens:.12,fz0:3600};
export function tyreForce(t,Fz,kap,tanA,muMul,out){
  if(Fz<=0){out.fx=0;out.fy=0;out.dk=0;out.sg=0;return out;}
  const lf=Math.max(.6,1-t.loadSens*(Fz/t.fz0-1)),m=t.mu*muMul*lf*Fz;
  const sx=kap/t.kPk,sy=tanA/Math.tan(t.aPk),sg=Math.hypot(sx,sy);out.sg=sg;
  if(sg<1e-6){out.fx=2*m*sx;out.fy=-2*m*sy;out.dk=2*m/t.kPk;return out;}
  let f,fp;
  if(sg<1){f=sg*(2-sg);fp=2-2*sg;}
  else{const u=(sg-1)/t.slideW,q=1+u*u;f=t.slide+(1-t.slide)/q;fp=-(1-t.slide)*2*u/(t.slideW*q*q);}
  const cx=sx/sg,cy=sy/sg;
  out.fx=m*f*cx;out.fy=-m*f*cy;out.dk=Math.max(0,m*(fp*cx*cx+f/sg*cy*cy)/t.kPk);
  return out;
}
