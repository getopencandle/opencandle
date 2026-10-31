import {afterEach,expect,it,vi} from 'vitest';
import {hiddenIndicatorHarness} from './hidden-indicator-harness';
import {factoryIndicatorDefault} from '../../src/ui/indicator-library';
import {createRendererContextPort} from '../../src/chart/renderer-context';
import {contextMenuRefusalText,CONTEXT_MENU_UNAVAILABLE_TEXT} from '../../src/ui/ChartPanel';
import {fixtureDataset} from '../../src/domain/fixtures';
import type {IndicatorScaleSide} from '../../src/chart/indicator-scale';

// The chart right-click must open for any right gutter width. Regression: a private-scale indicator placed on
// "No scale" (or left, or sharing another's scale) has no right column, so Vela's gutter is 64 px while the reader
// counted one column and refused every plot right-click. SYNTHETIC native geometry on the unmounted harness renderer;
// no DOM, canvas or GUI claim.
let cleanup:Array<()=>void>=[];
afterEach(()=>{for(const dispose of cleanup)dispose();cleanup=[];vi.unstubAllGlobals();});
const dataset=fixtureDataset('GME',3);
type Harness=Awaited<ReturnType<typeof hiddenIndicatorHarness>>;
/** Native gutter width as Vela computes it (refreshAxisWidth), unless a width is forced. */
function geometry(h:Harness,forced?:number){
 const r=h.native,panes=[...r.scene.panes.values()].sort((a:any,b:any)=>a.order-b.order),each=300/panes.length;
 panes.forEach((pane:any,index:number)=>Object.assign(pane,{bounds:{top:index*each,height:each},scale:{min:100,max:200},initialized:true}));
 const axis=forced??r.lvRightAxisWidth(64+56*r.maxOwnScaleColumns());
 r.coords={times:dataset.bars.map(bar=>bar.time*1000),widthPx:400,dataHeightPx:300,pitchScale:1,viewport:{barSpacing:20,rightOffset:0}};
 r.rightAxisW=axis;r.plot={getBoundingClientRect:()=>({left:10,top:20,width:400+axis,height:326})};r.userDrawings=null;
 return axis;
}
async function setup(side:IndicatorScaleSide){
 vi.stubGlobal('document',{createElement:()=>({className:'',style:{},setAttribute(){},appendChild(){}})});
 const h=await hiddenIndicatorHarness();cleanup.push(h.dispose);
 const id=await h.add('volume',factoryIndicatorDefault('volume'));h.port.setScale(id,side);await h.settle();
 return{h,id,port:createRendererContextPort(h.renderer,h.modelAbsence)};
}

for(const side of ['none','left'] as const)it(`a "${side}" private scale has no right column: the plot and the price axis still capture`,async()=>{
 const {h,id,port}=await setup(side);
 expect(h.model(id).ownScale).toBe(true);expect(h.native.maxOwnScaleColumns()).toBe(0);
 // A rendered private scale has its scale window whatever its placement (the live chart state).
 h.native.scene.ensureIndicatorScale(h.row(id).rendererId,{min:0,max:5000});
 expect(geometry(h)).toBe(64);
 expect(()=>port.signature(h.inventory())).not.toThrow();
 expect(port.capture(h.inventory(),dataset.bars,{x:200,y:60}).entity.kind).toBe('chart');
 expect(port.capture(h.inventory(),dataset.bars,{x:10+430,y:60}).entity).toMatchObject({kind:'price-axis',columnOwner:null});
});

it('a right private scale still attributes its own column',async()=>{
 const {h,id,port}=await setup('own');
 expect(geometry(h)).toBe(64+56)
 const owner=port.capture(h.inventory(),dataset.bars,{x:10+400+64+10,y:20+200}).entity;
 expect(owner).toMatchObject({kind:'price-axis',columnOwner:{id}});
 expect(port.capture(h.inventory(),dataset.bars,{x:10+400+10,y:20+200}).entity).toMatchObject({kind:"price-axis",columnOwner:null});
});

it('a right gutter width outside 64+56n degrades to the pane scale instead of refusing the menu',async()=>{
 const {h,port}=await setup('own');
 for(const width of [0,64,96,150,64+56*3]){
  geometry(h,width);
  expect(()=>port.signature(h.inventory())).not.toThrow();
  expect(port.capture(h.inventory(),dataset.bars,{x:200,y:60}).entity.kind).toBe('chart');
  if(width>0)expect(port.capture(h.inventory(),dataset.bars,{x:10+400+width-2,y:60}).entity).toMatchObject({kind:'price-axis',columnOwner:null});
 }
 geometry(h,96);expect(JSON.parse(port.signature(h.inventory())).columnLayout).toBe(false);
});

it('a native geometry refusal never reaches the user as reader wording',()=>{
 const debug=vi.spyOn(console,'debug').mockImplementation(()=>{});
 try{
  expect(contextMenuRefusalText(Error('Pinned native axis-column signature changed'))).toBe(CONTEXT_MENU_UNAVAILABLE_TEXT);
  expect(contextMenuRefusalText(Error('Native context bounds are not settled'))).toBe(CONTEXT_MENU_UNAVAILABLE_TEXT);
  expect(debug).toHaveBeenCalled();
  expect(contextMenuRefusalText(Error('Context target is not ready. Wait for this chart input to commit.'))).toBe('Context target is not ready. Wait for this chart input to commit.');
 }finally{debug.mockRestore();}
});
