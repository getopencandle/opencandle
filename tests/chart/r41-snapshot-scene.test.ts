import {expect,it} from 'vitest';
import type {ChartController} from '../../src/chart/adapter';
import {snapshotSourceKey,snapshotSeriesKey,captureSnapshotGuard,publishSnapshotScene,requireSnapshotScene,clearSnapshotScene,type SnapshotBinding} from '../../src/chart/snapshot-scene';

function fixture(){
 const state={source:{datasetId:'synthetic-gme',revision:'1',fixture:true,label:'SYNTHETIC GME',basisIdentity:'synthetic-regular'},pending:false,close:10,viewport:{from:1,to:2},panes:[{id:'price',top:0,height:200}],readout:new Map([['synthetic-study',3]])};
 const chart={getDataWindow:()=>({pending:state.pending,source:state.source,series:{count:2},standard:{close:state.close},displayed:{close:state.close},readout:state.readout,crosshair:null}),getStyle:()=> 'candles',getViewport:()=>state.viewport,paneGeometry:()=>state.panes} as unknown as ChartController;
 const owner={},binding=():SnapshotBinding=>({owner,chart,sourceKey:snapshotSourceKey(state.source,'candles'),seriesKey:snapshotSeriesKey(chart)});
 return{state,chart,binding};
}
const empty=()=>({texts:[],boxes:[],badges:[]});
it('publishes immutable already displayed values only for the exact owner/controller',()=>{
 const a=fixture(),b=fixture(),scene=empty(),token={};expect(publishSnapshotScene(a.binding(),'legend',token,scene)).toBe(true);scene.badges.push({} as never);
 expect(requireSnapshotScene(a.binding(),'legend').badges).toHaveLength(0);expect(()=>requireSnapshotScene(b.binding(),'legend')).toThrow('updating');
});
it('rejects changed source/session, same-count corrections and study readout corrections',()=>{
 const f=fixture();publishSnapshotScene(f.binding(),'legend',{},empty());f.state.source={...f.state.source,basisIdentity:'synthetic-extended'};expect(()=>requireSnapshotScene(f.binding(),'legend')).toThrow('updating');
 publishSnapshotScene(f.binding(),'legend',{},empty());f.state.close=11;expect(()=>requireSnapshotScene(f.binding(),'legend')).toThrow('updating');
 publishSnapshotScene(f.binding(),'legend',{},empty());f.state.readout.set('synthetic-study',4);expect(()=>requireSnapshotScene(f.binding(),'legend')).toThrow('updating');
});
it('rejects source updates and viewport/pane resizes before publication',()=>{
 const f=fixture();publishSnapshotScene(f.binding(),'events',{},empty());f.state.pending=true;expect(snapshotSeriesKey(f.chart)).toBeNull();expect(()=>requireSnapshotScene(f.binding(),'events')).toThrow('updating');
 f.state.pending=false;f.state.viewport={from:2,to:3};expect(()=>requireSnapshotScene(f.binding(),'events')).toThrow('updating');publishSnapshotScene(f.binding(),'events',{},empty());f.state.panes[0].height=300;expect(()=>requireSnapshotScene(f.binding(),'events')).toThrow('updating');
});
it('new owner publication survives an old cleanup; changed DOM/geometry refuses synchronously',()=>{
 const f=fixture(),old={},next={};let current=true;publishSnapshotScene(f.binding(),'legend',old,empty());publishSnapshotScene(f.binding(),'legend',next,empty(),()=>current);clearSnapshotScene(f.binding(),'legend',old);expect(requireSnapshotScene(f.binding(),'legend')).toEqual(empty());current=false;expect(()=>requireSnapshotScene(f.binding(),'legend')).toThrow('updating');
});
it('Undo, Redo and restored sources require a publication for each displayed state',()=>{
 const f=fixture(),a={...f.state.source},b={...a,revision:'2'};
 for(const source of [a,b,a,b,{...a,revision:'saved-layout'}]){f.state.source=source;expect(publishSnapshotScene(f.binding(),'legend',{},empty())).toBe(true);expect(requireSnapshotScene(f.binding(),'legend')).toEqual(empty());}
});

it('the native screenshot step cannot change the price scale before PNG/bridge publication even when every optional overlay is hidden',()=>{
 const f=fixture(),scale={offset:0};(f.chart as any).pricePaneProjection=()=>({left:0,top:0,width:400,height:200,scaleSide:'right',priceToY:(price:number)=>200-price+scale.offset});
 const guard=captureSnapshotGuard(f.binding()),painted:string[]=[],screenshotCanvas=()=>{scale.offset=20;return{width:400,height:200};};
 const exportSynthetic=()=>{screenshotCanvas();guard();painted.push('paint','png','bridge');};expect(exportSynthetic).toThrow('geometry is updating');expect(painted).toEqual([]);
});
it('the final overlay callback revalidates captured channels after native rendering and rejects replacement scenes',()=>{
 const f=fixture();let current=true;publishSnapshotScene(f.binding(),'legend',{},empty(),()=>current);const guard=captureSnapshotGuard(f.binding(),['legend']);current=false;expect(guard).toThrow('legend is updating');current=true;publishSnapshotScene(f.binding(),'legend',{},empty());expect(guard).toThrow('overlays are updating');
});
