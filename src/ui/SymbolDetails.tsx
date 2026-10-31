import React,{useEffect,useRef,useState} from 'react';
import {DETAIL_BLOCK_IDS,DETAIL_BLOCK_LABELS,defaultDetailPreferences,detailBlockAvailability,restoreDetailPreferences,type DetailBlockId,type DetailPreferences,type DetailSnapshot} from '../watchlists/details';
import {Modal} from './Modal';
import {checkFundamentalsSummary,type FundamentalsSummaryMarket,type FundamentalsSummaryPeriod,type SymbolFundamentalsSummary} from './symbol-details-fundamentals';
import {DETAIL_PANE_LIMITS,defaultDetailPane,dragDetailPaneHeight,keyDetailPaneHeight,type DetailPane} from '../watchlists/detail-pane';
import {detailCoverage,detailKeyStatsWithFundamentals,detailMarketStatus,detailRanges,formatDetailPrice,formatDetailValue,type DetailRange} from '../domain/symbol-details-quote';
import {DEMO_BADGE,DEMO_BADGE_TITLE,displayExchange} from '../domain/fixtures';
import {demoDataMode} from '../domain/demo-mode';
/** Example mode labels generated prices as example data; normal use never shows them. */
const demoBadge=()=>demoDataMode()==='example'?{text:'EXAMPLE',title:'Example data: invented prices, not real market prices.'}:{text:DEMO_BADGE,title:DEMO_BADGE_TITLE};
import {DetailSourceSections} from '../fundamentals/detail-sources';
import './symbol-details.css';

