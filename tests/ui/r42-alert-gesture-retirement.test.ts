import {beforeEach,expect,it,vi} from 'vitest';
import {mountControlledComponent,all,invoke} from '../helpers/alert-dialog-harness';
import {AlertChartLines,type AlertChartLinesProps,type AlertChartLinesProjection} from '../../src/ui/AlertChartLines';
import {fixtureDataset} from '../../src/domain/fixtures';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {stampLiveLineage} from '../../src/chart/bar-input-identity';
import {snapshotSourceKey,snapshotInspectionKey,requireSnapshotScene,type SnapshotBinding} from '../../src/chart/snapshot-scene';
import type {ChartController} from '../../src/chart/adapter';

const frames=new Map<number,FrameRequestCallback>();let frameId=0;
beforeEach(()=>{frames.clear();vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{frames.set(++frameId,callback);return frameId;});vi.stubGlobal('cancelAnimationFrame',(id:number)=>frames.delete(id));});
const drive=(view:ReturnType<typeof mountControlledComponent>)=>{view.render();for(const effect of view.owner.pending.splice(0))effect();};
function fixture(live=false){
 let token:object={},reset='synthetic-grid0-fin0-cell0-ordinary',execution='ordinary',yOrigin=400,pending=false;
 let dataset=fixtureDataset('GME',4);dataset={...dataset,instrument:{...dataset.instrument,tickSize:.5},resolution:'1m'};if(live)stampLiveLineage(dataset.bars,'synthetic-gesture-feed',1);
 let source=sourceContextForDataset(dataset),series={count:dataset.bars.length,firstTime:dataset.bars[0].time,lastTime:dataset.bars.at(-1)!.time,style:'candles'};
 const observation=()=>({pending,source,series,standard:{bar:dataset.bars.at(-1)},displayed:{bar:dataset.bars.at(-1)},readout:[],crosshair:null});
 const getDataWindow=vi.fn(observation),getExecutionIdentity=vi.fn(()=>execution),chart={getDataWindow,getExecutionIdentity,getStyle:()=> 'candles',getViewport:()=>({from:1,to:2}),paneGeometry:()=>[]} as unknown as ChartController,owner={};
 const bindings=():SnapshotBinding=>{const accepted=token;return{owner,chart,sourceKey:snapshotSourceKey(source,'candles'),seriesKey:snapshotInspectionKey(observation() as any,'candles'),gestureOwnerKey:reset,isOwnerCurrent:()=>token===accepted};};
 const projections:Array<AlertChartLinesProjection&{convert:ReturnType<typeof vi.fn>}>=[],projection=vi.fn(()=>{const at=yOrigin,convert=vi.fn((y:number)=>at-y),value={left:0,top:0,width:800,height:400,priceToY:(price:number)=>at-price,yToPrice:convert,convert};projections.push(value);return value;});
 let props:AlertChartLinesProps={snapshot:bindings(),rows:[{alertId:'synthetic-alert',name:'SYNTHETIC',slot:'level',price:100,label:'100 SYNTHETIC'}],tickSize:.5,visible:true,projection,onReprice:vi.fn(()=>true)};
 const view=mountControlledComponent(()=>AlertChartLines(props));for(let pass=0;pass<4;pass++)drive(view);
 const handle=()=>all(view.render(),node=>node.props['data-alert-line']==='synthetic-alert')[0];
 const target={isConnected:true,captured:false,listeners:new Map<string,EventListener>(),retained:new Map<string,EventListener>(),onRelease:undefined as (()=>void)|undefined,onFocus:undefined as (()=>void)|undefined,
  focus:vi.fn(()=>target.onFocus?.()),setPointerCapture:vi.fn(()=>{target.captured=true;}),releasePointerCapture:vi.fn(()=>{target.captured=false;target.onRelease?.();}),
  addEventListener:vi.fn((type:string,listener:EventListener)=>{target.listeners.set(type,listener);target.retained.set(type,listener);}),removeEventListener:vi.fn((type:string)=>{target.listeners.delete(type);})};
 const down=()=>{const element=handle();expect(element).toBeTruthy();invoke(element.props.onPointerDown,{button:0,pointerId:7,currentTarget:target,preventDefault:vi.fn(),stopPropagation:vi.fn()});};
 const event=(type:string,extra:Record<string,unknown>={})=>({type,pointerId:7,clientY:250,...extra}) as unknown as PointerEvent;
 const send=(type:string,extra:Record<string,unknown>={})=>target.retained.get(type)?.(event(type,extra));
 const refresh=()=>{token={};props={...props,snapshot:bindings()};view.render();};
 return{view,target,projections,projection,getDataWindow,getExecutionIdentity,handle,down,send,event,refresh,chart,owner,
  get props(){return props;},set props(next:AlertChartLinesProps){props=next;},retire(){token={};},reset(){reset+='-replacement';refresh();},pending(value:boolean){pending=value;},execution(value:string){execution=value;},scale(value:number){yOrigin=value;},
  advance(){const bars=[...dataset.bars,{...dataset.bars.at(-1)!,time:dataset.bars.at(-1)!.time+60}];if(live)stampLiveLineage(bars,'synthetic-gesture-feed',2);dataset={...dataset,bars};source=sourceContextForDataset(dataset);series={...series,count:bars.length,lastTime:bars.at(-1)!.time};refresh();},
  correctSameLength(){const bars=dataset.bars.map((bar,index)=>index===dataset.bars.length-1?{...bar,close:bar.close+.25}:bar);dataset={...dataset,bars};source=sourceContextForDataset(dataset);refresh();},
  changeBasis(){dataset={...dataset,instrument:{...dataset.instrument,currency:'EUR'}};source=sourceContextForDataset(dataset);refresh();},
  corruptStaticSeries(){series={...series,count:series.count+1,lastTime:series.lastTime+60};refresh();},
 };
}
const noReads=(f:ReturnType<typeof fixture>)=>{expect(f.getDataWindow).not.toHaveBeenCalled();expect(f.getExecutionIdentity).not.toHaveBeenCalled();expect(f.projection).not.toHaveBeenCalled();expect(f.projections.every(value=>value.convert.mock.calls.length===0)).toBe(true);};
const clearReads=(f:ReturnType<typeof fixture>)=>{f.getDataWindow.mockClear();f.getExecutionIdentity.mockClear();f.projection.mockClear();for(const value of f.projections)value.convert.mockClear();};

