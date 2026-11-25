// Coordinates follow the Blender plan: x east, y north, z elevation.
export const equipment = {
  intake:{name:'空气过滤与净化',short:'进气净化机柜',code:'进气端',point:[30,-25,2.4],label:[30,-25,5.6],offset:[13,-22,10],cut:'intake',
    text:'进气经滤除颗粒杂质与净化后，通过进气管送入三级压缩机。此机柜用于展示进气工序。',
    specs:[['输入','环境空气'],['下游','三级压缩机']]},
  compressor:{name:'三级空气压缩机',short:'空气压缩机',code:'CMP',point:[-11,-25,6.4],label:[-18,-24,9.2],offset:[-22,-33,21],cut:'compressor',
    text:'净化后的空气进入三级压缩机。级间换热带走压缩产生的热量，并由水回路回收。',
    specs:[['设备形式','三级串联'],['入口介质','净化空气'],['出口介质','高压空气'],['配套','级间换热、热回收']]},
  intercooler:{name:'级间换热器组',short:'级间换热器',code:'HX–01',point:[-10,-4,3.5],label:[-8,-1,7],offset:[14,-53,34],cut:'intercooler',
    text:'压缩空气通过换热器降温。水侧吸收压缩热，热量随后用于释能阶段的空气复温。',
    specs:[['空气侧','压缩空气降温'],['水侧','回收压缩热'],['换热形式','间接换热']]},
  hot:{name:'热水罐',short:'热水罐',code:'HT–01',point:[-44,1,9],label:[-44,1,17],offset:[-14,-29,15],cut:'hot',
    text:'压缩阶段回收的热量以热水形式储存。释能时，热水送往复温换热器，将热量传给空气。',
    specs:[['储存介质','热水'],['罐体形式','高压球形罐'],['热量用途','空气复温']]},
  cold:{name:'冷箱',short:'冷箱',code:'CB–01',point:[-29,24,13.4],label:[-29,24,29.5],offset:[-23,-50,26],cut:'cold',
    text:'预冷的高压空气在冷箱内深度降温并液化。释能时，液态空气在换热气化的同时回收可供下一循环使用的冷量。',
    specs:[['项目液化温度','约 −194 °C'],['工质','空气'],['功能','深冷液化 / 蓄冷回用']]},
  storage:{name:'液空罐',short:'液空罐',code:'TK–01',point:[-44,22,8],label:[-44,22,15],offset:[-30,-24,13],cut:'storage',
    text:'冷箱输出的液态空气进入绝热储罐，在接近常压的深冷条件下储存。用电高峰时，低温泵将液态空气加压送出。',
    specs:[['存储介质','液态空气'],['储存条件','低温、近常压'],['系统储能容量','600 MWh'],['演示液位','—']]},
  frontTank:{name:'冷水罐',short:'冷水罐',code:'TK–02',point:[-44,-20,6.8],label:[-44,-20,12.2],offset:[-23,-29,14],cut:'frontTank',
    text:'压缩时供水给三台压缩换热器，释能时接收两台膨胀换热器冷却后的回水。',
    specs:[['介质','循环冷水'],['设备外形','立式圆筒罐']]},
  recover:{name:'复温换热器组',short:'复温换热器',code:'HX–02',point:[42,-11,4.4],label:[42,1,8],offset:[37,-30,36],cut:'recover',
    text:'液态空气加压后回到冷箱换热气化，气化后的高压空气在此利用球罐热水复温，形成推动透平的高压气流。',
    specs:[['空气侧','气化后高压空气'],['供热介质','回收热水'],['下游','膨胀透平']]},
  turbine:{name:'膨胀机',short:'膨胀机',code:'TG–01',point:[45,-21,5],label:[45,-23,9.8],offset:[21,-29,16],cut:'turbine',
    text:'复温后的高压空气进入透平膨胀做功，带动同轴发电机。电能经变压器升压后送入电网。',
    specs:[['项目额定发电功率','60 MW'],['透平','四级膨胀'],['驱动介质','复温高压空气'],['系统额定放电时长','10 h（容量 ÷ 功率）']]},
  grid:{name:'升压与并网',short:'并网变压器',code:'TR–02',point:[65,-24,2.3],label:[65,-24,5.4],offset:[23,-21,13],
    text:'发电机输出的电能经变压器升压后送入电网。电能沿三相电缆输送至并网变压器，再由架空导线送至电塔。',
    specs:[['输入','发电机电能'],['输出','电网'],['功能','升压并网']]},
  inputPower:{name:'充电侧供电设备',short:'充电侧变压器',code:'TR–01',point:[-44,-30.5,2.5],label:[-44,-30.5,5.3],offset:[-17,-22,13],
    text:'充电侧供电设备为压缩机提供电能。',
    specs:[['设备编号','TR–01'],['对应阶段','低谷供电']]},
  renewables:{name:'风光电源示意',short:'风光电源',code:'RE',point:[-76,9,8],label:[-80,16,23.5],offset:[-25,-35,25],
    text:'场景中的风机和光伏用于说明新能源电力如何参与储能。富余电力可以用于空气压缩与液化。',
    specs:[['能源形式','风能 / 太阳能'],['作用','示意充电侧电源']]},
  thermal:{name:'蓄冷介质罐组',short:'蓄冷介质罐组',code:'TES',point:[17,24,7.2],label:[16,24,18],offset:[-30,-42,31],cut:'thermal',
    text:'后排罐组展示蓄冷介质。液化时介质向冷箱供冷，气化时回收冷量。',
    specs:[['冷量来源','释能气化过程'],['供冷用途','下一次空气液化']]}
};
const families={compressor:[],intercooler:[],thermal:[],recover:[]};
function member(id,family,name,code,point,label,text,specs){
  equipment[id]={...equipment[family],family,name,short:name,code,point,label,text,specs};
  families[family].push(id);
}
for(const [i,x] of [8,-9,-23].entries()){
  const n=i+1;
  member('cmp'+n,'compressor',n+'段压缩机','CMP–0'+n,[x,-25,6.2],[x,-25,10.4],
    '空气经本段升压后进入'+n+'段压缩换热器。',[['入口',i?i+'段压缩换热器':'进气净化机柜'],['出口',n+'段压缩换热器']]);
  const hx=[8,-10,-25][i];
  member('hx'+n,'intercooler',n+'段压缩换热器','HX–C0'+n,[hx,-5,3.7],[hx,-5,7.4],
    '空气与冷水在各自通道中换热，热水汇入热水罐。',[['空气入口',n+'段压缩机'],['空气出口',i===2?'冷箱':(n+1)+'段压缩机'],['设备外形',i===2?'卧式 U 形':'卧式筒形']]);
}
for(const [i,x] of [-6,15,33,48].entries()){
  const stage=i<2?1:2,low=i%2===0,y=i<2?24:25,h=i<2?16.4:12.18;
  member('tes'+i,'thermal',stage+'级蓄冷工质'+(low?'低温罐':'常温罐'),'TES–'+stage+(low?'L':'A'),[x,y,h*.52],[x,y,h+2],
    low?'液化时向冷箱供冷。释能时，通过独立回管接收降温后的蓄冷工质。':'液化时接收升温的工质。释能时，通过独立供管将常温工质送回冷箱。',
    [['所属回路',stage+'级蓄冷'],['罐顶接口','供、回各一根']]);
}
for(const [i,point] of [[44,2,4.3],[40,-6,2.8]].entries()){
  member('expHx'+(i+1),'recover','膨胀换热器','HX–E0'+(i+1),point,[point[0],point[1],point[2]+3.9],
    i?'膨胀机级间空气再次利用热水升温，然后返回后续膨胀级。':'冷箱送出的高压气态空气在此吸热，送往膨胀机。',
    [['设备外形',i?'卧式筒形':'卧式 U 形'],['空气入口',i?'膨胀机级间':'冷箱'],['空气出口','膨胀机'],['水侧','热水罐供水，回冷水罐']]);
}
export const devices=Object.keys(equipment).filter(id=>!families[id]);
// Grouped GLB primitives share materials. Use the same spatial bands for
// picking and for the hover shader, including the generated cutaway shells.
export function pickMember(group,x,north){
  if(group==='compressor')return x>-1?'cmp1':x>-16?'cmp2':'cmp3';
  if(group==='intercooler')return x>-1?'hx1':x>-17.5?'hx2':'hx3';
  if(group==='thermal')return x<4.5?'tes0':x<24.8?'tes1':x<40.8?'tes2':'tes3';
  if(group==='recover')return north>-2?'expHx1':'expHx2';
  return group;
}
export function hoverBand(id){
  const group=equipment[id]?.family;
  const boundaries={compressor:[-16,-1],intercooler:[-17.5,-1],thermal:[4.5,24.8,40.8],recover:[-2]}[group]||[];
  const order={compressor:['cmp3','cmp2','cmp1'],intercooler:['hx3','hx2','hx1'],thermal:families.thermal,recover:['expHx2','expHx1']}[group]||[id];
  const index=order.indexOf(id);
  return [boundaries[index-1]??-1000,boundaries[index]??1000,group==='recover'?1:0];
}