export interface SymbolDetailsProps {
 snapshot:DetailSnapshot;identity:string;ownerToken:object;preferences:DetailPreferences;notes:readonly {id:string;text:string}[];
 assertOwner:()=>void;onBegin:()=>void;onPreferences:(next:DetailPreferences)=>boolean|void;
 onNotes?:(noteId?:string,startNew?:boolean)=>boolean|void;
 /** Section contract. undefined: no section. null: section states nothing was supplied. */
 fundamentals?:SymbolFundamentalsSummary|null;
 onOpenFundamentals?:(market:FundamentalsSummaryMarket)=>boolean|void;
 /** List/details split. With onPane the pane is docked under the list with a divider; false means not saved. */
 pane?:DetailPane;onPane?:(next:DetailPane)=>boolean|void;
 /** Opens the Symbol info dialog for this exact market. Absent: no button. false: not opened. */
 onOpenSymbolInfo?:(market:FundamentalsSummaryMarket)=>boolean|void;
}
const AVAILABILITY_LABELS={'not-loaded':'Not loaded','not-applicable':'Not applicable','unavailable':'Unavailable','error':'Load failed'} as const;
const SOURCE_LABELS={'sec-public':'public SEC filing data','local-import':'local import','synthetic':'demo data'} as const;
/** Internal identifiers never shown as detail rows (UI audit 1028: no internal ids where a user looks). Symbol info keeps the full record. */
const HIDDEN_FIELDS=new Set(['Instrument ID','Provider ID','Dataset ID','Daily Provider ID','Daily Dataset ID','Daily dataset ID']);
/** Display-only period text; keeps a start-only period instead of dropping it. */
function periodText(period:FundamentalsSummaryPeriod|null):string{
 if(!period)return 'Period not supplied';
 const fiscal=[period.fiscalYear===null?null:'FY'+period.fiscalYear,period.fiscalPeriod].filter(Boolean).join(' ');
 const span=period.start&&period.end?period.start+' to '+period.end:period.end?'as of '+period.end:period.start?'from '+period.start+' (end not supplied)':'dates not supplied';
 return (fiscal?fiscal+' · ':'')+span;
}
/** Large Last with the coloured daily change, then the session reading (LV calendar). */
function DetailHeadlineLine({headline,tick}:{headline:NonNullable<DetailSnapshot['headline']>;tick?:unknown}){
 const signed=(text:string,value:number)=>(value>0?'+':'')+text;
 const change=headline.change===null?null:signed(formatDetailPrice(headline.change,tick),headline.change)+(headline.changePercent===null?'':' ('+signed(headline.changePercent.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}),headline.changePercent)+'%)');
 return <div className="symbol-details-headline" data-tone={headline.tone??undefined}><strong title="Last close">{formatDetailPrice(headline.last!,tick)}</strong>{change&&<span className="symbol-details-change" title="Daily snapshot change">{change}</span>}</div>;
}
/** Low and high at the ends, the last supplied close as a marker. */
export function RangeBar({row,tick}:{row:DetailRange;tick?:unknown}){
 const n=(value:number)=>formatDetailPrice(value,tick);
 return <div className="detail-range" data-range={row.id} title={row.reason??(row.value===null?'No last close to mark.':'Last close '+n(row.value))}>
  <span className="detail-range-label">{row.label}</span>
  {row.low===null||row.high===null?<span className="detail-range-missing">Not available: {row.reason}</span>:<>
   <span className="detail-range-ends"><span>{n(row.low)}</span><span>{n(row.high)}</span></span>
   <span className="detail-range-track">{row.position!==null&&<span className="detail-range-marker" style={{left:row.position+'%'}}/>}</span>
  </>}
 </div>;
}
type Session={mode:'expanded'|'customize';identity:string;ownerToken:object;preferences:DetailPreferences;closed:boolean;busy:boolean};
export function SymbolDetails(props:SymbolDetailsProps){
 const {snapshot,preferences,notes}=props,latest=useRef(props);latest.current=props;
 // Categories that do not apply to this instrument type are shown disabled with a reason; saved preferences are never changed by this.
 const assetClass=snapshot.blocks.identity.find(row=>row.label==='Asset class')?.value,availability=detailBlockAvailability(typeof assetClass==='string'?assetClass:null);
 const currencyValue=snapshot.blocks.identity.find(row=>row.label==='Currency')?.value,checkedSummary=props.fundamentals?checkFundamentalsSummary(props.fundamentals,{exchange:snapshot.exchange,symbol:snapshot.symbol,synthetic:snapshot.synthetic}):null,validSummary=checkedSummary?.ok?checkedSummary.summary:null;
 const tickValue=snapshot.blocks.identity.find(row=>row.label==='Tick size')?.value,tickSize=typeof tickValue==='number'?tickValue:undefined;
 const status=detailMarketStatus(snapshot.headline?.session),statusMarket={exchange:snapshot.exchange,symbol:snapshot.symbol,synthetic:snapshot.synthetic};
 const mounted=useRef(true),sessionRef=useRef<Session|null>(null),revision=useRef(0);
 const [session,setSession]=useState<Session|null>(null),[draft,setDraft]=useState(preferences),[error,setError]=useState('');
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const owns=()=>mounted.current&&latest.current.snapshot===snapshot&&latest.current.preferences===preferences&&latest.current.assertOwner===props.assertOwner;
 const assertOwner=()=>{if(!owns())throw Error('This symbol detail view was replaced.');props.assertOwner();if(!owns())throw Error('This symbol detail view was replaced.');};
 const current=()=>{try{assertOwner();return true;}catch{return false;}};
 const active=session&&!session.closed&&session.identity===props.identity&&(session.mode==='expanded'||session.ownerToken===props.ownerToken&&session.preferences===preferences)?session:null;
 const capturedRevision=revision.current;
 function close(target:Session){if(!owns()||sessionRef.current!==target||target.closed)return;target.closed=true;sessionRef.current=null;setSession(null);setError('');}
 function run(action:()=>void,target:Session|null=sessionRef.current){try{assertOwner();action();}catch(cause){if(current()&&sessionRef.current===target&&(!target||!target.closed)&&revision.current===capturedRevision)setError(cause instanceof Error?cause.message:String(cause));}}
 function open(mode:Session['mode']){run(()=>{props.onBegin();assertOwner();if(sessionRef.current&&!sessionRef.current.closed)sessionRef.current.closed=true;const next:Session={mode,identity:props.identity,ownerToken:props.ownerToken,preferences,closed:false,busy:false};sessionRef.current=next;revision.current++;setDraft(structuredClone(preferences));setError('');setSession(next);});}
 function assertSession(target:Session){assertOwner();if(sessionRef.current!==target||target.closed||target.busy||revision.current!==capturedRevision)throw Error('This symbol detail dialog changed. Review its current draft.');}
 function stage(target:Session,next:DetailPreferences){run(()=>{assertSession(target);const valid=restoreDetailPreferences(next);revision.current++;setDraft(valid);setError('');},target);}
 function publish(target:Session|null,next:DetailPreferences,closeAfter=true){run(()=>{
  if(target)assertSession(target);else if(sessionRef.current&&!sessionRef.current.closed)throw Error('Close the symbol detail dialog before changing a block.');
  const valid=restoreDetailPreferences(next);assertOwner();if(target)target.busy=true;
  try{if(props.onPreferences(valid)===false)throw Error('Symbol details were not saved. Your edit is kept.');
   // The parent validates its own accepted publication. Only this exact local
   // session may close, even if saving synchronously replaced the book props.
   if(closeAfter&&target&&mounted.current&&sessionRef.current===target&&!target.closed){target.closed=true;sessionRef.current=null;setSession(null);setError('');}
  }finally{if(target)target.busy=false;}
 },target);}
 function collapse(id:DetailBlockId,expanded=false){publish(expanded?active:null,{...preferences,collapsed:preferences.collapsed.includes(id)?preferences.collapsed.filter(value=>value!==id):[...preferences.collapsed,id]},false);}
 function note(noteId?:string,startNew=false){run(()=>{if(active)assertSession(active);else if(sessionRef.current&&!sessionRef.current.closed)throw Error('Close the symbol detail dialog before opening a note.');if(props.onNotes?.(noteId,startNew)===false)throw Error('Local notes could not be opened.');if(active&&mounted.current&&sessionRef.current===active){active.closed=true;sessionRef.current=null;setSession(null);}},active);}
 function openFundamentals(summary:SymbolDetailsProps['fundamentals']){run(()=>{if(latest.current.fundamentals!==summary)throw Error('The fundamentals summary changed. Review the current details.');if(active)assertSession(active);else if(sessionRef.current&&!sessionRef.current.closed)throw Error('Close the symbol detail dialog before opening fundamentals.');if(props.onOpenFundamentals?.({exchange:snapshot.exchange,symbol:snapshot.symbol,synthetic:snapshot.synthetic})===false)throw Error('Fundamentals could not be opened.');if(active&&mounted.current&&sessionRef.current===active){active.closed=true;sessionRef.current=null;setSession(null);}},active);}
 function openSymbolInfo(){run(()=>{if(active)assertSession(active);else if(sessionRef.current&&!sessionRef.current.closed)throw Error('Close the symbol detail dialog before opening symbol info.');if(props.onOpenSymbolInfo?.({...statusMarket})===false)throw Error('Symbol info could not be opened.');if(active&&mounted.current&&sessionRef.current===active){active.closed=true;sessionRef.current=null;setSession(null);}},active);}
 function fundamentals(){
  const raw=props.fundamentals;if(raw===undefined)return null;
  const check=raw===null?null:checkFundamentalsSummary(raw,{exchange:snapshot.exchange,symbol:snapshot.symbol,synthetic:snapshot.synthetic}),summary=check?.ok?check.summary:null;
  const value=(row:SymbolFundamentalsSummary['fields'][number])=>row.value===null?'Unavailable: '+row.missingReason:(typeof row.value==='number'?row.value.toLocaleString(undefined,{maximumFractionDigits:16}):row.value)+(row.unit?' '+row.unit:'');
  return <section className="detail-block detail-fundamentals" aria-label="Fundamentals summary"><h4>Fundamentals summary</h4>
   {raw===null?<p>No fundamentals summary was supplied for this symbol.</p>:check&&!check.ok?<p className="detail-fundamentals-rejected">Fundamentals summary rejected: {check.reason} No values are shown.</p>:summary&&<>
    {summary.availability!=='available'&&<p>{AVAILABILITY_LABELS[summary.availability]}: {summary.reason}</p>}
    {summary.source&&<p className="detail-source-diagnostic">Source: {summary.source.label} ({SOURCE_LABELS[summary.source.kind]}) · retrieved {summary.source.retrievedAt??'time not supplied'} · filing cutoff {summary.asOf??'latest supplied'}{summary.entity?' · '+summary.entity.name+(summary.entity.cik?' (CIK '+summary.entity.cik+')':''):''}</p>}
    {summary.availability!=='available'&&summary.fields.length>0&&<p className="detail-fundamentals-rejected">{summary.fields.length} supplied field{summary.fields.length===1?' is':'s are'} not shown because this summary is not available.</p>}
    {summary.availability==='available'&&summary.fields.length>0&&<dl>{summary.fields.map(row=><div key={row.id}><dt>{row.label}<small>{periodText(row.period)}{row.form?' · '+row.form:''}{row.filed?' · filed '+row.filed:''}{row.derived?' · derived: '+row.derived.formula:''}</small></dt><dd>{value(row)}</dd></div>)}</dl>}
   </>}
   {props.onOpenFundamentals&&<div className="button-row"><button type="button" onClick={()=>openFundamentals(raw)}>Open fundamentals</button></div>}
  </section>;
 }
 // Key stats and Performance, fixed sections after the customizable blocks (their saved
 // order and visibility are unchanged). Each unavailable value names its reason; nothing is estimated.
 function keyStats(){
  const rows=detailKeyStatsWithFundamentals(snapshot.keyStats,props.fundamentals===undefined?undefined:validSummary,typeof snapshot.headline?.last==='number'?snapshot.headline.last:null,typeof currencyValue==='string'?currencyValue:null);if(!rows)return null;
  return <section className="detail-block detail-key-stats" aria-label="Key stats"><h4>Key stats</h4><dl>{rows.map(row=><div key={row.label} title={row.reason??undefined}><dt>{row.label}</dt><dd>{row.value===null?'Unavailable'+(row.reason?': '+row.reason:''):formatDetailValue(row.label,row.value,tickSize)}</dd></div>)}</dl></section>;
 }
 function performance(){
  const result=snapshot.performance;if(!result)return null;
  const day=(seconds:number)=>new Date(seconds*1000).toISOString().slice(0,10),signed=(value:number)=>value.toLocaleString('en-US',{maximumFractionDigits:2,signDisplay:'exceptZero'})+'%';
  const largest=Math.max(0,...result.rows.map(row=>row.value===null?0:Math.abs(row.value)));
  return <section className="detail-block detail-performance" aria-label="Performance"><h4 title={'OpenCandle calculation from the loaded daily bars'+(result.asOf===null?'':', last daily close on '+day(result.asOf))+'.'}>Performance</h4>
   {result.reason&&<p className="detail-source-diagnostic">{result.reason}</p>}
   {result.rows.map(row=>{const tone=row.value===null||row.value===0?undefined:row.value>0?'up':'down',width=row.value===null||largest===0?0:Math.round(Math.abs(row.value)/largest*10000)/100;
    return <div key={row.id} data-period={row.label} title={row.value===null?row.reason??'Unavailable':row.label+' '+signed(row.value)+(row.base?' from the close '+row.base.close.toLocaleString('en-US',{maximumFractionDigits:6})+' on '+day(row.base.time):'')+'.'} style={{display:'grid',gridTemplateColumns:'34px minmax(40px,1fr) 78px',alignItems:'center',gap:8,padding:'3px 0'}}>
     <span>{row.label}</span>
     <span className="detail-performance-track" style={{display:'block',height:6,borderRadius:3,overflow:'hidden',background:'var(--lv-border,#30405a)'}}><span className="detail-performance-fill" data-tone={tone} style={{display:'block',height:'100%',width:width+'%',background:tone==='down'?'var(--lv-negative-text,#f7525f)':'var(--lv-positive-text,#22ab94)'}}/></span>
     <span style={{textAlign:'right',fontVariantNumeric:'tabular-nums',color:tone==='down'?'var(--lv-negative-text,#f7525f)':tone==='up'?'var(--lv-positive-text,#22ab94)':undefined}}>{row.value===null?'Unavailable':signed(row.value)}</span>
    </div>;})}
  </section>;
 }
 function ranges(){return <section className="detail-block detail-ranges" aria-label="Price ranges"><h4>Price ranges</h4>{detailRanges(snapshot).map(row=><RangeBar key={row.id} row={row} tick={tickSize}/>)}</section>;}
 function coverage(){
  const rows=detailCoverage(snapshot,validSummary,typeof assetClass==='string'?assetClass:null);
  return <section className="detail-block detail-coverage" aria-label="More details"><h4>More details</h4><dl>{rows.map(row=><div key={row.id} data-coverage={row.id} title={row.reason??undefined}><dt>{row.label}</dt><dd className={row.value===null?'detail-unavailable':undefined}>{row.value??'Not available: '+row.reason}</dd></div>)}</dl></section>;
 }
 function fields(id:Exclude<DetailBlockId,'notes'>){return <dl>{snapshot.blocks[id].filter(row=>!HIDDEN_FIELDS.has(row.label)).map(row=><div key={row.label}><dt>{row.label}</dt><dd>{row.value===null?'Unavailable':row.label==='Exchange'&&typeof row.value==='string'?displayExchange(row.value):formatDetailValue(row.label,row.value,tickSize)}</dd></div>)}</dl>;}
 function blocks(expanded=false){return <>
  <details className="detail-about"><summary title="How these values are sourced">About this data</summary><p className="detail-snapshot-policy">{snapshot.disclaimer}</p><p className="detail-source-diagnostic">{snapshot.diagnostic}</p></details>
  {preferences.order.filter(id=>!preferences.hidden.includes(id)).map(id=><section className="detail-block" key={id}>
   <h4><button type="button" aria-label={(preferences.collapsed.includes(id)?'Expand ':'Collapse ')+DETAIL_BLOCK_LABELS[id]} aria-expanded={!preferences.collapsed.includes(id)} onClick={()=>collapse(id,expanded)}>{preferences.collapsed.includes(id)?'▸':'▾'} {DETAIL_BLOCK_LABELS[id]}</button></h4>
   {!preferences.collapsed.includes(id)&&(availability[id]?<p className="detail-unavailable">{availability[id]}</p>:id==='notes'?<div className="detail-notes">{props.onNotes?<><div className="button-row"><button type="button" onClick={()=>note(undefined,true)}>Add note</button><button type="button" onClick={()=>note()}>View all notes</button></div>{notes.length?notes.map(row=><button className="detail-note-preview" type="button" key={row.id} onClick={()=>note(row.id)}>{row.text}</button>):<p>No local notes for this symbol.</p>}</>:<p>Local note editor is unavailable.</p>}</div>:fields(id))}
  </section>)}
  {!preferences.order.some(id=>!preferences.hidden.includes(id))&&<p>All detail blocks are hidden. Use Customize blocks to show them.</p>}
  {ranges()}
  {keyStats()}
  {performance()}
  {fundamentals()}
  {/* With app-supplied sources the coverage list gains Company profile, Sector, Earnings, Dividends, News, Technical rating and Seasonals sections. */}
  <DetailSourceSections market={statusMarket} snapshot={snapshot} summary={validSummary} assetClass={typeof assetClass==='string'?assetClass:null}>{coverage()}</DetailSourceSections>
 </>;}
 // The list sits above and the details below a horizontal divider.
 // No hooks
 // are added: a drag previews on the element and saves once on release.
 const pane=props.pane??defaultDetailPane(),docked=!!props.onPane,paneOpen=docked&&!pane.collapsed;
 function measure(section:HTMLElement){
  const box=section.getBoundingClientRect(),table=section.parentElement?.querySelector<HTMLElement>('.wl-table'),header=section.querySelector<HTMLElement>('.symbol-details-content>header');
  return{height:box.height,available:table?table.getBoundingClientRect().height+box.height:null,headerMin:header?header.getBoundingClientRect().bottom-box.top+DETAIL_PANE_LIMITS.divider:DETAIL_PANE_LIMITS.detailsMin};
 }
 function savePane(next:DetailPane){let saved=false;try{saved=props.onPane?.(next)!==false;}catch{saved=false;}if(!saved&&mounted.current)setError('The details pane layout was not saved.');return saved;}
 function togglePane(){savePane({height:pane.height,collapsed:!pane.collapsed});}
 function startDrag(event:React.PointerEvent<HTMLDivElement>){
  if(!paneOpen||event.button!==0)return;const handle=event.currentTarget,section=handle.closest<HTMLElement>('.symbol-details');if(!section)return;
  event.preventDefault();const start=measure(section),startY=event.clientY,id=event.pointerId,previous=section.style.height;let height=Math.round(start.height),done=false;try{handle.setPointerCapture?.(id);}catch{}
  const move=(next:PointerEvent)=>{if(next.pointerId!==id)return;height=dragDetailPaneHeight(start.height,startY,next.clientY,start.available,start.headerMin);section.style.height=height+'px';handle.setAttribute('aria-valuenow',String(height));};
  const finish=(next:PointerEvent)=>{if(next.pointerId!==id||done)return;done=true;window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',finish);window.removeEventListener('pointercancel',finish);
   if(next.type==='pointercancel'||height===pane.height||!savePane({height,collapsed:false})){section.style.height=previous;handle.setAttribute('aria-valuenow',String(pane.height));}};
  window.addEventListener('pointermove',move);window.addEventListener('pointerup',finish);window.addEventListener('pointercancel',finish);
 }
 function paneKey(event:React.KeyboardEvent<HTMLDivElement>){
  const section=event.currentTarget.closest<HTMLElement>('.symbol-details');
  if(event.key==='Enter'){event.preventDefault();event.stopPropagation();togglePane();return;}
  if(!section)return;const box=measure(section),next=keyDetailPaneHeight(box.height,event.key,box.available,box.headerMin);if(next===null)return;
  event.preventDefault();event.stopPropagation();if(next!==pane.height)savePane({height:next,collapsed:false});
 }
 return <section className={'symbol-details'+(docked?' symbol-details-docked':'')+(docked&&pane.collapsed?' symbol-details-collapsed':'')} aria-label="Selected watchlist symbol details" style={paneOpen?{height:pane.height}:undefined}>
  {paneOpen&&<div className="symbol-details-divider" role="separator" tabIndex={0} aria-orientation="horizontal" aria-label="Resize watchlist and details" aria-valuemin={DETAIL_PANE_LIMITS.detailsMin} aria-valuemax={DETAIL_PANE_LIMITS.max} aria-valuenow={pane.height} title="Drag to resize. Arrow keys resize, Enter collapses." onPointerDown={startDrag} onKeyDown={paneKey}/>}
  <div className="symbol-details-content" inert={!!active||undefined}><header>{docked&&<button type="button" className="symbol-details-toggle" aria-expanded={!pane.collapsed} aria-label={pane.collapsed?'Show details pane':'Collapse details pane'} onClick={togglePane}>{pane.collapsed?'▸':'▾'}</button>}<h3>{snapshot.symbol}</h3>{!snapshot.synthetic&&<span>{displayExchange(snapshot.exchange)}</span>}{snapshot.synthetic&&demoDataMode()!=='off'&&<strong className="synthetic-badge" title={demoBadge().title}>{demoBadge().text}</strong>}{snapshot.description&&snapshot.description!==snapshot.symbol&&<p>{snapshot.description}</p>}{snapshot.headline&&snapshot.headline.last!==null&&<DetailHeadlineLine headline={snapshot.headline} tick={tickSize}/>}{status.state!=='unknown'&&<div className="symbol-details-status" data-state={status.state} title={status.detail}><span className="symbol-details-status-dot" aria-hidden="true"/>{status.label}</div>}<div className="button-row"><button type="button" onClick={()=>open('expanded')}>Expand details</button>{props.onOpenSymbolInfo&&<button type="button" onClick={openSymbolInfo}>Symbol info</button>}{props.onOpenFundamentals&&<button type="button" onClick={()=>openFundamentals(props.fundamentals)}>Fundamentals</button>}<button type="button" onClick={()=>open('customize')}>Customize blocks</button></div></header>
  {!(docked&&pane.collapsed)&&<div className="symbol-details-scroll">{blocks()}</div>}<p role="alert">{!active?error:''}</p></div>
  {active?.mode==='expanded'&&<Modal title={snapshot.symbol+' details'} onClose={()=>close(active)} wide><div className="symbol-details-expanded"><h3>{snapshot.symbol}{snapshot.synthetic?(demoDataMode()!=='off'&&<strong className="synthetic-badge" title={demoBadge().title}>{demoBadge().text}</strong>):' · '+displayExchange(snapshot.exchange)}</h3>{blocks(true)}</div><footer><span role="alert">{error}</span><button type="button" onClick={()=>close(active)}>Close</button></footer></Modal>}
  {active?.mode==='customize'&&<Modal title="Customize symbol detail blocks" onClose={()=>close(active)}><form className="detail-customize" onSubmit={event=>{event.preventDefault();publish(active,draft);}}><p>Choose visible blocks and their order. These settings apply to your local watchlists.</p>{draft.order.map((id,index)=><div className="detail-customize-row" key={id}><label><input type="checkbox" aria-label={'Show '+DETAIL_BLOCK_LABELS[id]} disabled={!!availability[id]} title={availability[id]??undefined} checked={!draft.hidden.includes(id)} onChange={event=>stage(active,{...draft,hidden:event.target.checked?draft.hidden.filter(value=>value!==id):[...draft.hidden,id]})}/>{DETAIL_BLOCK_LABELS[id]}{availability[id]?' ('+availability[id]+')':''}</label><button type="button" aria-label={'Move '+DETAIL_BLOCK_LABELS[id]+' up'} disabled={index===0} onClick={()=>{if(index===0)return;const order=[...draft.order];[order[index-1],order[index]]=[order[index],order[index-1]];stage(active,{...draft,order});}}>↑</button><button type="button" aria-label={'Move '+DETAIL_BLOCK_LABELS[id]+' down'} disabled={index===DETAIL_BLOCK_IDS.length-1} onClick={()=>{if(index===DETAIL_BLOCK_IDS.length-1)return;const order=[...draft.order];[order[index+1],order[index]]=[order[index],order[index+1]];stage(active,{...draft,order});}}>↓</button></div>)}<footer><span role="alert">{error}</span><button type="button" onClick={()=>stage(active,defaultDetailPreferences())}>Reset draft</button><button type="button" onClick={()=>close(active)}>Cancel</button><button type="submit">Apply</button></footer></form></Modal>}
 </section>;
}
