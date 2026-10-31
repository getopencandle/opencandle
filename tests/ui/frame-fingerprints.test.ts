import {expect,it} from 'vitest';
import {createHash} from 'node:crypto';
import {createFrameFingerprintCalculator} from '../../src/ui/frame-fingerprints';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {factoryIndicatorDefault} from '../../src/ui/indicator-library';
import {fixtureDataset} from '../../src/domain/fixtures';
const cell=()=>{const workspace=createInitialWorkspace();return workspace.grid!.cells[workspace.grid!.layout.activeCellId];};
it('keeps VWAP legacy descriptor bytes while version2 has a distinct numerical identity',async()=>{
 const calculate=createFrameFingerprintCalculator(),legacy=cell();legacy.indicators=[{id:'vwap-one',kind:'vwap',...factoryIndicatorDefault('vwap'),paneId:'price'}];
 const original=await calculate(legacy,[]),explicit=structuredClone(legacy);explicit.indicators[0].inputs.kernelVersion=1;expect(await calculate(explicit,[])).toEqual(original);expect(explicit.indicators[0].inputs.kernelVersion).toBe(1);
 const exact=structuredClone(explicit);exact.indicators[0].inputs.kernelVersion=2;const descriptor=[1,'built','vwap',[['anchor','Session'],['kernelVersion',2],['source','hlc3'],['timezone','UTC']],0,[['vwap','line']]],expected='sha256:'+createHash('sha256').update(JSON.stringify(descriptor)).digest('hex');expect((await calculate(exact,[]))['["built","vwap-one"]']).toBe(expected);expect(await calculate(exact,[])).not.toEqual(original);expect(legacy.indicators[0].inputs).not.toHaveProperty('kernelVersion');
});
it('Volume omitted and explicit SMA preserve the historical descriptor while EMA and WMA differ',async()=>{
 const calculate=createFrameFingerprintCalculator(),input=cell();input.indicators=[{id:'volume-one',kind:'volume',...factoryIndicatorDefault('volume'),paneId:'volume-pane'}];
 const descriptor=[1,'built','volume',[['length',20]],0,[['ma','line'],['volume','columns']]],expected='sha256:'+createHash('sha256').update(JSON.stringify(descriptor)).digest('hex');
 const old=await calculate(input,[]);expect(old['["built","volume-one"]']).toBe(expected);
 const sma=structuredClone(input);sma.indicators[0].inputs.maType='SMA';expect(await calculate(sma,[])).toEqual(old);expect(sma.indicators[0].inputs.maType).toBe('SMA');
 const identities=new Set([expected]);for(const type of ['EMA','WMA']){const changed=structuredClone(input);changed.indicators[0].inputs.maType=type;identities.add((await calculate(changed,[]))['["built","volume-one"]']);}expect(identities.size).toBe(3);
 const malformed=structuredClone(input);malformed.indicators[0].inputs.maType='ema';await expect(calculate(malformed,[])).rejects.toThrow();
});
it('preserves the pre-band VWAP descriptor for legacy and fully disabled bands',async()=>{
 const calculate=createFrameFingerprintCalculator(),input=cell(),settings=factoryIndicatorDefault('vwap');input.indicators=[{id:'vwap-one',kind:'vwap',...settings,paneId:'price'}];
 const legacy=structuredClone(input);legacy.indicators[0].inputs={anchor:'Session',timezone:'UTC',source:'hlc3'};legacy.indicators[0].plots={vwap:legacy.indicators[0].plots.vwap};delete legacy.indicators[0].presentation;
 // Independently computed with Python hashlib over the original pre-band JSON descriptor.
 const expected='sha256:3395a2079a1abb242924aa7ae960eb260ef1f1a157358255b425a00b93ffd127';
 expect((await calculate(legacy,[]))['["built","vwap-one"]']).toBe(expected);expect((await calculate(input,[]))['["built","vwap-one"]']).toBe(expected);
 const dormant=structuredClone(input);dormant.indicators[0].inputs.band2Multiplier=17;dormant.indicators[0].plots.upper2.kind='histogram';dormant.indicators[0].presentation!.hideOnDaily=true;expect(await calculate(dormant,[])).toEqual(await calculate(legacy,[]));
 const invalid=structuredClone(dormant);invalid.indicators[0].inputs.band3Multiplier=-1;await expect(calculate(invalid,[])).rejects.toThrow();
});
it('includes only enabled VWAP pair multipliers and emitted plot kinds in historical identity',async()=>{
 const calculate=createFrameFingerprintCalculator(),input=cell(),settings=factoryIndicatorDefault('vwap');settings.inputs.band2Enabled=true;input.indicators=[{id:'vwap-two',kind:'vwap',...settings,paneId:'price'}];
 const descriptor=[1,'built','vwap',[['anchor','Session'],['band2Enabled',true],['band2Multiplier',2],['bandMode','Percentage'],['source','hlc3'],['timezone','UTC']],0,[['lower2','line'],['upper2','line'],['vwap','line']]];
 const expected='sha256:'+createHash('sha256').update(JSON.stringify(descriptor)).digest('hex'),initial=await calculate(input,[]);expect(initial['["built","vwap-two"]']).toBe(expected);
 const inactive=structuredClone(input);inactive.indicators[0].inputs.band1Multiplier=42;inactive.indicators[0].plots.upper1.kind='step';expect(await calculate(inactive,[])).toEqual(initial);
 for(const mutate of [(row:typeof input.indicators[0])=>{row.inputs.band2Multiplier=3;},(row:typeof input.indicators[0])=>{row.inputs.band3Enabled=true;},(row:typeof input.indicators[0])=>{row.plots.lower2.kind='histogram';}]){const changed=structuredClone(input);mutate(changed.indicators[0]);expect(await calculate(changed,[])).not.toEqual(initial);}
});
it('matches an independently constructed SHA-256 descriptor and preserves cosmetic changes',async()=>{
 const calculate=createFrameFingerprintCalculator(),input=cell(),settings=factoryIndicatorDefault('sma');input.indicators=[{id:'sma-one',kind:'sma',...settings,paneId:'price'}];
 const expected='sha256:'+createHash('sha256').update(JSON.stringify([1,'built','sma',[['length',9],['source','close']],0,[['sma','line']]])).digest('hex'),first=await calculate(input,[]);expect(first['["built","sma-one"]']).toBe(expected);
 const styled=structuredClone(input);styled.indicators[0].plots.sma.color='#123456';styled.indicators[0].plots.sma.width=7;styled.indicators[0].visible=false;expect(await calculate(styled,[])).toEqual(first);
 const changed=structuredClone(input);changed.indicators[0].inputs.length=10;expect(await calculate(changed,[])).not.toEqual(first);
});
it('keeps legacy and explicit None hashes equal while retaining validated dormant controls',async()=>{
 const calculate=createFrameFingerprintCalculator(),input=cell(),settings=factoryIndicatorDefault('sma');input.indicators=[{id:'sma-one',kind:'sma',...settings,paneId:'price'}];
 const legacy=structuredClone(input);legacy.indicators[0].inputs={length:9,source:'close'};legacy.indicators[0].plots={sma:legacy.indicators[0].plots.sma};delete legacy.indicators[0].presentation;
 const expected='sha256:'+createHash('sha256').update(JSON.stringify([1,'built','sma',[['length',9],['source','close']],0,[['sma','line']]])).digest('hex');
 expect((await calculate(legacy,[]))['["built","sma-one"]']).toBe(expected);expect(await calculate(input,[])).toEqual(await calculate(legacy,[]));
 const dormant=structuredClone(input);dormant.indicators[0].inputs.smoothingLength=27;dormant.indicators[0].inputs.smoothingMultiplier=3;dormant.indicators[0].plots.smooth.kind='histogram';dormant.indicators[0].plots.smoothUpper.kind='step';expect(await calculate(dormant,[])).toEqual(await calculate(input,[]));
 const invalid=structuredClone(dormant);invalid.indicators[0].inputs.smoothingLength=0;await expect(calculate(invalid,[])).rejects.toThrow('numeric input');
 const invalidStyle=structuredClone(dormant);invalidStyle.indicators[0].plots.smooth.width=0;await expect(calculate(invalidStyle,[])).rejects.toThrow();
});
it('hashes only effective smoothing inputs and emitted plot kinds with an independent descriptor',async()=>{
 const calculate=createFrameFingerprintCalculator(),input=cell(),settings=factoryIndicatorDefault('sma');settings.inputs.smoothingType='SMA';settings.inputs.smoothingLength=2;input.indicators=[{id:'sma-one',kind:'sma',...settings,paneId:'price'}];
 const expected='sha256:'+createHash('sha256').update(JSON.stringify([1,'built','sma',[['length',9],['smoothingLength',2],['smoothingType','SMA'],['source','close']],0,[['sma','line'],['smooth','line']]])).digest('hex'),first=await calculate(input,[]);expect(first['["built","sma-one"]']).toBe(expected);
 const dormant=structuredClone(input);dormant.indicators[0].inputs.smoothingMultiplier=5;dormant.indicators[0].plots.smoothUpper.kind='histogram';expect(await calculate(dormant,[])).toEqual(first);
 for(const patch of [{smoothingLength:3},{smoothingType:'EMA'},{smoothingType:'SMA+BB'}]){const changed=structuredClone(input);Object.assign(changed.indicators[0].inputs,patch);expect(await calculate(changed,[])).not.toEqual(first);}
 const plot=structuredClone(input);plot.indicators[0].plots.smooth.kind='histogram';expect(await calculate(plot,[])).not.toEqual(first);
 const bands=structuredClone(input);bands.indicators[0].inputs.smoothingType='SMA+BB';const changed=structuredClone(bands);changed.indicators[0].inputs.smoothingMultiplier=3;expect(await calculate(changed,[])).not.toEqual(await calculate(bands,[]));
});
it('binds scripts to exact immutable source/version and placement without hashing display labels',async()=>{
 const calculate=createFrameFingerprintCalculator(),input=cell();input.scriptBindings=[{id:'instance',name:'Name',source:'({onBar(ctx){ctx.plot("x",1);}})',documentId:'file',version:1,pane:'price',paneId:null,ownScale:false,visible:true,plots:{}}];const first=await calculate(input,[]);
 const renamed=structuredClone(input);renamed.scriptBindings![0].name='Renamed';renamed.scriptBindings![0].visible=false;expect(await calculate(renamed,[])).toEqual(first);
 for(const patch of [{source:'({onBar(ctx){ctx.plot("x",2);}})'},{version:2},{ownScale:true}]){const changed=structuredClone(input);Object.assign(changed.scriptBindings![0],patch);expect(await calculate(changed,[])).not.toEqual(first);}
});
it('comparison fingerprints distinguish source coverage, adjustment, revision and scale mode',async()=>{
 const calculate=createFrameFingerprintCalculator(),input=cell(),dataset=fixtureDataset('SPY',4);input.comparisons=[{id:'compare',datasetId:dataset.provenance.datasetId,mode:'absolute',baseline:'first-loaded-match',color:'#fff',width:1,visible:true}];const first=await calculate(input,[dataset]);
 for(const key of ['coverage','adjustment','revision'] as const){const other=structuredClone(dataset);(other.provenance as any)[key]=key==='adjustment'?'split-adjusted':'Changed';expect(await calculate(input,[other])).not.toEqual(first);}
 const changed=structuredClone(input);changed.comparisons[0].mode='percent';expect(await calculate(changed,[dataset])).not.toEqual(first);await expect(calculate(input,[])).rejects.toThrow('exact supplied source');await expect(calculate(input,[dataset,dataset])).rejects.toThrow('exact supplied source');
});
it('rejects hostile settings without invoking accessors and returns frozen cached maps for immutable inputs',async()=>{
 const calculate=createFrameFingerprintCalculator(),input=cell(),datasets=[fixtureDataset('GME',3)];const pending=calculate(input,datasets);expect(calculate(input,datasets)).toBe(pending);expect(Object.isFrozen(await pending)).toBe(true);
 let reads=0;const hostile=cell();Object.defineProperty(hostile,'scriptBindings',{enumerable:true,get(){reads++;return[];}});await expect(calculate(hostile,[])).rejects.toThrow('accessors');expect(reads).toBe(0);
 const source=fixtureDataset('SPY',3);Object.defineProperty(source.provenance,'datasetId',{enumerable:true,get(){reads++;return 'forged';}});await expect(calculate(input,[source])).rejects.toThrow('plain data');expect(reads).toBe(0);
 const list=[fixtureDataset('SPY',3)];Object.defineProperty(list,'0',{enumerable:true,get(){reads++;return source;}});await expect(calculate(input,list)).rejects.toThrow('plain data');expect(reads).toBe(0);
});
