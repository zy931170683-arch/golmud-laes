import { equipment,devices } from './data.js?v=continuous-1';
import { createStation } from './station.js?v=hd-1';
import { modules, deviceModules, stages, energyLoops, moduleIndex, coldBoxFill } from './process.js?v=cold-fill-1';
const $=id=>document.getElementById(id);
let motion=0, processIndex=0, processTime=0, wholeDemo=false, stageView=false;
const idleRoutes=[];
let active=null, selectedModule=null, selectedLoop=null, view='overview', labels=true, cut=false, station;
let lastFrame=0, lastPaint=0;
let levels={storage:.23,coldBox:.09};
const stepViews={
  compress:[[-8,-14,5],[27,-62,51]], heat:[[-17,-1,6],[29,-91,62]],
  coldEntry:[[-27,8,12],[-19,-68,35]], liquefy:[[-1,22,14],[14,-91,36]],
  coldRecovery:[[-1,22,14],[14,-91,36]], reheat:[[2,-1,8],[18,-135,70]],
  expand:[[56,-4,10],[36,-99,54]], storage:[[-38,23,13],[-22,-53,31]],pump:[[-38,23,13],[-22,-53,31]]
};

function button(parent,className,html,action){
  const item=document.createElement('button');
  item.type='button';
  item.className=className;
  item.innerHTML=html;
  item.addEventListener('click',action);
  parent.append(item);
  return item;
}
function hoverButton(item,id){
  item.addEventListener('pointerenter',event=>{if(event.pointerType==='mouse')station?.hover(id);});
  item.addEventListener('pointerleave',()=>station?.hover(null));
}
const stageButtons=[];
const stageGroups=[];
const loopButtons=[];
const stepStages=[];
for(const [stageIndex,stage] of stages.entries()){
  const group=document.createElement('section');
  group.className='stage-group';
  group.innerHTML=`<h3><span>0${stageIndex+1}</span>${stage.name}</h3>`;
  $('stages').append(group);
  stageGroups.push(group);
  for(const step of stage.steps){
    const index=moduleIndex[step];
    const module=modules[index];
    stepStages[index]=stageIndex;
    stageButtons[index]=button(group,'stage',`<span><b>${module.name}</b></span><i class="tick"></i>`,()=>goDevice(module.device,index,null,true));
    hoverButton(stageButtons[index],module.device);
  }
}
for(const loop of energyLoops){
  const group=document.createElement('details');
  group.className='energy-loop '+loop.id;
  group.innerHTML=`<summary>${loop.name}</summary><div class="loop-steps"></div>`;
  $('stages').append(group);
  for(const [label,step,id] of loop.steps){
    const index=moduleIndex[step];
    const action=button(group.lastElementChild,'loop-step',label,()=>goDevice(id,index,action,true));
    loopButtons.push(action);
    hoverButton(action,id);
  }
}
const pins={};
for(const id of devices){
  const device=equipment[id];
  pins[id]=button($('hotspots'),'pin',`<i></i>${device.short}<span class="pin-selected">已选中</span>`,()=>goDevice(id));
  hoverButton(pins[id],id);
  pins[id].hidden=true;
}

