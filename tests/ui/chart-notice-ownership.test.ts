import {afterEach,expect,it} from 'vitest';
import {all,mountControlledComponent} from '../helpers/alert-dialog-harness';
import {WorkspaceChartHost} from '../../src/ui/WorkspaceChartHost';
import {MultiChartGrid} from '../../src/ui/MultiChartGrid';
import {LiveHistoryEdge} from '../../src/ui/live-registry';
import {fixtureDataset} from '../../src/domain/fixtures';
import {cellFixture} from './status-overlay-fixture';
const fixtures:ReturnType<typeof cellFixture>[]=[];afterEach(()=>{for(const fixture of fixtures.splice(0))fixture.dispose();});
const fixture=(options:Parameters<typeof cellFixture>[0]={})=>{const result=cellFixture(options);fixtures.push(result);return result;};

it('only selected visible non-staging grid cell owns history notices and absent prop means visible',()=>{
 const f=fixture({two:true});expect(f.elements().map(node=>node.props.historyActive)).toEqual([true,false]);f.setParent({historyActive:false});expect(f.elements().map(node=>node.props.historyActive)).toEqual([false,false]);
 f.setParent({historyActive:true,staging:true});expect(f.elements().map(node=>node.props.historyActive)).toEqual([false,false]);f.setParent({staging:false});const previous=f.parentProps().state,next={...previous,layout:{...previous.layout,activeCellId:previous.layout.cells[1].id}};f.setParent({state:next});expect(f.elements().map(node=>node.props.historyActive)).toEqual([false,true]);
 f.setParent({state:{...next,layout:{...next.layout,maximizedCellId:next.layout.cells[0].id}}});expect(f.elements().map(node=>node.props.historyActive)).toEqual([false,false]);
});
it('history notices have exact cell source and controller readiness and remain mounted during frame-only readiness changes',()=>{
 const f=fixture();expect(f.history()).toHaveLength(1);expect(f.history()[0].props.chart).toBe(f.controller);expect(f.history()[0].props.datasetId).toBe(f.source.datasetId);expect(f.history()[0].props.firstTime).toBe(f.dataset.bars[0].time);
 // Controlled state of the actual GridCell frameReady hook, independently of source/execution readiness.
 f.cell.owner.cells[5]=false;expect(f.history()).toHaveLength(1);f.setProps({historyActive:false});expect(f.history()).toHaveLength(0);f.setProps({historyActive:true});expect(f.history()).toHaveLength(1);
});
it('source replacement cannot render the old history notice before the new exact input commits',()=>{
 const f=fixture(),old=f.history()[0],spy=fixtureDataset('SPY',8);f.setProps({dataset:spy,bars:spy.bars,datasets:[spy],saved:{...f.props().saved,datasetId:spy.provenance.datasetId}});expect(f.history()).toHaveLength(0);
 f.ready({getExecutionIdentity:()=> 'ordinary'},spy);expect(f.history()).toHaveLength(1);expect(f.history()[0].props.datasetId).toBe(spy.provenance.datasetId);expect((f.history()[0] as any).key).not.toBe((old as any).key);
});
it('a replaced execution or controller cannot lend a source-ready history observer',()=>{
 const f=fixture();f.setProps({executionIdentity:'SYNTHETIC-other-run'});expect(f.history()).toHaveLength(0);f.setProps({executionIdentity:'ordinary'});expect(f.history()).toHaveLength(1);
 f.setProps({brokenMessage:'SYNTHETIC retired cell'});expect(f.history()).toHaveLength(0);f.setProps({brokenMessage:undefined});expect(f.history()).toHaveLength(1);
});
it('history child lives inside the same source-independent absolute notice stack as script statuses',()=>{
 const f=fixture(),stack=all(f.tree(),node=>node.props.className==='lv-chart-notices');expect(stack).toHaveLength(1);expect(all(stack[0],node=>node.type===LiveHistoryEdge)).toHaveLength(1);
});
it('actual host visibility changes invalidate cached grid history props across active held parked and reused states',()=>{
 const f=fixture(),props={...f.parentProps(),activeBars:f.dataset.bars,activeDatasetId:f.source.datasetId,activeExecutionIdentity:'ordinary'},ui=mountControlledComponent(()=>WorkspaceChartHost(props));
 try{
  ui.render();const host=ui.owner.cells.map(value=>(value as any)?.current).find(value=>typeof value?.slots==='function'),slot=host.slots()[0];
  const grid=()=>all(ui.render(),node=>node.type===MultiChartGrid)[0];const active=grid();expect(active.props.historyActive).toBe(true);slot.mode='held';expect(grid()).toBe(active);slot.mode='parked';const parked=grid();expect(parked.props.historyActive).toBe(false);expect(parked).not.toBe(active);
  slot.mode='active';expect(grid().props.historyActive).toBe(true);for(const mode of ['staging','quarantined']){slot.mode=mode;expect(grid().props.historyActive).toBe(false);}slot.mode='active';expect(grid().props.historyActive).toBe(true);
 }finally{ui.dispose();}
});
