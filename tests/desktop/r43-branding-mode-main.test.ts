import {existsSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {runInNewContext} from 'node:vm';
import {expect,it} from 'vitest';

// One brand. Executes the actual main-process icon selection with no Electron window and no asset probe.
const source=readFileSync('electron/main.cjs','utf8');
function icons(){
 const start=source.indexOf('// One brand. The window/taskbar icon'),end=source.indexOf("const { WorkspaceStore }",start);
 if(start<0||end<0)throw Error('Review the actual main branding boundary.');
 const required:string[]=[];
 const value=runInNewContext(source.slice(start,end)+';({appIcon,trayIcons,APP_USER_MODEL_ID})',{__dirname:'/SYNTHETIC/electron',path,require:(name:string)=>{required.push(name);throw Error('Unexpected synthetic dependency '+name);}});
 return{value,required};
}
it('the window icon and the four tray sizes are the generated OpenCandle files, chosen without any receipt or probe',()=>{
 const {value,required}=icons();
 expect(value.appIcon).toBe(path.join('/SYNTHETIC/electron','assets','opencandle-256.png'));
 expect(Object.keys(value.trayIcons)).toEqual(['16','20','24','32']);
 for(const size of [16,20,24,32])expect(value.trayIcons[size]).toBe(path.join('/SYNTHETIC/electron','assets','opencandle-tray-'+size+'.png'));
 expect(required).toEqual([]);
 for(const file of [value.appIcon,...Object.values(value.trayIcons) as string[]])expect(existsSync(path.join('electron','assets',path.basename(file)))).toBe(true);
 expect(source).not.toMatch(/branding-mode\.json|larryvision-mark|larryvision-logo/);
});
it('sets the Windows AppUserModelID once, before the profile lock, and passes the tray sizes to the tray',()=>{
 expect(icons().value.APP_USER_MODEL_ID).toBe('com.getopencandle.app');
 const aumid=source.indexOf("if(process.platform==='win32')app.setAppUserModelId(APP_USER_MODEL_ID);"),lock=source.indexOf('app.requestSingleInstanceLock()');
 expect(aumid).toBeGreaterThan(0);expect(aumid).toBeLessThan(lock);
 expect(source.match(/setAppUserModelId\(/g)).toHaveLength(1);
 expect(source).toContain('iconPath:appIcon,iconPaths:trayIcons,getWindow');
 expect(source.match(/title:'OpenCandle',\s?icon:appIcon/g)).toHaveLength(2);
});
it('the exe icon holds every Windows shell size and the About/menu logos have their exact sizes',()=>{
 const ico=readFileSync('electron/assets/opencandle.ico');
 expect(ico.readUInt16LE(0)).toBe(0);expect(ico.readUInt16LE(2)).toBe(1);
 const count=ico.readUInt16LE(4),sizes=[];
 for(let i=0;i<count;i++){const w=ico[6+i*16];sizes.push(w===0?256:w);}
 expect(sizes.sort((a,b)=>a-b)).toEqual([16,20,24,32,40,48,64,128,256]);
 for(const [file,size] of [['opencandle-256.png',256],['opencandle-logo-512.png',512],['opencandle-mark-64.png',64],['opencandle-favicon-32.png',32]] as const){
  const png=readFileSync(path.join('electron/assets',file));expect(png.readUInt32BE(16)).toBe(size);expect(png.readUInt32BE(20)).toBe(size);
 }
 expect(readFileSync('electron/assets/opencandle-mark-64.png').length).toBeLessThan(20000);
});