function refreshDetails(){
  const process=modules[processIndex];
  const device = active && equipment[active];
  const module = selectedModule === null ? null : modules[selectedModule];
  $('inspector-type').textContent=device ? '设备详情 / '+device.code : '当前工序';
  $('equipment-name').textContent=selectedLoop?.textContent || module?.name || device?.name || (wholeDemo?process.name:'全站总览');
  $('description').textContent=selectedLoop ? process.title : device&&!stageView ? device.text : module ? process.title : wholeDemo ? process.title : '选择左侧工序，或点击设备查看介质与流向。';
  $('parameters').replaceChildren();
  for(const [name,value] of device?.specs || []){
    const row=document.createElement('div');
    const dt=document.createElement('dt');
    const dd=document.createElement('dd');
    dt.textContent=name;
    dd.textContent=value;
    if(name==='演示液位'){dd.id='level';dd.textContent=Math.round(levels.storage*100)+'%';}
    row.append(dt,dd);
    $('parameters').append(row);
  }
  const showColdLevel=cutSections().includes('cold')&&['coldEntry','liquefy','storage','pump','coldRecovery'].includes(process.id);
  $('cold-box-level').hidden=!showColdLevel;
  $('equipment-action').replaceChildren();
  if(availableSections().length)button($('equipment-action'),'action',cut?'恢复设备外观':'查看设备内部',toggleCut);
  if(module){
    const related=devices.filter(id=>deviceModules[id]?.includes(selectedModule));
    if(related.length>1){
      const chooser=document.createElement('select');
      chooser.className='related-select';
      chooser.setAttribute('aria-label','聚焦相关设备');
      chooser.add(new Option('聚焦相关设备…','',true,true));
      for(const id of related){
        const d=equipment[id];
        chooser.add(new Option(d.short+(id.startsWith('expHx')?' · '+d.specs[0][1]:''),id));
      }
      chooser.onchange=()=>{if(chooser.value)goDevice(chooser.value,selectedModule);};
      $('equipment-action').append(chooser);
    }
  }
  $('view-name').textContent=stageView?module.name:device?.short || '全站总览';
  $('view-sub').textContent=stageView?'工序演示 · '+device.short:device ? (cut?'设备内部 · '+device.code:device.code) : '点击工序或设备查看流向';
  $('view-state').textContent=cut?'内部流动示意':device?'设备视图':'全站视图';
  $('section').disabled=!availableSections().length;
  $('section').setAttribute('aria-pressed',cut);
  stageButtons.forEach((item,i)=>item.setAttribute('aria-pressed',i===selectedModule));
  loopButtons.forEach(item=>item.setAttribute('aria-pressed',item===selectedLoop));
  for(const id of devices){
    pins[id].setAttribute('aria-pressed',active===id);
  }
  refreshOperation();
}
function refreshOperation(){
  const process=modules[processIndex];
  const playing=selectedModule!==null||wholeDemo;
  stageButtons.forEach((item,i)=>{
    if(playing&&i===processIndex)item.setAttribute('aria-current','step');
    else item.removeAttribute('aria-current');
  });
  $('timeline-name').textContent=playing?process.title:'选择工序，或播放全流程';
  if(stageView||wholeDemo)$('description').textContent=process.title;
  $('prev-beat').disabled=!playing||processIndex===0;
  $('next-beat').disabled=!playing||processIndex===modules.length-1;
  $('play-all').textContent=wholeDemo?'结束演示':'播放全流程';
  stageGroups.forEach((group,i)=>group.classList.toggle('running',playing&&i===stepStages[processIndex]));
  $('timeline-count').textContent=playing?String(stepStages[processIndex]+1).padStart(2,'0')+' / 03':'— / 03';
  $('status').textContent=!playing?'待演示':wholeDemo?'全流程演示':'工序演示';
}
function availableSections(){
  if(stageView)return modules[processIndex].sections;
  const section=equipment[active]?.cut;
  return section?[section]:[];
}
function cutSections(){
  return wholeDemo?modules[processIndex].sections:cut?availableSections():[];
}
function processFrame(id){
  const host=$('scene');
  if(id==='expand'&&host.clientWidth>900&&host.clientWidth/host.clientHeight<1.15){
    return [[64,-1,10],[45,-123,67]];
  }
  return stepViews[id];
}
function applyView(){
  if(station?.isReady()){
    station.setSection(cutSections());
    station.hover(null);
    if(active)station.focus(active,stageView?processFrame(modules[selectedModule].id):null);
    else station.overview();
  }
  refreshDetails();
}
function goDevice(id,module=null,loop=null,broad=false){
  if(!equipment[id])return;
  const matches=deviceModules[id];
  const preferred=matches.find(index=>modules[index].device===id)??matches[0];
  const next=module??(matches.includes(selectedModule)||wholeDemo&&matches.includes(processIndex)?processIndex:preferred);
  if(broad||next!==processIndex||(selectedModule===null&&!wholeDemo))processTime=0;
  processIndex=next;
  wholeDemo=false;
  stageView=broad;
  active=id;
  selectedModule=next;
  selectedLoop=loop;
  view='device';
  cut=availableSections().length>0;
  station?.setFlows(modules[next].routes);
  applyView();
  (loop||stageButtons[next]).scrollIntoView({block:'nearest',inline:'nearest'});
}
function toggleCut(){
  if(!availableSections().length)return;
  cut=!cut;
  station?.setSection(cutSections());
  refreshDetails();
}
function resetOverview(play){
  view='overview';active=null;selectedModule=null;selectedLoop=null;stageView=false;cut=false;
  wholeDemo=play;processTime=0;processIndex=0;
  station?.setFlows(play?modules[0].routes:idleRoutes);
  applyView();
}
$('overview').addEventListener('click',()=>resetOverview(false));
$('play-all').addEventListener('click',()=>resetOverview(!wholeDemo));
function nextProcess(direction){
  const index=processIndex+direction;
  if(!modules[index])return;
  if(!wholeDemo){goDevice(modules[index].device,index,null,true);return;}
  processIndex=index;
  processTime=0;
  station?.setSection(cutSections());
  refreshDetails();
}
$('prev-beat').onclick=()=>nextProcess(-1);
$('next-beat').onclick=()=>nextProcess(1);
$('section').addEventListener('click',toggleCut);
$('labels').addEventListener('click',()=>{labels=!labels;$('labels').setAttribute('aria-pressed',labels);if(!labels)for(const pin of Object.values(pins))pin.hidden=true;});
$('fullscreen').addEventListener('click',async()=>{
  try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}
  catch{ $('view-state').textContent='当前浏览器无法全屏';}
});
$('dof').addEventListener('click',()=>{const enabled=$('dof').getAttribute('aria-pressed')!=='true';$('dof').setAttribute('aria-pressed',enabled);station?.setDepthOfField(enabled);});
$('panels').addEventListener('click',()=>{document.body.classList.toggle('clean-view');$('panels').setAttribute('aria-pressed',!document.body.classList.contains('clean-view'));});
$('retry').addEventListener('click',()=>location.reload());
function error(message){
  $('load').hidden=false;
  $('load').classList.add('error');
  $('load-text').textContent=message;
  $('retry').hidden=false;
}
try{
  station=createStation($('scene'),(message,ratio)=>{
    $('load-text').textContent=message+(ratio===undefined?'':' '+Math.round(ratio*100)+'%');
  },()=>{
    lastFrame=0;
    $('load').hidden=true;
    $('viewport').dataset.ready='true';
    applyView();
  },error,id=>goDevice(id));
}catch(e){console.error(e);error('当前浏览器无法启动三维渲染，请用支持 WebGL 2 的 Edge 或 Chrome 打开');}

