import {cp,mkdir,readFile,readdir,unlink,stat} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

function contained(target,parent){const resolved=path.resolve(target);const relative=path.relative(path.resolve(parent),resolved);if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw new Error('Public package path escapes assigned directory.');return resolved;}
export async function copyDistribution(options,template,root){
  contained(template,path.join(root,'.tmp'));
  contained(options.dir,path.join(root,'.tmp'));
  contained(options.out,path.join(root,'out'));
  if(!/^win32-x64-template-/.test(path.basename(template)))throw new Error('Fallback requires the newly extracted public distribution.');
  const metadata=JSON.parse(await readFile(path.join(root,'node_modules/@electron/packager/package.json'),'utf8'));
  if(metadata.version!=='19.0.3')throw new Error('Copy adapter requires audited packager 19.0.3.');
  let zip;
  const cache=path.join(root,'.cache/electron');
  const filename='electron-v'+options.electronVersion+'-win32-x64.zip';
  for(const entry of await readdir(cache,{withFileTypes:true})){if(!entry.isDirectory())continue;const candidate=path.join(cache,entry.name,filename);try{if((await stat(candidate)).isFile())zip=candidate;}catch{}}
  if(!zip)throw new Error('Verified upstream distribution archive is missing.');
  const sourceSha256=createHash('sha256').update(await readFile(zip)).digest('hex');
  const checksumUrl='https://github.com/electron/electron/releases/download/v'+options.electronVersion+'/SHASUMS256.txt';
  const response=await fetch(checksumUrl);if(!response.ok)throw new Error('Official Electron checksums unavailable.');
  const sums=await response.text();const line=sums.split(/\r?\n/).find(line=>line.trim().endsWith('*'+filename)||line.trim().endsWith(' '+filename));
  const officialSha256=line?.trim().split(/\s+/)[0];
  if(!officialSha256||officialSha256!==sourceSha256)throw new Error('Upstream Electron archive checksum mismatch.');
  const verified=spawnSync('python',[path.join(root,'scripts/package-verify-template.py'),'--zip',zip,'--template',template],{encoding:'utf8',windowsHide:true});
  if(verified.status!==0)throw new Error('Extracted public template verification failed: '+verified.stderr);
  const {WindowsApp}=await import(pathToFileURL(path.join(root,'node_modules/@electron/packager/dist/win32.js')).href);
  class CopyWindowsApp extends WindowsApp{
    async initialize(){
      contained(this.stagingPath,options.out);
      await cp(this.templatePath,this.stagingPath,{recursive:true,errorOnExist:true,force:false});
      // These inherited methods retain pinned packager ASAR validation/integrity and copy filtering.
      await this.removeDefaultApp();
      await this.buildApp();
    }
    async renameElectron(){
      const original=contained(path.join(this.stagingPath,'electron.exe'),this.stagingPath);
      const renamed=contained(path.join(this.stagingPath,(options.name||'OpenCandle')+'.exe'),this.stagingPath);
      await cp(original,renamed,{errorOnExist:true,force:false});
      await unlink(original);
    }
  }
  const app=new CopyWindowsApp({...options,tmpdir:false,appVersion:JSON.parse(await readFile(path.join(options.dir,'package.json'),'utf8')).version,ignore:()=>false},template);
  const directory=await app.create();
  return {directory,distribution:{file:filename,sha256:sourceSha256,officialSha256,checksumUrl,extractedFilesVerified:JSON.parse(verified.stdout).files,packagingMode:'Verified public distribution copy; pinned packager ASAR and Windows resource integrity retained; no directory move or sandbox change.'}};
}
