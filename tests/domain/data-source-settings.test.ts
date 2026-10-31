import {afterEach,expect,it} from 'vitest';
import {createRequire} from 'node:module';
import {mkdtempSync,rmSync,writeFileSync,existsSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DATA_NEEDS,dataNeedStatus,describeKeyProtection,type DataNeedInputs} from '../../src/domain/data-source-settings';

// The needs table, the settings file rules and the key store's "cannot unlock" state. Fake keys only.
const require=createRequire(path.resolve('electron/data-sources.cjs'));
const sources=require('./data-sources.cjs');
const {AlpacaKeyStore}=require('./public-alpaca.cjs');
const temps:string[]=[];
afterEach(()=>{for(const dir of temps.splice(0))rmSync(dir,{recursive:true,force:true});});
const base:DataNeedInputs={alpacaKey:{configured:false,keyIdHint:null,encryption:true},alpacaStream:null,coinbaseEnabled:false,fredEnabled:true,desktop:true};

it('lists every need in plain words: no em dashes, no internal ids, a minimum and a how-to for each',()=>{
  expect(DATA_NEEDS.map(row=>row.id)).toEqual(['demo','stocks-live','stocks-history','crypto','macro','fundamentals','own-files','other-markets']);
  for(const row of DATA_NEEDS){
    const text=[row.title,row.minimum,row.gives,row.howTo].join(' ');
    expect(text).not.toMatch(/\u2014|\u2013/);
    expect(text).not.toMatch(/lv-|alpaca-iex|owner-key|public-unauthenticated|SYNTHETIC|fixture/i);
    expect(row.minimum.length).toBeGreaterThan(5);expect(row.howTo.length).toBeGreaterThan(10);
  }
  const stocks=DATA_NEEDS.find(row=>row.id==='stocks-live')!;
  expect(stocks.minimum).toBe('A free Alpaca account and its API key.');
  expect(stocks.gives).toMatch(/IEX/);expect(stocks.gives).toMatch(/30 symbols/);expect(stocks.gives).toMatch(/paid/);
  for(const id of ['crypto','macro','fundamentals'] as const)expect(DATA_NEEDS.find(row=>row.id===id)!.minimum).toBe('Nothing. No account or key.');
});
it('status pills follow the real state and never claim Connected without a running stream',()=>{
  expect(dataNeedStatus('stocks-live',base)).toEqual({state:'not-set-up',label:'Not set up'});
  const saved={...base,alpacaKey:{configured:true,keyIdHint:'****ABCD',encryption:true}};
  expect(dataNeedStatus('stocks-live',saved).label).toBe('Key saved');
  expect(dataNeedStatus('stocks-live',{...saved,alpacaStream:{state:'ready'} as any}).label).toBe('Connected');
  expect(dataNeedStatus('stocks-history',{...saved,alpacaStream:{state:'ready'} as any}).label).toBe('Key saved');
  expect(dataNeedStatus('stocks-live',{...saved,alpacaStream:{state:'auth-failed'} as any}).state).toBe('attention');
  expect(dataNeedStatus('stocks-live',{...base,alpacaKey:{configured:false,keyIdHint:null,encryption:true,unreadable:true}}).label).toBe('Enter your key again');
  expect(dataNeedStatus('stocks-live',{...base,alpacaKey:{configured:false,keyIdHint:null,encryption:false}}).label).toBe('Cannot save keys here');
  expect(dataNeedStatus('crypto',base)).toEqual({state:'off',label:'Switched off'});expect(dataNeedStatus('crypto',{...base,coinbaseEnabled:true}).label).toBe('On');
  expect(dataNeedStatus('macro',{...base,fredEnabled:false}).label).toBe('Downloads off');
  expect(dataNeedStatus('crypto',{...base,desktop:false}).label).toBe('Needs the desktop app');
  expect(dataNeedStatus('demo',{...base,desktop:false}).label).toBe('Ready');
  expect(describeKeyProtection({encryption:false})).toMatch(/will not save API keys/);
});
it('the settings file round-trips the non-secret choices and refuses keys, other files and newer versions',()=>{
  const settings={coinbase:true,alpacaSymbols:['AAPL','AAPL','BRK.B'],alpacaPlan:'paid',fred:false};
  const text=sources.serializeSettings(settings,new Date('2026-10-29T00:00:00Z'));
  expect(text).not.toMatch(/secret|keyId/i);
  expect(sources.parseSettingsFile(text)).toEqual({coinbase:true,alpacaSymbols:['AAPL','BRK.B'],alpacaPlan:'paid',fred:false});
  expect(sources.parseSettingsFile(sources.serializeSettings({coinbase:false,alpacaSymbols:[],alpacaPlan:'free'}))).toEqual({coinbase:false,alpacaSymbols:[]});
  const doc=JSON.parse(text);
  expect(()=>sources.parseSettingsFile(JSON.stringify({...doc,settings:{...doc.settings,secret:'x'}}))).toThrow(/never imports keys/);
  expect(()=>sources.parseSettingsFile(JSON.stringify({...doc,apiKey:'x'}))).toThrow(/never imports keys/);
  expect(()=>sources.parseSettingsFile(JSON.stringify({...doc,schemaVersion:2}))).toThrow(/newer OpenCandle/);
  expect(()=>sources.parseSettingsFile(JSON.stringify({...doc,extra:1}))).toThrow(/damaged/);
  expect(()=>sources.parseSettingsFile('{"schemaVersion":1,"data":{}}')).toThrow(/not an OpenCandle data sources settings file/);
  expect(()=>sources.parseSettingsFile('not json')).toThrow(/not valid JSON/);
  expect(()=>sources.exportInput({settings:{...settings,alpacaSymbols:Array.from({length:31},(_,i)=>'A'+String.fromCharCode(65+i%26))}})).toThrow();
});
it('flags a profile inside the program folder (case-insensitive on Windows) and not one beside it',()=>{
  expect(sources.isInside('C:\\work\\OpenCandle\\local-data\\owner-preview','c:\\WORK\\opencandle','win32')).toBe(true);
  expect(sources.isInside('C:\\Users\\A\\AppData\\Roaming\\LarryVision','C:\\work\\OpenCandle','win32')).toBe(false);
  expect(sources.isInside('C:\\work\\OpenCandle-other','C:\\work\\OpenCandle','win32')).toBe(false);
  expect(sources.profileInfo({directory:'C:\\p',appFolders:['C:\\p\\app'],encryption:true,keySaved:false,platform:'win32'})).toEqual({directory:'C:\\p',insideAppFolder:false,encryption:true,keySaved:false});
});
it('a key file that cannot be unlocked reads as unreadable, is kept on disk, and a new save replaces it',async()=>{
  const dir=mkdtempSync(path.join(os.tmpdir(),'lv-datasrc-key-'));temps.push(dir);
  writeFileSync(path.join(dir,'alpaca-market-data.key'),'sealed-by-another-profile');
  const safeStorage={isEncryptionAvailable:()=>true,decryptString:()=>{throw Error('cannot unlock');},encryptString:(text:string)=>Buffer.from(text)};
  const store=new AlpacaKeyStore({safeStorage,directory:dir});
  expect(await store.status()).toEqual({configured:false,keyIdHint:null,encryption:true,unreadable:true});
  expect(existsSync(path.join(dir,'alpaca-market-data.key'))).toBe(true);
  expect(await store.save({keyId:'FAKEKEYID0000ABCD',secret:'FakeSecretForTestsOnly000000000'})).toEqual({configured:true,keyIdHint:'****ABCD',encryption:true});
  const fresh=new AlpacaKeyStore({safeStorage,directory:mkdtempSync(path.join(os.tmpdir(),'lv-datasrc-none-'))});temps.push(fresh.file.slice(0,-'alpaca-market-data.key'.length-1));
  expect(await fresh.status()).toEqual({configured:false,keyIdHint:null,encryption:true});
});
