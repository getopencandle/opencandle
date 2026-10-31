import {expect,it,vi} from 'vitest';
import {all,mountControlledComponent,text} from '../helpers/alert-dialog-harness';
import {MultiChartGrid,createMultiChartState,type MultiChartTransactionCoordinator} from '../../src/ui/MultiChartGrid';
import {fixtureDataset} from '../../src/domain/fixtures';
import {defaultTheme} from '../../src/ui/themes';
import {cellSessionRefusal} from '../../src/chart/cell-session';

// Real Grid action and rejection under the shared controlled React model.
// This checks error ownership/containment, not browser CSS or native chart work.
it('a refused trading-hours change leaves layout controls free of error-triggered popup content and preserves the visible alert',async()=>{
 const dataset=fixtureDataset('GME',3);
 // A regular-hours-only synthetic source must refuse an explicit extended view.
 const regular={...dataset,resolution:'1m',instrument:{...dataset.instrument,timezone:'America/New_York'},bars:dataset.bars.map((bar,index)=>({...bar,time:Date.parse('2026-10-20T14:00:00Z')/1000+index*60})),provenance:{...dataset.provenance,timezone:'America/New_York',session:'regular' as const}};
 expect(cellSessionRefusal(regular,'regular')).toBeNull();
 const state=createMultiChartState(regular,{appearance:defaultTheme.appearance}),before=JSON.stringify(state),publish=vi.fn(()=>true);
 const owner:{current:MultiChartTransactionCoordinator|null}={current:null};
 const props={state,datasets:[regular],onChange:publish,onReady:()=>{},onActiveCell:()=>{},onTransactionReady:(value:MultiChartTransactionCoordinator|null)=>{owner.current=value;}};
 const ui=mountControlledComponent(()=>MultiChartGrid(props));
 ui.settle();expect(all(ui.render(),node=>node.props.role==='alert')).toHaveLength(0);
 expect(owner.current?.setCellSession).toBeTypeOf('function');
 await owner.current!.setCellSession!(state.layout.activeCellId,'extended');ui.settle();
 const tree=ui.render(),alert=ui.find(node=>node.props.role==='alert',tree),layout=ui.find(node=>node.props['aria-label']==='Chart layout',tree);
 expect(text(alert)).toContain('This source supplies regular trading hours only. Extended hours are unavailable.');
 expect(ui.nodeFor(alert).parentElement).toBe(ui.nodeFor(ui.find(node=>node.type==='section'&&node.props.className==='lv-multichart',tree)));
 expect(ui.nodeFor(layout).parentElement?.contains(ui.nodeFor(alert))).toBe(false);
 expect(publish).not.toHaveBeenCalled();expect(JSON.stringify(state)).toBe(before);
 ui.dispose();
});
