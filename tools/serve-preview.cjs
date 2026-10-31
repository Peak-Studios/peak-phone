/** Zero-dependency, loopback-only browser preview. Serves public UI assets only, not resource Lua or server config. */
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../web/public');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.json':'application/json'};
const port=Number(process.env.PORT||8791);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Use a port between 1024 and 65535');
http.createServer((req,res)=>{
 let target;try{const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(name.includes('\0'))throw Error('Invalid path');target=path.resolve(root,'.'+(name==='/'?'/index.html':name));}catch{res.writeHead(400).end();return;}
 if(!target.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.stat(target,(error,stat)=>{if(error||!stat.isFile()){res.writeHead(404).end('Not found');return;}res.setHeader('Content-Type',mime[path.extname(target)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');fs.createReadStream(target).on('error',()=>res.destroy()).pipe(res);});
}).listen(port,'127.0.0.1',()=>console.log(`Browser preview: http://127.0.0.1:${port} (synthetic fixtures; no live gameplay)`));
