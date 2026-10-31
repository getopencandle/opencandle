import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {expect,it,vi} from 'vitest';
import {finishInlineDialogTransfer} from '../../src/ui/inline-dialog-transfer';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {fixtureDataset} from '../../src/domain/fixtures';

function setup(){
 const source=readFileSync('src/ui/App.tsx','utf8').replace(/\r\n/g,'\n'),begin=source.indexOf(' function setDialog('),end=source.indexOf(' const snap=',begin);if(begin<0||end<0)throw Error('Review current App setDialog extraction boundaries.');
 let currentSource=sourceContextForDataset(fixtureDataset('GME',3));const setMessage=vi.fn(),setDialogState=vi.fn(),retireContextDialog=vi.fn(),chart={getSourceContext:vi.fn(()=>({...currentSource})),getStyle:vi.fn(()=> 'candles'),getAnalysisUnavailable:vi.fn(()=>''),finishInlineText:vi.fn(()=>true)};
 const code=`(function(injected){const {finishInlineDialogTransfer,setMessage,setDialogState,retireContextDialog,chart}=injected;const activeController={current:chart},gridGeneration={current:1},dialogAuthority={current:{}},contextDialog={current:null},dialogOwner={current:null},advancedOwner={current:null};const dialog=null,setPreview=()=>{};${source.slice(begin,end)};return setDialog;})`;
 const run=new Function('return '+stripTypeScriptTypes(code,{mode:'strip'}))()({finishInlineDialogTransfer,setMessage,setDialogState,retireContextDialog,chart});
 return{chart,setMessage,setDialogState,retireContextDialog,run:()=>run('drawing'),changeSource(){currentSource={...currentSource,revision:currentSource.revision+'-new'};}};
}

it('actual App drawing-transfer catch cannot write an old error after inline commit changes the source',()=>{
 const x=setup();x.chart.finishInlineText.mockImplementationOnce(()=>{x.changeSource();return true;});x.run();expect(x.setDialogState).not.toHaveBeenCalled();expect(x.retireContextDialog).not.toHaveBeenCalled();expect(x.setMessage).not.toHaveBeenCalled();
});

it('actual App cannot open drawing settings when the final availability callback replaces its source',()=>{
 const x=setup();x.chart.getAnalysisUnavailable.mockImplementationOnce(()=>{x.changeSource();return'';});x.run();expect(x.setDialogState).not.toHaveBeenCalled();expect(x.retireContextDialog).not.toHaveBeenCalled();expect(x.setMessage).not.toHaveBeenCalled();
});

it('actual App catch rechecks ownership after formatting a thrown inline diagnostic',()=>{
 const x=setup();x.chart.finishInlineText.mockImplementationOnce(()=>{throw{toString(){x.changeSource();return 'SYNTHETIC retired inline failure';}};});x.run();expect(x.setDialogState).not.toHaveBeenCalled();expect(x.setMessage).not.toHaveBeenCalled();
});

it('actual adapter private source owner detects replacement hidden by unchanged public getter replies',()=>{
 const source=readFileSync('src/chart/adapter.ts','utf8'),begin=source.indexOf('    captureInlineTextSourceOwner:'),end=source.indexOf('\n',begin);if(begin<0||end<0)throw Error('Review actual private inline source owner expression.');
 const original=sourceContextForDataset(fixtureDataset('GME',3)),code=`(function(source){let currentSource=source,currentBars=[],requestedStyle='candles',disposed=false;const controller={${source.slice(begin,end)}};return{capture:controller.captureInlineTextSourceOwner,replace:()=>{currentSource={...currentSource};}};})`;
 const owner=new Function('return '+stripTypeScriptTypes(code,{mode:'strip'}))()(original),chart={captureInlineTextSourceOwner:owner.capture,getSourceContext:()=>({...original}),getStyle:()=> 'candles',finishInlineText:()=>true,getAnalysisUnavailable:()=>{owner.replace();return'';}};
 expect(()=>finishInlineDialogTransfer(chart,()=>{})).toThrow('source changed');
});
