import {expect,it,vi} from 'vitest';
import {createMultiChartState,resizeMultiChartState} from '../../src/ui/MultiChartGrid';
import {fixtureDataset} from '../../src/domain/fixtures';
import {defaultTheme} from '../../src/ui/themes';
// Public model/allocator callback seam; no selector/native readiness proof.
it('first-chart settings are detached before an allocator callback can insert a getter or invalid setting',()=>{
 const plot={visible:true,color:'#123456',width:2,lineStyle:'solid' as const,kind:'line' as const,priceScale:true,legend:true,dataWindow:true},before=createMultiChartState(fixtureDataset('GME',3),{appearance:defaultTheme.appearance,indicators:[{id:'synthetic-rsi',kind:'rsi',inputs:{length:7,source:'close'},plots:{rsi:plot},offset:0,visible:true,paneId:'synthetic-pane'}]}),openingId=before.layout.cells[0].id,snapshot=structuredClone(before),reads=vi.fn(()=>0);let issued=0;
 const after=resizeMultiChartState(before,'two-columns',()=>{if(++issued===1)Object.defineProperty(before.cells[openingId].indicators[0].inputs,'length',{get:reads,enumerable:true,configurable:true});return'synthetic-issued-'+issued;});
 expect(reads).not.toHaveBeenCalled();expect(after.cells[openingId]).toEqual(snapshot.cells[openingId]);const added=after.cells[after.layout.cells[1].id];expect(added.indicators[0].inputs.length).toBe(7);expect(added.indicators[0].plots.rsi).toEqual(plot);expect(added.indicators[0].id).not.toBe('synthetic-rsi');expect(added.indicators[0].paneId).not.toBe('synthetic-pane');
});
