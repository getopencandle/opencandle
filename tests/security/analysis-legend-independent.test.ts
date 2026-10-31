import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {expect,it} from 'vitest';
import {friendlyError} from '../../src/ui/user-error';
import {fixtureDataset} from '../../src/domain/fixtures';
import {sourceContextForDataset,chartSourceContextKey} from '../../src/chart/source-context';
import {factoryIndicatorDefault,indicatorEditFingerprint} from '../../src/ui/indicator-library';
import {confirmAnalysisPublication} from '../../src/ui/analysis-capture-confirmation';
import {AnalysisPublicationError} from '../../src/chart/analysis-publication';

// Execute the exact current App function bodies, with controlled lexical refs and native sinks.
// This is a handler/model boundary test, not a mounted component or executable UI test.
const app=readFileSync(new URL('../../src/ui/App.tsx',import.meta.url),'utf8');
const start=app.includes(' const analysisRenderOwner=')?app.indexOf(' const analysisRenderOwner='):app.indexOf(' function assertActiveAnalysisChart(');
const end=app.indexOf(' const closeChartDialog=',start);
if(start<0||end<0)throw Error('The exact App legend extraction boundaries changed.');
const capture=app.split(/\r?\n/).find(line=>line.includes('const captureIndicators='));
if(!capture)throw Error('The actual App presentation capture body is required.');
const body=stripTypeScriptTypes(capture+'\n'+app.slice(start,end),{mode:'strip'});

type Change='dataset'|'prefix'|'revision'|'run'|'style'|'cell'|'epoch'|'controller';
function harness(){
 const dataset=fixtureDataset('GME',3),bars=dataset.bars,source=sourceContextForDataset(dataset,bars),gridEpoch=11,replay={runId:'independent-run-a'};
 const settings={id:'legend-study',kind:'sma',...factoryIndicatorDefault('sma'),paneId:null};
 let native:any[]=[structuredClone(settings)],available=true;
 const row={...structuredClone(settings),rendererId:'native-study-a',diagnostics:[],series:[]};
 const workspace:any={chartStyle:'candles',grid:{layout:{activeCellId:'cell-a'},cells:{'cell-a':{indicators:structuredClone(native),comparisons:[]},'cell-b':{indicators:structuredClone(native),comparisons:[]}}}};
 const current={current:workspace},currentInput={current:{dataset,bars,datasets:[dataset],replay} as any},currentReplay={current:replay as any},gridGeneration={current:gridEpoch},storageMutation={current:false},workspaceTransaction={current:false};
 const messages:string[]=[],views:unknown[]=[],quarantines:unknown[]=[];
 let mutations=0,reads=0,refreshReads=0;
 const hooks:{eligibility?:()=>void;list?:()=>void;update?:()=>void;remove?:()=>void;serialize?:()=>void;refresh?:()=>void}={};
 let listCalls=0;
 const chart:any={
  isInputCurrent(){hooks.eligibility?.();return available;},
  indicators:{
   list(){listCalls++;reads++;if(listCalls>1)refreshReads++;hooks.list?.();return native.map(item=>({...structuredClone(item),rendererId:'native-study-a',diagnostics:[],series:[]}));},
   update(id:string,patch:any){mutations++;native=native.map(item=>item.id===id?{...item,...patch}:item);if(hooks.update)hooks.update();else commit();},
   remove(id:string){mutations++;native=native.filter(item=>item.id!==id);if(hooks.remove)hooks.remove();else commit();},
   serialize(){hooks.serialize?.();return structuredClone(native);},
  },
  reportAnalysisPublicationFailure(error:unknown){quarantines.push(error);available=false;},
 };
 const activeController={current:chart};
 function commit(){
  const saved=current.current,grid=saved.grid,id=grid.layout.activeCellId;
  current.current={...saved,grid:{...grid,cells:{...grid.cells,[id]:{...grid.cells[id],indicators:structuredClone(native)}}}};
  // Legitimate render/publication also replaces this container. Its contents still own the input.
  currentInput.current={...currentInput.current};
 }
 function replace(change:Change){
  const input=currentInput.current;
  if(change==='dataset'){const next=fixtureDataset('SPY',3);currentInput.current={...input,dataset:next,bars:next.bars,datasets:[next]};}
  if(change==='prefix')currentInput.current={...input,bars:input.bars.slice(0,2)};
  if(change==='revision')currentInput.current={...input,dataset:{...input.dataset,provenance:{...input.dataset.provenance,revision:'independent-revision-999'}}};
  if(change==='run'){currentReplay.current={runId:'independent-run-b'};currentInput.current={...input,replay:currentReplay.current};}
  if(change==='style')current.current={...current.current,chartStyle:'line'};
  if(change==='cell')current.current={...current.current,grid:{...current.current.grid,layout:{...current.current.grid.layout,activeCellId:'cell-b'}}};
  if(change==='epoch')gridGeneration.current++;
  if(change==='controller')activeController.current={...chart};
 }
 const bindings={chart,dataset,bars,source,workspace,replay,gridEpoch,current,currentInput,currentReplay,activeController,gridGeneration,storageMutation,workspaceTransaction,sourceContextForDataset,chartSourceContextKey,indicatorEditFingerprint,confirmAnalysisPublication,assertDialogContext(){},setMessage:(message:unknown)=>messages.push(String(message)),reportFailure:(cause:unknown)=>messages.push(friendlyError(cause)),setIndicatorViews:(next:unknown)=>{hooks.refresh?.();views.push(next);}};
 const extracted=new Function(...Object.keys(bindings),body+'\nreturn {action:applyIndicatorLegendAction,confirm:confirmAnalysisCapture};')(...Object.values(bindings)) as {action:(row:any,remove?:boolean)=>void;confirm:(domain:string,owned?:boolean)=>unknown};
 return{...extracted,chart,row,hooks,replace,commit,current,currentInput,messages,views,quarantines,counts:()=>({mutations,reads,refreshReads}),native:()=>native,unavailable(){available=false;}};
}

