import fs from 'node:fs';
import path from 'node:path';
import {createServer} from 'vite';
import {chromium} from 'playwright';
const project=process.cwd().replaceAll('\\','/'),stage=process.env.LV_SNAPSHOT_OUTPUT||project+'/.tmp/r41-snapshot-pixels',roots=[...JSON.parse(process.env.LV_SNAPSHOT_OVERLAYS||'[]'),project],clean=name=>name.replaceAll('\\','/');
const externalRoots=roots.filter(root=>!root.startsWith(project+'/')&&root!==project);
function mapped(name){name=clean(name);const owner=roots.find(root=>name.startsWith(root+'/'));if(!owner)return null;const rel=name.slice(owner.length+1);if(!/^(src|tests)\//.test(rel))return null;for(const root of roots)for(const ext of ['','.ts','.tsx','.js','/index.ts']){const candidate=root+'/'+rel+ext;if(fs.existsSync(candidate)&&fs.statSync(candidate).isFile())return candidate;}return null;}
fs.mkdirSync(stage+'/empty-env',{recursive:true});
const server=await createServer({configFile:false,root:project,envDir:stage+'/empty-env',publicDir:false,cacheDir:stage+'/vite-memory-check',optimizeDeps:{noDiscovery:true,include:['react','react-dom/client','react/jsx-dev-runtime','react/jsx-runtime','decimal.js']},server:{watch:null,host:'127.0.0.1',port:0,strictPort:true,fs:{allow:[project,...externalRoots]}},plugins:[{name:'snapshot-sparse-overlay',enforce:'pre',configureServer(server){server.middlewares.use('/snapshot-fixture',(_request,response)=>{response.setHeader('Content-Type','text/html');response.end('<!doctype html><html><body></body></html>');});},async resolveId(source,importer){if(source.startsWith('.')&&importer)return mapped(path.resolve(path.dirname(importer.split('?')[0]),source));if(path.isAbsolute(source))return mapped(source);if(importer&&externalRoots.some(root=>clean(importer).startsWith(root+'/'))&&!source.startsWith('\0'))return this.resolve(source,project+'/src/overlay-owner.ts',{skipSelf:true});return null;}}]});
let browser,context;
try{
 await server.listen();const address=server.httpServer.address(),origin='http://127.0.0.1:'+address.port;
 const executable=process.env.LV_SNAPSHOT_CHROME||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';browser=await chromium.launch({executablePath:executable,headless:true,args:['--disable-background-networking','--disable-component-update','--no-first-run']});context=await browser.newContext({viewport:{width:900,height:700}});const page=await context.newPage();
 await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 await page.goto(origin+'/snapshot-fixture');await page.evaluate(()=>{document.body.replaceChildren();});
 const result=await page.evaluate(async url=>{const module=await import(url);return module.runPixelCases();},origin+'/@fs/'+roots.map(root=>root+'/tests/ui/r41-snapshot-browser-fixture.tsx').find(name=>fs.existsSync(name)));
 const receipt={headless:true,isolatedContext:true,executable,version:browser.version(),result};fs.writeFileSync(stage+'/headless-pixels.json',JSON.stringify(receipt,null,2)+'\n');process.stdout.write(JSON.stringify(receipt)+'\n');
}finally{try{await context?.close();}finally{try{await browser?.close();}finally{await server.close();}}}
