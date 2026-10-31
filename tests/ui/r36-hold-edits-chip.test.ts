import {beforeEach,expect,it,vi} from 'vitest';
import {createDrawing,type SerializedDrawing} from '@luxalgo/vela';

// (fail-first): the Bars pattern interval chip during the routine background autosave. The save holds the
// chart, whose updateDrawingEdit then refuses ("Drawing editing is unavailable while the chart is busy or unavailable"), so
// the choice was refused. The chip now hands the choice to the host's held-input queue (deferEdit; App: queueDrawingEdit over
// the ACTUAL held-key gate, src/ui/held-key-gate.ts) and applies it, as chosen, when the write ends. The real chip function
// runs with controlled hooks; the chart is a controlled stand-in over the actual drawing port. SYNTHETIC datasets only.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];}};});
const {BarsPatternResolutionChip}=await import('../../src/ui/BarsPatternSource');
const {createHeldKeyGate}=await import('../../src/ui/held-key-gate');
const {drawingEditor,patchDrawingEdit}=await import('../../src/chart/drawing-port');
const {sourceContextForDataset}=await import('../../src/chart/source-context');
const {LV_BARS_PATTERN}=await import('../../src/chart/lv-types/bars-pattern');
const {readBarsPattern}=await import('../../src/chart/lv-types/bars-pattern-data');
const {clearStagedBarsPatternRequests}=await import('../../src/chart/lv-types/bars-pattern-request');
const {DAY,D0,day,daily,dailyBars,dataset,minuteBars}=await import('../helpers/barspat-fixture');

const text=(node:any):string=>typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';
function findAll(node:any,predicate:(node:any)=>boolean,out:any[]=[]):any[]{if(Array.isArray(node))node.forEach(child=>findAll(child,predicate,out));else if(node?.props){if(predicate(node))out.push(node);findAll(node.props.children,predicate,out);}return out;}
const projection={width:600,height:400,xOf:(t:number)=>20+(t/1000-D0)/DAY*10,yOf:(p:number)=>300-p,pxToPoint:()=>({time:0,price:0}),paneIdAtY:()=>'price',
 barsInRange:(from:number,to:number)=>dailyBars(0,30).filter(bar=>bar.time*1000>=from&&bar.time*1000<=to).map(bar=>({...bar,time:bar.time*1000}))} as never;
function placed():SerializedDrawing{
 const draft=createDrawing(LV_BARS_PATTERN as never,{id:'pattern',paneId:'price',anchors:[{time:day(5)*1000,price:120},{time:day(9)*1000,price:120}]})!;
 draft.onPlaced(projection);return draft.serialize();
}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;clearStagedBarsPatternRequests();});

function setup(){
 let record=placed();const d=daily(),bars=d.bars,context=sourceContextForDataset(d),minutes=dataset('m-a','1m',minuteBars(5,15));
 const write={held:false},waiters:Array<()=>void>=[],reports:string[]=[];
 const update=vi.fn((_id:string,patch:any,coordinates:any,offset:any)=>{if(write.held)throw Error('Drawing editing is unavailable while the chart is busy or unavailable.');record=patchDrawingEdit(record,bars,patch,coordinates,offset);return{accepted:true,changed:true};});
 const chart:any={getDrawingEditor:()=>({...drawingEditor(record,bars),recordFingerprint:JSON.stringify(record)}),getSourceBars:()=>bars,getSourceContext:()=>context,updateDrawingEdit:update};
 const gate=createHeldKeyGate({state:()=>write.held?'background':'idle',afterWrite:run=>{waiters.push(run);return()=>{};},capture:()=>()=>true,run:()=>{},report:message=>{reports.push(message);}});
 const props={chart,id:'pattern',data:{datasets:[d,minutes]},onChange:vi.fn(),onMessage:vi.fn(),deferEdit:(run:()=>void)=>gate.defer({run})};
 const render=()=>{hooks.cursor=0;return BarsPatternResolutionChip(props)!;};
 const resolution=()=>findAll(render(),node=>node.props['aria-label']==='Pattern interval')[0];
 const endWrite=()=>{write.held=false;for(const run of waiters.splice(0))run();};
 return{props,update,render,resolution,write,endWrite,reports,record:()=>record};
}

it('a chip choice made during the write waits for it, then applies once as chosen (it was refused)',()=>{
 const s=setup();s.render();
 s.write.held=true;
 s.resolution().props.onChange({target:{value:'1m'}});
 expect(text(s.render()),'no refusal while the write runs').not.toContain('unavailable while the chart is busy');
 expect(s.props.onMessage).not.toHaveBeenCalledWith(expect.stringContaining('unavailable while the chart is busy'));
 const applied=s.update.mock.calls.length;
 s.endWrite();
 expect(s.update.mock.calls.length-applied,'applied once when the write ends').toBeGreaterThanOrEqual(1);
 expect(s.props.onChange,'one workspace capture').toHaveBeenCalledTimes(1);
 const read=readBarsPattern(s.record().props);
 expect(read.state==='supported'&&read.member.source?.resolution).toBe('1m');
 expect(s.reports).toEqual([]);
});

it('outside the write the chip applies at once, as before',()=>{
 const s=setup();s.render();
 s.resolution().props.onChange({target:{value:'1m'}});
 expect(s.props.onChange).toHaveBeenCalledTimes(1);
 const read=readBarsPattern(s.record().props);
 expect(read.state==='supported'&&read.member.source?.resolution).toBe('1m');
});
