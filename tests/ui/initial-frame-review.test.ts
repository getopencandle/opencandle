import {expect,it,vi} from 'vitest';
import {restoreInitialHistoricalFrame} from '../../src/chart/initial-historical-frame';
import {fixtureDataset} from '../../src/domain/fixtures';
import {sourceContextForDataset} from '../../src/chart/source-context';
function setup(){
 const dataset=fixtureDataset('GME',3),input={bars:dataset.bars,source:sourceContextForDataset(dataset),style:'candles'},frame={schemaVersion:1,basis:{basisIdentity:sourceContextForDataset(dataset).basisIdentity!,revision:'1',style:'candles'},calculationFingerprints:{},panes:[{key:{kind:'price'},owners:[],order:0,heightWeight:1,collapsed:false,mode:'price',log:false,invert:false,manualRange:{min:5,max:15}}],independent:[],maximized:null};
 let owned=true,nativeCurrent=true;const rollback=vi.fn(async()=>{}),commit=vi.fn(),seal=vi.fn(),edit={isCurrent:()=>nativeCurrent,result:{},commit,seal,rollback},chart={scripts:{configurationSnapshot:()=>[]},waitForAnalysisPlacement:async()=>{},isInputCurrent:()=>true,captureHistoricalFrame:()=>({...frame,panes:[{...frame.panes[0],manualRange:null}]}),prepareConfigurationEdit:async()=>edit},runtime={configurationStatus:()=>({state:'ready',calculations:'complete',diagnostics:[]})};
 return{chart,edit,rollback,commit,seal,retire:()=>{owned=false;nativeCurrent=false;},options:{chart,runtime,input,executionIdentity:'ordinary',bindings:[],frame,fingerprints:{},signal:new AbortController().signal,isCurrent:()=>owned} as any};
}
it('a superseded initial-frame lease still runs rollback cleanup without committing stale state',async()=>{
 const s=setup();s.chart.prepareConfigurationEdit=async()=>{s.retire();return s.edit;};await expect(restoreInitialHistoricalFrame(s.options)).rejects.toThrow(/superseded/);expect(s.rollback).toHaveBeenCalledOnce();expect(s.commit).not.toHaveBeenCalled();expect(s.seal).not.toHaveBeenCalled();
});
it('initial-frame recovery failure preserves both original ownership failure and cleanup failure',async()=>{
 const s=setup();s.chart.prepareConfigurationEdit=async()=>{s.retire();return s.edit;};s.rollback.mockRejectedValue(Error('Synthetic frame release failed'));
 const error=await restoreInitialHistoricalFrame(s.options).catch(error=>error);expect(error).toBeInstanceOf(AggregateError);expect(error.errors.map(String).join(' ')).toMatch(/superseded/);expect(error.errors.map(String).join(' ')).toContain('Synthetic frame release failed');expect(s.rollback).toHaveBeenCalledOnce();
});
it('an initial frame that committed cannot roll back because notification publication failed',async()=>{
 const s=setup();s.seal.mockImplementation(()=>{throw Error('Synthetic sealed notification failed');});await expect(restoreInitialHistoricalFrame(s.options)).rejects.toThrow('Synthetic sealed notification failed');expect(s.commit).toHaveBeenCalledOnce();expect(s.rollback).not.toHaveBeenCalled();
});
