import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {beforeEach,expect,it,vi} from 'vitest';
import {IndicatorDialog} from '../../src/ui/IndicatorDialog';
import {ComparisonDialog} from '../../src/ui/ComparisonDialog';
import {AnalysisPublicationError} from '../../src/chart/analysis-publication';
import {createIndicatorLibrary} from '../../src/ui/indicator-library';
import {fixtureDataset} from '../../src/domain/fixtures';
import {sourceContextForDataset,chartSourceContextKey} from '../../src/chart/source-context';
const hooks=vi.hoisted(()=>({cells:[] as unknown[],cursor:0,writes:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<typeof import('react')>('react');return{...actual,startTransition:(fn:()=>void)=>fn() /* App commits range picks as transitions */,useDeferredValue:(value:any)=>value /* App defers the range-button inputs; the hook-cell mock has no React dispatcher */,useState:(initial:unknown)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?(initial as ()=>unknown)():initial;return[hooks.cells[index],(next:unknown)=>{hooks.writes++;hooks.cells[index]=typeof next==='function'?(next as (prior:unknown)=>unknown)(hooks.cells[index]):next;}];},useRef:(initial:unknown)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},useEffect:()=>{hooks.cursor++;}};});
function text(node:any):string{return typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
function find(node:any,predicate:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const found=find(child,predicate);if(found)return found;}}else if(node?.props){if(predicate(node))return node;return find(node.props.children,predicate);}return null;}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.writes=0;});
const app=readFileSync(new URL('../../src/ui/App.tsx',import.meta.url),'utf8');
const start=app.indexOf(' const analysisRenderOwner='),end=app.indexOf(' function confirmAnalysisCapture(',start);
if(start<0||end<0)throw Error('Actual App parent assertion extraction boundaries changed.');
const dialogAssertion=app.split(/\r?\n/).find(line=>line.includes(' function assertDialogContext('));if(!dialogAssertion)throw Error('Actual App dialog assertion body is required.');
const parentBody=stripTypeScriptTypes(dialogAssertion+'\n'+app.slice(start,end),{mode:'strip'});
function fixture(kind:'indicator'|'comparison',contextual=false){
 const dataset=fixtureDataset('GME',3),bars=dataset.bars,source=sourceContextForDataset(dataset,bars),workspace:any={chartStyle:'candles',grid:{layout:{activeCellId:'cell-a'}}},current={current:workspace},currentInput={current:{dataset,bars,replay:null}},currentReplay={current:null},gridEpoch=7,gridGeneration={current:gridEpoch},storageMutation={current:false},workspaceTransaction={current:false};
 let available=true,dialogOwned=true,mode:'accepted-failure'|'success'|'retired-failure'='accepted-failure';
 const close=vi.fn(),changed=vi.fn(()=>true),add=vi.fn(()=>{if(mode==='success')return'synthetic-accepted-study';available=false;if(mode==='retired-failure')dialogOwned=false;throw new AnalysisPublicationError(kind,[Error('Independent grid capture rejected')]);});
 const chart:any={isInputCurrent:()=>available,isInputOwned:()=>true,indicators:{catalog:['sma'],list:()=>[],add,subscribe:()=>()=>{}},comparisons:{list:()=>[],add,subscribe:()=>()=>{}}},activeController={current:chart};
 const renderedDialogAuthority={},dialogAuthority={get current(){return dialogOwned?renderedDialogAuthority:{};}},dialog=kind==='indicator'?'indicators':'compare',dialogOwner={current:dialog},activeDialogContext=contextual?{dialog,ownership:{assertCurrent(native:boolean){if(!dialogOwned||native&&!available)throw Error('Independent context native eligibility is unavailable');}}}:null,contextDialog={current:activeDialogContext};
 const bindings={chart,dataset,bars,source,workspace,replay:null,gridEpoch,gridGeneration,activeController,current,currentInput,currentReplay,storageMutation,workspaceTransaction,sourceContextForDataset,chartSourceContextKey,dialogAuthority,renderedDialogAuthority,dialogOwner,dialog,activeDialogContext,contextDialog};
 const assertions=new Function(...Object.keys(bindings),parentBody+'\nreturn {assertOwner:assertAnalysisDialogContext,assertEditable:assertAnalysisDialogEditable};')(...Object.values(bindings));
 const props:any={chart,datasets:[dataset],instances:[],library:createIndicatorLibrary(),onLibraryChange:()=>true,onChange:changed,onClose:close,ownerToken:{},...assertions};
 const render=()=>{hooks.cursor=0;return kind==='indicator'?IndicatorDialog(props):ComparisonDialog(props);};
 const button=find(render(),node=>node.type==='button'&&(kind==='indicator'?node.props['aria-label']==='Add Simple Moving Average':text(node).includes('GME')));
 return{render,button,add,changed,close,chart,mode(next:typeof mode){mode=next;},unavailable(){available=false;},retireSource(){currentInput.current={...currentInput.current,dataset:fixtureDataset('SPY',3)};},writes:()=>hooks.writes};
}
it.each(['indicator','comparison'] as const)('%s actual App parent permits a same-owner accepted failure diagnostic after unavailable and retires further actions',kind=>{
 const h=fixture(kind);h.button.props.onClick();expect(h.add).toHaveBeenCalledTimes(1);expect(h.changed).not.toHaveBeenCalled();const after=h.render();expect(text(find(after,node=>node.props.role==='alert'))).toMatch(/publication was incomplete/);expect(find(after,node=>node.type==='fieldset'&&node.props.className==='indicator-layout').props.disabled).toBe(true);h.button.props.onClick();expect(h.add).toHaveBeenCalledTimes(1);find(after,node=>node.type==='button'&&text(node)==='Close').props.onClick();expect(h.close).toHaveBeenCalledTimes(1);
});
it.each(['indicator','comparison'] as const)('%s context-opened actual App parent preserves accepted failure diagnostics independently from native eligibility',kind=>{
 const h=fixture(kind,true);h.button.props.onClick();expect(h.add).toHaveBeenCalledTimes(1);const after=h.render();expect(text(find(after,node=>node.props.role==='alert'))).toMatch(/publication was incomplete/);expect(find(after,node=>node.type==='fieldset'&&node.props.className==='indicator-layout').props.disabled).toBe(true);expect(h.changed).not.toHaveBeenCalled();
});
it.each(['indicator','comparison'] as const)('%s actual App parent retains successful publication and no terminal diagnostic',kind=>{
 const h=fixture(kind);h.mode('success');h.button.props.onClick();expect(h.add).toHaveBeenCalledTimes(1);expect(h.changed).toHaveBeenCalledTimes(1);const after=h.render();expect(text(find(after,node=>node.props.role==='alert'))).toBe('');expect(find(after,node=>node.type==='fieldset'&&node.props.className==='indicator-layout').props.disabled).toBe(false);
});
it.each(['indicator','comparison'] as const)('%s retired actual App dialog owner still suppresses old accepted-failure error writes',kind=>{
 const h=fixture(kind);h.mode('retired-failure');h.button.props.onClick();expect(h.add).toHaveBeenCalledTimes(1);expect(h.changed).not.toHaveBeenCalled();expect(h.writes()).toBe(0);
});
it.each(['indicator','comparison'] as const)('%s unavailable native input rejects a new action even though source identity remains current',kind=>{
 const h=fixture(kind);h.unavailable();h.button.props.onClick();expect(h.add).not.toHaveBeenCalled();expect(h.changed).not.toHaveBeenCalled();
});
it.each(['indicator','comparison'] as const)('%s native ownership callback retirement before action cannot write an old error into a replacement source',kind=>{
 const h=fixture(kind);h.chart.isInputOwned=()=>{h.retireSource();return true;};h.button.props.onClick();expect(h.add).not.toHaveBeenCalled();expect(h.changed).not.toHaveBeenCalled();expect(h.writes()).toBe(0);
});
it.each(['indicator','comparison'] as const)('%s eligibility callback retirement before action cannot write an old error into a replacement source',kind=>{
 const h=fixture(kind);h.chart.isInputCurrent=()=>{h.retireSource();return true;};h.button.props.onClick();expect(h.add).not.toHaveBeenCalled();expect(h.changed).not.toHaveBeenCalled();expect(h.writes()).toBe(0);
});