it('a current gesture uses a fresh owned projection, snaps to its original tick and commits once',()=>{
 const f=fixture();requireSnapshotScene(f.props.snapshot!,'alerts');f.down();expect(()=>requireSnapshotScene(f.props.snapshot!,'alerts')).toThrow('updating');f.scale(450);f.send('pointermove',{clientY:299.8});expect(f.projections.at(-1)!.convert).toHaveBeenCalledOnce();f.send('pointerup');f.send('pointerup');expect(f.props.onReprice).toHaveBeenCalledExactlyOnceWith('synthetic-alert','level',150);expect(f.target.listeners.size).toBe(0);expect(f.target.captured).toBe(false);expect(f.target.releasePointerCapture).toHaveBeenCalledOnce();
});
it('same-controller live lineage advancement and a fresh render predicate preserve the gesture',()=>{
 const f=fixture(true),oldBinding=f.props.snapshot!,oldPublish=f.props.onReprice;f.down();f.scale(500);f.advance();expect(oldBinding.isOwnerCurrent!()).toBe(false);const currentPublish=vi.fn(()=>true);f.props={...f.props,onReprice:currentPublish};f.view.render();expect(f.handle()).toBeTruthy();f.send('pointermove');f.send('pointerup');expect(oldPublish).not.toHaveBeenCalled();expect(currentPublish).toHaveBeenCalledExactlyOnceWith('synthetic-alert','level',250);expect(f.target.listeners.size).toBe(0);
});
it('a retired owner cancels before any native read and cannot resume after a later valid render',()=>{
 const f=fixture(true);f.down();f.retire();clearReads(f);f.send('pointermove');noReads(f);f.refresh();f.send('pointerup');expect(f.props.onReprice).not.toHaveBeenCalled();expect(f.target.listeners.size).toBe(0);expect(f.target.captured).toBe(false);
});
it('a same-controller reset epoch cancels before native conversion or reprice',()=>{
 const f=fixture(true);f.down();f.reset();clearReads(f);f.send('pointermove');f.send('pointerup');noReads(f);expect(f.props.onReprice).not.toHaveBeenCalled();expect(f.target.releasePointerCapture).toHaveBeenCalledOnce();
});
it('controller replacement cancels retained handlers before effect cleanup',()=>{
 const f=fixture();f.down();f.props={...f.props,snapshot:{...f.props.snapshot!,chart:{} as ChartController}};f.view.render();clearReads(f);f.send('pointermove');f.send('pointerup');noReads(f);expect(f.props.onReprice).not.toHaveBeenCalled();
});
it('static source/input replacement and unexpected static series changes never inherit an old drag',()=>{
 const changed=fixture();changed.down();changed.correctSameLength();clearReads(changed);changed.send('pointermove');noReads(changed);expect(changed.props.onReprice).not.toHaveBeenCalled();
 const basis=fixture();basis.down();basis.changeBasis();clearReads(basis);basis.send('pointermove');noReads(basis);expect(basis.props.onReprice).not.toHaveBeenCalled();
 const series=fixture();series.down();series.corruptStaticSeries();clearReads(series);series.send('pointermove');expect(series.getDataWindow).toHaveBeenCalled();expect(series.projection).not.toHaveBeenCalled();expect(series.props.onReprice).not.toHaveBeenCalled();
});
it('execution retirement and an unavailable source cancel without a coordinate read',()=>{
 const f=fixture(true);f.down();f.execution('synthetic-replay-run');clearReads(f);f.send('pointermove');expect(f.projection).not.toHaveBeenCalled();expect(f.props.onReprice).not.toHaveBeenCalled();
 const pending=fixture();pending.down();pending.pending(true);clearReads(pending);pending.send('pointerup');expect(pending.projection).not.toHaveBeenCalled();expect(pending.props.onReprice).not.toHaveBeenCalled();
});
it('tick and in-place row changes cancel using captured values',()=>{
 const f=fixture();f.down();f.props.tickSize=1;clearReads(f);f.send('pointermove');noReads(f);expect(f.props.onReprice).not.toHaveBeenCalled();
 const row=fixture();row.down();(row.props.rows[0] as any).price=120;clearReads(row);row.send('pointerup');noReads(row);expect(row.props.onReprice).not.toHaveBeenCalled();
});
it('hidden or deleted rows cancel while unrelated pointer ids leave the current drag intact',()=>{
 const f=fixture();f.down();clearReads(f);f.send('pointermove',{pointerId:8});f.send('pointerup',{pointerId:8});noReads(f);expect(f.target.captured).toBe(true);f.props={...f.props,rows:[]};f.view.render();f.send('pointermove');expect(f.target.listeners.size).toBe(0);expect(f.props.onReprice).not.toHaveBeenCalled();
});
it('cancel, lost capture and unmount release every listener and make retained callbacks inert',()=>{
 for(const end of ['pointercancel','lostpointercapture','unmount']){const f=fixture();f.down();if(end==='unmount')f.view.dispose();else f.send(end);clearReads(f);const writes=f.view.owner.writes;f.send('pointermove');f.send('pointerup');noReads(f);expect(f.view.owner.writes).toBe(writes);expect(f.props.onReprice).not.toHaveBeenCalled();expect(f.target.listeners.size).toBe(0);expect(f.target.captured).toBe(false);}
});
it('focus retirement and release reentrancy cannot publish into another owner',()=>{
 const focus=fixture();focus.target.onFocus=()=>{focus.retire();clearReads(focus);};focus.down();noReads(focus);expect(focus.target.listeners.size).toBe(0);
 const release=fixture();release.down();release.send('pointermove');release.target.onRelease=()=>release.reset();release.send('pointerup');expect(release.props.onReprice).not.toHaveBeenCalled();expect(release.target.listeners.size).toBe(0);
 const replacement=fixture();replacement.down();replacement.send('pointermove');let once=true;replacement.target.onRelease=()=>{if(!once)return;once=false;replacement.down();replacement.send('pointermove',{clientY:225});};replacement.send('pointerup');expect(replacement.props.onReprice).not.toHaveBeenCalled();expect(replacement.target.captured).toBe(true);expect(replacement.handle().props['aria-valuenow']).toBe(175);replacement.target.onRelease=undefined;replacement.send('pointerup');expect(replacement.props.onReprice).toHaveBeenCalledExactlyOnceWith('synthetic-alert','level',175);
 const beginReplacement=fixture();beginReplacement.down();beginReplacement.send('pointermove');let beginOnce=true;beginReplacement.target.onRelease=()=>{if(!beginOnce)return;beginOnce=false;beginReplacement.down();beginReplacement.send('pointermove',{clientY:225});};beginReplacement.down();expect(beginReplacement.props.onReprice).not.toHaveBeenCalled();expect(beginReplacement.target.focus).toHaveBeenCalledTimes(2);expect(beginReplacement.target.setPointerCapture).toHaveBeenCalledTimes(2);expect(beginReplacement.target.listeners.size).toBe(4);expect(beginReplacement.target.captured).toBe(true);expect(beginReplacement.handle().props['aria-valuenow']).toBe(175);beginReplacement.target.onRelease=undefined;beginReplacement.send('pointerup');expect(beginReplacement.props.onReprice).toHaveBeenCalledExactlyOnceWith('synthetic-alert','level',175);expect(beginReplacement.target.listeners.size).toBe(0);
});
it('registration, coordinate and publication errors still clean up capture',()=>{
 const registration=fixture();registration.target.addEventListener.mockImplementation((type,listener)=>{registration.target.listeners.set(type,listener);if(type==='pointerup')throw Error('SYNTHETIC registration failure');});registration.down();expect(registration.target.listeners.size).toBe(0);expect(registration.target.captured).toBe(false);
 const conversion=fixture();conversion.down();conversion.projection.mockImplementation(()=>{throw Error('SYNTHETIC projection failure');});conversion.send('pointermove');expect(conversion.target.listeners.size).toBe(0);expect(conversion.target.captured).toBe(false);
 const publish=fixture();publish.props={...publish.props,onReprice:vi.fn(()=>{throw Error('SYNTHETIC publication failure');})};publish.view.render();publish.down();publish.send('pointermove');expect(()=>publish.send('pointerup')).toThrow('publication failure');expect(publish.target.listeners.size).toBe(0);expect(publish.target.captured).toBe(false);
});
it('current keyboard moves preserve tick behavior and stale tick/reset handlers cannot reprice',()=>{
 const f=fixture(),handler=f.handle().props.onKeyDown;invoke(handler,{key:'ArrowUp',preventDefault:vi.fn(),stopPropagation:vi.fn()});expect(f.props.onReprice).toHaveBeenCalledWith('synthetic-alert','level',100.5);vi.mocked(f.props.onReprice).mockClear();f.props.tickSize=1;clearReads(f);invoke(handler,{key:'ArrowDown',preventDefault:vi.fn(),stopPropagation:vi.fn()});noReads(f);expect(f.props.onReprice).not.toHaveBeenCalled();
 const reset=fixture(),old=reset.handle().props.onKeyDown;reset.reset();clearReads(reset);invoke(old,{key:'ArrowUp',preventDefault:vi.fn(),stopPropagation:vi.fn()});noReads(reset);expect(reset.props.onReprice).not.toHaveBeenCalled();
});
it('a keyboard edit cancels an existing pointer and a release-side owner switch cancels the key action',()=>{
 const f=fixture();f.down();f.send('pointermove');invoke(f.handle().props.onKeyDown,{key:'ArrowDown',preventDefault:vi.fn(),stopPropagation:vi.fn()});f.send('pointerup');expect(f.props.onReprice).toHaveBeenCalledExactlyOnceWith('synthetic-alert','level',99.5);expect(f.target.captured).toBe(false);
 const switched=fixture();switched.down();switched.target.onRelease=()=>switched.reset();invoke(switched.handle().props.onKeyDown,{key:'ArrowUp',preventDefault:vi.fn(),stopPropagation:vi.fn()});expect(switched.props.onReprice).not.toHaveBeenCalled();
});
