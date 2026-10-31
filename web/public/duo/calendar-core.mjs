/** Local-calendar arithmetic: never convert a datetime-local value through UTC. */
export const pad2 = n => String(n).padStart(2, '0');
export function dateKey(date = new Date()) { return `${date.getFullYear()}-${pad2(date.getMonth()+1)}-${pad2(date.getDate())}`; }
export function localDateTime(date = new Date()) { return `${dateKey(date)}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`; }
export function monthCells(year, month) {
 const first = new Date(year, month, 1, 12); const start = new Date(year, month, 1-first.getDay(), 12);
 return Array.from({length:42}, (_, i) => { const d=new Date(start);d.setDate(start.getDate()+i);return {key:dateKey(d),day:d.getDate(),inMonth:d.getMonth()===month,date:d}; });
}
export function validEvents(data) {
 return (Array.isArray(data)?data:[]).filter(e=>e&&typeof e.id==='string'&&typeof e.title==='string'&&typeof e.at==='string'&&Number.isFinite(new Date(e.at).getTime()));
}
export function eventDate(event) { return String(event.at).slice(0,10); }
export function displayDuration(ms, fractions=false) {
 const total=Math.max(0,Number(ms)||0), seconds=Math.floor(total/1000), hours=Math.floor(seconds/3600);
 const base=(hours?pad2(hours)+':':'')+pad2(Math.floor(seconds/60)%60)+':'+pad2(seconds%60);
 return base+(fractions?'.'+pad2(Math.floor(total%1000/10)):'');
}
