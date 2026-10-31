import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {ChartEventMarkers,type ChartEventMarkersProps} from '../../src/ui/ChartEventMarkers';
import {AlertChartLines,type AlertChartLinesProps} from '../../src/ui/AlertChartLines';
import {createAxisTagBoard} from '../../src/chart/axis-tag-board';
import type {ChartController} from '../../src/chart/adapter';
import {snapshotSeriesKey,snapshotSourceKey,requireSnapshotScene} from '../../src/chart/snapshot-scene';
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,cleanups:new Map<number,()=>void>()}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');const same=(a:any[]|undefined,b:any[]|undefined)=>!!a&&!!b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));return{...actual,
 useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(next:any)=>{hooks.cells[i]=typeof next==='function'?next(hooks.cells[i]):next;}];},
 useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},
 useEffect:(effect:()=>void|(()=>void),deps?:any[])=>{const i=hooks.cursor++;if(!(i in hooks.cells)||!same(hooks.cells[i],deps)){hooks.cleanups.get(i)?.();hooks.cleanups.delete(i);hooks.cells[i]=deps;const cleanup=effect();if(cleanup)hooks.cleanups.set(i,cleanup);}}
};});
const day=86400,time=Date.UTC(2026,0,5,5)/1000;
function fixture(){
 const state={source:{datasetId:'synthetic-gme',revision:'1',fixture:true,label:'SYNTHETIC events',basisIdentity:'regular'},viewport:{from:time,to:time+100*day},left:100,crosshair:null as null|{time:number}};
 const chart={getDataWindow:()=>({pending:false,source:state.source,series:{count:100},readout:[],standard:{bar:{time,close:1}},displayed:{bar:{time,close:1}},crosshair:state.crosshair}),getStyle:()=> 'candles',getViewport:()=>state.viewport,paneGeometry:()=>[]} as unknown as ChartController,owner={};
 const binding=()=>({owner,chart,sourceKey:snapshotSourceKey(state.source,'candles'),seriesKey:snapshotSeriesKey(chart)});
 const load=vi.fn(async()=>({ok:true,value:{schemaVersion:1,symbol:'GME',events:[{id:'synthetic-dividend',kind:'cash-dividend',symbol:'GME',exDate:'2026-02-16',recordDate:null,payableDate:null,processDate:null,amount:0.14,currency:'USD',special:false,foreign:false}],synthetic:true}} as any));
 const props:ChartEventMarkersProps={symbol:'GME',bars:Array.from({length:100},(_,i)=>({time:time+i*day})),settings:{dividends:true,splits:true},synthetic:true,projection:()=>({left:state.left,top:50,width:800,height:400}),timeToX:seconds=>state.left+(seconds-time)/day*8,load,snapshot:binding(),sourceKey:state.source.datasetId};
 const render=()=>{hooks.cursor=0;return ChartEventMarkers(props) as any;};
 const settle=async()=>{for(let i=0;i<5;i++){render();await Promise.resolve();}return render();};return{state,props,binding,render,settle,load};
}
const frames=new Map<number,FrameRequestCallback>();let serial=0;
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.cleanups.clear();frames.clear();vi.stubGlobal('requestAnimationFrame',(fn:FrameRequestCallback)=>{frames.set(++serial,fn);return serial;});vi.stubGlobal('cancelAnimationFrame',(id:number)=>frames.delete(id));});
afterEach(()=>{for(const cleanup of hooks.cleanups.values())cleanup();hooks.cleanups.clear();vi.unstubAllGlobals();});
it('publishes actual loaded badge positions, exports no tooltip and performs no additional request',async()=>{
 const f=fixture(),ui=await f.settle(),badge=ui.props.children[0][0],scene=requireSnapshotScene(f.binding(),'events');expect(scene.badges).toHaveLength(1);expect(scene.badges[0]).toMatchObject({left:badge.props.style.left+100,top:badge.props.style.top+50,size:16,letter:'D'});expect(scene.texts).toHaveLength(0);expect(f.load).toHaveBeenCalledTimes(1);requireSnapshotScene(f.binding(),'events');expect(f.load).toHaveBeenCalledTimes(1);
});
it('rejects pan geometry before the overlay refresh and republishes only after its real position updates',async()=>{
 const f=fixture();await f.settle();f.state.left=120;expect(()=>requireSnapshotScene(f.binding(),'events')).toThrow('updating');f.render();expect(()=>requireSnapshotScene(f.binding(),'events')).toThrow('updating');const callback=[...frames.values()].at(-1)!;callback(1);f.render();expect(requireSnapshotScene(f.binding(),'events').badges[0].left).toBeGreaterThan(120);expect(f.load).toHaveBeenCalledTimes(1);
});
it('source/session Undo, Redo and layout restore republish already loaded badges; hidden settings publish none',async()=>{
 const f=fixture();await f.settle();for(const basis of ['extended','regular','extended','restored-layout']){f.state.source={...f.state.source,basisIdentity:basis};f.props.snapshot=f.binding();f.render();expect(requireSnapshotScene(f.binding(),'events').badges).toHaveLength(1);}expect(f.load).toHaveBeenCalledTimes(1);f.props.settings={dividends:false,splits:false};f.render();expect(requireSnapshotScene(f.binding(),'events').badges).toHaveLength(0);
});

