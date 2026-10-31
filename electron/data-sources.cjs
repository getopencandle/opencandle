'use strict';
// The Data sources page's "Your saved info" helpers. Pure functions: no Electron, network, child process or shell
// access (main.cjs does the dialogs, the folder opening and the file writes). main.cjs loads this module lazily, on the first
// Data sources call, so a session that never opens the page never loads it.
//
// The settings file holds only the non-secret provider choices (Coinbase on or off, the Alpaca plan and symbols, FRED on or
// off). It never holds an API key: keys stay encrypted in the profile and must be entered again on another computer.
const path=require('node:path');
const {BoundaryError,exactKeys}=require('./validation.cjs');
const SETTINGS_KIND='lv-data-sources';
const SETTINGS_FILE_NAME='OpenCandle-data-sources.json';
const SETTINGS_MAX_BYTES=64*1024;
const MAX_SYMBOLS=30;
const SYMBOL=/^[A-Z]{1,5}(?:\.[A-Z]{1,3}){0,2}$/; // the same rule as public-alpaca.cjs and ALPACA_SYMBOL
const KEY_NOTE='API keys are never written to this file. After importing, enter your Alpaca key again in Data sources.';
const fail=message=>{throw new BoundaryError('INVALID_ARGUMENT',message);};
/** The non-secret provider choices, exactly as the renderer keeps them (LiveDataChoices). */
function settingsInput(value){
  exactKeys(value,['coinbase','alpacaSymbols'],['alpacaPlan','fred']);
  if(typeof value.coinbase!=='boolean')fail('Coinbase must be on or off.');
  if(!Array.isArray(value.alpacaSymbols)||value.alpacaSymbols.length>MAX_SYMBOLS)fail('List at most 30 Alpaca symbols.');
  const symbols=value.alpacaSymbols.map(item=>{if(typeof item!=='string'||!SYMBOL.test(item))fail('An Alpaca symbol is not a US stock symbol.');return item;});
  if(value.alpacaPlan!==undefined&&value.alpacaPlan!=='free'&&value.alpacaPlan!=='paid')fail('The Alpaca plan must be free or paid.');
  if(value.fred!==undefined&&typeof value.fred!=='boolean')fail('FRED downloads must be on or off.');
  return{coinbase:value.coinbase,alpacaSymbols:[...new Set(symbols)],...(value.alpacaPlan==='paid'?{alpacaPlan:'paid'}:{}),...(value.fred===false?{fred:false}:{})};
}
/** Export input from the renderer: exactly {settings}. Anything else (a key field, a path) is refused. */
function exportInput(value){exactKeys(value,['settings']);return settingsInput(value.settings);}
function serializeSettings(settings,now=new Date()){
  return JSON.stringify({kind:SETTINGS_KIND,schemaVersion:1,exportedAt:now.toISOString(),note:KEY_NOTE,settings:settingsInput(settings)},null,2)+'\n';
}
/** Parses an imported settings file. A file that carries anything that looks like a key is refused, not silently trimmed. */
function parseSettingsFile(text){
  if(typeof text!=='string'||text.length>SETTINGS_MAX_BYTES)throw new BoundaryError('FILE_TOO_LARGE','A data sources settings file is at most 64 KB.');
  let data;try{data=JSON.parse(text);}catch{throw new BoundaryError('INVALID_FORMAT','This file is not an OpenCandle data sources settings file (it is not valid JSON).');}
  if(!data||typeof data!=='object'||Array.isArray(data)||data.kind!==SETTINGS_KIND)throw new BoundaryError('INVALID_FORMAT','This file is not an OpenCandle data sources settings file.');
  if(data.schemaVersion!==1)throw new BoundaryError('INVALID_FORMAT','This settings file comes from a newer OpenCandle. Update OpenCandle and try again.');
  if(/"(?:secret|secretKey|keyId|apiKey|key)"\s*:/i.test(text))throw new BoundaryError('INVALID_FORMAT','This settings file contains key fields. OpenCandle never imports keys from a file; enter your key in Data sources instead.');
  try{exactKeys(data,['kind','schemaVersion','settings'],['exportedAt','note']);return settingsInput(data.settings);}
  catch(error){throw new BoundaryError('INVALID_FORMAT','This data sources settings file is damaged: '+(error instanceof Error?error.message:'unexpected content.'));}
}
/** True when `child` is `parent` or inside it (case-insensitive on Windows). */
function isInside(child,parent,platform=process.platform){
  if(typeof child!=='string'||typeof parent!=='string'||!child||!parent)return false;
  const p=platform==='win32'?path.win32:path,norm=value=>platform==='win32'?p.resolve(value).toLowerCase():p.resolve(value);
  const relative=p.relative(norm(parent),norm(child));
  return relative===''||(!relative.startsWith('..')&&!p.isAbsolute(relative));
}
/** What the page shows about where things are saved. `appFolders` are the program folders (the checkout or the portable folder). */
function profileInfo({directory,appFolders=[],encryption,keySaved,platform=process.platform}){
  const inside=appFolders.some(folder=>isInside(directory,folder,platform));
  return{directory,insideAppFolder:inside,encryption:encryption===true,keySaved:keySaved===true};
}
module.exports={SETTINGS_KIND,SETTINGS_FILE_NAME,SETTINGS_MAX_BYTES,KEY_NOTE,settingsInput,exportInput,serializeSettings,parseSettingsFile,isInside,profileInfo};
