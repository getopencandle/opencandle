import {expect,it,vi} from 'vitest';
import {finishInlineDialogTransfer} from '../../src/ui/inline-dialog-transfer';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {fixtureDataset} from '../../src/domain/fixtures';

function setup(){
 let live=true,source=sourceContextForDataset(fixtureDataset('GME',3)),style='candles',unavailable='';
 const chart={finishInlineText:vi.fn(()=>true),getSourceContext:vi.fn(()=>({...source})),getStyle:vi.fn(()=>style),getAnalysisUnavailable:vi.fn(()=>unavailable)};
 return{chart,run:()=>finishInlineDialogTransfer(chart,()=>{if(!live)throw Error('Dialog action replaced');}),retire:()=>{live=false;},changeSource:()=>{source={...source,revision:source.revision+'-changed'};},changeStyle:()=>{style='line';},unavailable:()=>{unavailable='SYNTHETIC chart unavailable';}};
}
it('dialog transfer commits exactly once and admits the unchanged independent action',()=>{const x=setup();expect(x.run()).toBe(true);expect(x.chart.finishInlineText).toHaveBeenCalledTimes(1);});
it('an ordinary rejected draft or active composition keeps settings closed',()=>{const x=setup();x.chart.finishInlineText.mockReturnValueOnce(false);expect(x.run()).toBe(false);expect(x.chart.getSourceContext).toHaveBeenCalledTimes(1);expect(x.chart.getAnalysisUnavailable).not.toHaveBeenCalled();});
it.each(['source','style','dialog','unavailable'] as const)('accepted inline publication cannot transfer its settings action after %s replacement',change=>{const x=setup();x.chart.finishInlineText.mockImplementationOnce(()=>{if(change==='source')x.changeSource();else if(change==='style')x.changeStyle();else if(change==='dialog')x.retire();else x.unavailable();return true;});expect(x.run).toThrow();expect(x.chart.finishInlineText).toHaveBeenCalledTimes(1);});
it('retirement inside a source callback prevents any subsequent inline commit',()=>{const x=setup(),get=x.chart.getSourceContext.getMockImplementation()!;x.chart.getSourceContext.mockImplementationOnce(()=>{x.retire();return get();});expect(x.run).toThrow('Dialog action');expect(x.chart.finishInlineText).not.toHaveBeenCalled();});
it('a captured private source guard detects replacement during the last style getter',()=>{
 const x=setup();let live=true;const chart={...x.chart,captureInlineTextSourceOwner:()=>()=>{if(!live)throw Error('Private source replaced');}};
 chart.getStyle.mockImplementationOnce(()=>'candles').mockImplementationOnce(()=>{live=false;return'candles';});
 expect(()=>finishInlineDialogTransfer(chart,()=>{})).toThrow('Private source replaced');expect(chart.getAnalysisUnavailable).not.toHaveBeenCalled();
});
it('the retained reporting guard survives an ordinary rejected edit but rejects a later source',()=>{
 const x=setup();let reportOwner:(()=>void)|undefined;x.chart.finishInlineText.mockImplementationOnce(()=>{throw Error('SYNTHETIC draft rejected');});
 expect(()=>finishInlineDialogTransfer(x.chart,()=>{},owner=>{reportOwner=owner;})).toThrow('draft rejected');expect(()=>reportOwner!()).not.toThrow();x.changeSource();expect(()=>reportOwner!()).toThrow('chart changed');
});
