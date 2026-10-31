/** Original Peak icon artwork. No Apple assets, SF Symbols, icon fonts or network requests.
 * Each icon is drawn on a 64-unit grid; glass highlights are ordinary vector layers.
 */
import { icon } from './icons.mjs?rev=owner-config-20261015';
const palettes={
 maps:['#f5f5e9','#c5ddd7'],calendar:['#ffffff','#f2f4f7'],clock:['#282d36','#080b10'],
 voicememos:['#353a43','#11151c'],homeedit:['#b5bcff','#6b6bc8'],jobcreator:['#b3b1fa','#6156ae'],

 kilogram:['#f69357','#b82c91'],binge:['#d4a5ca','#735379'],
 calls:['#73f79c','#09ac49'],messages:['#82f1a8','#13bd54'],mails:['#7fcaff','#0961ec'],
 contacts:['#ced5e0','#657289'],gallery:['#ffffff','#f1eef2'],camera:['#ebedf0','#8f99a9'],
 documents:['#f4f1e8','#d6d1c0'],settings:['#a2adbf','#3c4759'],details:['#98aef9','#4358b9'],
 store:['#66c7ff','#0865e5'],housing:['#ffba68','#ed7720'],y:['#46505b','#0a0e16'],
 wenmo:['#7ea8ff','#335bda'],services:['#ff989e','#e3455d'],vehicles:['#9aaafd','#5b65da'],
 debt:['#ddb797','#8e6550'],crypto:['#d3adff','#7552c0'],jobcenter:['#a9cfff','#4979c9'],
 busdriver:['#ffe695','#d99624'],lumberjack:['#a9dfa3','#368761'],employment:['#96cae7','#436f97'],
 peakify:['#ff8f9f','#ef214f'],news:['#ff9986','#d63739'],bin:['#93cadd','#2c8aa4'],
 calculator:['#5d6370','#161c25'],yellowpages:['#ffe56f','#edb826'],doj:['#c5b2e7','#76589c'],
 pinger:['#89e6cf','#148e96'],tierup:['#dac0f3','#9b66c2'],racing:['#fcab83','#d65839'],
 'time-trials':['#a0d9f7','#4599c6'],cars:['#a0d6d1','#3d8d90'],facetime:['#81e9a0','#21b150'],
 guber:['#97adbc','#2e4354'],bankbusters:['#b6c9a1','#5c7450'],
 weather:['#a4e1f7','#4384d5'],
};
const squircle='M32 1C46 1 53 1 58 6S63 18 63 32 63 53 58 58 46 63 32 63 11 63 6 58 1 46 1 32 1 11 6 6 18 1 32 1Z';
function special(id){
 if(id==='maps')return '<path d="M5 13 24 5l18 6 17-5v49l-18 5-19-7-17 5Z" fill="#e9eadc"/><path d="m6 16 16-7v20L6 36Zm22-4 11 4v15l-11-4Zm17 6 13-7v18l-13 6ZM8 43l13-6v13L8 55Zm19-9 12 4v15l-12-5Z" fill="#92cbaa"/><path d="M4 38 24 29 41 35l19-9M24 6v23l-1 26M42 12l-1 46" fill="none" stroke="#fffdf6" stroke-width="5"/><path d="M7 46 30 35l13 5 15-6" fill="none" stroke="#6db1ff" stroke-width="6"/><path d="M7 46 30 35l13 5 15-6" fill="none" stroke="#edf7ff" stroke-width="2"/><circle cx="39" cy="30" r="12" fill="#fff"/><circle cx="39" cy="30" r="9.5" fill="#2580f5"/><path d="m39 23-5 13 5-3 5 3Z" fill="#fff"/>';
 if(id==='calendar'){const date=new Date();const day=date.toLocaleDateString('en-US',{weekday:'short'}).toUpperCase();return `<path d="M8 6h48v12H8Z" fill="#fff"/><text x="32" y="20" text-anchor="middle" fill="#ee595b" font-family="Arial,sans-serif" font-size="10" font-weight="700" letter-spacing="1">${day}</text><text x="32" y="51" text-anchor="middle" fill="#1a202a" font-family="Arial,sans-serif" font-size="34" font-weight="400" letter-spacing="-1.5">${date.getDate()}</text>`;}
 if(id==='clock'){const date=new Date(),minutes=date.getMinutes(),hours=date.getHours()%12;return `<circle cx="32" cy="32" r="26" fill="#fafbfc"/><g transform="translate(32 32)">${Array.from({length:12},(_,i)=>`<path d="M0-21v${i%3===0?4:2}" stroke="#253040" stroke-width="${i%3===0?1.8:1.1}" stroke-linecap="round" transform="rotate(${i*30})"/>`).join('')}<path d="M0 2V-12" stroke="#232a35" stroke-width="3" stroke-linecap="round" transform="rotate(${hours*30+minutes/2})"/><path d="M0 3V-19" stroke="#232a35" stroke-width="2.1" stroke-linecap="round" transform="rotate(${minutes*6})"/><path d="M0 5v-25" stroke="#f07b42" stroke-width="1" transform="rotate(${date.getSeconds()*6})"/><circle r="2" fill="#f07b42"/></g>`;}
 if(id==='voicememos')return `<path d="M7 32h50" stroke="#68717d" stroke-width=".6"/><g stroke-linecap="round" stroke-width="2.4">${[6,13,23,15,31,43,27,39,19,31,13,6].map((h,i)=>`<path d="M${10+i*4} ${32-h/2}v${h}" stroke="${i>=4&&i<=7?'#ff625f':'#f3f5f8'}"/>`).join('')}</g><path d="M22 53h20" stroke="#abb1bb" stroke-width="1" stroke-linecap="round"/>`;
 if(id==='homeedit')return '<rect x="11" y="10" width="42" height="45" rx="10" fill="#f4f2ff" fill-opacity=".94"/><rect x="16" y="15" width="32" height="12" rx="4" fill="#d4d8f5"/><circle cx="22" cy="21" r="3" fill="#f9ba65"/><path d="M30 20h12M30 23h8" stroke="#8f99c9" stroke-width="1.5" stroke-linecap="round"/><rect x="16" y="31" width="8" height="8" rx="2.5" fill="#68b8e8"/><rect x="28" y="31" width="8" height="8" rx="2.5" fill="#e795af"/><rect x="40" y="31" width="8" height="8" rx="2.5" fill="#80c6ae"/><rect x="16" y="43" width="8" height="8" rx="2.5" fill="#b59cda"/><path d="m35 50 13-13 5 5-13 13-7 2Z" fill="#fff" stroke="#7d79bf" stroke-width="1.5"/><path d="m46 39 5 5" stroke="#7d79bf" stroke-width="1.5"/>';
 if(id==='jobcreator')return '<rect x="11" y="20" width="39" height="29" rx="7" fill="#f2efff"/><path d="M23 20v-7h15v7" fill="none" stroke="#f2efff" stroke-width="4" stroke-linejoin="round"/><path d="M12 31c11 7 26 7 37 0" fill="none" stroke="#a798dc" stroke-width="2"/><circle cx="46" cy="46" r="12" fill="#8c7dd1" stroke="#eee8ff" stroke-width="2"/><path d="M40 46h12m-6-6v12" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>';
 if(id==='lumberjack')return '<path d="m32 9 17 19h-9l13 16H11l13-16h-9Z" fill="#e1f8e5"/><path d="M29 43h6v12h-6Z" fill="#e0c295"/><path d="M32 19v24m-8-14 8 7 8-7" stroke="#7dbb94" stroke-width="2" stroke-linecap="round"/>';
 if(id==='bin')return '<circle cx="32" cy="32" r="23" fill="none" stroke="#e8f9ff" stroke-width="3"/><ellipse cx="32" cy="32" rx="11" ry="23" fill="none" stroke="#e8f9ff" stroke-width="2"/><path d="M10 25h44M10 39h44" stroke="#e8f9ff" stroke-width="2"/><circle cx="46" cy="17" r="6" fill="#c6f3e2"/>';
 if(id==='yellowpages')return '<rect x="13" y="10" width="38" height="45" rx="7" fill="#fff8d8"/><path d="M21 10v45" stroke="#e1b548" stroke-width="2"/><path d="m30 26 12-5v18l-12-5h-5v-8Z" fill="#d99b24"/><path d="m28 35 2 9h5l-3-9" fill="#d99b24"/><path d="M45 27v7" stroke="#d99b24" stroke-width="2" stroke-linecap="round"/>';
 if(id==='racing')return `<path d="M18 11v44" stroke="#fff6ee" stroke-width="3" stroke-linecap="round"/><path d="M20 14c10-8 17 6 30-1v24c-13 7-20-7-30 1Z" fill="#fff7ee"/><path d="M21 15h7v8h-7Zm14 2h7v8h-7Zm7 8h8v8h-8ZM28 23h7v9h-7Z" fill="#ba5b42"/>`;
 if(id==='time-trials')return '<circle cx="32" cy="35" r="20" fill="#f0faff"/><path d="M32 12V7m-6 0h12m9 10 4-4" stroke="#effaff" stroke-width="3" stroke-linecap="round"/><path d="M32 19v16l11 7" fill="none" stroke="#4c8bac" stroke-width="3" stroke-linecap="round"/><circle cx="32" cy="35" r="3" fill="#4c8bac"/>';
 if(id==='guber')return '<path d="M32 9c-12 0-21 9-21 20 0 15 21 28 21 28s21-13 21-28C53 18 44 9 32 9Z" fill="#eef5f8"/><circle cx="32" cy="28" r="10" fill="#577384"/><path d="m25 28 4 4 10-10" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>';
 if(id==='y')return '<path d="m14 13 14 23v16h8V36l14-23H40L32 28 24 13Z" fill="#f3f5f8"/>';

 if(id==='kilogram')return '<rect x="14" y="14" width="36" height="36" rx="11" fill="none" stroke="#fff" stroke-width="4"/><circle cx="32" cy="32" r="8.5" fill="none" stroke="#fff" stroke-width="4"/><circle cx="43" cy="21" r="2.8" fill="#fff"/>';
 if(id==='binge')return '<path d="M20 13v35h12c15 0 22-15 11-23-5-4-11-3-16 0V13Z" fill="#fff8fc"/><path d="M29 32c3-4 9-2 8 2-1 3-5 6-5 6s-5-3-5-6c0-1 1-2 2-2Z" fill="#a46894"/>';

 if(id==='settings')return `<g transform="translate(32 32)" fill="#e0e5ee">${Array.from({length:12},(_,i)=>`<rect x="-3.5" y="-23" width="7" height="10" rx="1.7" transform="rotate(${i*30})"/>`).join('')}<circle r="18" fill="#d7dfeb"/><circle r="14" fill="#717d91"/><circle r="10.5" fill="#a6b1c4"/><circle r="6" fill="#465365"/><circle r="3" fill="#bdcbdd"/></g>`;
 if(id==='vehicles'||id==='cars')return '<path d="m14 29 5-12h26l6 12v20h-7v-6H19v6h-7V31Z" fill="#f4f6ff"/><path d="m20 20-3 10h30l-4-10Z" fill="#526690"/><path d="M17 37h7m16 0h7" stroke="#6178a9" stroke-width="3" stroke-linecap="round"/><rect x="27" y="35" width="10" height="5" rx="2" fill="#839ad0"/>';
 if(id==='store')return '<g fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round"><path d="m20 49 19-34M25 15l16 28M13 39h38"/></g><path d="m40 43 5 7" stroke="#cde9ff" stroke-width="4" stroke-linecap="round"/>';
 if(id==='housing')return '<path d="m10 30 22-19 22 19-4 5-18-15-18 15Z" fill="#fff4e3"/><path d="M17 31v22h30V31L32 19Z" fill="#fff4e3"/><rect x="27" y="34" width="11" height="19" rx="2" fill="#f09b3c"/><rect x="22" y="28" width="5" height="5" rx="1" fill="#f09b3c"/>';
 if(id==='news')return '<rect x="12" y="12" width="40" height="41" rx="6" fill="#fff6f2"/><rect x="18" y="20" width="11" height="17" rx="2" fill="#ef6b69"/><path d="M34 21h11M34 27h11M34 33h11M19 43h26" stroke="#b2a0a1" stroke-width="2.5" stroke-linecap="round"/>';
 if(id==='wenmo'||id==='bankbusters')return '<rect x="12" y="17" width="39" height="33" rx="7" fill="#f2f7ff"/><path d="m17 17 23-7 3 7" fill="#b5d6f8"/><rect x="33" y="28" width="20" height="13" rx="4" fill="#799bdc"/><circle cx="39" cy="34.5" r="2" fill="#f9fbff"/><path d="M18 24h25" stroke="#a0b5db" stroke-width="2" stroke-linecap="round"/>';
 if(id==='busdriver')return '<rect x="15" y="10" width="34" height="42" rx="7" fill="#fff9e6"/><rect x="20" y="17" width="24" height="18" rx="3" fill="#c38f43"/><path d="M18 51v5m28-5v5" stroke="#fff9e6" stroke-width="5" stroke-linecap="round"/><circle cx="23" cy="43" r="3" fill="#d7a84f"/><circle cx="41" cy="43" r="3" fill="#d7a84f"/>';
 if(id==='jobcenter'||id==='employment')return '<rect x="12" y="23" width="40" height="28" rx="6" fill="#eff8ff"/><path d="M25 23v-7h14v7" fill="none" stroke="#eff8ff" stroke-width="4" stroke-linejoin="round"/><path d="M13 34c14 8 26 8 38 0" fill="none" stroke="#6b94be" stroke-width="2"/><rect x="28" y="32" width="8" height="8" rx="2" fill="#769fc6"/>';
 if(id==='crypto')return '<ellipse cx="32" cy="20" rx="17" ry="7" fill="none" stroke="white" stroke-width="3"/><path d="M15 20v23c0 4 8 8 17 8s17-4 17-8V20M15 31c0 4 8 8 17 8s17-4 17-8M15 42c0 4 8 8 17 8s17-4 17-8" fill="none" stroke="white" stroke-width="3" stroke-linecap="round"/><path d="M32 16v9m-4-6h6a2 2 0 0 1 0 4h-5a2 2 0 0 0 0 4h6" fill="none" stroke="#efe6ff" stroke-width="1.5" stroke-linecap="round"/>';
 if(id==='details')return '<rect x="10" y="16" width="44" height="33" rx="6" fill="#f4f5ff"/><circle cx="24" cy="28" r="5" fill="#7f93cc"/><path d="M16 42v-2a8 8 0 0 1 16 0v2" fill="#7f93cc"/><path d="M38 25h9M38 32h9M38 39h6" stroke="#9eadd8" stroke-width="2.5" stroke-linecap="round"/>';
 if(id==='gallery')return `<g transform="translate(32 32)">${['#fcab32','#fb6d47','#ee506c','#bf67bf','#8984d7','#66b2df','#6bc7b2','#b3d760'].map((c,i)=>`<ellipse cx="0" cy="-11" rx="7.1" ry="12.2" transform="rotate(${i*45})" fill="${c}" fill-opacity=".85"/>`).join('')}<circle r="4" fill="white" fill-opacity=".48"/></g>`;
 if(id==='camera')return '<rect x="12" y="21" width="40" height="29" rx="8" fill="#262c37"/><path d="M22 21l4-6h12l4 6" fill="#262c37"/><circle cx="32" cy="35" r="12" fill="#657286"/><circle cx="32" cy="35" r="9" fill="#162637"/><circle cx="32" cy="35" r="6" fill="#344e61"/><circle cx="29" cy="32" r="2.5" fill="#b6ebee" opacity=".75"/><circle cx="46" cy="26" r="2" fill="#dde4e8"/>';
 if(id==='documents')return '<rect x="12" y="8" width="40" height="48" rx="6" fill="#fff" stroke="#d7d1c0" stroke-width="1.1"/><path d="M18 8h28a6 6 0 0 1 6 6v5H12v-5a6 6 0 0 1 6-6Z" fill="#f0c43c"/><path d="M20 28h24M20 35h24M20 42h24M20 49h16" stroke="#d0b85e" stroke-width="2" stroke-linecap="round"/>';
 if(id==='calculator')return '<g fill="white"><rect x="14" y="13" width="36" height="11" rx="4" opacity=".88"/><circle cx="21" cy="35" r="6" opacity=".45"/><circle cx="21" cy="49" r="6" opacity=".45"/><circle cx="43" cy="35" r="6" fill="#ffb13d"/><circle cx="43" cy="49" r="6" fill="#ffb13d"/><path d="M40 35h6M43 32v6M40 48h6M40 50h6" stroke="#39230d" stroke-width="1.5"/></g>';
 if(id==='contacts')return '<rect x="15" y="12" width="32" height="42" rx="6" fill="#f0e8de"/><rect x="46" y="19" width="4" height="7" rx="1" fill="#79baeb"/><rect x="46" y="29" width="4" height="7" rx="1" fill="#eaac59"/><rect x="46" y="39" width="4" height="7" rx="1" fill="#b296d4"/><circle cx="30" cy="27" r="6" fill="#a48e7f"/><path d="M19 45v-3a11 11 0 0 1 22 0v3" fill="#a48e7f"/>';
 if(id==='calls')return '<path d="M21 13c-2-1-7 3-8 6-2 7 10 25 23 31 7 3 12-4 12-6 0-2-9-7-11-6l-4 3c-5-3-9-7-12-12l3-4c2-2-2-11-3-12Z" fill="white"/>';
 if(id==='messages')return '<path d="M53 30c0 11-10 18-21 18-3 0-7-1-10-2l-9 5 3-10c-3-3-5-7-5-11 0-10 10-18 21-18s21 8 21 18Z" fill="white"/>';
 if(id==='weather')return '<circle cx="43" cy="21" r="9" fill="#ffe9a7"/><path d="M17 43a8 8 0 0 1 2-16 13 13 0 0 1 25-3 9 9 0 1 1 2 19H17Z" fill="white"/><path d="m24 48-2 5m12-5-2 5m12-5-2 5" fill="none" stroke="#eaf8ff" stroke-width="2.4" stroke-linecap="round"/>';
 if(id==='mails')return '<rect x="10" y="17" width="44" height="32" rx="6" fill="white"/><path d="m12 20 20 15 20-15M12 47l14-13m26 13-14-13" fill="none" stroke="#3899ef" stroke-width="2" stroke-linejoin="round"/>';
 if(id==='facetime')return '<rect x="10" y="20" width="29" height="25" rx="6" fill="white"/><path d="m41 27 11-7v25l-11-7Z" fill="white"/>';
 if(id==='peakify')return '<path d="M27 19v27c0 8-14 9-14 2 0-5 5-8 10-7V17l26-5v27c0 8-14 9-14 2 0-5 5-8 10-7V23l-18 4Z" fill="white"/>';
 return null;
}
let iconSerial=0;
export function appIcon(app){
 const id=app.id+'-'+(++iconSerial), [a,b]=palettes[app.id]||['#a6bce5','#4a6d9e'];
 const mark=(app.ownerIconOverride?null:special(app.id))||icon(app.icon).replace('<svg ', '<svg x="15" y="15" width="34" height="34" ').replace('stroke-width="1.7"','stroke-width="1.95"');
 // IDs are catalogue constants, not player-supplied content.
 return `<svg class="ios-app-icon" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><defs><linearGradient id="ic-${id}" x1="0" x2=".75" y1="0" y2="1"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient><linearGradient id="shine-${id}" x2=".5" y2="1"><stop stop-color="white" stop-opacity=".48"/><stop offset=".52" stop-color="white" stop-opacity=".04"/><stop offset="1" stop-color="white" stop-opacity=".13"/></linearGradient></defs><path class="icon-base" d="${squircle}" fill="url(#ic-${id})"/><path d="M9 7C17 1 44 1 56 7L56 19C40 29 24 31 8 27Z" fill="white" opacity=".12"/><g class="icon-color" color="white">${mark}</g><path d="${squircle}" fill="none" stroke="url(#shine-${id})" stroke-width="1.4"/></svg>`;
}
export const iconPalettes=Object.freeze(palettes);
