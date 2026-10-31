import {MAP_CONFIG} from './map-config.mjs';
export const validPoint=p=>!!p&&typeof p.x==='number'&&typeof p.y==='number'&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.abs(p.x)<=16000&&Math.abs(p.y)<=16000;
export const validWorldAttachmentPoint=p=>!!p&&typeof p.x==='number'&&typeof p.y==='number'&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=-10000&&p.x<=10000&&p.y>=-10000&&p.y<=15000;
export function project(point,zoom=0,c=MAP_CONFIG.projection){const scale=2**zoom;return {x:(c.centerX+c.scaleX*point.x)*scale,y:(c.centerY-c.scaleY*point.y)*scale};}
export function unproject(point,zoom=0,c=MAP_CONFIG.projection){const scale=2**zoom;return {x:(point.x/scale-c.centerX)/c.scaleX,y:(c.centerY-point.y/scale)/c.scaleY};}
export function parseCoordinates(text){const match=String(text).trim().match(/^(-?\d+(?:\.\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?)$/);if(!match)return null;const p={x:Number(match[1]),y:Number(match[2])};return validWorldAttachmentPoint(p)?p:null;}
export function distance(a,b){return validPoint(a)&&validPoint(b)?Math.hypot(a.x-b.x,a.y-b.y):null;}
export function formatDistance(m){return !Number.isFinite(m)?'':m>=1000?(m/1000).toFixed(1)+' km':Math.round(m)+' m';}
export function validRoute(points){return Array.isArray(points)?points.filter(validPoint).slice(0,384):[];}
