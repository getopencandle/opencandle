import {expect,it} from 'vitest';
import {readFileSync,readdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
const nodeRequire=createRequire(import.meta.url);

// Tool About source links: the renderer names a source address, main opens it only when it is http or https, carries no
// credentials and sits on a reference host. The host list stays equal to the hosts the bundled notes link to.
const main=readFileSync('electron/main.cjs','utf8'),preload=readFileSync('electron/preload.cjs','utf8');
const hostsSource=/const REFERENCE_LINK_HOSTS=new Set\((\[[^\]]*\])\);/.exec(main)?.[1];
const inputSource=/const referenceLinkInput=value=>\{[\s\S]*?\n\};/.exec(main)?.[0];
const validation=nodeRequire('../../electron/validation.cjs');
const check:(value:unknown)=>string=runInNewContext(`const REFERENCE_LINK_HOSTS=new Set(${hostsSource});${inputSource};referenceLinkInput`,{validation,URL});
const hosts=new Set<string>(JSON.parse(String(hostsSource).replace(/'/g,'"')));

it('opens through one handler with the checked address and stays out of layout windows',()=>{
 expect(main).toContain("'lv:help:open-reference': async value => {const url=referenceLinkInput(value);await require('electron').shell.openExternal(url);return {opened:true};},");
 expect(preload).toContain("openReferenceLink: value => invoke('lv:help:open-reference', value),");
 const {secondaryChannels,SECONDARY_CHANNELS}=nodeRequire('../../electron/windows.cjs');
 expect((SECONDARY_CHANNELS??secondaryChannels??[]) as string[]).not.toContain('lv:help:open-reference');
});
it('accepts only http and https reference addresses without credentials, exactly {url}',()=>{
 expect(check({url:'https://chartschool.stockcharts.com/table-of-contents'})).toBe('https://chartschool.stockcharts.com/table-of-contents');
 expect(check({url:'http://ta-lib.org/'})).toBe('http://ta-lib.org/');
 for(const value of [undefined,null,'https://ta-lib.org/',{},{url:1},{url:'https://ta-lib.org/',extra:1},{url:'javascript:alert(1)'},{url:'file:///C:/Windows/notepad.exe'},{url:'data:text/html,x'},
  {url:'https://example.com/'},{url:'https://ta-lib.org.example.com/'},{url:'https://user:pw@ta-lib.org/'},{url:'ms-settings:'},{url:'https://ta-lib.org/'+'a'.repeat(2048)},{url:'not a url'}])
  expect(()=>check(value),JSON.stringify(value)).toThrow();
});
it('lists exactly the hosts the reference notes link to',()=>{
 const used=new Set<string>();
 for(const name of readdirSync('docs/reference/tools').filter(file=>file.endsWith('.md'))){
  const text=readFileSync('docs/reference/tools/'+name,'utf8');
  for(const match of text.matchAll(/^\s+url:\s*(https?:\/\/\S+)\s*$/gm))used.add(new URL(match[1]).hostname);
  for(const match of text.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g))used.add(new URL(match[1]).hostname);
 }
 expect([...used].filter(host=>!hosts.has(host)).sort(),'hosts linked by the notes but not allowed in main').toEqual([]);
 expect([...hosts].filter(host=>!used.has(host)).sort(),'allowed hosts no note links to').toEqual([]);
});
