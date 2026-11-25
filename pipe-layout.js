// Coordinates are in the station plan: x, north, elevation.
export const topPorts = {
  storageIn: [-45.35,22,14.66],
  frontTank: [-44,-18.7,11.45],
  hotIn: [-45.15,1,15.10],
  coldIn: [-32.1,22.5,27.69], coldOut: [-30.8,24.7,27.69],
  coldAir: [-31.4,19.70,12.2],
  coldMedia: Array.from({length:8},(_,n)=>[-32+n*.85,19.70,7.9+(n%2)*.65])
};

export const centralVessels = [
  {center:[8,-5,3.45], radius:1.54, length:17.55, axis:'y'},
  {center:[-10,-5,3.45], radius:1.54, length:17.55, axis:'y'}
];
export const reheatVessel = {center:[40,-6,2.8], radius:1.31, length:18.1, axis:'x'};
export const centralReturn = {axis:'y', center:-25, ends:-8.3, bend:-2.55, low:2.48, high:4.92, radius:.91};
export const reheatReturn = {axis:'x', center:2, ends:48.55, bend:41.4, low:2.84, high:5.3, radius:.94};
export const turbineStages = [[-15.7,1.45,3.45],[-20.05,1.53,3.7],[-24.4,1.84,3.85],[-29.1,2.18,4.55]];

export const hxPorts = {
  centralHeat: [[8,-9.3,4.99],[-10,-9.3,4.99],[-25,-5.75,5.83]],
  centralCoolant: [[8,1.1,4.99],[-10,1.1,4.99],[-25,-4.3,5.83]],
  rightSteam: [46.1,-6,4.11], rightHeat: [34.4,-6,4.11],
  turbine: [[45,-15.7,6.45],[45,-20.05,6.53],[45,-24.4,6.84],[45,-29.1,7.18]]
};
const {centralHeat,centralCoolant,rightSteam,rightHeat,turbine}=hxPorts;
const {storageIn,frontTank,hotIn,coldIn,coldOut,coldAir,coldMedia}=topPorts;
export const thermalPorts=[[-6,24,16.4],[15,24,16.4],[33,25,12.18],[48,25,12.18]];
export const thermalNozzles=thermalPorts.map(([x,y,z])=>[[x-1.05,y,z],[x+1.05,y,z]]);

// Only these paths have physical pipe walls. Points are shared by the idle mesh,
// fluid, and arrows. Opposite uses of a common main are listed separately below.
export const exteriorPipes={
  intake:['air',[[27,-25,2.2],[25.5,-25,2.2],[25.5,-25,6.2],[13.5,-25,6.2]]],
  toCold:['pressure',[[-25,-8.3,4.92],[-25,-10.1,4.92],[-28.4,-10.1,4.92],[-28.4,9.3,4.92],[-33.4,9.3,4.92],[-33.4,18.1,4.92],[-33.4,18.1,29.3],[-32.1,18.1,29.3],[-32.1,22.5,29.3],coldIn]],
  toTank:['liquid',[coldOut,[-30.8,24.7,29.5],[-38,24.7,29.5],[-38,24.7,16.6],[-38,22,16.6],[-45.35,22,16.6],storageIn]],
  warm:['expanded',[coldAir,[-31.4,16.4,12.2],[-32.5,16.4,12.2],[-32.5,16.4,4.24],[-32.5,9.15,4.24],[51.2,9.15,4.24],[51.2,2,4.24],[51.2,2,5.3],[48.55,2,5.3]]],
  expand:['expanded',[[48.55,2,2.84],[50.6,2,2.84],[50.6,2,4.12],[50.6,-15.7,4.12],[50.6,-15.7,8.1],[45,-15.7,8.1],turbine[0]]],
  interstage:['expanded',[turbine[1],[45,-20.05,7.85],[30,-20.05,7.85],[30,-20.05,2.8],[28.9,-20.05,2.8],[28.9,-6,2.8],[30.95,-6,2.8]]],
  expandLast:['expanded',[[49.05,-6,2.8],[52.4,-6,2.8],[52.4,-24.4,2.8],[52.4,-24.4,8.25],[45,-24.4,8.25],turbine[2]]]
};
const compressorEnds=[[8,-22.18,6.2],[-9,-22.6,6.2],[-23,-22.48,6.2]];
for(const [i,[x,y,z]] of compressorEnds.entries()){
  const outlet=[[8,-13.775,3.45],[-10,-13.775,3.45],[-25,-8.3,2.48]][i];
  const [ex,,ez]=outlet;
  exteriorPipes['compress'+(i+1)]=['air',[[x,y,z],[x,-20.4,z],[x,-20.4,ez],[ex,-20.4,ez],outlet]];
  if(i===2)continue;
  const next=compressorEnds[i+1][0]+2.25;
  exteriorPipes['return'+(i+1)]=['air',[[ex,3.775,3.45],[ex,5.25,3.45],[ex-3.3,5.25,3.45],[ex-3.3,-18,3.45],[next,-18,3.45],[next,-18,6.2],[next,compressorEnds[i+1][1],6.2]]];
}

