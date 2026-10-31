import {afterEach,it,expect,vi} from 'vitest';
import type {Vela} from '@luxalgo/vela';
import {nativeHost} from '../ui/indicator-real-port-harness';
import {createIndicatorPort} from '../../src/chart/indicator-port';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {profileSourceContext,setProfileDatasets} from '../../src/chart/vp-visible-range-ltf';
import {installScriptRequestResolver} from '../../src/ui/script-requests';
import {fixtures} from '../fixtures/r43-profile-source';
import type {BarDataset} from '../../src/domain/types';
const ports:ReturnType<typeof createIndicatorPort>[]=[],offs:Array<()=>void>=[];
afterEach(()=>{for(const port of ports.splice(0))port.dispose();for(const off of offs.splice(0))off();setProfileDatasets([]);});
function rig(primary:BarDataset){const host=nativeHost(primary.bars.map(row=>({...row,time:row.time*1000}))),context=vi.fn(()=>({resolution:primary.resolution,calendar:'utc' as const,...profileSourceContext(sourceContextForDataset(primary),primary.bars)})),port=createIndicatorPort(host.chart as unknown as Vela,undefined,undefined,()=>primary.bars,undefined,context);ports.push(port);const id=port.add('pvp',{period:'Month',valueAreaVolume:0});return{host,port,id,context,profile:()=>port.values(id).profiles![0],poc:()=>port.values(id).series[0].values[0]};}
it('actual legacy profile never displays foreign live finer observations from the loaded universe',()=>{
 const {primary,foreign}=fixtures();setProfileDatasets([primary]);const baseline=rig(primary).poc();setProfileDatasets([primary,foreign]);const current=rig(primary);
 expect({finerChartBars:current.profile().lowerTimeframeBars,poc:current.poc()}).toEqual({finerChartBars:0,poc:baseline});
});
it('actual legacy profile refuses foreign live resolver prices absent from the qualified loaded source set',()=>{
 const {primary,foreign}=fixtures();foreign.resolution='30m';foreign.bars=foreign.bars.map((row,index)=>({...row,time:primary.bars[0].time+index*1800}));setProfileDatasets([primary]);const baseline=rig(primary).poc();
 offs.push(installScriptRequestResolver(()=>({bars:foreign.bars,resolution:'30m',fixture:true,label:'SYNTHETIC foreign live history'})));const current=rig(primary);
 expect({finerChartBars:current.profile().lowerTimeframeBars,poc:current.poc()}).toEqual({finerChartBars:0,poc:baseline});expect(current.profile().finer).toMatchObject({state:'unavailable',message:'Finer history does not have exact compatible loaded-source ownership.'});
});
it('actual same-source finer rows refine the profile and source publication can retire them without a new bar',()=>{
 const {primary,fine}=fixtures();setProfileDatasets([primary]);const current=rig(primary),baseline=current.poc();setProfileDatasets([primary,fine]);
 expect(current.profile().lowerTimeframeBars).toBeGreaterThan(0);expect(current.poc()).not.toBe(baseline);setProfileDatasets([primary]);expect(current.profile().lowerTimeframeBars).toBe(0);expect(current.poc()).toBe(baseline);
});
it('Remove, restore and disposal keep publication listeners bound to current owners only',()=>{
 const {primary,fine}=fixtures();setProfileDatasets([primary,fine]);const current=rig(primary),saved=structuredClone(current.port.serialize());current.port.remove(current.id);const afterRemove=current.context.mock.calls.length;setProfileDatasets([primary]);expect(current.context.mock.calls.length).toBe(afterRemove);expect(current.host.live.size).toBe(0);
 current.port.restore(saved);expect(current.profile().lowerTimeframeBars).toBe(0);setProfileDatasets([primary,fine]);expect(current.profile().lowerTimeframeBars).toBeGreaterThan(0);
 current.port.dispose();ports.splice(ports.indexOf(current.port),1);const afterDispose=current.context.mock.calls.length;setProfileDatasets([primary]);expect(current.context.mock.calls.length).toBe(afterDispose);expect(current.host.live.size).toBe(0);
});
it('a context capability borrowed from another chart cannot authorize that chart different actual input array',()=>{
 const {primary,fine}=fixtures();setProfileDatasets([primary,fine]);const other={...primary,bars:primary.bars.map(row=>({...row,open:25,high:30,low:20,close:25}))},baseline=rig(other).poc();
 const host=nativeHost(other.bars.map(row=>({...row,time:row.time*1000}))),port=createIndicatorPort(host.chart as unknown as Vela,undefined,undefined,()=>other.bars,undefined,()=>({resolution:'1D',calendar:'utc',...profileSourceContext(sourceContextForDataset(primary),primary.bars)}));ports.push(port);
 const id=port.add('pvp',{period:'Month',valueAreaVolume:0});expect(port.values(id).profiles![0].lowerTimeframeBars).toBe(0);expect(port.values(id).series[0].values[0]).toBe(baseline);
});
