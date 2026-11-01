import {expect,it,vi} from 'vitest';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {CompoundAlertBook} from '../../src/ui/compound-alert-book';
import {COMPOUND_POLICY,type CompoundDefinition} from '../../src/domain/compound-alerts';
import {fixtureDataset} from '../../src/domain/fixtures';
import {createPaperAccount} from '../../src/domain/paper';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {prepareWorkspaceJSON} from '../../src/ui/workspace-json';
import {prepareWorkspaceData,prepareWorkspaceReplacement} from '../../src/ui/workspace-transfer';
import {captureCompoundWorkspaceSave,assertCompoundWorkspaceShareable,prepareCompoundWorkspaceAdoption} from '../../src/ui/compound-workspace-storage';
import {COMPOUND_SHARE_NOTICE} from '../../src/ui/compound-alert-document';
import type {CompoundChartInputPort} from '../../src/ui/compound-alert-observer';

const require=createRequire(import.meta.url),{saveInput}=require(resolve(process.cwd(),'electron/validation.cjs'));
const delivery={schemaVersion:1 as const,popup:true,desktop:false,sound:null};
const initial=()=>prepareWorkspaceJSON({...createInitialWorkspace(),paper:createPaperAccount(),alerts:[]});
function fixture(){
 const dataset=fixtureDataset('GME',1),chart:CompoundChartInputPort={getStyle:()=>{throw Error('Storage cannot acquire chart permission.');},isInputExact:()=>{throw Error('Storage cannot read prices.');},isInputCurrent:()=>{throw Error('Storage cannot read prices.');}};
 const refs={financial:{current:{paper:{},paperBook:null,alerts:[]}},currentInput:{current:{dataset,bars:dataset.bars,replay:null}},activeController:{current:chart},financialGeneration:{current:0},gridGeneration:{current:0},storageMutation:{current:false},workspaceTransaction:{current:false},currentReplay:{current:null},startup:{current:{phase:'ready'}},mainWindow:true};
 const book=new CompoundAlertBook(refs);
 const definition:CompoundDefinition={kind:'compound',schemaVersion:1,policy:COMPOUND_POLICY,mode:'ordinary',id:'SYNTHETIC private-storage',name:'Synthetic storage alert',message:'Synthetic local test',context:{instrumentId:'SYNTHETIC',sourceFamily:'SYNTHETIC feed',interval:'1m',session:'regular',basis:'SYNTHETIC basis'},predicates:[{id:'SYNTHETIC first',source:{kind:'price',field:'close'},operator:{kind:'greater',value:10}},{id:'SYNTHETIC second',source:{kind:'price',field:'high'},operator:{kind:'greater',value:20}}],frequency:'every-time',createdAt:0,expiresAt:null};
 return {book,definition,refs};
}

it('leaves legacy workspace data unchanged when the separate compound book is empty',()=>{
 const {book}=fixture(),data=initial(),capture=captureCompoundWorkspaceSave(book,100),saved=prepareWorkspaceData({...data,...capture.data});
 expect(capture.data).toEqual({});expect(saved.data).toEqual(prepareWorkspaceData(data).data);expect(saved.compoundAlerts).toBeUndefined();expect(Object.hasOwn(saved.workspace,'compoundAlerts')).toBe(false);expect(()=>assertCompoundWorkspaceShareable(book)).not.toThrow();
});

it('passes a canonical private collection through the unchanged Electron save boundary without putting it into chart Workspace',()=>{
 const {book,definition}=fixture();expect(book.prepareCreate(definition,delivery).commit()).toBe(true);
 const capture=captureCompoundWorkspaceSave(book,100),saved=prepareWorkspaceData({...initial(),...capture.data});
 expect(saved.compoundAlerts?.records).toHaveLength(1);expect(saved.data.compoundAlerts).toEqual(capture.data.compoundAlerts);expect(Object.hasOwn(saved.workspace,'compoundAlerts')).toBe(false);
 expect(()=>saveInput({schemaVersion:1,expectedRevision:4,data:saved.data})).not.toThrow();expect(JSON.stringify(saved.workspace)).not.toContain('SYNTHETIC private-storage');
 const restored=prepareWorkspaceReplacement(JSON.stringify({schemaVersion:1,data:saved.data}));expect(restored.compoundAlerts).toEqual(saved.compoundAlerts);expect(restored.summary.join(' ')).toContain('1 all-conditions alerts');
});