it('alert proof rejects a mutable native price-scale change before RAF, then accepts refreshed and hidden/off-pane empty frames',()=>{
 const f=fixture(),scale={offset:0},board=createAxisTagBoard(()=>null);
 const props:AlertChartLinesProps={snapshot:f.binding(),rows:[{alertId:'synthetic-a',name:'SYNTHETIC',slot:'level',price:100,label:'100 SYNTHETIC'}],visible:true,tickSize:.01,tagBoard:board,onReprice:()=>true,projection:()=>({left:100,top:50,width:800,height:400,priceToY:price=>450-price+scale.offset,yToPrice:y=>450-y+scale.offset})};
 const render=()=>{hooks.cursor=0;return AlertChartLines(props);};render();render();expect(requireSnapshotScene(f.binding(),'alerts')).toEqual({texts:[],boxes:[],badges:[]});
 scale.offset=20;expect(()=>requireSnapshotScene(f.binding(),'alerts')).toThrow('updating');const callback=[...frames.values()].at(-1)!;callback(1);render();render();expect(requireSnapshotScene(f.binding(),'alerts')).toEqual({texts:[],boxes:[],badges:[]});
 props.rows=[{...props.rows[0],price:9000}];render();render();expect(requireSnapshotScene(f.binding(),'alerts')).toEqual({texts:[],boxes:[],badges:[]});props.visible=false;render();render();expect(requireSnapshotScene(f.binding(),'alerts')).toEqual({texts:[],boxes:[],badges:[]});
});

// App rebinds these layers only after 60 ms of hover quiet; a snapshot right after a crosshair move still succeeds.
it('a crosshair move before the settled rebind does not refuse the events snapshot',async()=>{
 const f=fixture();await f.settle();const stale=f.props.snapshot!;
 expect(requireSnapshotScene(f.binding(),'events').badges).toHaveLength(1);for(const day3 of [3,4]){f.state.crosshair={time:time+day3*day};expect(f.binding().seriesKey).not.toBe(stale.seriesKey);expect(requireSnapshotScene(f.binding(),'events').badges).toHaveLength(1);}
});
it('a crosshair move before the settled rebind does not refuse the alerts snapshot',()=>{
 const f=fixture(),props:AlertChartLinesProps={snapshot:f.binding(),rows:[{alertId:'synthetic-a',name:'SYNTHETIC',slot:'level',price:100,label:'100 SYNTHETIC'}],visible:true,tickSize:.01,onReprice:()=>true,projection:()=>({left:100,top:50,width:800,height:400,priceToY:price=>450-price,yToPrice:y=>450-y})};
 const render=()=>{hooks.cursor=0;return AlertChartLines(props);};render();render();
 f.state.crosshair={time:time+3*day};expect(f.binding().seriesKey).not.toBe(props.snapshot!.seriesKey);expect(requireSnapshotScene(f.binding(),'alerts')).toEqual({texts:[],boxes:[],badges:[]});
});

it('alert proof rejects changed paper chip obstacles before the alert layer rerenders',()=>{
 const f=fixture(),board=createAxisTagBoard(()=>null),props:AlertChartLinesProps={snapshot:f.binding(),rows:[{alertId:'synthetic-a',name:'SYNTHETIC',slot:'level',price:100,label:'100 SYNTHETIC'}],visible:true,tickSize:.01,tagBoard:board,onReprice:()=>true,projection:()=>({left:100,top:50,width:800,height:400,priceToY:price=>450-price,yToPrice:y=>450-y})};
 const render=()=>{hooks.cursor=0;return AlertChartLines(props);};render();render();requireSnapshotScene(f.binding(),'alerts');const tags=JSON.stringify([...board.placements('alerts')]);board.publishLabels!('paper',[{left:8,top:340,right:200,bottom:360}]);expect(JSON.stringify([...board.placements('alerts')])).toBe(tags);expect(()=>requireSnapshotScene(f.binding(),'alerts')).toThrow('updating');render();requireSnapshotScene(f.binding(),'alerts');
});
