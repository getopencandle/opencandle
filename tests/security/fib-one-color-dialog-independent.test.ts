import {beforeEach,expect,it,vi} from 'vitest';
import {createDrawing} from '@luxalgo/vela';
import {DrawingDialog} from '../../src/ui/DrawingDialog';
import {ColorControl} from '../../src/ui/ColorControl';
import {drawingEditor,patchDrawingEdit} from '../../src/chart/drawing-port';
import {fixtureDataset} from '../../src/domain/fixtures';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {nativeFibTrendLineDefaults} from '../../src/chart/fib-level-format-native';

// Separate controlled hook banks execute both original component bodies.
// This is handler/composition evidence, not a DOM or executable-window test.
const hooks=vi.hoisted(()=>({active:'dialog',banks:{} as Record<string,{cells:any[];cursor:number;writes:number}>}));
vi.mock('react',async()=>{
 const actual=await vi.importActual<any>('react');
 const bank=()=>hooks.banks[hooks.active]??=( {cells:[],cursor:0,writes:0});
 return {...actual,useRef:(initial:any)=>{const b=bank(),i=b.cursor++;if(!(i in b.cells))b.cells[i]={current:initial};return b.cells[i];},
  useState:(initial:any)=>{const b=bank(),i=b.cursor++;if(!(i in b.cells))b.cells[i]=typeof initial==='function'?initial():initial;return[b.cells[i],(value:any)=>{b.writes++;b.cells[i]=typeof value==='function'?value(b.cells[i]):value;}];},useEffect:()=>{bank().cursor++;}};
});
const text=(n:any):string=>typeof n==='string'?n:Array.isArray(n)?n.map(text).join(''):n?.props?text(n.props.children):'';
function find(n:any,p:(n:any)=>boolean):any{if(Array.isArray(n)){for(const c of n){const a=find(c,p);if(a)return a;}}else if(n?.props){if(p(n))return n;return find(n.props.children,p);}return null;}
const renderBank=(name:string,body:()=>any)=>{hooks.active=name;(hooks.banks[name]??={cells:[],cursor:0,writes:0}).cursor=0;return body();};
const submit=(form:any)=>form.props.onSubmit({preventDefault(){},nativeEvent:{isComposing:false}});
function fixture(prepare?:(record:any)=>void){
 const dataset=fixtureDataset('SYNTHETIC-FIB',4),bars=dataset.bars,source=sourceContextForDataset(dataset);
 let record:any=createDrawing('fibretracement',{id:'SYNTHETIC-FIB',paneId:'price',anchors:[{time:bars[0].time*1000,price:10},{time:bars[2].time*1000,price:20}]})!.serialize();
 record.props??={};record.props.levels=Array.from({length:5},(_,i)=>({ratio:i===0?-0:(i-2)/2,color:i%2?'#12345680':'#abcdef',enabled:i%2===0,label:'SYNTHETIC '+i,opaque:{own:undefined,zero:-0}}));
 prepare?.(record);
 const update=vi.fn((_id:string,properties:any,coordinates:any,offset:any)=>{record=patchDrawingEdit(record,bars,properties,coordinates,offset);return{accepted:true,changed:Object.keys(properties).length>0};});
 const props:any={id:record.id,ownerToken:{},isCurrent:()=>true,assertOwner:()=>{},onClose:vi.fn(),onChange:vi.fn(),chart:{getDrawingEditor:()=>({...drawingEditor(record,bars),recordFingerprint:JSON.stringify(record)}),getSourceBars:()=>bars,getSourceContext:()=>source,updateDrawingEdit:update}};
 const render=()=>renderBank('dialog',()=>DrawingDialog(props));
 const button=(label:string)=>find(render(),n=>n.type==='button'&&text(n)===label);
 const common=()=>find(render(),n=>n.type===ColorControl&&n.props.label==='All Fibonacci lines');
 const picker=()=>{const element=common();return renderBank('picker',()=>ColorControl(element.props));};
 return{props,render,button,common,picker,record:()=>record,update,form:()=>find(render(),n=>n.type==='form'),level:(i:number)=>find(render(),n=>n.props['data-property']==='levels.'+i+'.color')};
}
beforeEach(()=>{hooks.active='dialog';hooks.banks={};});