it('ordinary save preserves the exact running canonical state and cannot acquire numerical authority',()=>{
 const {book,definition}=fixture();expect(book.prepareCreate(definition,delivery).commit()).toBe(true);
 const entry=book.entry(definition.id)!,state=entry.store.current,version=book.version;
 const capture=captureCompoundWorkspaceSave(book,100);prepareWorkspaceData({...initial(),...capture.data});
 expect(book.entry(definition.id)).toBe(entry);expect(entry.store.current).toBe(state);expect(book.version).toBe(version);expect(capture.version).toBe(version);expect(state.history).toBeNull();
});

it('tracks compound-only changes and omits a removed collection from the next private save',async()=>{
 const {book,definition}=fixture(),empty=captureCompoundWorkspaceSave(book,100);expect(book.prepareCreate(definition,delivery).commit()).toBe(true);await Promise.resolve();
 const created=captureCompoundWorkspaceSave(book,101);expect(created.version).toBeGreaterThan(empty.version);expect(created.data.compoundAlerts?.records).toHaveLength(1);
 expect(book.prepareRemove(definition.id,book.entry(definition.id)!).commit()).toBe(true);await Promise.resolve();
 const removed=captureCompoundWorkspaceSave(book,102);expect(removed.version).toBeGreaterThan(created.version);expect(removed.data).toEqual({});
});

it('refuses portable workspace sharing for actual private alert state even without any trigger history',()=>{
 const {book,definition}=fixture();expect(book.prepareCreate(definition,delivery).commit()).toBe(true);
 expect(()=>assertCompoundWorkspaceShareable(book)).toThrow(COMPOUND_SHARE_NOTICE);expect(book.entry(definition.id)?.state.history).toBeNull();
});

it('refuses even malformed or accessor-backed recoverable private data before touching that field',()=>{
 const {book}=fixture(),getter=vi.fn(()=>{throw Error('Export must not encode this field.');}),raw=Object.defineProperty({},'compoundAlerts',{enumerable:true,get:getter});
 for(const compoundAlerts of [null,{},[],{kind:'unknown'},undefined])expect(()=>assertCompoundWorkspaceShareable(book,{compoundAlerts})).toThrow(COMPOUND_SHARE_NOTICE);
 expect(()=>assertCompoundWorkspaceShareable(book,raw)).toThrow(COMPOUND_SHARE_NOTICE);expect(getter).not.toHaveBeenCalled();expect(()=>assertCompoundWorkspaceShareable(book,{symbol:'GME'})).not.toThrow();
});

it('rejects malformed private ingress before workspace replacement and preserves the current running book',()=>{
 const {book,definition}=fixture();expect(book.prepareCreate(definition,delivery).commit()).toBe(true);const entry=book.entry(definition.id),version=book.version;
 for(const compoundAlerts of [null,{},[],{kind:'lv-compound-private-alerts',schemaVersion:2}])expect(()=>prepareWorkspaceData({...initial(),compoundAlerts})).toThrow();
 expect(book.entry(definition.id)).toBe(entry);expect(book.version).toBe(version);
});

it('installs private data during actual loading and storage holds, then notifies only after the Root refs are assigned',async()=>{
 const {book,definition,refs}=fixture();expect(book.prepareCreate(definition,delivery).commit()).toBe(true);await Promise.resolve();
 const capture=captureCompoundWorkspaceSave(book,100),saved=prepareWorkspaceData({...initial(),...capture.data}),oldEntry=book.entry(definition.id);
 refs.startup.current={phase:'loading'};refs.storageMutation.current=true;refs.workspaceTransaction.current=true;
 const events:Array<{ready:boolean;paper:unknown;fresh:unknown}>=[];book.subscribe(event=>{if(event.kind==='adopt')events.push({ready:refs.startup.current.phase==='ready',paper:refs.financial.current.paper,fresh:event.fresh});});
 const action=prepareCompoundWorkspaceAdoption(book,saved.compoundAlerts,110);expect(book.entry(definition.id)).toBe(oldEntry);action.assertCurrent();expect(action.commit()).toBe(true);expect(events).toEqual([]);
 const replacementPaper={synthetic:true};refs.financial.current={paper:replacementPaper,paperBook:null,alerts:[]};refs.gridGeneration.current++;refs.startup.current={phase:'ready'};refs.storageMutation.current=false;refs.workspaceTransaction.current=false;
 await Promise.resolve();await Promise.resolve();expect(events).toEqual([{ready:true,paper:replacementPaper,fresh:null}]);
 const restored=book.entry(definition.id)!;expect(restored).not.toBe(oldEntry);expect(restored.state.status).toBe('waiting-for-data');expect(restored.state.previous).toEqual([null,null]);expect(restored.state.history).toBeNull();expect(action.rollback()).toBe(false);
});
