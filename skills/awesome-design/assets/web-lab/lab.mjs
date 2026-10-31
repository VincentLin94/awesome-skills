import { createSpring, releaseVelocity, nearestSnap } from './spring.mjs';
const $ = id => document.getElementById(id);
const media = matchMedia('(prefers-reduced-motion: reduce)');
const listeners = [];
function listen(target, event, fn) { target.addEventListener(event, fn); listeners.push(() => target.removeEventListener(event, fn)); }
let scene = null, rendererReady = false, staticView = false, destroyed = false;
let sceneMessage = '支持三维时可拖动查看，也可保留静态样片。';
let sceneFactory = null, loading = false;
const reduce = () => media.matches || $('reduce-motion').checked;
function syncView() {
  const use3d = rendererReady && !staticView;
  $('scene-host').dataset.renderer = use3d ? 'three' : 'static';
  $('fallback').hidden = use3d;
  $('mode-label').textContent = use3d ? '三维材质' : '静态预览';
  $('scene-status').textContent = rendererReady && staticView ? '静态预览保留样片颜色与形体，三维绘制已暂停。' : sceneMessage;
  $('static-view').textContent = rendererReady ? '静态预览' : '重试三维';
  $('static-view').setAttribute('aria-pressed',String(!use3d));
  ['rotate-left','rotate-right','reset-view','roughness'].forEach(id => $(id).disabled = !use3d);
  $('auto-rotate').disabled = !use3d || reduce();
  scene?.setEnabled(use3d);
}
function stopAuto() { scene?.setAuto(false); $('auto-rotate').setAttribute('aria-pressed','false'); $('auto-rotate').textContent='自动转动'; }
async function mountScene() {
  if (loading || destroyed) return;
  loading=true;
  scene?.dispose(); scene=null;
  try {
    sceneFactory ||= (await import('./material-scene.mjs')).createMaterialScene;
    if (destroyed) return;
    scene = sceneFactory({canvas:$('material-canvas'),host:$('scene-host'),textureURL:'../fiber-tile.png',onStatus:(state,message)=>{
      rendererReady=state==='ready'; sceneMessage=message; syncView();
    }});
    scene?.setReduced(reduce());
    scene?.setRoughness(Number($('roughness').value)/100);
    scene?.setColor(document.querySelector('[data-color][aria-pressed="true"]').dataset.color);
    syncView();
  } catch (error) { rendererReady=false; sceneMessage='三维资源暂不可用，静态样片仍可查看。'; syncView(); }
  finally { loading=false; }
}
listen($('rotate-left'),'click',()=>{stopAuto();scene?.rotate(-1);});
listen($('rotate-right'),'click',()=>{stopAuto();scene?.rotate(1);});
listen($('reset-view'),'click',()=>{stopAuto();scene?.reset();});
listen($('auto-rotate'),'click',()=>{const active=$('auto-rotate').getAttribute('aria-pressed')!=='true';scene?.setAuto(active);$('auto-rotate').setAttribute('aria-pressed',String(active));$('auto-rotate').textContent=active?'暂停转动':'自动转动';});
listen($('static-view'),'click',()=>{if(!rendererReady){mountScene();return;}stopAuto();staticView=!staticView;syncView();});
listen($('roughness'),'input',()=>{const value=Number($('roughness').value)/100;$('roughness-value').value=value.toFixed(2);scene?.setRoughness(value);});
document.querySelectorAll('[data-color]').forEach(button=>listen(button,'click',()=>{document.querySelectorAll('[data-color]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));$('material-heading').textContent=button.dataset.name;$('scene-host').style.setProperty('--sample-color',button.dataset.color);$('fallback').setAttribute('aria-label',button.dataset.name+'的柔边样片，带朱红标记。');scene?.setColor(button.dataset.color);}));
listen($('about'),'click',()=>$('details').showModal());
listen($('details'),'close',()=>$('about').focus());

const track=$('track'), puck=$('puck'), names=['起点','中点','终点'];
let width=1, chosen=1, drag=null;
const stops=()=>[0,width/2,width];
const clamp=n=>Math.min(width,Math.max(0,n));
function draw(value) {const percent=Math.round(value/width*100);puck.style.transform=`translateX(${value}px)`;puck.setAttribute('aria-valuenow',String(percent));puck.setAttribute('aria-valuetext',percent===0?'起点':percent===50?'中点':percent===100?'终点':percent+'%');track.dataset.position=value.toFixed(3);}
const spring=createSpring({onChange:draw,bounds:()=>({min:0,max:width})});
function selected(index) {chosen=index;document.querySelectorAll('[data-stop]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.stop)===index)));puck.setAttribute('aria-valuetext',names[index]);$('snap-status').textContent='当前选择：'+names[index];}
function go(index, velocity) {selected(index);spring.setTarget(stops()[index],{velocity,immediate:reduce()});}
const sizeObserver=new ResizeObserver(()=>{endDrag(null,true);width=Math.max(1,track.clientWidth-puck.offsetWidth);spring.setPosition(stops()[chosen]);});
sizeObserver.observe(track);
document.querySelectorAll('[data-stop]').forEach(button=>listen(button,'click',()=>go(Number(button.dataset.stop))));
listen(puck,'keydown',e=>{let index=chosen;if(e.key==='ArrowLeft'||e.key==='ArrowDown')index=Math.max(0,chosen-1);else if(e.key==='ArrowRight'||e.key==='ArrowUp')index=Math.min(2,chosen+1);else if(e.key==='Home')index=0;else if(e.key==='End')index=2;else return;e.preventDefault();go(index);});
listen(puck,'pointerdown',e=>{if(!e.isPrimary||e.button!==0)return;const value=spring.grab();drag={id:e.pointerId,startX:e.clientX,origin:value,value,samples:[{time:e.timeStamp,position:value}]};puck.setPointerCapture(e.pointerId);puck.dataset.dragging='true';puck.focus({preventScroll:true});});
listen(puck,'pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;drag.value=clamp(drag.origin+e.clientX-drag.startX);spring.setPosition(drag.value);drag.samples.push({time:e.timeStamp,position:drag.value});drag.samples=drag.samples.filter(p=>e.timeStamp-p.time<=80);});
function endDrag(e,cancelled=false) {if(!drag||(e&&e.pointerId!==drag.id))return;const d=drag;drag=null;puck.dataset.dragging='false';if(puck.hasPointerCapture(d.id))puck.releasePointerCapture(d.id);const velocity=cancelled||reduce()?0:releaseVelocity(d.samples,e.timeStamp,d.value);const target=nearestSnap(d.value,velocity,stops());go(stops().indexOf(target),velocity);}
listen(puck,'pointerup',e=>endDrag(e));
listen(puck,'pointercancel',e=>endDrag(e,true));
listen(puck,'lostpointercapture',e=>endDrag(e,true));
function updateMotion() {stopAuto();scene?.setReduced(reduce());if(reduce()&&!drag)spring.settle();$('motion-status').textContent=reduce()?'直接控制可用，自动转动与释放惯性已关闭。':'拖动后保留轻微惯性。';syncView();}
listen(media,'change',updateMotion);
listen($('reduce-motion'),'change',updateMotion);
listen(document,'visibilitychange',()=>{if(document.hidden){endDrag(null,true);spring.settle();stopAuto();}});
listen(window,'pagehide',e=>{if(e.persisted){spring.settle();stopAuto();return;}destroyed=true;scene?.dispose();spring.dispose();sizeObserver.disconnect();listeners.forEach(remove=>remove());});
updateMotion();
mountScene();
