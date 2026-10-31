import {afterEach,expect,it,vi} from 'vitest';
import {hiddenIndicatorHarness} from './hidden-indicator-harness';
import {createRendererContextPort} from '../../src/chart/renderer-context';
import {fixtureDataset} from '../../src/domain/fixtures';

// the chart right-click context geometry with the main price
// scale on the left (LV-VELA-SCALE-LEFT-1). SYNTHETIC native geometry on the unmounted harness renderer (one price pane, no
// indicator); no DOM, canvas or GUI claim.
let cleanup:Array<()=>void>=[];
afterEach(()=>{for(const dispose of cleanup)dispose();cleanup=[];vi.unstubAllGlobals();});
const dataset=fixtureDataset('GME',3);
type Harness=Awaited<ReturnType<typeof hiddenIndicatorHarness>>;
/** One price pane in 300 CSS px on a 400 px data area; the plot starts at client x 10 (after any left gutter). */
function geometry(h:Harness,rightAxis:number){
 const r=h.native,pane=r.scene.panes.get('price');
 Object.assign(pane,{bounds:{top:0,height:300},scale:{min:100,max:200},initialized:true});
 r.coords={times:dataset.bars.map(bar=>bar.time*1000),widthPx:400,dataHeightPx:300,pitchScale:1,viewport:{barSpacing:20,rightOffset:0}};
 r.rightAxisW=rightAxis;r.plot={getBoundingClientRect:()=>({left:10,top:20,width:400+rightAxis,height:326})};r.userDrawings=null;
}
async function setup(side:'left'|'right'){
 vi.stubGlobal('document',{createElement:()=>({className:'',style:{},setAttribute(){},appendChild(){}})});
 const h=await hiddenIndicatorHarness();cleanup.push(h.dispose);
 if(side==='left'){h.native.lvSetMainScaleSide('left');expect(h.native.rightAxisW).toBe(0);expect(h.native.lvLeftScaleWidth()).toBe(64);}
 geometry(h,side==='left'?0:64);
 return{h,port:createRendererContextPort(h.renderer,h.modelAbsence)};
}

it('accepts the left geometry (right gutter 0 on one pane) and the signature differs between sides',async()=>{
 const left=await setup('left'),right=await setup('right');
 expect(()=>left.port.signature(left.h.inventory())).not.toThrow();
 const a=JSON.parse(left.port.signature(left.h.inventory())),b=JSON.parse(right.port.signature(right.h.inventory()));
 expect(a.mainSide).toBe('left');expect(Object.hasOwn(b,'mainSide')).toBe(false);
 expect(left.port.signature(left.h.inventory())).not.toBe(right.port.signature(right.h.inventory()));
});
it('a press on the left column (x=-10) is the price axis with a price from the pane scale',async()=>{
 const {h,port}=await setup('left');
 const result=port.capture(h.inventory(),dataset.bars,{x:0,y:20+150});
 expect(result.local).toEqual({x:-10,y:150});
 expect(result.entity).toEqual({kind:'price-axis',pane:{kind:'price'},columnOwner:null,unit:'price'});
 expect(result.point.price).toBeCloseTo(150,9);expect(result.point.unit).toBe('price');
 expect(port.capture(h.inventory(),dataset.bars,{x:10-64,y:20+30}).entity.kind).toBe('price-axis');
});
it('below the panes on the left is the corner; left of the gutter is still rejected',async()=>{
 const {h,port}=await setup('left');
 expect(port.capture(h.inventory(),dataset.bars,{x:0,y:20+310}).entity).toEqual({kind:'corner'});
 expect(()=>port.capture(h.inventory(),dataset.bars,{x:10-65,y:20+150})).toThrow(/outside the native chart/);
});
it('without the left side, x<0 is still rejected and an empty right gutter is accepted (no column to attribute)',async()=>{
 const {h,port}=await setup('right');
 expect(()=>port.capture(h.inventory(),dataset.bars,{x:0,y:20+150})).toThrow(/outside the native chart/);
 geometry(h,0);expect(()=>port.signature(h.inventory())).not.toThrow();
 expect(port.capture(h.inventory(),dataset.bars,{x:10+200,y:20+150}).entity).toEqual({kind:'chart'});
});
it('the blank right master slot of the price pane (right gutter kept at 64 px) is the chart with no price',async()=>{
 // With a study pane the right gutter stays 64 px and the price pane's master slot there is blank; the slot rule is the
 // price pane's, so the SYNTHETIC geometry keeps one pane and a 64 px right gutter.
 const {h}=await setup('left');geometry(h,64);
 const port=createRendererContextPort(h.renderer,h.modelAbsence);
 const result=port.capture(h.inventory(),dataset.bars,{x:10+410,y:20+150});
 expect(result.entity).toEqual({kind:'chart'});expect(result.point.price).toBeNull();
 expect(port.capture(h.inventory(),dataset.bars,{x:10+200,y:20+150}).entity).toEqual({kind:'chart'});
});
