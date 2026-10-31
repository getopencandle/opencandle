import type {Vela} from '@luxalgo/vela';
import {afterEach,expect,it} from 'vitest';
import {actualCell} from '../fixtures/live-staging-cell';
import {publishedSource,flushMtf,unix} from '../fixtures/qualified-nyse-mtf-source';
import {clearLiveDatasets,publishLiveDataset} from '../../src/ui/live-registry';
import {stableDatasetUniverse} from '../../src/ui/workspace-grid';
import {sourceContextForDataset,captureSeasonalityDailyContext,seasonalityDailyContextMode,producerCompletionSourceInputMatches,type ChartSourceContext} from '../../src/chart/source-context';
import {createIndicatorPortWithPrimarySource,seasonalityUsesLiveDailyHistory} from '../../src/chart/indicator-port';
import {nativeHost} from './indicator-real-port-harness';
import {factoryIndicatorDefault} from '../../src/ui/indicator-library';
import {defaultChartSettingsDocument} from '../../src/chart/chart-settings-document';
import type {Bar,BarDataset} from '../../src/domain/types';

// Actual provider, publisher, imported GridCell/hooks, selected-session
// constructors and source context. Controlled React callbacks/native host are
// explicitly descriptive evidence; no DOM, numerical/native or GUI claim.
const cleanup:(()=>void)[]=[];
afterEach(()=>{const failures:unknown[]=[];for(const close of cleanup.splice(0).reverse())try{close();}catch(error){failures.push(error);}clearLiveDatasets();if(failures.length)throw new AggregateError(failures,'Coherent live cell cleanup failed.');});
async function producer(){const p=await publishedSource();cleanup.push(()=>p.dispose());return p;}
function cell(data:BarDataset,staging=false){const c=actualCell(data,staging);cleanup.push(()=>c.dispose());return c;}
function input(c:ReturnType<typeof cell>){const panel=c.panel();return{bars:panel.bars as Bar[],source:panel.source as ChartSourceContext};}
function workspace(c:ReturnType<typeof cell>,session:'regular'|'extended'){const settings=defaultChartSettingsDocument();settings.symbol.session=session;c.set({chartSettings:settings});}
async function tick(p:Awaited<ReturnType<typeof producer>>,at='2024-03-11T19:59:30Z'){
 p.setNow(unix('2024-03-11T20:01:00Z'));p.emit({schemaVersion:1,kind:'batch',bars:[],trades:[{symbol:'GME',time:unix(at),price:140,high:140,low:140,size:1}],receivedAt:''});await flushMtf();return p.raw();
}
it('stable universe plus current publisher produces an actual owned GridCell source, not old metadata with new bars',async()=>{
 const p=await producer(),first=p.raw(),universe=[first],c=cell(first),next=await tick(p);expect(next).not.toBe(first);expect(stableDatasetUniverse(universe,[next])).toBe(universe);c.publish(next);const view=input(c);
 expect(view.bars).toBe(next.bars);expect(c.getProps().dataset).toBe(first);expect(seasonalityDailyContextMode(sourceContextForDataset(first,next.bars),'ordinary')).toBe(false);expect(seasonalityDailyContextMode(view.source,'ordinary')).toBe(true);expect(captureSeasonalityDailyContext(view.source,2023,2024,'ordinary')).not.toBeNull();expect(producerCompletionSourceInputMatches(view.source,view.bars)).toBe(true);expect(seasonalityDailyContextMode({...view.source},'ordinary')).toBe(false);
});
it('actual owned port receives the live descriptive mode from the real cell source while native acceptance stays pending',async()=>{
 const p=await producer(),first=p.raw(),c=cell(first);c.publish(await tick(p));const view=input(c),host=nativeHost(view.bars.map(row=>({...row,time:row.time*1000}))),basis={};
 const primaryHost={capture:()=>({basis,phase:'pending' as const,context:view.source,rows:view.bars.length,style:'candle',execution:'ordinary',forming:false,assertCurrent(){if(!seasonalityDailyContextMode(view.source,'ordinary'))throw Error('Actual current publisher retired.');}}),accepted:()=>null,sourceMode:()=>({context:view.source,execution:'ordinary',assertCurrent(){if(!seasonalityDailyContextMode(view.source,'ordinary'))throw Error('Actual source retired.');}}),subscribeSettled:()=>()=>{}};
 const {port}=createIndicatorPortWithPrimarySource({chart:host.chart as unknown as Vela,primaryHost});cleanup.push(()=>port.dispose());const defaults=factoryIndicatorDefault('seasonality'),id=port.add('seasonality',defaults.inputs,defaults);expect(seasonalityUsesLiveDailyHistory(port,id)).toBe(true);expect(port.captureReadout!(id).state).toBe('unavailable');
});
it('workspace regular selection stays constructor-owned after an all-RTH raw snapshot grows an after-hours tail',async()=>{
 const p=await producer(),c=cell(p.raw());workspace(c,'regular');expect(seasonalityDailyContextMode(input(c).source,'ordinary')).toBe(true);const next=await tick(p,'2024-03-11T20:00:01Z');c.publish(next);const view=input(c);
 expect(next.bars.at(-1)!.time).toBe(unix('2024-03-11T20:00:00Z'));expect(view.bars.at(-1)!.time).toBeLessThan(unix('2024-03-11T20:00:00Z'));expect(producerCompletionSourceInputMatches(view.source,view.bars)).toBe(true);expect(seasonalityDailyContextMode(view.source,'ordinary')).toBe(true);
});
it('explicit cell session supersedes workspace selection using the genuine latest raw dataset',async()=>{
 const p=await producer(),c=cell(p.raw());workspace(c,'regular');const next=await tick(p,'2024-03-11T20:00:01Z');c.publish(next);c.set({saved:{...(c.getProps().saved as object),session:'extended'}});const extended=input(c);expect(extended.bars).toBe(next.bars);expect(extended.source.sessionOverride).toBe('extended');expect(seasonalityDailyContextMode(extended.source,'ordinary')).toBe(true);
 c.set({saved:{...(c.getProps().saved as object),session:'regular'}});const regular=input(c);expect(regular.bars).not.toBe(next.bars);expect(regular.source.sessionOverride).toBe('regular');expect(producerCompletionSourceInputMatches(regular.source,regular.bars)).toBe(true);
});
it('hidden staging keeps its exact supplied snapshot and catches up coherently only after publication',async()=>{
 const p=await producer(),first=p.raw(),c=cell(first,true),next=await tick(p);c.publish(next);expect(input(c).bars).toBe(first.bars);expect(seasonalityDailyContextMode(input(c).source,'ordinary')).toBe(false);c.set({staging:false});expect(input(c).bars).toBe(next.bars);expect(seasonalityDailyContextMode(input(c).source,'ordinary')).toBe(true);
});
it('ordinary publisher updates cannot replace a supplied replay prefix or confer ordinary permission on it',async()=>{
 const p=await producer(),first=p.raw(),c=cell(first),prefix=first.bars.slice(0,2);c.set({bars:prefix,replayActive:true,executionIdentity:'SYNTHETIC-replay-prefix'});c.publish(await tick(p));expect(input(c).bars).toBe(prefix);expect(captureSeasonalityDailyContext(input(c).source,2023,2024,'SYNTHETIC-replay-prefix')).toBeNull();
});
it('a replacement subscription cannot borrow the retired publisher even with identical symbol and resolution',async()=>{
 const a=await producer(),first=a.raw(),c=cell(first),old=await tick(a);c.publish(old);const b=await producer(),replacement=b.raw();c.set({dataset:replacement,datasets:[replacement],bars:replacement.bars,saved:{...(c.getProps().saved as object),datasetId:replacement.provenance.datasetId}});c.publish(replacement);expect(input(c).bars).toBe(replacement.bars);expect(seasonalityDailyContextMode(input(c).source,'ordinary')).toBe(true);c.publish(await tick(a));expect(input(c).bars).toBe(replacement.bars);expect(producerCompletionSourceInputMatches(input(c).source,replacement.bars)).toBe(true);
});
it('a copied publisher dataset cannot create provider authority for its current-looking rows',async()=>{
 const p=await producer(),first=p.raw(),c=cell(first),next=await tick(p),copy={...next};publishLiveDataset(copy);c.ui.settle();expect(input(c).bars).toBe(next.bars);expect(seasonalityDailyContextMode(input(c).source,'ordinary')).toBe(false);c.publish(next);expect(seasonalityDailyContextMode(input(c).source,'ordinary')).toBe(true);
});
