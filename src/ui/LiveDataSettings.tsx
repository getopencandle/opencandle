import React,{useEffect,useId,useRef,useState} from 'react';
import {LIVE_CRYPTO_SETTING,COINBASE_PRODUCTS} from '../domain/coinbase-live';
import {ALPACA_DATA_PLAN_SETTING,ALPACA_SETTING,alpacaSettingLabel,ALPACA_SYMBOL,ALPACA_MAX_SYMBOLS,alpacaAssetNotice,type AlpacaAsset,usMarketSession,alpacaMarketNow,type AlpacaBridge,type AlpacaDataPlan,type AlpacaKeyStatus,type AlpacaStatus} from '../domain/alpaca-live';
import type {LiveBridgeResult} from '../domain/live-provider';
import {useMinuteTick} from './use-minute-tick';

/**
 * Live data settings panel: the Coinbase public-feed switch (off by default) and the owner's own Alpaca key.
 * The secret lives in this component only between typing and Save; it is cleared from state right after the
 * request, never echoed back (the desktop process returns a 4-character key ID hint only) and never persisted here.
 * Standalone: App.tsx does the wiring.
 */
export type AlpacaSettingsBridge=Pick<AlpacaBridge,'alpacaKeyStatus'|'saveAlpacaKey'|'clearAlpacaKey'|'testAlpacaConnection'|'searchAlpacaAssets'>&{
 /** Optional: the live stream's state and its plain failure reason, shown under the key. */
 alpacaStatus?:()=>Promise<LiveBridgeResult<AlpacaStatus|null>>;
 onAlpacaEvent?:AlpacaBridge['onAlpacaEvent'];
};
export interface LiveDataSettingsProps {
 coinbaseEnabled:boolean;
 onCoinbaseEnabledChange:(enabled:boolean)=>void;
 /** Owner-chosen Alpaca symbols for symbol search (validated, at most 30). */
 alpacaSymbols:readonly string[];
 onAlpacaSymbolsChange:(symbols:string[])=>void;
 /** Reported after every key status read, so App can show or hide the Alpaca symbols in search. */
 onAlpacaKeyStatus?:(status:AlpacaKeyStatus)=>void;
 bridge:AlpacaSettingsBridge|null;
 /** Data plan, Free (IEX live, all-exchange history 15 minutes behind) or Paid (all exchanges live). */
 alpacaPlan?:AlpacaDataPlan;
 onAlpacaPlanChange?:(plan:AlpacaDataPlan)=>void;
}
export function parseAlpacaSymbols(text:string):{symbols:string[];error:string|null}{
 const items=text.toUpperCase().split(/[\s,;]+/).filter(Boolean),bad=items.filter(item=>!ALPACA_SYMBOL.test(item)),symbols=[...new Set(items.filter(item=>ALPACA_SYMBOL.test(item)))];
 if(bad.length)return {symbols,error:'Not a US stock symbol: '+bad.slice(0,3).join(', ')+'.'};
 if(symbols.length>ALPACA_MAX_SYMBOLS)return {symbols:symbols.slice(0,ALPACA_MAX_SYMBOLS),error:'The Alpaca Basic plan streams at most 30 symbols.'};
 return {symbols,error:null};
}
/** Add symbols to the saved list. Duplicates are skipped; a full list drops the oldest saved (the front), the same oldest-first rule as mergeStreamSymbols. */
export function addStreamSymbols(saved:readonly string[],add:readonly string[]):string[]{
 const next=[...saved];
 for(const symbol of add)if(ALPACA_SYMBOL.test(symbol)&&!next.includes(symbol)){next.push(symbol);if(next.length>ALPACA_MAX_SYMBOLS)next.shift();}
 return next;
}
const SUGGESTION_ROWS=8,SUGGEST_DELAY_MS=120;
/** Chips for the saved symbols plus an "Add symbol" combobox fed by the Alpaca asset list. */
export function AlpacaSymbolPicker(props:{symbols:readonly string[];onChange:(symbols:string[])=>void;keySaved:boolean;search?:AlpacaSettingsBridge['searchAlpacaAssets']}){
 const id=useId(),listId=id+'-list';
 const [text,setText]=useState(''),[open,setOpen]=useState(false),[active,setActive]=useState(-1);
 const [rows,setRows]=useState<{query:string;assets:AlpacaAsset[]}|null>(null),[failure,setFailure]=useState(''),[note,setNote]=useState('');
 const ticket=useRef(0),mounted=useRef(true),search=useRef(props.search);search.current=props.search;
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const query=text.trim().toUpperCase();
 useEffect(()=>{
  const mine=++ticket.current;
  if(!query||/[\s,;]/.test(query)||!search.current||!props.keySaved){setRows(null);return;}
  const timer=setTimeout(()=>{
   const ask=search.current;if(!ask)return;
   void ask({query}).then(result=>{
    if(!mounted.current||mine!==ticket.current)return;
    if(result.ok){setFailure('');setRows({query,assets:result.value.assets.slice(0,SUGGESTION_ROWS)});}
    else{setRows(null);setFailure(result.error.message);}
   },cause=>{if(!mounted.current||mine!==ticket.current)return;setRows(null);setFailure(cause instanceof Error?cause.message:String(cause));});
  },SUGGEST_DELAY_MS);
  return()=>clearTimeout(timer);
 },[query,props.keySaved]);
 const shown=rows&&rows.query===query?rows.assets:[];
 const listOpen=open&&shown.length>0;
 const full=props.symbols.length>=ALPACA_MAX_SYMBOLS;
 const reset=()=>{setText('');setActive(-1);setOpen(false);setRows(null);};
 const addMany=(items:readonly string[])=>{
  const upper=items.map(item=>item.toUpperCase()),good=[...new Set(upper.filter(item=>ALPACA_SYMBOL.test(item)))],bad=upper.filter(item=>!ALPACA_SYMBOL.test(item));
  if(good.length)props.onChange(addStreamSymbols(props.symbols,good));
  setNote(bad.length?'Not a US stock symbol: '+bad.slice(0,3).join(', ')+'.':'');
  if(good.length||!bad.length)reset();
 };
 const addAsset=(asset:AlpacaAsset)=>{
  if(!asset.chartable||!ALPACA_SYMBOL.test(asset.symbol)){setNote(alpacaAssetNotice(asset)??'');return;}
  setNote('');
  if(!props.symbols.includes(asset.symbol))props.onChange(addStreamSymbols(props.symbols,[asset.symbol]));
  reset();
 };
 const chips=useRef<HTMLUListElement>(null),input=useRef<HTMLInputElement>(null),refocus=useRef<number|null>(null);
 const remove=(symbol:string)=>{refocus.current=props.symbols.indexOf(symbol);props.onChange(props.symbols.filter(item=>item!==symbol));};
 useEffect(()=>{
  const at=refocus.current;if(at===null)return;refocus.current=null;
  const buttons=chips.current?.querySelectorAll<HTMLButtonElement>('button');
  (buttons&&buttons.length?buttons[Math.min(at,buttons.length-1)]:input.current)?.focus();
 },[props.symbols]);
 const onKeyDown=(event:React.KeyboardEvent<HTMLInputElement>)=>{
  if((event.nativeEvent as KeyboardEvent).isComposing)return;
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){
   if(!shown.length)return;event.preventDefault();setOpen(true);
   setActive(index=>event.key==='ArrowDown'?(index+1)%shown.length:(index<=0?shown.length-1:index-1));
  }else if(event.key==='Enter'){
   // This panel renders inside the Settings dialog form: the Enter must never reach it.
   event.preventDefault();event.stopPropagation();
   if(listOpen&&active>=0&&shown[active]){addAsset(shown[active]);return;}
   if(query)addMany(query.split(/[\s,;]+/).filter(Boolean));
  }else if(event.key==='Escape'&&(open||text)){
   event.preventDefault();event.stopPropagation();
   if(listOpen)setOpen(false);else reset();
  }
 };
 const onPaste=(event:React.ClipboardEvent<HTMLInputElement>)=>{
  const pasted=event.clipboardData.getData('text');
  if(!/[\s,;]/.test(pasted.trim()))return;
  event.preventDefault();addMany(pasted.toUpperCase().split(/[\s,;]+/).filter(Boolean));
 };
 return <div className="lv-live-symbols" role="group" aria-label="Symbols to stream">
  <div className="lv-live-symbols-head"><span>Symbols to stream</span><span className="lv-live-note" aria-live="polite">{props.symbols.length} of {ALPACA_MAX_SYMBOLS}</span></div>
  {props.symbols.length>0&&<ul className="lv-live-chips" aria-label="Saved symbols" ref={chips}>{props.symbols.map(symbol=><li key={symbol} className="lv-live-chip"><span>{symbol}</span><button type="button" aria-label={'Remove '+symbol} title={'Remove '+symbol} onClick={()=>remove(symbol)}>×</button></li>)}</ul>}
  <div className="lv-live-combo">
   <input ref={input} type="text" role="combobox" aria-label="Add symbol" aria-autocomplete="list" aria-expanded={listOpen} aria-controls={listId} aria-activedescendant={listOpen&&active>=0?id+'-opt-'+active:undefined}
    autoComplete="off" spellCheck={false} disabled={!props.keySaved} placeholder={props.keySaved?'Add symbol, for example AAPL':'Save a key to add symbols'} value={text}
    onChange={event=>{setText(event.target.value);setOpen(true);setActive(-1);setNote('');}} onFocus={()=>setOpen(true)} onBlur={()=>setOpen(false)} onKeyDown={onKeyDown} onPaste={onPaste}/>
   <ul id={listId} role="listbox" aria-label="Matching symbols" className="lv-live-suggest" hidden={!listOpen}>
    {listOpen&&shown.map((asset,index)=>{const notice=alpacaAssetNotice(asset),blocked=!asset.chartable,added=props.symbols.includes(asset.symbol);
     return <li key={asset.symbol} id={id+'-opt-'+index} role="option" aria-selected={index===active} aria-disabled={blocked||undefined} className={'lv-live-suggest-row'+(index===active?' active':'')+(blocked?' blocked':'')}
      onMouseDown={event=>event.preventDefault()} onMouseEnter={()=>setActive(index)} onClick={()=>addAsset(asset)}>
      <span className="lv-live-suggest-main"><strong>{asset.symbol}</strong> <span>{asset.name}</span>{added&&<em> (added)</em>}</span>
      {notice&&<span className="lv-live-suggest-notice">{notice}</span>}
     </li>;})}
   </ul>
  </div>
  {!props.keySaved&&<p className="lv-live-note">Suggestions appear once a key is saved.</p>}
  {failure&&<p className="lv-live-error">{'Suggestions are unavailable: '+failure+' You can still type a ticker and press Enter.'}</p>}
  {note&&<p className="lv-live-error" role="status">{note}</p>}
  <p className="lv-live-note">Or search any stock on the chart. It's added here automatically.{full?' The list is full. Adding one drops the oldest.':''}</p>
 </div>;
}
export function describeKeyStatus(status:AlpacaKeyStatus|null):string{
 if(!status)return 'Checking saved key...';
 if(!status.encryption&&!status.configured)return 'Windows encryption is unavailable, so a key cannot be saved.';
 if(status.configured)return 'Key saved (ID ending '+(status.keyIdHint??'****').slice(-4)+'). Stored encrypted on this computer.';
 return status.unreadable?'Saved key cannot be unlocked here. Enter it again.':'No key saved. Live stocks stay off.';
}
/** Plain words for the stream's bid and ask shedding (status.quoteLevel 'shown' or 'none'). Prices and bars are not affected. */
export function quoteLevelNote(status:AlpacaStatus|null):string{
 if(status?.quoteLevel==='shown')return ' Quotes reduced to on-screen symbols';
 if(status?.quoteLevel==='none')return ' Quotes paused (high traffic)';
 return '';
}
/** DOM hooks so desktop flows can read the quote state without parsing the sentence. Also the stream state and its reconnect count (a flow proves a rejected key is not retried). Absent when there is no status. */
export function streamStatusAttributes(status:AlpacaStatus|null):Record<string,string>{
 if(!status)return {};
 return {'data-quote-level':status.quoteLevel??'all','data-dropped':String(status.counters?.dropped??0),'data-quotes-dropped':String(status.counters?.quotesDropped??0),'data-stream-state':status.state,'data-reconnects':String(status.counters?.reconnects??0)};
}
export function StreamStatusLine(props:{status:AlpacaStatus|null}){
 // "Market closed" reads the clock; a connected stream line re-renders at each whole minute.
 useMinuteTick(props.status?.state==='ready');
 return <p className="lv-live-note" aria-live="polite" {...streamStatusAttributes(props.status)}>{describeStreamStatus(props.status)}</p>;
}
/** Plain stream line for the Data sources panel. The reason text comes from the desktop process in plain words. */
export function describeStreamStatus(status:AlpacaStatus|null,nowMs:number=alpacaMarketNow()):string{
 if(!status||status.state==='idle'||status.state==='closed')return 'Live stream not running. It starts when you open an Alpaca chart.';
 const closed=usMarketSession(nowMs)==='closed';
 const quotes=quoteLevelNote(status);
 switch(status.state){
  case 'ready':return (closed?'Live stream connected. Market closed: charts show the last session until US trading opens.':status.feed==='sip'?'Live stream connected (all exchanges).':'Live stream connected (IEX).')+quotes;
  case 'stale':return 'Live stream connected, but no data has arrived recently.'+quotes;
  case 'connecting':return 'Connecting to the Alpaca live stream...';
  case 'authenticating':return 'Checking the key with the Alpaca live stream...';
  case 'auth-failed':return 'Live stream stopped: '+(status.lastError??'Alpaca did not accept the connection.');
  default:return 'Live stream reconnecting: '+(status.lastError??'the connection dropped.');
 }
}
/** The Coinbase switch on its own (the Crypto section of Data sources). */
export function CoinbaseSourceSettings(props:Pick<LiveDataSettingsProps,'coinbaseEnabled'|'onCoinbaseEnabledChange'>){
 return <>
  <label className="lv-live-toggle"><input type="checkbox" checked={props.coinbaseEnabled} onChange={event=>props.onCoinbaseEnabledChange(event.target.checked)}/> {LIVE_CRYPTO_SETTING.label}</label>
  <p className="lv-live-note">{LIVE_CRYPTO_SETTING.disclosure} Products: {COINBASE_PRODUCTS.join(', ')}.</p>
 </>;
}
/** Plain words for a key file that exists but cannot be unlocked. */
export const UNREADABLE_KEY_NOTE='A saved key was found but cannot be unlocked on this computer (for example after copying the profile from another computer or Windows account). Enter your key again; the old file is replaced when you save.';
export type AlpacaSourceSettingsProps=Omit<LiveDataSettingsProps,'coinbaseEnabled'|'onCoinbaseEnabledChange'>&{
 /** The live stream state, so the page's summary can say Connected. */
 onStreamStatus?:(status:AlpacaStatus|null)=>void;
};
/** The Alpaca key, plan and symbols on their own (the Real-time US stocks section of Data sources). */
export function AlpacaSourceSettings(props:AlpacaSourceSettingsProps){
 const {bridge}=props;
 const mounted=useRef(true);
 const [status,setStatus]=useState<AlpacaKeyStatus|null>(null);
 const [keyId,setKeyId]=useState(''),[secret,setSecret]=useState('');
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [stream,setStreamState]=useState<AlpacaStatus|null>(null);
 const onStream=useRef(props.onStreamStatus);onStream.current=props.onStreamStatus;
 const setStream=(next:AlpacaStatus|null)=>{setStreamState(next);onStream.current?.(next);};
 useEffect(()=>{
  if(!bridge?.alpacaStatus&&!bridge?.onAlpacaEvent)return;let active=true;
  void bridge.alpacaStatus?.().then(result=>{if(active&&result.ok)setStream(result.value);}).catch(()=>undefined);
  const off=bridge.onAlpacaEvent?.(event=>{if(active&&event?.kind==='status')setStream(event.status);});
  return()=>{active=false;off?.();};
 },[bridge]);
 const report=(next:AlpacaKeyStatus)=>{if(!mounted.current)return;setStatus(next);props.onAlpacaKeyStatus?.(next);};
 useEffect(()=>{mounted.current=true;if(bridge)void bridge.alpacaKeyStatus().then(result=>{if(result.ok)report(result.value);else if(mounted.current)say(result.error.message,'error');}).catch(()=>undefined);return()=>{mounted.current=false;};},[bridge]);
 const [messageKind,setMessageKind]=useState<'pending'|'ok'|'error'>('ok');
 const say=(text:string,kind:'pending'|'ok'|'error'='ok')=>{setMessage(text);setMessageKind(kind);};
 // Every action shows its outcome in the status line right under the buttons (a pending line while it runs), never only far
 // below the symbol list: a Test connection answer printed at the bottom of the section read as "nothing happened".
 async function run(action:()=>Promise<void>,pending=''){if(busy)return;setBusy(true);say(pending,'pending');try{await action();}catch(cause){if(mounted.current)say(cause instanceof Error?cause.message:String(cause),'error');}finally{if(mounted.current)setBusy(false);}}
 const save=()=>run(async()=>{
  if(!bridge)throw Error('Live stocks need the desktop app.');
  const input={keyId:keyId.trim(),secret:secret.trim()};
  setSecret('');
  const result=await bridge.saveAlpacaKey(input);
  if(!result.ok)throw Error(result.error.message);
  setKeyId('');report(result.value);say('Key saved. Use Test connection to check it with Alpaca.');
 });
 const clear=()=>run(async()=>{if(!bridge)return;const result=await bridge.clearAlpacaKey();if(!result.ok)throw Error(result.error.message);report(result.value);say('Key removed from this computer.');});
 const test=()=>run(async()=>{if(!bridge)return;const result=await bridge.testAlpacaConnection();if(!result||!result.ok)throw Error('Connection test failed: '+(result?.error?.message||'the desktop app gave no answer.'));say('Connected: Alpaca accepted the key (IEX feed).'+(plan==='paid'?' The connection test checks IEX only; the all-exchange live stream needs a paid plan.':'')+(usMarketSession(alpacaMarketNow())==='closed'?' The US market is closed now, so charts show the last session.':''));},'Testing the connection with Alpaca...');
 const plan:AlpacaDataPlan=props.alpacaPlan==='paid'?'paid':'free';
 return <>
  <p role="status" aria-live="polite" className="lv-live-status">{describeKeyStatus(status)}</p>
  {status?.unreadable&&!status.configured&&<p className="lv-live-note">{UNREADABLE_KEY_NOTE}</p>}
  {status?.configured&&<StreamStatusLine status={stream}/>}
  {/* Not a <form>: this panel renders inside the Settings dialog's form, so a nested submit bubbled into Settings Ok
      and closed the dialog mid-save. Enter in a key field saves here and never reaches the outer form. */}
  <div className="lv-live-key-form lv-live-grid" onKeyDown={event=>{if(event.key!=='Enter'||(event.nativeEvent as KeyboardEvent).isComposing||!(event.target instanceof HTMLInputElement))return;event.preventDefault();event.stopPropagation();if(keyId.trim()&&secret.trim())void save();}}>
   <label>API key ID <input type="password" autoComplete="off" spellCheck={false} value={keyId} maxLength={80} onChange={event=>setKeyId(event.target.value)} aria-label="Alpaca API key ID" placeholder={status?.configured?'Saved. Enter a new one to replace it':'Key ID from the Alpaca dashboard'}/></label>
   <label>Secret key <input type="password" autoComplete="off" spellCheck={false} value={secret} maxLength={160} onChange={event=>setSecret(event.target.value)} aria-label="Alpaca secret key" placeholder="Shown once by Alpaca when you create the key"/></label>
   <span/><div className="lv-live-key-actions">
   <button type="button" className="primary" disabled={busy||!bridge||!keyId.trim()||!secret.trim()||status?.encryption===false} onClick={()=>void save()}>Save key</button>
   <button type="button" disabled={busy||!bridge||!status?.configured} onClick={()=>void test()}>Test connection</button>
   <button type="button" data-lv-destructive="true" disabled={busy||!bridge||!status?.configured} onClick={()=>void clear()}>Remove key</button>
   </div>
  </div>
  {/* Action outcome (Save, Test connection, Remove), directly under the buttons that caused it. */}
  <p role="status" aria-live="polite" className="lv-live-message" data-lv-action-result={message?messageKind:undefined} hidden={!message}>{message}</p>
  {props.onAlpacaPlanChange&&<div className="lv-live-grid"><label>{ALPACA_DATA_PLAN_SETTING.label} <select aria-label="Alpaca data plan" value={plan} onChange={event=>props.onAlpacaPlanChange?.(event.target.value==='paid'?'paid':'free')}>{ALPACA_DATA_PLAN_SETTING.options.map(row=><option key={row.value} value={row.value}>{row.label}</option>)}</select></label><span/><p className="lv-live-note">{ALPACA_DATA_PLAN_SETTING.options.find(row=>row.value===plan)?.note}</p></div>}
  <AlpacaSymbolPicker symbols={props.alpacaSymbols} onChange={props.onAlpacaSymbolsChange} keySaved={!!status?.configured} search={bridge?.searchAlpacaAssets?input=>bridge.searchAlpacaAssets!(input):undefined}/>
  {/* The full disclosure stays one click away. */}
  <details className="lv-live-about"><summary>How your key and data are used</summary><p className="lv-live-note">{ALPACA_SETTING.disclosure} {plan==='paid'?'Prices come from all exchanges.':'Past bars come from all exchanges (15 minutes behind); the newest 15 minutes and live prices come from the IEX exchange only, so their volume is lower than the full market.'}</p></details>
 </>;
}
/** Both live sources in one section (the original layout; the Data sources page uses the two parts above). */
export function LiveDataSettings(props:LiveDataSettingsProps){
 const plan:AlpacaDataPlan=props.alpacaPlan==='paid'?'paid':'free';
 return <section className="lv-live-settings" aria-label="Live data">
  <h3>Live data</h3>
  {CoinbaseSourceSettings({coinbaseEnabled:props.coinbaseEnabled,onCoinbaseEnabledChange:props.onCoinbaseEnabledChange})}
  <h4>{alpacaSettingLabel(plan)}</h4>
  {/* Called inline (its hooks run as this component's, always in the same order), so the markup stays one tree. */}
  {AlpacaSourceSettings(props)}
 </section>;
}
