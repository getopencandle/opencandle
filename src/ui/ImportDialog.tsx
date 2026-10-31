import React,{useEffect,useMemo,useRef,useState} from 'react';
import {IMPORT_ADJUSTMENTS,IMPORT_EXAMPLES,SEASONALITY_IMPORT_EXAMPLES,findImportExample,IMPORT_FIRST_USE_STEPS,IMPORT_MAX_ROWS,IMPORT_RESOLUTIONS,IMPORT_SESSIONS,OHLCV_TOOL_COVERAGE,createImportDraft,describeIssue,exampleDraft,parseImportText,prepareImport,scanImportText,type ImportDraft,type ImportIssue} from '../domain/data-setup';
import type {BarDataset} from '../domain/types';
import {identifyLocalImport} from './local-import-identity';
import {Modal} from './Modal';
import './import-dialog.css';
const NO_SOURCES:readonly BarDataset[]=[];
const SHOWN_ISSUES=30;
const bridge=()=>typeof window==='undefined'?undefined:window.lv;
/** Local OHLCV import: choose/paste/example, describe, preview, then publish through the workspace import path. Cancel, Escape and the close button discard the draft. */
export function ImportDialog({onClose,onImport,existing=NO_SOURCES,now}:{onClose:()=>void;onImport:(dataset:BarDataset)=>boolean|void;existing?:readonly BarDataset[];now?:number}){
 const [draft,setDraft]=useState<ImportDraft>(createImportDraft),[previous,setPrevious]=useState<ImportDraft|null>(null),[exampleId,setExampleId]=useState(''),[status,setStatus]=useState(''),[error,setError]=useState('');
 const [clock]=useState(()=>now??Math.floor(Date.now()/1000));
 const fileRequest=useRef(0),closed=useRef(false),latest=useRef(draft),edits=useRef(0);latest.current=draft;
 useEffect(()=>()=>{closed.current=true;},[]);
 const parsed=useMemo(()=>draft.text.trim()?parseImportText(draft):null,[draft.text,draft.format,draft.timestampUnit,draft.duplicatePolicy,draft.outOfOrder,draft.resolution]);
 const scan=useMemo(()=>draft.text.trim()?scanImportText(draft.text,draft.format):null,[draft.text,draft.format]);
 const prepared=useMemo(()=>prepareImport(draft,parsed,scan,{now:clock,existing}),[draft,parsed,scan,clock,existing]);
 const preview=prepared.preview;
 const update=(patch:Partial<ImportDraft>)=>{setDraft(current=>({...current,...patch}));setError('');};
 const replaceDraft=(next:ImportDraft,message:string)=>{const current=latest.current;if(current.text.trim())setPrevious(current);latest.current=next;setDraft(next);setStatus(message);setError('');};
 const fieldIssue=(field:string)=>{const issue=preview.issues.find(row=>row.field===field&&row.severity==='error');return issue?<small className="error import-field-error">{issue.message}</small>:null;};
 async function choose(){
  const lv=bridge();if(!lv){setError('File selection requires the desktop application. Paste data below or load a demo example.');return;}
  const request=++fileRequest.current,editsAtOpen=edits.current;setStatus('Waiting for file selection...');setError('');
  let result:Awaited<ReturnType<typeof lv.importBars>>;
  try{result=await lv.importBars();}catch(cause){result={ok:false,error:{code:'FAILED',message:cause instanceof Error?cause.message:String(cause)}};}
  if(request!==fileRequest.current||closed.current)return;
  if(result.ok&&edits.current!==editsAtOpen)setStatus(`${result.value.fileName} was not loaded because the data was edited while the file chooser was open. Your edits are kept; choose the file again to replace them.`);
  else if(result.ok){setExampleId('');replaceDraft({...latest.current,text:result.value.text,fileName:result.value.fileName,format:result.value.format},`Loaded ${result.value.fileName} (${result.value.bytes.toLocaleString('en-US')} bytes). Review the preview before importing.`);}
  else if(result.error.code==='CANCELLED')setStatus('File selection cancelled. Your current draft is unchanged.');
  else{setStatus('');setError(result.error.message+' Your current draft is unchanged; choose another file or paste data.');}
 }
 function loadExample(id:string){
  setExampleId(id);if(!id)return;fileRequest.current++;
  const example=findImportExample(id)!;
  replaceDraft(exampleDraft(id),`Loaded demo example: ${example.title}. Prices are invented; an import creates a source labeled as demo data.`);
 }
 async function saveExample(){
  const example=findImportExample(exampleId);if(!example)return;
  const lv=bridge();if(!lv){setError('Saving an example file requires the desktop application. You can still load and import it here.');return;}
  let result:Awaited<ReturnType<typeof lv.exportData>>;
  try{result=await lv.exportData({text:example.draft.text,suggestedName:example.fileName,format:example.draft.format});}catch(cause){result={ok:false,error:{code:'FAILED',message:cause instanceof Error?cause.message:String(cause)}};}
  if(closed.current)return;
  if(result.ok)setStatus(`Saved ${result.value.fileName}. Import it later with Choose CSV or JSON file.`);else if(result.error.code==='CANCELLED')setStatus('Save cancelled.');else setError(result.error.message);
 }
 function restorePrevious(){if(!previous)return;fileRequest.current++;setDraft(previous);setPrevious(null);setExampleId('');setStatus('Previous draft restored.');setError('');}
 function submit(e:React.FormEvent){
  e.preventDefault();
  if(!prepared.dataset){setError(preview.state==='empty'?'Add data first: choose a file, paste text or load a demo example.':'Fix the problems listed in the preview before importing.');return;}
  try{if(onImport(identifyLocalImport(prepared.dataset,crypto.randomUUID()))===false)throw new Error('The import was rejected. Your data remains in this draft; review the workspace message.');onClose();}
  catch(cause){setError(cause instanceof Error?cause.message:String(cause));}
 }
 const issueRow=(issue:ImportIssue,index:number)=><li key={index} className={'import-issue '+issue.severity}><b>{issue.severity==='error'?'Error':issue.severity==='warning'?'Warning':'Note'}</b> {describeIssue(issue)}</li>;
 const selectedExample=findImportExample(exampleId);
 return <Modal title="Import historical data" onClose={onClose} wide><form onSubmit={submit}><div className="modal-scroll import-dialog">
  <p>Import your own OHLCV history (time, open, high, low, close, volume) for one instrument. Data stays on this computer; nothing is fetched. Maximum 20 MiB and {IMPORT_MAX_ROWS.toLocaleString('en-US')} rows per import. Nothing changes until you press Import and open.</p>
  <section aria-label="Choose data" className="import-step"><h3>1. Choose data</h3>
   <div className="button-row import-source-row"><button type="button" onClick={()=>void choose()}>Choose CSV or JSON file</button><span>{draft.fileName?'Current: '+draft.fileName:'Or paste text below'}</span>{draft.text&&<button type="button" onClick={()=>{fileRequest.current++;replaceDraft({...draft,text:'',fileName:''},'Data cleared. Instrument details are kept.');setExampleId('');}}>Clear data</button>}{previous&&<button type="button" onClick={restorePrevious}>Restore previous draft</button>}</div>
   <div className="import-options"><label>Demo examples<select aria-label="Synthetic example" value={exampleId} onChange={e=>loadExample(e.target.value)}><option value="">Load a ready-to-import example...</option>{IMPORT_EXAMPLES.map(row=><option key={row.id} value={row.id}>{row.title}</option>)}<optgroup label="Multi-year demo examples">{SEASONALITY_IMPORT_EXAMPLES.map(row=><option key={row.id} value={row.id}>{row.title}</option>)}</optgroup></select></label>{selectedExample&&<button type="button" onClick={()=>void saveExample()}>Save example file</button>}<label>Format<select value={draft.format} onChange={e=>update({format:e.target.value as ImportDraft['format']})}><option value="csv">CSV</option><option value="json">JSON</option></select></label></div>
   {selectedExample&&<p className="help">Demo data: {selectedExample.summary}</p>}
  </section>
  <section aria-label="Describe the data" className="import-step"><h3>2. Describe the data</h3>
   <p className="help">OpenCandle cannot infer these from prices. Confirm them against your source; leave the basis Unknown when the source does not say.</p>
   <div className="import-options">
    <label>Symbol<input aria-label="Import symbol" value={draft.symbol} maxLength={24} onChange={e=>update({symbol:e.target.value.toUpperCase()})} required/>{fieldIssue('symbol')}</label>
    <label>Resolution<select aria-label="Import resolution" value={draft.resolution} onChange={e=>update({resolution:e.target.value})}>{IMPORT_RESOLUTIONS.map(v=><option key={v}>{v}</option>)}</select>{fieldIssue('resolution')}</label>
    <label>Declared exchange<input aria-label="Import exchange" value={draft.exchange} maxLength={80} onChange={e=>update({exchange:e.target.value.toUpperCase()})}/>{fieldIssue('exchange')}</label>
    <label>Currency<input aria-label="Import currency" value={draft.currency} maxLength={3} onChange={e=>update({currency:e.target.value.toUpperCase()})}/>{fieldIssue('currency')}</label>
    <label>Asset class<select value={draft.assetClass} onChange={e=>update({assetClass:e.target.value as ImportDraft['assetClass']})}><option value="stock">Stock</option><option value="etf">ETF</option></select></label>
    <label>Tick size<input aria-label="Import tick size" type="number" min="0.000001" step="any" value={draft.tickSize} onChange={e=>update({tickSize:Number(e.target.value)})}/>{fieldIssue('tickSize')}</label>
    <label>Lot size<input aria-label="Import lot size" type="number" min="0.000001" step="any" value={draft.lotSize} onChange={e=>update({lotSize:Number(e.target.value)})}/>{fieldIssue('lotSize')}</label>
    <label>Exchange timezone<input aria-label="Import timezone" value={draft.timezone} onChange={e=>update({timezone:e.target.value})}/>{fieldIssue('timezone')}</label>
    <label>Adjustment basis<select aria-label="Import adjustment basis" value={draft.adjustment} onChange={e=>update({adjustment:e.target.value as ImportDraft['adjustment']})}>{IMPORT_ADJUSTMENTS.map(row=><option key={row.value} value={row.value}>{row.label}</option>)}</select></label>
    <label>Session<select aria-label="Import session" value={draft.session} onChange={e=>update({session:e.target.value as ImportDraft['session']})}>{IMPORT_SESSIONS.map(row=><option key={row.value} value={row.value}>{row.label}</option>)}</select></label>
    <label className="import-wide">Source description (optional)<input aria-label="Import source description" value={draft.sourceLabel} maxLength={160} placeholder="For example: my broker's daily export, downloaded 2026-10-01" onChange={e=>update({sourceLabel:e.target.value})}/>{fieldIssue('sourceLabel')}</label>
   </div>
   <details className="import-metadata"><summary>Parsing rules</summary><div className="import-options">
    <label>Numeric timestamps<select value={draft.timestampUnit} onChange={e=>update({timestampUnit:e.target.value as ImportDraft['timestampUnit']})}><option value="seconds">Unix seconds</option><option value="milliseconds">Unix milliseconds</option></select></label>
    <label>Duplicate timestamps<select value={draft.duplicatePolicy} onChange={e=>update({duplicatePolicy:e.target.value as ImportDraft['duplicatePolicy']})}><option value="dedupe-identical">Remove identical duplicates</option><option value="reject">Reject duplicates</option><option value="keep-last">Keep last correction</option></select></label>
    <label>Out-of-order rows<select value={draft.outOfOrder} onChange={e=>update({outOfOrder:e.target.value as ImportDraft['outOfOrder']})}><option value="sort">Sort by time and report it</option><option value="reject">Reject the file</option></select></label>
   </div></details>
  </section>
  <label className="import-text">Data<textarea aria-label="Historical data" value={draft.text} onChange={e=>{const text=e.target.value;edits.current++;setExampleId('');setDraft(current=>({...current,text,fileName:current.fileName&&!current.fileName.endsWith(' (edited)')?current.fileName+' (edited)':current.fileName}));setError('');}} placeholder={'date,open,high,low,close,volume\n2024-01-02,10,12,9,11,1000'} spellCheck={false}/></label>
  <p className="help">Required columns: time (or date/timestamp), open, high, low, close, volume. Dates use YYYY-MM-DD; times use ISO 8601 with Z or an offset such as -05:00; numbers use plain decimals. JSON accepts an array of bar objects or an object with a bars array. Extra columns are ignored, except a symbol column, which must match the Symbol field. Missing values are rejected: volume is never invented, so a source without volume cannot be imported as OHLCV.</p>
  <section aria-label="Import preview" className="import-step import-preview"><h3>3. Preview</h3>
   <p className={'import-headline '+preview.state}><strong>{preview.headline}</strong></p>
   {preview.state!=='empty'&&<dl className="import-stats"><div><dt>Rows read</dt><dd>{preview.rowsRead.toLocaleString('en-US')}</dd></div><div><dt>Valid bars</dt><dd>{preview.validBars.toLocaleString('en-US')}</dd></div><div><dt>Rejected rows</dt><dd>{preview.rejectedRows.toLocaleString('en-US')}</dd></div><div><dt>Errors / warnings</dt><dd>{preview.errors} / {preview.warnings}</dd></div>{preview.first&&<div><dt>First bar</dt><dd>{preview.first}</dd></div>}{preview.last&&<div><dt>Last bar</dt><dd>{preview.last}</dd></div>}{preview.typicalSpacing&&<div><dt>Typical spacing</dt><dd>{preview.typicalSpacing}</dd></div>}{preview.largestGap&&<div><dt>Largest gap</dt><dd>{preview.largestGap}</dd></div>}</dl>}
   {preview.issues.length>0&&<ul className="import-issues" aria-label="Import problems and notes">{preview.issues.slice(0,SHOWN_ISSUES).map(issueRow)}{preview.issues.length>SHOWN_ISSUES&&<li className="import-issue info">{preview.issues.length-SHOWN_ISSUES} more not shown. Fix the first problems and the list updates.</li>}</ul>}
   {preview.disclosure.length>0&&<dl className="import-disclosure" aria-label="Source disclosure">{preview.disclosure.map(row=><div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl>}
   {preview.sample.length>0&&<div className="table-scroll import-sample"><table className="data-table"><caption>Sample of parsed bars (times in UTC)</caption><thead><tr><th>#</th><th>Time</th><th>Open</th><th>High</th><th>Low</th><th>Close</th><th>Volume</th></tr></thead><tbody>{preview.sample.map(row=><tr key={row.position}><td>{row.position}</td><td>{row.time}</td><td>{row.open}</td><td>{row.high}</td><td>{row.low}</td><td>{row.close}</td><td>{row.volume.toLocaleString('en-US')}</td></tr>)}</tbody></table></div>}
  </section>
  <details className="import-guide"><summary>After import: making the chart and tools use this data</summary>
   <ol>{IMPORT_FIRST_USE_STEPS.map(step=><li key={step}>{step}</li>)}</ol>
   <table className="data-table"><caption>What your imported bars give each tool</caption><thead><tr><th>Tool</th><th>From your bars</th><th>Not included</th></tr></thead><tbody>{OHLCV_TOOL_COVERAGE.map(row=><tr key={row.tool}><td>{row.tool}</td><td>{row.supplied}</td><td>{row.notSupplied}</td></tr>)}</tbody></table>
  </details>
 </div><footer><span role="alert">{error}</span><output className="import-status">{error?'':status}</output><button type="button" onClick={onClose}>Cancel</button><button type="submit" className="primary" disabled={!prepared.dataset}>Import and open</button></footer></form></Modal>;
}
