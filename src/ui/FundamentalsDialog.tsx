import {demoDataLabel,demoDataMode} from '../domain/demo-mode';
import React,{useEffect,useMemo,useRef,useState} from 'react';
import {normalizeCompanyFacts,queryFacts,type FactsDocument,type FactPeriod,type FactRow} from '../fundamentals/company-facts';
import {buildStatement,describeMethod,formatStatementValue,resolveScale,statementCurrencies,statementExportRows,COLUMN_LIMITS,STATEMENT_POLICY,UNAVAILABLE_METRICS,type StatementBasis,type StatementScale,type StatementTable} from '../fundamentals/statements';
import {createFundamentalsPreferences,createFundamentalsView,linkedDocumentId,pruneFundamentalsLinks,resolveFilingCutoff,setFundamentalsLink,utcToday,type CutoffMode,type FundamentalsMarket,type FundamentalsPreferences,type FundamentalsTab,type FundamentalsView} from '../fundamentals/preferences';
import {lookupCik,loadCikMap,parseTickerFile,saveCikMap,type CikMap} from '../fundamentals/cik-map';
import {computePriceRatios,formatRatio,PRICE_RATIO_IDS,type PriceInput} from '../fundamentals/price-ratios';
import type {PriceOverlayBar} from '../fundamentals/graph';
import {FundamentalsGraph} from './FundamentalsGraph';
import {FundamentalsMetrics} from './FundamentalsMetrics';
import {catalogExportRows,type CatalogTable} from '../fundamentals/metric-catalog';
import {Modal} from './Modal';
import {InfoTip,OverflowMenu} from './dialog-extras';
import './fundamentals.css';
import './dialog-forms.css';
import {plainErrorText} from './user-error';
const TABS:[FundamentalsTab,string][]=[['income','Income statement'],['balance','Balance sheet'],['cashflow','Cash flow'],['statistics','Statistics'],['facts','Reported facts']];
const KIND_LABELS:Record<string,string>={'sec-public':'SEC','local-import':'Imported',synthetic:'Demo'};
const REJECTED='Workspace update was rejected. This draft is unchanged; check the application status for details.';
export interface FundamentalsDialogProps {symbol:string;documents:FactsDocument[];onChange:(documents:FactsDocument[])=>boolean|void;onClose:()=>void;
 /** Optional (integration): exact chart market for explicit linking and the SymbolDetails summary. */
 market?:FundamentalsMarket|null;
 /** Optional (integration): persisted view and links. Without it, view settings last for this dialog only. */
 preferences?:FundamentalsPreferences;onPreferencesChange?:(preferences:FundamentalsPreferences)=>boolean|void;
 now?:()=>Date;
 /** Optional (integration): the active dataset's last close with provenance, for P/E, P/S, P/B and market cap. */
 lastClose?:PriceInput|null;
 /** Optional (integration): daily closes of the active dataset for the Graph tab price overlay. */
 priceBars?:PriceOverlayBar[]|null}
