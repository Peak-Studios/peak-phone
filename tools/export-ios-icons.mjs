/** Regenerate original vector icons from the one shared catalogue. No external artwork/fonts. */
import {writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {APPS} from '../web/public/duo/catalog.mjs';
import {appIcon} from '../web/public/duo/ios-icons.mjs';
const target=new URL('../web/public/images/ios/',import.meta.url);mkdirSync(target,{recursive:true});
for(const app of APPS){const svg=appIcon(app).replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" ');writeFileSync(new URL(app.id+'.svg',target),svg);}
console.log(`Exported ${APPS.length} SVG icons to ${fileURLToPath(target)}`);