it('composes the mixed parent presentation with a usable palette and disabled raw RGB/opacity',()=>{
 const ui=fixture();ui.button('Levels').props.onClick();
 expect(text(ui.common())).toBe('Mixed');expect(ui.common().props.value).toBe('');
 find(ui.picker(),n=>n.props['aria-label']==='Choose All Fibonacci lines color').props.onClick();
 const tree=ui.picker(),rgb=find(tree,n=>n.props['aria-label']==='All Fibonacci lines custom RGB'),alpha=find(tree,n=>n.props['aria-label']==='All Fibonacci lines color opacity');
 expect(rgb.props.disabled).toBe(true);expect(alpha.props.disabled).toBe(true);
 const before=hooks.banks.dialog.writes;alpha.props.onChange({target:{value:'35'}});
 expect(hooks.banks.dialog.writes).toBe(before);expect(ui.update).not.toHaveBeenCalled();expect(ui.common().props.value).toBe('');
 expect(find(tree,n=>n.props['aria-label']==='Use #3d8edb')).not.toBeNull();
});

it('uses actual child palette and opacity handlers to stage RGB35% on every disabled and enabled level once',()=>{
 const ui=fixture(),before=structuredClone(ui.record());ui.button('Levels').props.onClick();
 find(ui.picker(),n=>n.props['aria-label']==='Choose All Fibonacci lines color').props.onClick();
 const writes=hooks.banks.dialog.writes;
 find(ui.picker(),n=>n.props['aria-label']==='Use #3d8edb').props.onClick();
 expect(hooks.banks.dialog.writes-writes).toBe(1);expect(ui.common().props.value).toBe('rgba(61,142,219,1)');
 const alpha=find(ui.picker(),n=>n.props['aria-label']==='All Fibonacci lines color opacity');expect(alpha.props.disabled).toBe(false);alpha.props.onChange({target:{value:'35'}});
 expect(ui.common().props.value).toBe('rgba(61,142,219,0.35)');expect(ui.update).not.toHaveBeenCalled();expect(ui.record()).toEqual(before);
 submit(ui.form());expect(ui.update).toHaveBeenCalledTimes(1);
 const changed=Object.keys(ui.update.mock.calls[0][1]);expect(changed.filter(key=>key.startsWith('levels.'))).toEqual(Array.from({length:5},(_,i)=>'levels.'+i+'.color'));expect([...changed].sort()).toEqual([...Array.from({length:5},(_,i)=>'levels.'+i+'.color'),'lvFibTrendLine.color'].sort());
 expect(ui.record().props.lvFibTrendLine).toStrictEqual({...before.props.lvFibTrendLine,color:'rgba(61,142,219,0.35)'});expect(ui.record().props.lvFibTrendLine.enabled).toBe(true);// the recorded facts trendline.visible: a fresh Fib's trend line is visible.
 for(let i=0;i<5;i++){const level=ui.record().props!.levels[i];expect(level.color).toBe('rgba(61,142,219,0.35)');expect(level.enabled).toBe(i%2===0);expect(Object.hasOwn(level.opaque,'own')).toBe(true);expect(Object.is(level.opaque.zero,-0)).toBe(true);}
});

it('retained child palette and opacity handlers cannot revive a cancelled parent',()=>{
 const ui=fixture(),before=structuredClone(ui.record());ui.button('Levels').props.onClick();
 find(ui.picker(),n=>n.props['aria-label']==='Choose All Fibonacci lines color').props.onClick();
 const old=find(ui.picker(),n=>n.props['aria-label']==='Use #3d8edb').props.onClick;
 ui.button('Cancel').props.onClick();const writes=hooks.banks.dialog.writes;old();
 expect(hooks.banks.dialog.writes).toBe(writes);expect(ui.record()).toEqual(before);expect(ui.update).not.toHaveBeenCalled();
});

