import {exteriorPipes,reverseRoutes,centralVessels,centralReturn,reheatReturn,reheatVessel} from './pipe-layout.js?v=continuous-1';

export const palette={
  air:0xffdd67, pressure:0x609fff, expanded:0xc48aff, liquid:0x49caff,
  water:0x70e497, heat:0xff684f, cold:0xffaf3e, return:0xffda9a,
  pinkCold:0xef71ac, pinkReturn:0xffb8d3, power:0xa4e9ff
};
export const paths={
  ...exteriorPipes,
  atmosphere:['air',[[31,-35,3],[31,-32,2.4],[30,-28.2,2.4]]],
  exhaust:['air',[[45,-31.35,5],[45,-35,5],[44,-38,5.9],[43,-40,6.8]]]
};
for(const [reverse,forward] of Object.entries(reverseRoutes)){
  const [type,points]=paths[forward];
  paths[reverse]=[type,[...points].reverse()];
}
for(const [i,{center:[x,y,z],length}] of centralVessels.entries()){
  paths['cool'+(i+1)]=['air',[[x,y-length/2,z],[x,y+length/2,z]]];
}
paths.cool3=['air',[[centralReturn.center,centralReturn.ends,centralReturn.low],[centralReturn.center,centralReturn.ends,centralReturn.high]]];
paths.warmBend=['expanded',[[reheatReturn.ends,reheatReturn.center,reheatReturn.high],[reheatReturn.ends,reheatReturn.center,reheatReturn.low]]];
const [rx,ry,rz]=reheatVessel.center;
paths.reheat=['expanded',[[rx-reheatVessel.length/2,ry,rz],[rx+reheatVessel.length/2,ry,rz]]];
const feed=['waterTrunk','waterMain0','waterMain1','waterIn0','waterIn1','waterIn2'];
const collect=['hotOut0','hotOut1','hotOut2','hotMain1','hotMain0','hotTrunk'];
const releaseWater=['hotSupply','hotSupplyMain0','hotSupplyMain1','hotExtension','reheatHotA','reheatHotB',
  'reheatColdA','reheatColdB','coldExtension','waterReturnMain1','waterReturnMain0','waterReturn'];

const compression=['atmosphere','intake','compress1','cool1','return1','compress2','cool2','return2','compress3','cool3'];
const liquefaction=['toCold','mediaCharge0','mediaCharge1','mediaCharge2','mediaCharge3'];
const coldRecovery=['pump','mediaRecover0','mediaRecover1','mediaRecover2','mediaRecover3','warm'];
const reheatedAir=['warm','warmBend','expand','interstage','reheat','expandLast'];

export const modules=[
  {id:'filter',name:'空气过滤与净化',device:'intake',seconds:8,
    title:'环境空气持续经过滤网和净化模块，送往压缩机',routes:['atmosphere','intake'],sections:['intake']},
  {id:'compress',name:'三级压缩',device:'cmp1',seconds:12,
    title:'三段压缩机和三台级间换热器同步运行，空气连续通过各级',routes:compression,sections:['compressor','intercooler']},
  {id:'heat',name:'压缩热回收与储存',device:'hot',seconds:10,
    title:'三台换热器同时吸收压缩热，热水汇入热水罐',routes:[...feed,...collect],sections:['frontTank','hot','intercooler']},
  {id:'coldEntry',name:'高压空气进入冷箱',device:'cold',seconds:8,
    title:'高压空气持续进入冷箱，冷却形成的液态空气使液位升至中段',routes:['cool3','toCold'],sections:['cold','intercooler']},
  {id:'liquefy',name:'梯级冷却与液化',device:'cold',seconds:16,
    title:'两级蓄冷回路同时供冷，液态空气从中段继续升至顶部',routes:liquefaction,sections:['cold']},
  {id:'storage',name:'液态空气低温储存',device:'storage',seconds:12,
    title:'冷箱连续向液空罐送液，冷箱液位下降，液空罐液位上升',routes:['toTank'],sections:['cold','storage']},
  {id:'pump',name:'液态空气加压',device:'storage',seconds:10,
    title:'液空罐持续出液，低温泵加压后送回冷箱',routes:['pump'],sections:['cold','storage']},
  {id:'coldRecovery',name:'冷能回收',device:'cold',seconds:18,
    title:'两级工质同时回收冷量，冷箱液位升至顶部后随气化回落',routes:coldRecovery,sections:['cold']},
  {id:'reheat',name:'复温加热',device:'expHx1',seconds:10,
    title:'两台膨胀换热器持续供热，冷水汇回冷水罐',routes:[...reheatedAir,...releaseWater],sections:['recover']},
  {id:'expand',name:'四级膨胀发电并网',device:'turbine',seconds:12,
    title:'四级膨胀同步做功，发电机经升压变压器持续向电塔送电',routes:[...reheatedAir,'exhaust','export',...releaseWater],sections:['turbine','recover']}
];
export const stages=[
  {name:'储能',steps:['filter','compress','heat']},
  {name:'液化与保冷',steps:['coldEntry','liquefy','storage']},
  {name:'释能',steps:['pump','coldRecovery','reheat','expand']}
];
export const energyLoops=[
  {id:'heat',name:'热能循环',steps:[
    ['空气压缩产生热量','compress','cmp1'],['冷水分流吸热','heat','frontTank'],
    ['热水汇入热水罐','heat','hot'],['释能供热与冷水回流','reheat','expHx2']]},
  {id:'cold',name:'冷能循环',steps:[
    ['液态空气加压回冷箱','pump','storage'],['一级工质回收冷能','coldRecovery','tes0'],
    ['二级工质回收冷能','coldRecovery','tes2'],['下轮液化，两级供冷','liquefy','cold']]}
];
// Percentages describe the demonstration's liquid inventory, with smooth
// transitions and a hold at the final level during a selected process.
const coldBoxLevels={
  coldEntry:[[0,.09],[.82,.5],[1,.5]],
  liquefy:[[0,.5],[.14,.5],[.78,1],[1,1]],
  storage:[[0,1],[.88,.10],[1,.10]],
  pump:[[0,.10],[.86,.5],[1,.5]],
  coldRecovery:[[0,.5],[.12,.5],[.36,1],[.56,1],[.94,.16],[1,.16]]
};
export function coldBoxFill(id,progress){
  const levels=coldBoxLevels[id];
  if(!levels)return id==='reheat'||id==='expand'?.16:.09;
  for(let i=1;i<levels.length;i++){
    const [end,high]=levels[i];
    if(progress<=end){
      const [start,low]=levels[i-1];
      const u=Math.max(0,(progress-start)/(end-start));
      return low+(high-low)*u*u*(3-2*u);
    }
  }
  return levels.at(-1)[1];
}
export const moduleIndex=Object.fromEntries(modules.map(({id},i)=>[id,i]));
const associations={
  intake:['filter','compress'],hot:['heat','reheat'],frontTank:['heat','reheat'],
  cold:['coldEntry','liquefy','coldRecovery','pump','storage','reheat'],storage:['storage','pump'],
  turbine:['expand'],grid:['expand'],inputPower:['compress'],renewables:['compress']
};
for(let n=1;n<=3;n++){associations['cmp'+n]=['compress']; associations['hx'+n]=n===3?['compress','heat','coldEntry']:['compress','heat'];}
for(let n=0;n<4;n++)associations['tes'+n]=['liquefy','coldRecovery'];
for(let n=1;n<=2;n++)associations['expHx'+n]=['reheat','expand'];
export const deviceModules=Object.fromEntries(Object.entries(associations).map(([key,ids])=>[key,ids.map(id=>moduleIndex[id])]));