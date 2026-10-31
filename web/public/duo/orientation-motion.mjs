// Match the native prop's .2/.72/.18/1 turn curve. Frames fit the actual
// rotated rectangle rather than stretching its aspect ratio to stay on-screen.
function ease(progress){
 let low=0,high=1;
 for(let i=0;i<18;i++){
  const t=(low+high)/2,u=1-t,x=3*u*u*t*.2+3*u*t*t*.18+t*t*t;
  if(x<progress)low=t;else high=t;
 }
 const t=(low+high)/2,u=1-t;
 return progress===0?0:progress===1?1:3*u*u*t*.72+3*u*t*t+t*t*t;
}
export function orientationFrames({angle,scaleX,scaleY,from,to,width,height,viewport,padding=16}){
 return Array.from({length:61},(_,index)=>{
  const offset=index/60,t=ease(offset),turn=angle*(1-t),radians=turn*Math.PI/180;
  let x=scaleX+(1-scaleX)*t,y=scaleY+(1-scaleY)*t;
  const cos=Math.abs(Math.cos(radians)),sin=Math.abs(Math.sin(radians));
  let w=width*x*cos+height*y*sin,h=width*x*sin+height*y*cos;
  const fit=Math.min(1,(viewport.width-padding*2)/w,(viewport.height-padding*2)/h);
  x*=fit;y*=fit;w*=fit;h*=fit;
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const cx=clamp(from.x+(to.x-from.x)*t,padding+w/2,viewport.width-padding-w/2);
  const cy=clamp(from.y+(to.y-from.y)*t,padding+h/2,viewport.height-padding-h/2);
  return {offset,transform:`translate(${cx-to.x}px,${cy-to.y}px) rotate(${turn}deg) scale(${x},${y})`};
 });
}