it.each(['dataset','prefix','revision','run','style','cell','epoch','controller'] as const)('retained legend visibility rejects replaced render %s before any native read or mutation',change=>{
 const h=harness();h.replace(change);h.action(h.row);expect(h.counts()).toEqual({mutations:0,reads:0,refreshReads:0});expect(h.messages).toEqual([]);expect(h.views).toEqual([]);expect(h.quarantines).toEqual([]);
});
it.each([false,true])('same-owner accepted %s action permits canonical workspace/input-container replacement and readback',remove=>{
 const h=harness(),opening=h.current.current,input=h.currentInput.current;h.action(h.row,remove);expect(h.counts().mutations).toBe(1);expect(h.current.current).not.toBe(opening);expect(h.currentInput.current).not.toBe(input);expect(h.native()).toHaveLength(remove?0:1);expect(h.messages).toEqual([]);expect(h.quarantines).toEqual([]);expect(h.views).toHaveLength(1);
});
it('native input eligibility cannot retire the render owner and lend authority to the old action',()=>{
 const h=harness();h.hooks.eligibility=()=>{h.replace('prefix');};h.action(h.row);expect(h.counts().mutations).toBe(0);expect(h.messages).toEqual([]);expect(h.views).toEqual([]);expect(h.quarantines).toEqual([]);
});
it('list callback retirement is rechecked before visibility mutation',()=>{
 const h=harness();h.hooks.list=()=>h.replace('dataset');h.action(h.row);expect(h.counts().mutations).toBe(0);expect(h.messages).toEqual([]);expect(h.quarantines).toEqual([]);
});
it.each([false,true])('retirement during accepted native %s action never refreshes, diagnoses or quarantines replacement',remove=>{
 const h=harness();h.hooks[remove?'remove':'update']=()=>h.replace('dataset');h.action(h.row,remove);expect(h.counts().mutations).toBe(1);expect(h.messages).toEqual([]);expect(h.views).toEqual([]);expect(h.quarantines).toEqual([]);
});
it('retirement inside native serialization prevents old readback error publication',()=>{
 const h=harness();h.hooks.serialize=()=>h.replace('prefix');h.action(h.row);expect(h.counts().mutations).toBe(1);expect(h.messages).toEqual([]);expect(h.views).toEqual([]);expect(h.quarantines).toEqual([]);
});
it('actual captureIndicators list retirement cannot publish a stale presentation list',()=>{
 const h=harness();let calls=0;h.hooks.list=()=>{if(++calls===2)h.replace('dataset');};h.action(h.row);expect(h.counts().mutations).toBe(1);expect(h.counts().refreshReads).toBe(1);expect(h.views).toEqual([]);expect(h.messages).toEqual([]);expect(h.quarantines).toEqual([]);
});
it('refresh callback retirement and failure cannot overwrite replacement status',()=>{
 const h=harness();h.hooks.refresh=()=>{h.replace('run');throw Error('Independent old refresh failed');};h.action(h.row);expect(h.counts().mutations).toBe(1);expect(h.messages).toEqual([]);expect(h.quarantines).toEqual([]);
});
it('same-owner accepted failure remains visible after native quarantine and cannot mutate twice',()=>{
 const h=harness();h.hooks.update=()=>{h.commit();h.unavailable();throw new AnalysisPublicationError('indicator',[Error('Independent rejected grid capture')]);};h.action(h.row);expect(h.counts().mutations).toBe(1);expect(h.messages).toHaveLength(1);expect(h.messages[0]).toMatch(/publication was incomplete/);expect(h.views).toEqual([]);h.action(h.row);expect(h.counts().mutations).toBe(1);
});
it('same-owner fingerprint conflict rejects mutation with visible current diagnostic',()=>{
 const h=harness();h.action({...h.row,visible:false});expect(h.counts().mutations).toBe(0);expect(h.messages).toHaveLength(1);expect(h.messages[0]).toMatch(/indicator changed/);
});
it('retained Remove cannot mutate a replacement source with the same native instance fingerprint',()=>{
 const h=harness();h.replace('dataset');h.action(h.row,true);expect(h.counts().mutations).toBe(0);expect(h.messages).toEqual([]);expect(h.quarantines).toEqual([]);
});
it('immutable render source key detects metadata revision changed on the same dataset object',()=>{
 const h=harness();h.currentInput.current.dataset.provenance.revision='independent-in-place-revision';h.action(h.row);expect(h.counts().mutations).toBe(0);expect(h.messages).toEqual([]);
});
it('native mutation method acquisition cannot lend old rendered authority to a new source',()=>{
 const h=harness();let invoked=0;Object.defineProperty(h.chart.indicators,'update',{get(){h.replace('dataset');return()=>{invoked++;};}});h.action(h.row);expect(invoked).toBe(0);expect(h.messages).toEqual([]);expect(h.quarantines).toEqual([]);
});
it('quarantine method acquisition cannot quarantine a replacement after a saved/native mismatch',()=>{
 const h=harness();let invoked=0;h.hooks.update=()=>{};Object.defineProperty(h.chart,'reportAnalysisPublicationFailure',{get(){h.replace('dataset');return()=>{invoked++;};}});h.action(h.row);expect(h.counts().mutations).toBe(1);expect(invoked).toBe(0);expect(h.messages).toEqual([]);expect(h.views).toEqual([]);
});
it('equivalent detached metadata and fresh input/workspace containers retain the rendered source owner',()=>{
 const h=harness();h.currentInput.current={...h.currentInput.current,dataset:structuredClone(h.currentInput.current.dataset)};h.current.current={...h.current.current};h.action(h.row);expect(h.counts().mutations).toBe(1);expect(h.messages).toEqual([]);expect(h.quarantines).toEqual([]);expect(h.views).toHaveLength(1);
});