function paintPins(){
  const used=[];
  const priority=active||(wholeDemo?modules[processIndex].device:'cold');
  const ids=[priority,...Object.keys(pins).filter(id=>id!==priority)];
  const w=$('hotspots').clientWidth,h=$('hotspots').clientHeight;
  for(const id of ids){
    const pin=pins[id], device=equipment[id];
    const point=labels&&station?.isReady()?station.project(device.label):null;
    const single=view!=='overview' && id!==priority && (w<760||(stageView&&!deviceModules[id]?.includes(selectedModule)));
    if(!point||single||point[0]<.08||point[0]>.92||point[1]<(id===active?.13:.21)||point[1]>.91){
      pin.hidden=true;continue;
    }
    const x=point[0]*w,y=point[1]*h;
    const tooClose=used.some(([px,py])=>Math.abs(px-x)<95&&Math.abs(py-y)<24);
    if(tooClose){pin.hidden=true;continue;}
    pin.hidden=false;
    pin.style.left=x+'px';
    pin.style.top=y+'px';
    used.push([x,y]);
  }
}
function animate(now){
  requestAnimationFrame(animate);
  if(document.hidden){lastFrame=now;return;}
  const dt=(now-(lastFrame||now))/1000;
  lastFrame=now;
  if(station?.isReady()){
    motion+=dt;
    const playing=selectedModule!==null||wholeDemo;
    let process=modules[processIndex];
    if(playing)processTime+=dt;
    if(wholeDemo&&processTime>=process.seconds){
      processTime-=process.seconds;
      processIndex=(processIndex+1)%modules.length;
      process=modules[processIndex];
      station.setSection(cutSections());
      refreshDetails();
    }
    const progress=Math.min(1,processTime/process.seconds);
    const {id}=process;
    const loaded=processIndex>=moduleIndex.storage;
    const cooled=processIndex>=moduleIndex.liquefy&&processIndex<moduleIndex.reheat;
    let transfer=cooled?1:0;
    if(id==='liquefy')transfer=progress;
    if(id==='coldRecovery')transfer=1-progress;
    levels={
      storage:id==='storage'?.23+.51*progress:id==='pump'?.74-.51*progress:loaded&&processIndex<moduleIndex.pump?.74:.23,
      hot:id==='heat'?.26+.51*progress:id==='reheat'?.77-.51*progress:processIndex>moduleIndex.heat&&processIndex<moduleIndex.reheat?.77:.26,
      cold:.71-.36*transfer,return:.28+.36*transfer,
      pinkCold:.71-.36*transfer,pinkReturn:.28+.36*transfer,
      coldBox:playing?coldBoxFill(id,progress):.09
    };
    levels.water=1.02-levels.hot;
    station.setFlows(playing?process.routes:idleRoutes);
    station.frame(now,motion,levels);
  }
  if(now-lastPaint>33){
    lastPaint=now;
    paintPins();
    const playing=wholeDemo||selectedModule!==null;
    $('run-progress').value=playing?(processIndex+Math.min(1,processTime/modules[processIndex].seconds))/modules.length:0;
    if($('level'))$('level').textContent=Math.round(levels.storage*100)+'%';
    const liquidPercent=Math.round(levels.coldBox*100);
    if(!$('cold-box-level').hidden&&$('cold-box-gauge').value!==liquidPercent){
      $('cold-box-gauge').value=liquidPercent;
      $('cold-box-percent').textContent=liquidPercent+'%';
    }
  }
}
document.addEventListener('visibilitychange',()=>{lastFrame=0;});
refreshDetails();
requestAnimationFrame(animate);