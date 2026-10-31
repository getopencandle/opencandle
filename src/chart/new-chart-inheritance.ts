import type {MultiChartCellState} from '../ui/MultiChartGrid';
import {measureWorkspaceJSON} from '../ui/workspace-json';
import {restoreScriptBindings} from '../ui/script-library';
import {validateIndicatorSnapshots} from './indicator-settings';
import {parseIndicatorSource,remapIndicatorSource,orderIndicatorSourceGraph} from '../domain/indicator-source';
import {assertHistoricalFrameCompatible,historicalOwnerKey} from './historical-frame';
import {validateRendererContextInventory} from './renderer-frame';
import type {ChartSourceContext} from './source-context';
import type {AnalysisPaneInventory} from './analysis-transaction';
const overlay=new Set(['sma','ema','bb','vwap']);
/** Validate graph before allocating IDs. A comparison's raw native ID cannot
 * prove that an inherited study has an independent portable pane. */
export function prepareChartInheritance(first:MultiChartCellState,inventoryInput?:AnalysisPaneInventory,frameProof?:{source:ChartSourceContext;calculationFingerprints:Record<string,string>}){
 measureWorkspaceJSON({first,...frameProof?{frameProof}:{}});validateIndicatorSnapshots(first.indicators);const indicators=structuredClone(first.indicators);
 const bindingFields=new Set(['id','name','source','pane','documentId','version','paneId','ownScale','visible','plots','inputs']);
 for(const row of first.scriptBindings??[])if(Object.keys(row).some(key=>!bindingFields.has(key)))throw Error('Unsupported first-chart script binding fields');
 const bindings=restoreScriptBindings(first.scriptBindings??[]),configured=[...first.indicators.map(row=>({kind:'built' as const,id:row.id})),...bindings.map(row=>({kind:'script' as const,id:row.id})),...first.comparisons.map(row=>({kind:'comparison' as const,id:row.id}))],keys=new Set(configured.map(historicalOwnerKey));
 if(keys.size!==configured.length)throw Error('Ambiguous first-chart study identities');
 const nonprice=first.indicators.some(row=>row.paneId!== 'price'&&(row.paneId!==null||!overlay.has(row.kind)))||bindings.some(row=>row.pane==='new');
 let graph:Array<{price:boolean;logical:string|null;owners:Array<{kind:string;id:string}>}>|null=null;
 if(inventoryInput){const inventory=validateRendererContextInventory(inventoryInput);graph=inventory.panes.map(row=>({price:row.paneId==='price',logical:row.logicalPaneId,owners:row.owners}));}
 else if(first.frame&&frameProof&&first.comparisons.length&&nonprice){const frame=assertHistoricalFrameCompatible(first.frame,{...frameProof,style:first.style});graph=frame.panes.map(row=>({price:row.key.kind==='price',logical:row.key.kind==='logical'?row.key.id:row.key.kind==='price'?'price':null,owners:row.owners}));}
 if(graph){const found=new Set<string>();for(const pane of graph){for(const owner of pane.owners){if(!['built','script','comparison'].includes(owner.kind))throw Error('Unsupported first-chart pane owner');const key=historicalOwnerKey(owner as Parameters<typeof historicalOwnerKey>[0]);if(found.has(key)||!keys.has(key))throw Error('First-chart pane ownership is stale or ambiguous');found.add(key);}if(!pane.price&&pane.owners.some(row=>row.kind==='comparison')&&pane.owners.some(row=>row.kind==='built'||row.kind==='script'))throw Error('Comparison shares an inherited study pane; the excluded comparison cannot be removed safely');}if(found.size!==keys.size)throw Error('First-chart studies have not all reached native placement');const savedPanes=new Map<string,Set<string>>();for(const row of [...first.indicators.map(row=>({kind:'built' as const,id:row.id,paneId:row.paneId})),...bindings.map(row=>({kind:'script' as const,id:row.id,paneId:row.pane==='price'?'price':row.paneId??null}))])if(row.paneId!==null){let owners=savedPanes.get(row.paneId);if(!owners){owners=new Set();savedPanes.set(row.paneId,owners);}owners.add(historicalOwnerKey(row));}for(const [id,owners]of savedPanes){const panes=graph.filter(pane=>pane.owners.some(owner=>owners.has(historicalOwnerKey(owner as Parameters<typeof historicalOwnerKey>[0]))));if(panes.length!==1)throw Error('Saved logical study pane is split in its ownership graph');if(id!=='price'&&(panes[0].price||panes[0].owners.length!==owners.size))throw Error('Saved study pane has missing or foreign owners');}
  for(const row of [...first.indicators.map(row=>({kind:'built',id:row.id,paneId:row.paneId,price:row.paneId==='price'})),...bindings.map(row=>({kind:'script',id:row.id,paneId:row.paneId??null,price:row.pane==='price'}))]){const pane=graph.find(pane=>pane.owners.some(owner=>owner.kind===row.kind&&owner.id===row.id))!;if(row.paneId!==null&&(row.price?!pane.price:pane.price||pane.logical!==null&&pane.logical!==row.paneId))throw Error('First-chart logical pane placement does not match its saved settings');if(row.kind==='script'&&row.paneId===null&&row.price!==pane.price)throw Error('First-chart script default pane is unavailable');if(row.paneId===null&&!pane.price&&pane.owners.length>1)throw Error('A shared first-chart pane lacks a saved logical identity');}
 }else if(first.comparisons.length&&nonprice)throw Error('First-chart comparison placement is unknown; restore its pane graph before adding charts');
 return{copy(makeId:()=>string){const panes=new Map<string,string>(),pane=(value:string|null)=>value===null||value==='price'?value:panes.get(value)??(()=>{const id=makeId();panes.set(value,id);return id;})();const copied=indicators.map(row=>({...structuredClone(row),id:makeId(),paneId:pane(row.paneId)})),ids=new Map(indicators.map((row,index)=>[row.id,copied[index].id]));
  // Indicator-on-indicator sources follow their fresh identities (as template instantiation does); sources precede dependents.
  // A reference to a removed source has no copy: it passes through unchanged so the inherited
  // dependent stays explicitly source-unavailable. Fresh ids never collide with it.
  const source=(value:unknown)=>{const ref=parseIndicatorSource(value);return ref&&!ids.has(ref.instance)?value:remapIndicatorSource(value,ids);};
  const remapped=orderIndicatorSourceGraph(copied.map(row=>Object.hasOwn(row.inputs,'source')?{...row,inputs:{...row.inputs,source:source(row.inputs.source) as string}}:row));
  return{indicators:remapped,scriptBindings:bindings.map(row=>({...structuredClone(row),id:makeId(),paneId:pane(row.paneId??null)}))};}};
}