export function FundamentalsDialog({symbol,documents,onChange,onClose,market=null,preferences,onPreferencesChange,now=()=>new Date(),lastClose=null,priceBars=null}:FundamentalsDialogProps){
 const [cikMap,setCikMap]=useState<CikMap|null>(()=>loadCikMap()),[pane,setPane]=useState<'graph'|'metrics'|null>(null),[cikNote,setCikNote]=useState('');
 const initialLink=market&&preferences?linkedDocumentId(preferences.links,market):null;
 const [selected,setSelected]=useState(initialLink&&documents.some(row=>row.id===initialLink)?initialLink:documents[0]?.id??''),[cik,setCik]=useState(()=>lookupCik(loadCikMap(),symbol)?.cik??''),[search,setSearch]=useState(''),[conceptId,setConceptId]=useState(''),[unit,setUnit]=useState(''),[period,setPeriod]=useState<FactPeriod>('all'),[revisions,setRevisions]=useState<'latest'|'original'|'all'>('latest'),[text,setText]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [syntheticImport,setSyntheticImport]=useState(false);
 const [view,setView]=useState<FundamentalsView>(()=>preferences?.view??createFundamentalsView()),[,setSaved]=useState(0);
 // prefs holds the last accepted preferences. A new parent object replaces it; re-rendering with the
 // same (older) prop never rolls it back, so a later view save cannot drop a just-saved link.
 const request=useRef<string|null>(null),generation=useRef(0),alive=useRef(true),latest=useRef(documents),seenDocuments=useRef(documents),prefs=useRef(preferences??createFundamentalsPreferences()),seenProp=useRef(preferences);
 const exportEpoch=useRef(0),exportView=useRef<{key:string;document:FactsDocument|undefined}|null>(null);
 const lifecycle=useRef({closed:false,busy:false,synthetic:false}),selectedRef=useRef(selected),marketRef=useRef(market),preferencePublication=useRef(0);
 selectedRef.current=selected;marketRef.current=market;
 if(documents!==seenDocuments.current){seenDocuments.current=documents;latest.current=documents;}
 if(preferences&&preferences!==seenProp.current){seenProp.current=preferences;prefs.current=preferences;}
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;retireRequest(false);};},[]);
 const visibleRequest=generation.current;
 const today=utcToday(now());let cutoff:string|null=null,cutoffError='';try{cutoff=resolveFilingCutoff(view,today);}catch(e){cutoffError=String(e);}
 const current=documents.find(row=>row.id===selected),concepts=useMemo(()=>current?.facts.concepts.filter(row=>(row.label+' '+row.id).toLowerCase().includes(search.toLowerCase()))??[],[current,search]);
 const concept=current?.facts.concepts.find(row=>row.id===conceptId)??concepts[0],selectedUnit=concept?.units.includes(unit)?unit:concept?.units[0]??'';
 const query=useMemo(()=>{if(!concept||view.tab!=='facts'||cutoffError)return null;try{return {result:queryFacts(concept,{unit:selectedUnit,period,asOf:cutoff,revisions}),error:''};}catch(e){return {result:null,error:String(e)};}},[concept,selectedUnit,period,cutoff,cutoffError,revisions,view.tab]);
 const currencies=useMemo(()=>current?statementCurrencies(current.facts,cutoffError?null:cutoff):[],[current,cutoff,cutoffError]),currency=view.currency&&currencies.includes(view.currency)?view.currency:currencies[0]??null;
 const statement=useMemo(():{table:StatementTable|null;error:string}=>{
  if(!current||view.tab==='facts')return {table:null,error:''};if(cutoffError)return {table:null,error:cutoffError};
  if(!currency)return {table:null,error:'This document has no reported currency values on the supported statement tags. Use Reported facts to browse every concept.'};
  try{return {table:buildStatement(current.facts,{statement:view.tab,basis:view.basis,currency,asOf:cutoff,revisions:view.revisions,columns:view.columns}),error:''};}catch(e){return {table:null,error:String(e)};}
 },[current,view.tab,view.basis,view.revisions,view.columns,currency,cutoff,cutoffError]);
 const table=statement.table,scale=table?resolveScale(view.scale,table):'units',line=table?.rows.find(row=>row.id===view.line)??table?.rows[0];
 const linkedHere=market?linkedDocumentId(prefs.current.links,market):null,kindMismatch=!!(market&&current&&(current.source.kind==='synthetic')!==market.synthetic);
 // Export ownership includes visible filters and exact document identity, not a saved id alone.
 const exportKey=JSON.stringify([selected,view,search,conceptId,unit,period,revisions,cutoff,cutoffError,currency]);
 if(!exportView.current||exportView.current.key!==exportKey||exportView.current.document!==current){exportView.current={key:exportKey,document:current};exportEpoch.current++;}
 const exportOpening=exportView.current;
 // Async completions and retained handlers need current local authority, independently of App guards.
 function active(){return alive.current&&!lifecycle.current.closed;}
 function owns(token:number){return active()&&generation.current===token;}
 function retireRequest(notify:boolean){
  retireExports();generation.current++;const id=request.current;request.current=null;lifecycle.current.busy=false;
  if(notify&&active())setBusy(false);
  if(id&&window.lv){try{void Promise.resolve(window.lv.cancelSecRequest({requestId:id})).catch(()=>{});}catch{/* Logical retirement already took effect. */}}
 }
 function close(){if(!active())return;lifecycle.current.closed=true;retireRequest(false);onClose();}
 function cancel(token=visibleRequest){if(!owns(token)||!lifecycle.current.busy)return;retireRequest(true);}
 function begin(){if(!active()||lifecycle.current.busy)return null;retireExports();const token=++generation.current;lifecycle.current.busy=true;setBusy(true);setError('');return token;}
 function finish(token:number){if(!owns(token))return;request.current=null;lifecycle.current.busy=false;setBusy(false);}
 function changeImportKind(value:boolean){if(!active()||lifecycle.current.busy)return;lifecycle.current.synthetic=value;setSyntheticImport(value);}
 function selectDocument(id:string){if(!active())return;retireExports();selectedRef.current=id;setSelected(id);setConceptId('');setUnit('');}
 function marketIdentity(value:FundamentalsMarket|null){return value?JSON.stringify([value.exchange,value.symbol,value.synthetic]):null;}
 // Accepted publication and permission for local follow-up are separate outcomes.
 function persist(next:FundamentalsPreferences,failure:string,owner:()=>boolean=active):{accepted:boolean;current:boolean}{
  if(!owner())return {accepted:false,current:false};
  const publication=++preferencePublication.current,token=generation.current;
  const currentOwner=()=>owner()&&owns(token)&&preferencePublication.current===publication;
  if(!onPreferencesChange)return {accepted:true,current:currentOwner()};
  let accepted:boolean;
  try{accepted=onPreferencesChange(next)!==false;}catch(cause){if(currentOwner())setError(failure+' '+plainErrorText(cause));return {accepted:false,current:currentOwner()};}
  if(!currentOwner())return {accepted,current:false};
  if(!accepted){setError(failure);return {accepted:false,current:true};}
  prefs.current=next;setSaved(count=>count+1);return {accepted:true,current:true};
 }
 function updateView(patch:Partial<FundamentalsView>){if(!active())return;retireExports();const next={...view,...patch};setView(next);setError('');persist({...prefs.current,view:next},'This view is shown but was not saved: '+REJECTED);}
 function link(documentId:string|null){
  if(!active()||!market||marketIdentity(marketRef.current)!==marketIdentity(market))return;
  const target=documentId?latest.current.find(row=>row.id===documentId):null;
  const owner=()=>active()&&marketIdentity(marketRef.current)===marketIdentity(market)&&(!documentId||selectedRef.current===documentId&&latest.current.find(row=>row.id===documentId)===target);
  try{
   if(documentId&&(!target||documentId!==selectedRef.current||target!==current))throw new Error('The selected company data changed. Choose it again before linking.');
   if(target&&(target.source.kind==='synthetic')!==market.synthetic)throw new Error(market.synthetic?'Supplied filing data cannot be linked to a symbol with '+demoDataLabel().toLowerCase()+'.':demoDataLabel()+' cannot be linked to a real-market symbol.');
   const next=setFundamentalsLink(prefs.current,market,documentId),result=persist(next,REJECTED,owner);
   if(result.accepted&&result.current&&owner())setError('');
  }catch(e){if(active())setError(plainErrorText(e));}
 }
 function changeCutoffMode(mode:CutoffMode){updateView({cutoffMode:mode,cutoffDate:mode==='date'?view.cutoffDate??today:view.cutoffDate});}
 function changeCutoffDate(value:string){if(!value)updateView({cutoffMode:'none'});else updateView({cutoffMode:'date',cutoffDate:value});}
 function store(document:FactsDocument,token:number){
  if(!owns(token))return false;
  const next=[...latest.current.filter(row=>row.id!==document.id),document];
  if(onChange(next)===false)throw new Error(REJECTED);
  if(!owns(token))return true;
  latest.current=next;selectedRef.current=document.id;setSelected(document.id);setConceptId('');setUnit('');setError('');return true;
 }
 async function fetchFacts(){
  if(!active()||lifecycle.current.busy)return;
  if(!window.lv){setError('Public SEC fetching needs the desktop app. JSON paste works offline.');return;}
  const token=begin();if(token===null)return;const id=crypto.randomUUID();request.current=id;
  try{const result=await window.lv.fetchSecCompanyFacts({requestId:id,cik:cik.trim()});if(!owns(token))return;if(!result.ok)throw new Error(result.error.message);const facts=normalizeCompanyFacts(result.value.data);if(facts.cik!==result.value.cik)throw new Error('SEC company identity did not match the requested CIK.');store({id:'sec:'+facts.cik,facts,source:{kind:'sec-public',label:'SEC EDGAR companyfacts',retrievedAt:result.value.provenance.retrievedAt,sourceUrl:result.value.provenance.sourceUrl,sha256:result.value.provenance.sha256}},token);}
  catch(e){if(owns(token))setError(plainErrorText(e));}finally{finish(token);}
 }
 function importText(input:string,synthetic:boolean,token:number){
  if(!owns(token))return;
  if(new TextEncoder().encode(input).length>20*1024*1024)throw new Error('Fundamentals import exceeds 20 MiB.');
  const facts=normalizeCompanyFacts(JSON.parse(input));
  store({id:(synthetic?'synthetic-facts:':'local-facts:')+crypto.randomUUID(),facts,source:{kind:synthetic?'synthetic':'local-import',label:synthetic?'Demo companyfacts':'User-supplied companyfacts JSON; source unverified',retrievedAt:new Date().toISOString(),sourceUrl:null,sha256:null}},token);
  if(owns(token))setText('');
 }
 function paste(){const synthetic=lifecycle.current.synthetic,token=begin();if(token===null)return;try{importText(text,synthetic,token);}catch(e){if(owns(token))setError(plainErrorText(e));}finally{finish(token);}}
 async function choose(){
  if(!active()||lifecycle.current.busy)return;
  if(!window.lv){setError('File selection needs the desktop app. Paste JSON below.');return;}
  const synthetic=lifecycle.current.synthetic,token=begin();if(token===null)return;
  try{const result=await window.lv.importData({kind:'fundamentals'});if(!owns(token))return;if(!result.ok)throw new Error(result.error.message);if(result.value.format!=='json')throw new Error('Choose a SEC companyfacts JSON file.');importText(result.value.text,synthetic,token);}
  catch(e){if(owns(token))setError(plainErrorText(e));}finally{finish(token);}
 }
 function retireExports(){exportEpoch.current++;exportView.current=null;}
 function changeFactFilter(action:()=>void){if(!active())return;retireExports();action();}
 function exportCurrent(){return active()&&!lifecycle.current.busy&&exportView.current===exportOpening&&!!current&&selectedRef.current===current.id&&latest.current.find(row=>row.id===current.id)===current;}
 async function exportCSV(make:()=>{text:string;suggestedName:string;format:'csv'},missing:string){
  if(!exportCurrent())return;const token=++exportEpoch.current;
  const owner=()=>token===exportEpoch.current&&exportCurrent();
  try{
   if(!window.lv)throw new Error(missing);
   const value=make();if(!owner())return;
   const result=await window.lv.exportData(value);
   if(owner()&&!result.ok&&result.error.code!=='CANCELLED')setError(result.error.message);
  }catch(error){if(owner())setError(plainErrorText(error));}
 }
 function exportRows(){return exportCSV(()=>{if(!query?.result||!current||!concept)throw new Error('Select reported facts before exporting.');const fields=['source_kind','source_url','retrieved_at','cik','entity','concept','unit','start','end','value','filed','form','accession','ambiguous'];const rows=query.result.rows.map(row=>[current.source.kind,current.source.sourceUrl??'',current.source.retrievedAt,current.facts.cik,current.facts.entityName,concept.id,row.unit,row.start??'',row.end,row.value,row.filed??'',row.form??'',row.accession??'',row.ambiguous?'yes':'no']);const csv=[fields,...rows].map(row=>row.map(csvCell).join(',')).join('\r\n');return{text:csv,suggestedName:(current.source.kind==='synthetic'?'OpenCandle-SYNTHETIC-':'OpenCandle-')+current.facts.cik+'-reported-facts.csv',format:'csv'};},'CSV export needs the desktop app and selected facts.');}
 function exportStatement(){return exportCSV(()=>{if(!table||!current)throw new Error('Select a statement before exporting.');const [head,...body]=statementExportRows(table),meta=[current.source.kind,current.source.sourceUrl??'',current.source.retrievedAt,current.facts.cik,current.facts.entityName,table.options.statement,table.options.basis,table.options.asOf??'none',table.options.revisions];const csv=[['source_kind','source_url','retrieved_at','cik','entity','statement','basis','filing_cutoff','revisions',...head],...body.map(row=>[...meta,...row])].map(row=>row.map(csvCell).join(',')).join('\r\n');return{text:csv,suggestedName:(current.source.kind==='synthetic'?'OpenCandle-SYNTHETIC-':'OpenCandle-')+current.facts.cik+'-'+table.options.statement+'-'+table.options.basis+'.csv',format:'csv'};},'CSV export needs the desktop app and a statement view.');}
 function exportMetrics(table:CatalogTable){return exportCSV(()=>{if(!current)throw new Error('Choose company data before exporting.');const [head,...body]=catalogExportRows(table),meta=[current.source.kind,current.source.sourceUrl??'',current.source.retrievedAt,current.facts.cik,current.facts.entityName,table.options.basis,table.options.asOf??'none',table.options.revisions];const csv=[['source_kind','source_url','retrieved_at','cik','entity','basis','filing_cutoff','revisions',...head],...body.map(row=>[...meta,...row])].map(row=>row.map(csvCell).join(',')).join('\r\n');return{text:csv,suggestedName:(current.source.kind==='synthetic'?'OpenCandle-SYNTHETIC-':'OpenCandle-')+current.facts.cik+'-metrics-'+table.options.basis+'.csv',format:'csv'};},'CSV export needs the desktop app.');}
 function remove(target:FactsDocument){
  if(!active()||latest.current.find(row=>row.id===target.id)!==target)return;
  retireRequest(true);const token=generation.current;
  try{const rest=latest.current.filter(row=>row.id!==target.id);if(onChange(rest)===false)throw new Error(REJECTED);if(!owns(token))return;latest.current=rest;selectedRef.current='';setSelected('');persist(pruneFundamentalsLinks(prefs.current,rest.map(row=>row.id)),'Saved data was removed, but its symbol link could not be cleared: '+REJECTED,()=>owns(token));}catch(cause){if(owns(token))setError(plainErrorText(cause));}
 }
 async function chooseTickerFile(){
  if(!active()||lifecycle.current.busy)return;
  if(!window.lv){setError('File selection needs the desktop app.');return;}
  try{
   const result=await window.lv.importData({kind:'fundamentals'});if(!active())return;if(!result.ok)throw new Error(result.error.message);
   if(result.value.format!=='json')throw new Error('Choose SEC company_tickers.json.');
   const {map,skipped}=parseTickerFile(result.value.text);if(!active())return;
   setCikMap(map);const saved=saveCikMap(map),hit=lookupCik(map,symbol);if(hit)setCik(hit.cik);
   setError('');setCikNote(map.entries.length.toLocaleString()+' symbols loaded'+(skipped?' ('+skipped+' rows skipped)':'')+(saved?'':'; kept for this session only')+'. '+(hit?symbol+' is CIK '+hit.cik+(hit.title?' ('+hit.title+')':'')+'. Check it, then fetch.':symbol+' is not in that file; type the CIK.'));
  }catch(e){if(active())setError(plainErrorText(e));}
 }
 function saveGraph(config:import('../fundamentals/graph').GraphConfig){const result=persist({...prefs.current,graph:config},'The graph configuration was not saved: '+REJECTED);return result.accepted;}
 const sym=symbol.trim();
 const loadControls=<div className="fund-load"><div className="button-row"><button className="primary" aria-label="Fetch public SEC facts" disabled={busy||!/^\d{1,10}$/.test(cik)} onClick={()=>void fetchFacts()}>{busy?'Loading…':'Load from SEC'}</button>{busy&&<button onClick={()=>cancel(visibleRequest)}>Cancel request</button>}<button aria-label="Import JSON file" disabled={busy} onClick={()=>void choose()}>Import file</button><InfoTip label="About fetching and CIK numbers">Fetching sends this CIK and your network address to the public SEC service. It requires no account or key. OpenCandle sends no workspace data. Fetching is optional; saved facts remain available offline. CIK identifies the filing entity, independently of the chart ticker. Some ETFs and issuers have no companyfacts coverage. No substitute company is loaded.</InfoTip></div>
  {syntheticImport&&<p className="help" role="note">The next import is saved as {demoDataLabel().toLowerCase()}, not company filings.</p>}
  <details className="fund-advanced" open={!cik||undefined}><summary>Advanced</summary><div className="screener-toolbar"><label>SEC company number (CIK)<input aria-label="SEC company CIK" value={cik} inputMode="numeric" maxLength={10} onChange={e=>setCik(e.target.value)}/></label><button disabled={busy} onClick={()=>void chooseTickerFile()}>Import SEC ticker list</button></div>
  <p className="help" role="status">{cikNote||(cikMap?cikMap.entries.length.toLocaleString()+' tickers known (list imported '+cikMap.importedAt.slice(0,10)+'). The CIK fills in from the chart symbol.':'A few common tickers are built in. Import the SEC ticker list once to fill the CIK for any symbol.')}<InfoTip label="About the SEC ticker list">To fill the CIK from the chart symbol, import SEC company_tickers.json once. You download that file yourself; OpenCandle does not fetch it.</InfoTip></p>
  {/* No demo data in normal use; example mode says "example data". */demoDataMode()!=='off'&&<><label className="fund-check"><input type="checkbox" aria-label={'Mark import as '+demoDataLabel().toLowerCase()} checked={syntheticImport} disabled={busy} onChange={e=>changeImportKind(e.target.checked)}/>Mark import as {demoDataLabel().toLowerCase()}</label><InfoTip label={'About '+demoDataLabel().toLowerCase()}>Mark invented or test company facts as {demoDataLabel().toLowerCase()}. They are not company filings or market data.</InfoTip></>}
  <textarea aria-label="Companyfacts JSON" className="facts-json" placeholder="Paste the SEC company facts JSON here" value={text} disabled={busy} onChange={e=>{if(active()&&!lifecycle.current.busy)setText(e.target.value);}}/><button disabled={busy||!text} onClick={paste}>Import pasted JSON</button></details></div>;
 return <Modal title="Company fundamentals" onClose={close} wide><div className="modal-scroll lv-pol">
 {!!documents.length&&<div className="screener-toolbar"><label>Company data<select aria-label="Fundamentals document" value={selected} onChange={e=>selectDocument(e.target.value)}><option value="">Choose data</option>{documents.map(row=><option key={row.id} value={row.id}>{row.facts.entityName} · {KIND_LABELS[row.source.kind]??'Imported'}</option>)}</select></label>{current&&<OverflowMenu><button type="button" role="menuitem" onClick={()=>remove(current)}>Remove saved data</button></OverflowMenu>}</div>}
 {current?<details className="fund-add"><summary>Add company data</summary>{loadControls}</details>:<section className="fund-empty" aria-label="No fundamentals yet"><strong>No fundamentals for {sym||'this symbol'} yet</strong><p>{documents.length?'Choose saved company data above, or load more.':cik?'Load reported financials from SEC EDGAR, or import a companyfacts file.':(sym||'This symbol')+' has no SEC company number on file. Enter it under Advanced, or import a file.'}</p>{loadControls}</section>}
 {current&&<><div className="source-note fund-source"><strong>{current.facts.entityName}</strong>{current.source.kind==='synthetic'&&<span className="synthetic-badge">{demoDataLabel()}</span>}<span>{current.facts.concepts.length.toLocaleString()} reported fields</span><InfoTip label="About this company data">CIK {current.facts.cik}. {current.source.label} · Retrieved {current.source.retrievedAt}. {current.source.sourceUrl??(current.source.kind==='synthetic'?'Demo data, no external filing source.':'Local file origin has not been verified.')} {current.facts.concepts.length.toLocaleString()} reported concepts · {current.facts.observationCount.toLocaleString()} observations. {current.source.kind==='synthetic'?'Demo data: invented company facts for offline testing. These are not issuer filings or actual company values.':current.source.kind==='local-import'?'User-supplied companyfacts; source and filing claims have not been verified. These values are independent of chart prices.':'SEC companyfacts values are independent of chart prices.'}</InfoTip></div>
 {market&&onPreferencesChange&&<div className="screener-toolbar fund-link"><span>{linkedHere===current.id?'Linked to '+market.exchange+':'+market.symbol+' for symbol details.':'Not linked to '+market.exchange+':'+market.symbol+'. OpenCandle never links a company to a ticker by itself.'}</span>{linkedHere===current.id?<button onClick={()=>link(null)}>Unlink from {market.symbol}</button>:<button disabled={kindMismatch} onClick={()=>link(current.id)}>Use for {market.symbol}</button>}{kindMismatch&&<span>{market.synthetic?'Supplied filing data cannot be linked to a symbol with '+demoDataLabel().toLowerCase()+'.':demoDataLabel()+' cannot be linked to a real-market symbol.'}</span>}</div>}
 <div className="fund-tabs" role="tablist" aria-label="Fundamentals view">{TABS.map(([id,label])=><button key={id} role="tab" aria-selected={view.tab===id&&pane===null} className={view.tab===id&&pane===null?'active':''} onClick={()=>{setPane(null);updateView({tab:id});}}>{label}</button>)}<button role="tab" aria-selected={pane==='graph'} className={pane==='graph'?'active':''} onClick={()=>setPane('graph')}>Graph</button><button role="tab" aria-selected={pane==='metrics'} className={pane==='metrics'?'active':''} onClick={()=>setPane('metrics')}>Metrics</button></div>
 <div className="screener-toolbar"><label>Filing cutoff<select aria-label="Filing cutoff mode" value={view.cutoffMode} onChange={e=>changeCutoffMode(e.target.value as CutoffMode)}><option value="today">Today (UTC)</option><option value="date">On or before a date</option><option value="none">No cutoff</option></select></label><label>Filed on or before<input aria-label="Fundamentals filing cutoff" type="date" value={view.cutoffMode==='today'?today:view.cutoffMode==='date'?view.cutoffDate??'':''} onChange={e=>changeCutoffDate(e.target.value)}/></label>
 {(view.tab!=='facts'&&pane===null||pane==='metrics')&&<><label>Period<select aria-label="Statement period" value={view.basis} onChange={e=>updateView({basis:e.target.value as StatementBasis})}><option value="FY">Annual (FY)</option><option value="FQ">Quarterly (FQ)</option><option value="TTM">Trailing twelve months (TTM)</option></select></label><label>Currency<select aria-label="Statement currency" value={currency??''} disabled={!currencies.length} onChange={e=>updateView({currency:e.target.value})}>{currencies.length?currencies.map(value=><option key={value}>{value}</option>):<option value="">None reported</option>}</select></label><label>Scale<select aria-label="Statement scale" value={view.scale} onChange={e=>updateView({scale:e.target.value as StatementScale})}><option value="auto">Automatic</option><option value="units">Units</option><option value="thousands">Thousands (K)</option><option value="millions">Millions (M)</option><option value="billions">Billions (B)</option></select></label><label>Revisions<select aria-label="Statement revisions" value={view.revisions} onChange={e=>updateView({revisions:e.target.value as FundamentalsView['revisions']})}><option value="latest">Latest filed by the cutoff</option><option value="original">As first reported</option></select></label><label>Periods<select aria-label="Statement columns" value={view.columns} onChange={e=>updateView({columns:Number(e.target.value) as FundamentalsView['columns']})}>{COLUMN_LIMITS.map(value=><option key={value} value={value}>{value}</option>)}</select></label></>}
 <button type="button" className="fund-quiet" onClick={()=>updateView(createFundamentalsView())}>Reset view</button></div>
 {view.currency&&currency&&view.currency!==currency&&<p className="help">{view.currency} is not reported on this company's statement tags; showing {currency}.</p>}
 {pane==='metrics'&&currency?<FundamentalsMetrics key={current.id} document={current} basis={view.basis} currency={currency} asOf={cutoffError?null:cutoff} revisions={view.revisions} columns={view.columns} scale={view.scale} price={lastClose} today={today} onExport={exportMetrics}/>:pane==='metrics'?<p>{statement.error||'This document has no reported currency values on the supported statement tags.'}</p>:pane==='graph'?<FundamentalsGraph key={cutoff??'none'} documents={documents} asOf={cutoffError?null:cutoff} initial={prefs.current.graph} priceBars={priceBars} priceLabel={lastClose?lastClose.symbol+' close':''} onError={setError} onSave={saveGraph}/>:view.tab==='facts'?factsBrowser():statementView()}</>}
 </div><footer><span role="alert">{error||cutoffError||query?.error||statement.error}</span><button onClick={close}>Close</button></footer></Modal>;
 function statementView(){
  if(!table)return <p>{statement.error||'Choose company data.'}</p>;
  return <><p className="help fund-policy">About these values<InfoTip label="About these values">{current?.source.kind==='sec-public'?STATEMENT_POLICY:(current?.source.kind==='synthetic'?'Values are invented demo facts for offline testing, not issuer filings or actual company results. ':'Values are user-supplied companyfacts whose source and filing claims have not been verified. ')+STATEMENT_POLICY.split('. ').slice(1).join('. ')}</InfoTip></p>{table.notices.map(note=><p key={note}>{note}</p>)}
  {table.columns.length>0&&<><p>{table.rows.length} lines · {table.columns.length} periods · {table.options.currency} · values in {scale==='units'?'units':scale} where monetary · filing cutoff {table.options.asOf??'none'}</p>
  <div className="table-scroll"><table className="data-table fund-statement"><thead><tr><th>Line</th>{table.columns.map(end=><th key={end}>{table.options.basis} ending {end}</th>)}</tr></thead><tbody>{table.rows.map(row=><tr key={row.id} className={row.id===line?.id?'selected':''}><th scope="row"><button aria-label={'Inspect '+row.label} onClick={()=>updateView({line:row.id})}>{row.label}</button></th>{row.cells.map(cell=><td key={cell.end} className={cell.value===null?'fund-unavailable':''} title={describeMethod(cell)}>{formatStatementValue(cell.value,row.measure,scale)}</td>)}</tr>)}</tbody></table></div>
  <div className="screener-toolbar"><label>Statement line<select aria-label="Statement line" value={line?.id??''} onChange={e=>updateView({line:e.target.value})}>{table.rows.map(row=><option key={row.id} value={row.id}>{row.label}</option>)}</select></label><button onClick={()=>void exportStatement()}>Export statement CSV</button><span className="help">Exports the {table.columns.length} period{table.columns.length===1?'':'s'} shown{table.availableColumns>table.columns.length?' of '+table.availableColumns+'; raise Periods to include more':''}.</span></div>
  {line&&<div className="source-note fund-detail" aria-label="Statement line detail"><strong>{line.label}</strong> · {line.unit}{line.formula?<> · Formula: {line.formula}</>:<> · Tags in preference order: {line.tags.join(', ')}</>}{line.catalogId&&<> · Reference leaf {line.catalogId}</>}<ul>{line.cells.map(cell=><li key={cell.end}>{cell.start?cell.start+' to ':'At '}{cell.end}: {cell.value===null?'':formatStatementValue(cell.value,line.measure,'units')+' '+cell.unit+' · '}{describeMethod(cell)}{cell.value!==null&&<> · filed {cell.filed??'date unknown'}{cell.form&&<> · {cell.form}</>}{cell.accession&&<> · {cell.accession}</>}</>}</li>)}</ul></div>}</>}
  {view.tab==='statistics'&&priceRatios()}
  {view.tab==='statistics'&&<div className="fund-unavailable-list"><strong>Not available from filing data</strong><ul>{UNAVAILABLE_METRICS.filter(metric=>!lastClose||!PRICE_RATIO_IDS.includes(metric.id)).map(metric=><li key={metric.id}>{metric.label}: {metric.reason}</li>)}</ul></div>}</>;
 }
 function priceRatios(){
  if(!current||!currency||!lastClose)return null;
  let results:ReturnType<typeof computePriceRatios>;
  try{results=computePriceRatios({facts:current.facts,currency,asOf:cutoffError?null:cutoff,price:lastClose,today});}catch(e){return <p className="help">{String(e)}</p>;}
  return <div className="fund-ratios" aria-label="Price-based ratios"><strong>Price-based ratios</strong><p className="help">{lastClose?'Price: '+lastClose.symbol+' close '+lastClose.close+' on '+lastClose.date+' ('+lastClose.source+'), from loaded data, not a live quote. ':''}Filing values are the latest TTM, balance sheet and share count by the cutoff. Ratios use the numbers shown and are OpenCandle-computed, not vendor figures.</p>
   <table className="data-table"><thead><tr><th>Ratio</th><th>Value</th><th>Formula and inputs</th></tr></thead><tbody>{results.map(r=><tr key={r.id}><th scope="row">{r.label}</th><td className={r.value===null?'fund-unavailable':''}>{formatRatio(r)}</td><td>{r.value===null?r.reason:<>{r.formula}<br/>{r.inputs.map(i=><span key={i.label} className="fund-input">{i.label}: {i.value} ({i.detail})</span>)}</>}</td></tr>)}</tbody></table></div>;
 }
 function factsBrowser(){
  return <><div className="screener-toolbar"><input aria-label="Search fundamental fields" placeholder="Search reported fields" value={search} onChange={e=>changeFactFilter(()=>{setSearch(e.target.value);setConceptId('');})}/><select aria-label="Reported fundamental field" value={concept?.id??''} onChange={e=>changeFactFilter(()=>{setConceptId(e.target.value);setUnit('');})}>{concepts.map(row=><option key={row.id} value={row.id}>{row.label} ({row.id})</option>)}</select></div>
  {concept?<><p>{concept.description||'No definition supplied. The taxonomy tag remains visible above.'}</p><div className="screener-toolbar"><label>Unit<select aria-label="Fact unit" value={selectedUnit} onChange={e=>changeFactFilter(()=>setUnit(e.target.value))}>{concept.units.map(value=><option key={value}>{value}</option>)}</select></label><label>Period<select aria-label="Fact period" value={period} onChange={e=>changeFactFilter(()=>setPeriod(e.target.value as FactPeriod))}><option value="all">All reported periods</option><option value="instant">Instant</option><option value="quarter-length">60 to 120 day duration</option><option value="annual-length">300 to 400 day duration</option><option value="other-duration">Other durations</option></select></label><label>Revisions<select aria-label="Fact revision selection" value={revisions} onChange={e=>changeFactFilter(()=>setRevisions(e.target.value as typeof revisions))}><option value="latest">Latest available filing</option><option value="original">First available filing</option><option value="all">All reported versions</option></select></label></div>
  {query?.result&&<><p className="help">{query.result.policy}</p><p>{query.result.rows.length} results · {query.result.unavailableFilingDates} missing filing dates excluded · {query.result.afterCutoff} later filings excluded · {query.result.conflicts} conflicting filing groups · {query.result.unorderedFilingDates} rows with unknown chronology retained</p>{query.result.rows.length===0?<p>No reported values match these filters.</p>:<FactTable rows={query.result.rows}/>}<button onClick={()=>void exportRows()}>Export selected facts CSV</button></>}</>:<p>No reported concepts match the search.</p>}</>;
 }
}
export function csvCell(value:unknown):string{let text=String(value);if(typeof value==='string'&&/^(?:\s*[=+\-@]|[\t\r\n])/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';}
function FactTable({rows}:{rows:FactRow[]}){return <div className="table-scroll"><table className="data-table"><thead><tr>{['Start','End','Reported value','Unit','Filed','Form','Fiscal label','Accession','Status'].map(value=><th key={value}>{value}</th>)}</tr></thead><tbody>{rows.slice(0,2000).map((row,index)=><tr key={index}><td>{row.start??'Instant'}</td><td>{row.end}</td><td>{row.value.toLocaleString(undefined,{maximumFractionDigits:12})}</td><td>{row.unit}</td><td>{row.filed??'Unavailable'}</td><td>{row.form??'Unavailable'}</td><td>{row.fiscalYear??''} {row.fiscalPeriod??''}</td><td>{row.accession??'Unavailable'}</td><td>{row.chronologyUnknown?'Filing chronology unknown':row.ambiguous?'Conflicting reported values':row.duplicateCount>1?row.duplicateCount+' identical records':'Reported'}</td></tr>)}</tbody></table>{rows.length>2000&&<p>First 2,000 rows shown. CSV exports all {rows.length.toLocaleString()} selected rows.</p>}</div>;}
