// The exact polyhedron and satellite field from the ESPL homepage hero.
const $ = id => document.getElementById(id);
const defaults = {originX:52, originY:50, earthSize:72, satCount:5000, dotSize:100};
const bounds = {originX:[0,100],originY:[0,100],earthSize:[35,145],satCount:[0,7251],dotSize:[35,250]};
const color = '#8e8371';
const clamp = (value,low,high) => Math.min(high,Math.max(low,value));
const readImage = url => new Promise((resolve,reject) => {
  const image = new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('Could not load the original hero artwork'));image.src=url;
});
export async function mountOpeningArtwork() {
  const figure=$('openingArtwork'),panel=$('openingControls'),status=$('artStatus');
  if (!figure || !panel) return;
  const [source, saved] = await Promise.all([
    fetch('./assets/homepage-hero-globe.svg').then(r=>{if(!r.ok)throw new Error('Homepage hero artwork unavailable');return r.text();}),
    fetch('./opening-artwork.json',{cache:'no-store'}).then(r=>r.ok?r.json():defaults).catch(()=>defaults)
  ]);
  const svg=new DOMParser().parseFromString(source,'image/svg+xml');
  const groups=[...svg.documentElement.children];
  if (groups.length<2) throw new Error('Homepage hero layers are incomplete');
  const satellites=[...groups[1].querySelectorAll('circle')].map((circle,index)=>({
    x:Number(circle.getAttribute('cx')),y:Number(circle.getAttribute('cy')),r:Number(circle.getAttribute('r')),
    rank:Math.imul(index+1,2654435761)>>>0
  })).filter(dot=>[dot.x,dot.y,dot.r].every(Number.isFinite)).sort((a,b)=>a.rank-b.rank);
  if(satellites.length<7000)throw new Error('Homepage satellite field is incomplete');
  const earthSvg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2000 2000" width="2000" height="2000">${groups[0].outerHTML}</svg>`;
  const imageUrl=URL.createObjectURL(new Blob([earthSvg],{type:'image/svg+xml'}));
  let earth;
  try{earth=await readImage(imageUrl)}finally{URL.revokeObjectURL(imageUrl)}
  const settings={...defaults};
  for(const [key,[low,high]] of Object.entries(bounds)){
    const value=Number(saved?.[key]);if(Number.isFinite(value))settings[key]=clamp(Math.round(value),low,high);
  }
  const outputs=Object.fromEntries(Object.keys(bounds).map(key=>[key,panel.querySelector(`[data-art-output="${key}"]`)]));
  function sync(){for(const [key,value] of Object.entries(settings)){
    panel.querySelector(`[data-art="${key}"]`).value=String(value);
    outputs[key].textContent=key==='satCount'?value.toLocaleString('en-US'):`${value}%`;
  }}
  function draw(){
    const rect=figure.getBoundingClientRect();if(!rect.width||!rect.height)return;
    const dpr=Math.min(devicePixelRatio||1,2),width=Math.round(rect.width*dpr),height=Math.round(rect.height*dpr);
    if(figure.width!==width||figure.height!==height){figure.width=width;figure.height=height}
    const ctx=figure.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,rect.width,rect.height);
    const x=rect.width*settings.originX/100,y=innerHeight*settings.originY/100-rect.top;
    const scale=innerHeight*(settings.earthSize/100)/906;
    ctx.drawImage(earth,x-1000*scale,y-1000*scale,2000*scale,2000*scale);
    ctx.fillStyle=color;
    for(let i=0;i<Math.min(settings.satCount,satellites.length);i++){
      const point=satellites[i],px=x+(point.x-1000)*scale,py=y+(point.y-1000)*scale;
      const radius=Math.max(.4,point.r*scale*settings.dotSize/100);
      if(px+radius<0||px-radius>rect.width||py+radius<0||py-radius>rect.height)continue;
      const distance=Math.hypot(px-x,py-y),earthRadius=453*scale;
      ctx.globalAlpha=distance<=earthRadius?1:.68*Math.exp(-.95*(distance/earthRadius-1));
      ctx.beginPath();ctx.arc(px,py,radius,0,Math.PI*2);ctx.fill();
    }
    ctx.globalAlpha=1;
  }
  sync();draw();new ResizeObserver(draw).observe(figure);
  panel.querySelectorAll('[data-art]').forEach(input=>input.addEventListener('input',()=>{
    const key=input.dataset.art,[low,high]=bounds[key];settings[key]=clamp(Number(input.value),low,high);
    outputs[key].textContent=key==='satCount'?settings[key].toLocaleString('en-US'):`${settings[key]}%`;
    status.textContent='Unsaved artwork changes';draw();
  }));
  $('artControlsToggle').onclick=()=>{
    const collapsed=!$('artControlsBody').hidden;
    $('artControlsBody').hidden=collapsed;
    $('artControlsToggle').textContent=collapsed?'Adjust artwork':'Hide controls';
    $('artControlsToggle').setAttribute('aria-expanded',String(!collapsed));
  };
  $('saveOpeningArtwork').onclick=async()=>{
    status.textContent='Saving…';
    try{
      const response=await fetch('/api/artwork',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(settings)});
      if(!response.ok)throw new Error((await response.json()).error||'Save failed');
      status.textContent='Composition saved for the next review';
    }catch(error){status.textContent=error.message}
  };
  let drag=null;
  figure.addEventListener('pointerdown',event=>{
    if(document.body.classList.contains('spotMode')||document.body.classList.contains('presentation'))return;
    drag={x:event.clientX,y:event.clientY,originX:settings.originX,originY:settings.originY};figure.setPointerCapture(event.pointerId);
  });
  figure.addEventListener('pointermove',event=>{
    if(!drag)return;
    const rect=figure.getBoundingClientRect();
    settings.originX=clamp(Math.round(drag.originX+(event.clientX-drag.x)/rect.width*100),0,100);
    settings.originY=clamp(Math.round(drag.originY+(event.clientY-drag.y)/innerHeight*100),0,100);
    sync();draw();status.textContent='Unsaved artwork changes';
  });
  figure.addEventListener('pointerup',()=>{drag=null});figure.addEventListener('pointercancel',()=>{drag=null});
}