it('a common choice replaces an invalid individual draft without changing other level fields',()=>{
 const ui=fixture(),before=structuredClone(ui.record());ui.button('Levels').props.onClick();ui.level(2).props.onChange({target:{value:'Mixed'}});
 submit(ui.form());expect(ui.update).toHaveBeenCalledTimes(1);expect(ui.record()).toEqual(before);expect(ui.props.onClose).not.toHaveBeenCalled();
 ui.common().props.onChange('transparent');submit(ui.form());
 expect(ui.update).toHaveBeenCalledTimes(2);expect(ui.record().props!.levels.every((x:any)=>x.color==='transparent')).toBe(true);
 expect(ui.record().props.lvFibTrendLine).toStrictEqual({...before.props.lvFibTrendLine,color:'transparent'});
});

it('keeps legacy baseline omission on an effective same-color choice with valid uniform retained levels',()=>{
 const ui=fixture(record=>{delete record.props.lvFibTrendLine;for(const level of record.props.levels)level.color=nativeFibTrendLineDefaults().color;}),before=structuredClone(ui.record());ui.button('Levels').props.onClick();
 expect(ui.common()).not.toBeNull();expect(ui.common().props.value).toBe(nativeFibTrendLineDefaults().color);
 ui.common().props.onChange(nativeFibTrendLineDefaults().color);submit(ui.form());
 expect(ui.update).toHaveBeenCalledTimes(1);expect(ui.update.mock.calls[0][1]).toEqual({});expect(ui.record()).toStrictEqual(before);expect(Object.hasOwn(ui.record().props,'lvFibTrendLine')).toBe(false);
});

it('retains empty imported levels as editor-unavailable without inventing baseline state or a command',()=>{
 const ui=fixture(record=>{record.props.levels=[];delete record.props.lvFibTrendLine;}),before=structuredClone(ui.record());
 expect(text(ui.render())).toContain('Fib levels require bounded ordinal slots');expect(ui.common()).toBeNull();expect(ui.button('Levels')).toBeNull();expect(ui.form()).toBeNull();
 ui.button('Close').props.onClick();expect(ui.update).not.toHaveBeenCalled();expect(ui.record()).toStrictEqual(before);expect(Object.hasOwn(ui.record().props,'lvFibTrendLine')).toBe(false);
});

it('withholds the full common action for an opaque baseline while preserving individual level editing',()=>{
 const opaque={schemaVersion:2,future:{own:undefined,zero:-0}},ui=fixture(record=>{record.props.lvFibTrendLine=opaque;}),before=structuredClone(ui.record());ui.button('Levels').props.onClick();
 expect(ui.common()).toBeNull();expect(text(ui.render())).toContain('Unsupported Fibonacci trend line');ui.level(2).props.onChange({target:{value:'#112233'}});submit(ui.form());
 expect(ui.update.mock.calls[0][1]).toEqual({'levels.2.color':'#112233'});expect(ui.record().props.lvFibTrendLine).toStrictEqual(opaque);expect(Object.hasOwn(ui.record().props.lvFibTrendLine.future,'own')).toBe(true);expect(Object.is(ui.record().props.lvFibTrendLine.future.zero,-0)).toBe(true);
 for(let i=0;i<5;i++)expect(ui.record().props.levels[i]).toStrictEqual(i===2?{...before.props.levels[i],color:'#112233'}:before.props.levels[i]);
});

it('a source-owner callback replacing the dialog during staging cannot erase its newer common-color draft',()=>{
 const ui=fixture();ui.button('Levels').props.onClick();
 let reads=0,armed=true;
 ui.props.isCurrent=()=>{
  if(armed&&++reads===2){armed=false;ui.props.ownerToken={};ui.render();ui.button('Levels').props.onClick();ui.common().props.onChange('#123456');}
  return true;
 };
 const old=ui.common().props.onChange;old('#abcdef');
 expect(ui.button('Levels').props.className).toBe('active');expect(ui.common()).not.toBeNull();expect(ui.common().props.value).toBe('#123456');expect(ui.update).not.toHaveBeenCalled();
});