// The two headers have three separate tees: each exchanger sees fresh cooling
// water and sends its own hot return to the collector.
const coldY=10.1,hotY=11.1,headerZ=5.75;
const coldT=x=>[x,coldY,headerZ],hotT=x=>[x,hotY,headerZ];
exteriorPipes.waterTrunk=['water',[frontTank,[-44,-18.7,13.1],[-35.5,-18.7,13.1],[-35.5,-18.7,headerZ],[-35.5,coldY,headerZ],coldT(-25)]];
exteriorPipes.hotTrunk=['heat',[hotT(-25),[-35.9,hotY,headerZ],[-35.9,hotY,17],[-35.9,1,17],[-45.15,1,17],hotIn]];
for(const [i,x] of [8,-10,-25].entries()){
  const [cx,cy,cz]=centralCoolant[i];
  exteriorPipes['waterIn'+i]=['water',[coldT(x),[x,coldY,6.65],[cx,cy,6.65],[cx,cy,cz]]];
}
// The collector points toward the hot tank. Its branches join from above.
for(const [i,[a,b]] of [[-25,-10],[-10,8]].entries()){
  exteriorPipes['waterMain'+i]=['water',[coldT(a),coldT(b)]];
  exteriorPipes['hotMain'+i]=['heat',[hotT(b),hotT(a)]];
}
for(const [i,port] of centralHeat.entries()){
  const [x,y,z]=port;
  exteriorPipes['hotOut'+i]=['heat',[[x,y,z],[x,y,6.26],[x-1.95,y,6.26],[x-1.95,hotY,6.26],[x,hotY,6.26],hotT(x)]];
}
const heatT=hotT(35.3),waterT=coldT(46.1);
exteriorPipes.hotExtension=['heat',[hotT(8),heatT]];
exteriorPipes.coldExtension=['water',[waterT,coldT(8)]];
const upperWarm=[42.8,2,6.24],upperReturn=[46.5,2,6.24];
exteriorPipes.reheatHotA=['heat',[heatT,[35.3,13.25,headerZ],[35.3,13.25,8.45],[42.8,13.25,8.45],[42.8,2,8.45],upperWarm]];
exteriorPipes.reheatHotB=['heat',[heatT,[35.3,hotY,5.08],[35.3,-6,5.08],[34.4,-6,5.08],rightHeat]];
exteriorPipes.reheatColdA=['water',[upperReturn,[46.5,2,7.75],[47.6,2,7.75],[47.6,coldY,7.75],[46.1,coldY,7.75],waterT]];
exteriorPipes.reheatColdB=['water',[rightSteam,[46.1,-6,5.75],[50.05,-6,5.75],[50.05,coldY,5.75],waterT]];

// Two lanes lead to each tank, with independent flanges at both ends.
// Charge and recovery follow the same corridor with a finite lateral offset.
for(const [i,ports] of thermalNozzles.entries()){
  for(const [mode,port] of ports.entries()){
    const n=2*i+mode, [x,y,z]=port;
    const lane=8.28+n*.48, [bx,by,bz]=coldMedia[n];
    const riseY=16.6+(n%2)*.7;
    const points=[port,[x,y,z+1.72],[x,y-9.8,z+1.72],[x,y-9.8,8.48],[x,lane,8.48],[x,lane,7.23],
      [bx,lane,7.23],[bx,riseY,7.23],[bx,riseY,bz],[bx,by,bz]];
    const fromTank=(i%2===0)===(mode===0);
    const medium=['cold','return','pinkCold','pinkReturn'][i];
    exteriorPipes[(mode?'mediaRecover':'mediaCharge')+i]=[medium,fromTank?points:points.reverse()];
  }
}
export const reverseRoutes={pump:'toTank',hotSupply:'hotTrunk',waterReturn:'waterTrunk',
  hotSupplyMain0:'hotMain0',hotSupplyMain1:'hotMain1',waterReturnMain0:'waterMain0',waterReturnMain1:'waterMain1'};