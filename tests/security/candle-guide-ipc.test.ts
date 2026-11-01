import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
const nodeRequire=createRequire(import.meta.url);

// Candlestick guide link: the renderer may name only a #section; main builds the address from one fixed origin and path.
const main=readFileSync('electron/main.cjs','utf8'),preload=readFileSync('electron/preload.cjs','utf8');
const validation=nodeRequire('../../electron/validation.cjs');
const urlSource=/const CANDLE_GUIDE_URL='[^']*';/.exec(main)?.[0];
const targetSource=/const candleGuideTarget=value=>\{[\s\S]*?\n\};/.exec(main)?.[0];
const check:(value?:unknown)=>string=runInNewContext(`${urlSource};${targetSource};candleGuideTarget`,{validation});

it('opens through one handler with the checked address and stays out of layout windows',()=>{
 expect(urlSource).toBe("const CANDLE_GUIDE_URL='https://getopencandle.com/candles/';");
 expect(main).toContain("'lv:help:open-candle-guide': async value => {const url=candleGuideTarget(value);await require('electron').shell.openExternal(url);return {opened:true};},");
 expect(preload).toContain("openCandleGuide: value => invoke('lv:help:open-candle-guide', value),");
 const {secondaryChannels,SECONDARY_CHANNELS}=nodeRequire('../../electron/windows.cjs');
 expect((SECONDARY_CHANNELS??secondaryChannels??[]) as string[]).not.toContain('lv:help:open-candle-guide');
});
it('opens the guide page, or one lowercase #section of it',()=>{
 expect(check()).toBe('https://getopencandle.com/candles/');
 expect(check({})).toBe('https://getopencandle.com/candles/');
 expect(check({fragment:'bullish-engulfing'})).toBe('https://getopencandle.com/candles/#bullish-engulfing');
 expect(check({fragment:'a'.repeat(64)})).toBe('https://getopencandle.com/candles/#'+'a'.repeat(64));
});
it('rejects any other host, path, scheme, credentials, query or fragment shape',()=>{
 for(const value of [null,'x','https://getopencandle.com/candles/',['x'],{url:'https://getopencandle.com/candles/'},{fragment:'ok',extra:1},{fragment:''},{fragment:1},{fragment:null},{fragment:'Upper'},
  {fragment:'a b'},{fragment:'a/b'},{fragment:'a?b=1'},{fragment:'a#b'},{fragment:'#a'},{fragment:'a_b'},{fragment:'a'.repeat(65)},{fragment:'..'+'/x'},{fragment:'@evil.com'},{fragment:'é'},
  {host:'example.com'},{path:'/other/'},{scheme:'http'},{username:'u',password:'p'}])
  expect(()=>check(value),JSON.stringify(value)).toThrow();
});
