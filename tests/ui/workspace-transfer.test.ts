import {expect,it} from 'vitest';
import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {prepareWorkspaceJSON} from '../../src/ui/workspace-json';
import {prepareWorkspaceReplacement,WORKSPACE_IMPORT_BYTES} from '../../src/ui/workspace-transfer';
import {createPaperAccount,processPaperQuote,submitPaperOrder} from '../../src/domain/paper';
import {fixtureInstrument,fixtureDataset} from '../../src/domain/fixtures';
import {resizeMultiChartState,type MultiChartState} from '../../src/ui/MultiChartGrid';
const require=createRequire(import.meta.url),{saveInput,exportInput}=require('../../electron/validation.cjs');
const complete=()=>prepareWorkspaceJSON({...createInitialWorkspace(),paper:createPaperAccount(),alerts:[]});
const encode=(data:unknown)=>JSON.stringify({schemaVersion:1,data});

it('actual initial export passes preview, domain recovery and unchanged main save boundary',()=>{
 const data=complete(),text=JSON.stringify(exportInput({schemaVersion:1,data})),before=text;
 const next=prepareWorkspaceReplacement(text);expect(next.workspace.symbol).toBe('GME');expect(next.workspace.grid!.layout.cells).toHaveLength(1);expect(next.paper.cash).toBe(100000);expect(next.migrations).toEqual([]);expect(next.summary.join(' ')).toContain('1 chart(s) use labeled synthetic fixtures');
 expect(()=>saveInput({schemaVersion:1,expectedRevision:4,data:next.data})).not.toThrow();expect(text).toBe(before);expect(prepareWorkspaceReplacement(encode(next.data)).data).toEqual(next.data);
});
it('preserves multiple charts and executable script text without executing it during preview',()=>{
 const data=complete();data.grid=resizeMultiChartState(data.grid as MultiChartState,'two-columns');
 if((data.grid as any).layout.cells.length!==2)throw new Error('Expected two chart cells');
 const first=(data.grid as any).cells[(data.grid as any).layout.activeCellId];first.scriptBindings=[{id:'bound',documentId:'local',name:'Unexecuted probe',source:'throw new Error("MUST NOT EXECUTE IN PREVIEW")',version:1,pane:'price',paneId:'price',ownScale:false,visible:true,plots:{}}];
 const next=prepareWorkspaceReplacement(encode(data));expect(next.workspace.grid!.layout.cells).toHaveLength(2);expect(next.workspace.scriptBindings[0].source).toContain('MUST NOT EXECUTE');expect(next.summary.join(' ')).toContain('1 script bindings');
});
it('keeps validated virtual fills and rejects a fabricated cash value or replay account',()=>{
 const instrument=fixtureInstrument('GME');let account=createPaperAccount({initialBalance:1000,commission:{kind:'fixed',value:1}});
 account=processPaperQuote(account,{instrumentId:instrument.id,bid:9.98,ask:10.02,sequence:1,eventTime:1,receivedAt:1,availableAt:1,fixture:true,session:'unknown'},1).account;
 const order=submitPaperOrder(account,{instrument,side:'buy',type:'market',quantity:10},1);expect(order.ok).toBe(true);const data=complete();data.paper=order.account;
 const next=prepareWorkspaceReplacement(encode(data));expect(next.paper.cash).toBe(898.8);expect(next.paper.fills).toEqual(order.account.fills);
 data.paper={...order.account,cash:999};expect(()=>prepareWorkspaceReplacement(encode(data))).toThrow();data.paper=createPaperAccount({mode:'replay-paper'});expect(()=>prepareWorkspaceReplacement(encode(data))).toThrow('Replay accounts');
});
it('legacy optional defaults are disclosed individually while required data never silently defaults',()=>{
 const data=complete();delete data.indicatorTemplates;delete data.watchBook;const next=prepareWorkspaceReplacement(encode(data));expect(next.migrations).toHaveLength(2);expect(next.migrations.join(' ')).toContain('watchBook');delete data.paper;expect(()=>prepareWorkspaceReplacement(encode(data))).toThrow('missing paper');
});
it('rejects internal storage envelopes, future versions, credentials and transient account state',()=>{
 const data=complete();for(const text of [JSON.stringify({schemaVersion:1,data,revision:4}),JSON.stringify({schemaVersion:2,data}),'null','[]','{'])expect(()=>prepareWorkspaceReplacement(text)).toThrow();
 for(const [key,value] of [['api_key','not-a-real-key'],['replayPaper',{}],['revision',1],['__proto__',{}]] as const){const bad={...data};Object.defineProperty(bad,key,{value,enumerable:true});expect(()=>prepareWorkspaceReplacement(encode(bad))).toThrow();}
});
it('rejects missing chart and comparison sources and hidden cell settings before publication',()=>{
 const data=complete(),grid=data.grid as any,id=grid.layout.activeCellId;
 grid.cells[id].comparisons=[{id:'missing',datasetId:'unavailable',mode:'absolute',baseline:'first-loaded-match',color:'#ffffff',width:1,visible:true}];expect(()=>prepareWorkspaceReplacement(encode(data))).toThrow('comparison source');
 grid.cells[id].comparisons=[];grid.cells.hidden=structuredClone(grid.cells[id]);expect(()=>prepareWorkspaceReplacement(encode(data))).toThrow('outside the declared layout');delete grid.cells.hidden;
 grid.cells[id].datasetId='not-present';expect(()=>prepareWorkspaceReplacement(encode(data))).toThrow('dataset is unavailable');
});
it('enforces text and payload bounds and rejects invalid nested alerts before returning a candidate',()=>{
 expect(()=>prepareWorkspaceReplacement(' '.repeat(WORKSPACE_IMPORT_BYTES+1))).toThrow('64 MiB');const data=complete();data.future='x'.repeat(32*1024*1024);expect(()=>prepareWorkspaceReplacement(encode(data))).toThrow('32 MiB');delete data.future;data.alerts=[{id:'bad'}];expect(()=>prepareWorkspaceReplacement(encode(data))).toThrow();
});
it('previews a 100000-bar synthetic local export within the two-second model workload target',()=>{
 const source=fixtureDataset('GME',100000);source.provenance.datasetId='synthetic-import-workload';source.provenance.providerName='Synthetic recovery workload';const data=complete();data.imports=[source];const text=encode(data),started=performance.now(),next=prepareWorkspaceReplacement(text),elapsedMs=performance.now()-started;
 expect(next.workspace.imports[0].bars).toHaveLength(100000);expect(next.workspace.imports[0].bars.at(-1)).toEqual(source.bars.at(-1));expect(next.summary.join(' ')).toContain('100,000 imported bars');
 writeFileSync('reports/performance-workspace-restore.json',JSON.stringify({schemaVersion:1,recordedAt:new Date().toISOString(),workload:'workspace-restore-100000-synthetic-bars',bytes:new TextEncoder().encode(text).length,elapsedMs,targetMs:2000,interfaceTested:false,scope:'JSON parsing, strict bounded preparation, workspace/paper/alert/source validation and summary. Excludes native file chooser, textarea rendering, chart startup, IPC and disk persistence.'},null,2)+'\n');expect(elapsedMs).toBeLessThan(2000);
});
