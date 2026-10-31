import {expect,it,vi} from 'vitest';
import {duplicateAdapterFixture} from '../chart/drawing-duplicate-adapter-harness';
import {annotationRecord} from '../chart/trendline-annotation-native-harness';
import {createGridDrawingWorkspaceHost} from '../../src/ui/drawing-workspace';
import {createMultiChartState,type MultiChartGridProps,resizeMultiChartState} from '../../src/ui/MultiChartGrid';
import {fixtureDataset} from '../../src/domain/fixtures';
import {defaultTheme} from '../../src/ui/themes';
import {sourceContextForDataset} from '../../src/chart/source-context';

// ERASER.ENABLEMENT.ARMING: the current adapter setDrawingMode block (extracted by the
// shared adapter harness) bound to the actual Grid drawing workspace host. This is the
// route App.changeDrawingMode('eraser') reaches once the toolbar enables the mode.
// The Grid-side chart identity, readiness receipt and root workspace callback are
// SYNTHETIC controls; no native window, DOM painting or packaged build is exercised.
const row=(id='SYNTHETIC-A')=>({...annotationRecord(),id,lvPaneBinding:{schemaVersion:1,target:{kind:'price'}}});
const LINKED_REFUSAL='Erasing synchronized drawings is not available yet. Turn off drawing synchronization to erase in this chart.';
type Layout='single'|'linked'|'linked-sync-off';
function gridHost(layout:Layout,settled=true){
 const data=fixtureDataset('GME',5),base=createMultiChartState(data,{appearance:defaultTheme.appearance}),id=base.layout.activeCellId;
 const state=layout==='single'?base:resizeMultiChartState(base,'two-columns');
 if(layout!=='single')state.layout.sync.drawings=layout==='linked';
 const chart={getExecutionIdentity:()=>'ordinary',isInputCurrent:()=>true};
 const status={input:{bars:data.bars,source:sourceContextForDataset(data),style:'candles'},settled,error:''};
 let props:MultiChartGridProps;
 const upstream=vi.fn((expected:typeof state)=>({
  assertCurrent:()=>{if(props.state!==expected)throw Error('SYNTHETIC root workspace replaced.');},
  prepare:()=>{throw Error('Arming the eraser must not prepare a workspace candidate.');}
 }));
 props={state,datasets:[data],activeBars:data.bars,activeDatasetId:data.provenance.datasetId,activeExecutionIdentity:'ordinary',onChange:vi.fn(()=>true),onReady:vi.fn(),onActiveCell:vi.fn(),onDrawingHistory:vi.fn(),drawingHistoryStatus:()=>({canUndo:false,canRedo:false}),onCaptureDrawingWorkspace:upstream};
 const accept=vi.fn();
 const host=createGridDrawingWorkspaceHost(id,chart as any,{read:()=>props,alive:()=>true,blocked:()=>false,controller:()=>chart as any,readiness:()=>status as any,accept});
 return{host,upstream,accept,linkedPeers:state.layout.cells.filter(cell=>cell.id!==id).length};
}
async function armed(layout:Layout,settled=true){
 const f=await duplicateAdapterFixture([row()] as any),g=gridHost(layout,settled);
 try{f.controller.bindDrawingWorkspaceHost(g.host);}catch(error){f.dispose();throw error;}
 return{f,g,prior:f.f.document.serialize()};
}

// (spec 3.7, 3.8): the linked refusal is retired. Arming in a linked same-symbol
// layout takes the atomic route: it arms and prepares nothing; a hit later prepares one
// candidate per same-scope chart (tests/ui/dwutil-linked-eraser.test.ts).
it('ERASER.ENABLEMENT.ARMING arms a linked same-symbol drawing layout through the atomic route without the retired refusal',async()=>{
 const {f,g,prior}=await armed('linked');
 try{
  expect(g.linkedPeers).toBe(1);
  expect(()=>f.controller.setDrawingMode('eraser')).not.toThrow();
  expect(f.f.facade.getMode()).toBe('eraser');expect(f.f.paint.controller.eraserMode).toBe(true);expect(f.focuses()).toBe(1);
  expect(g.upstream).toHaveBeenCalledOnce();expect(g.accept).not.toHaveBeenCalled();
  expect(f.f.document.serialize()).toEqual(prior);expect(f.history.status().undo).toBe(0);expect(f.state().notifications).toBe(0);
  f.controller.setDrawingMode(null);expect(f.f.facade.getMode()).toBe(null);
  expect(LINKED_REFUSAL).toMatch(/not available yet/);// retired copy, asserted never thrown above
 }finally{f.dispose();}
});
it.each(['single','linked-sync-off'] as const)('ERASER.ENABLEMENT.ARMING arms through the real Grid host for a %s layout and publishes nothing',async layout=>{
 const {f,g,prior}=await armed(layout);
 try{
  f.controller.setDrawingMode('eraser');
  expect(f.f.facade.getMode()).toBe('eraser');expect(f.f.paint.controller.eraserMode).toBe(true);expect(f.focuses()).toBe(1);
  expect(g.upstream).toHaveBeenCalledOnce();expect(g.accept).not.toHaveBeenCalled();
  expect(f.f.document.serialize()).toEqual(prior);expect(f.history.status().undo).toBe(0);expect(f.state().notifications).toBe(0);
  f.controller.setDrawingMode(null);expect(f.f.facade.getMode()).toBe(null);expect(f.f.paint.controller.eraserMode).toBe(false);
 }finally{f.dispose();}
});
// Review finding ERASE_REFUSAL_SAYS_DUPLICATION: the Grid host's currency refusal names the
// operation that asked. Eraser arming while the cell is still loading gets eraser copy;
// Duplicate keeps its own wording.
const LOADING_ERASE='This chart is still loading, or its input or workspace changed. Wait for it to finish loading before erasing.';
it('ERASER.ENABLEMENT.ARMING refuses while the cell is loading with eraser wording before the native mode changes',async()=>{
 const {f,g,prior}=await armed('single',false);
 try{
  let message='';try{f.controller.setDrawingMode('eraser');}catch(error){message=(error as Error).message;}
  expect(message).toBe(LOADING_ERASE);expect(message).not.toMatch(/duplicat/i);
  expect(f.f.facade.getMode()).toBe(null);expect(f.f.paint.controller.eraserMode).toBe(false);expect(f.focuses()).toBe(0);
  expect(g.upstream).not.toHaveBeenCalled();expect(f.f.document.serialize()).toEqual(prior);
 }finally{f.dispose();}
});
it('Duplicate keeps its duplication wording for the same loading refusal',()=>{
 const g=gridHost('single',false);
 expect(()=>g.host.capture('duplicate')).toThrow('The exact chart input or workspace changed during drawing duplication.');
 expect(()=>g.host.capture()).toThrow('The exact chart input or workspace changed during drawing duplication.');
 expect(()=>g.host.capture('erase')).toThrow(LOADING_ERASE);expect(g.upstream).not.toHaveBeenCalled();
});
