import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

// Electron/main.cjs called clipboard.writeImage, which the installed Electron (44.x) no longer has, so
// Copy chart image threw in the packaged app while the mocked unit test passed. This guard reads the installed
// node_modules/electron/electron.d.ts and requires every `<module>.<method>(` call that main.cjs makes on an Electron main
// module to be a member that the declaration file actually declares. Static text check only; nothing is launched.
const main=readFileSync('electron/main.cjs','utf8'),types=readFileSync('node_modules/electron/electron.d.ts','utf8');
/** Module binding in main.cjs -> its declaration in electron.d.ts (interface or class; class members include statics). */
const MODULES:Record<string,{kind:'interface'|'class';name:string}>={
 app:{kind:'interface',name:'App'},clipboard:{kind:'interface',name:'Clipboard'},dialog:{kind:'interface',name:'Dialog'},
 ipcMain:{kind:'interface',name:'IpcMain'},protocol:{kind:'interface',name:'Protocol'},nativeImage:{kind:'class',name:'NativeImage'},
 Menu:{kind:'class',name:'Menu'},utilityProcess:{kind:'class',name:'UtilityProcess'},Notification:{kind:'class',name:'Notification'},
 session:{kind:'class',name:'Session'},
};
/** Members inherited from Node's EventEmitter, for declarations that extend it. */
const EMITTER=['on','once','off','addListener','removeListener','removeAllListeners','emit','listeners','listenerCount','prependListener','prependOnceListener','eventNames','setMaxListeners','getMaxListeners','rawListeners'];
function declaration(kind:'interface'|'class',name:string):{body:string;emitter:boolean}{
 const header=new RegExp(`^  ${kind} ${name}(?: extends ([\\w.]+))? \\{$`,'m'),match=header.exec(types);
 if(!match)throw Error(`electron.d.ts declares no ${kind} ${name}`);
 const end=types.indexOf('\n  }\n',match.index);if(end<0)throw Error(`Unterminated ${kind} ${name}`);
 return{body:types.slice(match.index,end),emitter:/EventEmitter/.test(match[1]??'')};
}
function members(kind:'interface'|'class',name:string):Set<string>{
 const {body,emitter}=declaration(kind,name),out=new Set<string>(emitter?EMITTER:[]);
 for(const row of body.matchAll(/^    (?:static\s+)?(?:readonly\s+)?([A-Za-z_$][\w$]*)\s*[(<:?]/gm))out.add(row[1]);
 return out;
}
/** `<module>.<method>(` calls in main.cjs, with the destructured `require('electron')` bindings only. */
function calls():Array<{module:string;method:string}>{
 const imported=/const \{([^}]*)\}\s*=\s*require\('electron'\)/.exec(main);if(!imported)throw Error('main.cjs no longer destructures electron');
 const names=imported[1].split(',').map(part=>part.trim().split(':').at(-1)!.trim()).filter(Boolean);
 const out:Array<{module:string;method:string}>=[];
 for(const name of names)for(const row of main.matchAll(new RegExp(`(?<![\\w$.])${name}\\.([A-Za-z_$][\\w$]*)\\s*\\(`,'g')))out.push({module:name,method:row[1]});
 return out;
}

it('the installed Electron Clipboard has no writeImage; the async write(ClipboardItem[]) API is the image path',()=>{
 const clipboard=members('interface','Clipboard');
 expect(clipboard.has('writeImage')).toBe(false);
 expect([...clipboard].filter(name=>['clear','has','read','readText','write','writeText'].includes(name)).sort()).toEqual(['clear','has','read','readText','write','writeText']);
 expect(types).toMatch(/^    write\(data: ClipboardItem\[\]\): Promise<void>;$/m);
 expect(types).toMatch(/^    class ClipboardItem extends Electron\.ClipboardItem \{\}$/m);// exported from the main-process module
});
it('every clipboard.<method>(call in electron/main.cjs is declared by the installed Clipboard interface',()=>{
 const declared=members('interface','Clipboard'),used=calls().filter(call=>call.module==='clipboard');
 expect(used.length,'main.cjs writes the chart image to the clipboard').toBeGreaterThan(0);
 for(const call of used)expect(declared.has(call.method),'clipboard.'+call.method).toBe(true);
});
it('every call main.cjs makes on a mapped Electron main module is declared in electron.d.ts',()=>{
 const used=calls(),unmapped=[...new Set(used.map(call=>call.module))].filter(name=>!MODULES[name]&&!['BrowserWindow','Tray'].includes(name));
 expect(unmapped,'map each called Electron module to its declaration').toEqual([]);
 const missing=used.filter(call=>MODULES[call.module]&&!members(MODULES[call.module].kind,MODULES[call.module].name).has(call.method)).map(call=>call.module+'.'+call.method);
 expect(missing).toEqual([]);
});
it('the guard itself rejects an undeclared member',()=>{
 expect(members('interface','Clipboard').has('writeImage')).toBe(false);
 expect(members('interface','App').has('getPath')).toBe(true);
 expect(members('class','NativeImage').has('createFromBuffer')).toBe(true);
 expect(members('interface','IpcMain').has('handle')).toBe(true);
});
