import {defaultDrawingVisibilityV2} from '../../src/chart/drawing-visibility';
import {beforeEach,expect,it,vi} from 'vitest';
import {createDrawing,type DrawingTypeKey} from '@luxalgo/vela';
import {DrawingDialog} from '../../src/ui/DrawingDialog';
import {Modal} from '../../src/ui/Modal';
import {ColorControl} from '../../src/ui/ColorControl';
import {drawingEditor,patchDrawingEdit} from '../../src/chart/drawing-port';
import {DrawingEditRecoveryError} from '../../src/chart/drawing-edit-transaction';
import {fixtureDataset} from '../../src/domain/fixtures';
import {sourceContextForDataset} from '../../src/chart/source-context';
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>,writes:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{hooks.writes++;hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];},useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},useEffect:(effect:()=>unknown)=>{const index=hooks.cursor++;if(!(index in hooks.cells)){hooks.cells[index]=true;hooks.effects.push(effect);}}};});
const text=(node:any):string=>typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';
function find(node:any,predicate:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const result=find(child,predicate);if(result)return result;}}else if(node?.props){if(predicate(node))return node;return find(node.props.children,predicate);}return null;}
function fixture(type:DrawingTypeKey='trendline',emptyBars=false){
 const dataset=fixtureDataset('GME',4),recordAnchors=[{time:dataset.bars[0].time*1000,price:100},{time:dataset.bars[2].time*1000,price:120}];if(emptyBars)dataset.bars=[];
 const bars=dataset.bars,source=sourceContextForDataset(dataset);let record=createDrawing(type,{id:'line',paneId:'price',anchors:['hline','vline','hray'].includes(type)?recordAnchors.slice(0,1):recordAnchors})!.serialize();
 const update=vi.fn((id:string,patch:any,coordinates:any,offset:any,_visibility?:unknown)=>{record=patchDrawingEdit(record,bars,patch,coordinates,offset);return{accepted:true};});
 const chart={getDrawingEditor:()=>({...drawingEditor(record,bars),recordFingerprint:JSON.stringify(record),sourceResolution:dataset.resolution}),getSourceBars:()=>bars,getSourceContext:()=>source,updateDrawingEdit:update};
 const props:any={chart,id:'line',ownerToken:{},isCurrent:()=>true,onClose:vi.fn(),onChange:vi.fn(),assertOwner:vi.fn()};
 const render=()=>{hooks.cursor=0;return DrawingDialog(props);},form=()=>find(render(),node=>node.type==='form');
 const button=(label:string)=>find(render(),node=>node.type==='button'&&text(node)===label);
 const color=()=>find(render(),node=>node.type==='input'&&node.props.value===drawingEditor(record,bars).values['style.lineColor']);
 return{props,render,form,button,color,update,record:()=>record,source};
}
const submit=(form:any,isComposing=false)=>form.props.onSubmit({preventDefault(){},nativeEvent:{isComposing}});
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];hooks.writes=0;});
it('Trendline text controls occupy a separate Text tab while the shared draft survives switching',()=>{
 const ui=fixture(),field=(path:string)=>find(ui.render(),node=>node.props['data-property']===path);
 expect(ui.button('Style').props.className).toBe('active');expect(field('text.value')).toBeNull();field('style.lineWidth').props.onChange({target:{value:'5'}});
 ui.button('Text').props.onClick();expect(field('style.lineWidth')).toBeNull();for(const path of ['text.value','text.color','text.size','text.bold','text.italic','text.place','text.side','text.lvAnnotation.enabled'])expect(field(path),path).not.toBeNull();
 field('text.value').props.onChange({target:{value:'SYNTHETIC tab draft'}});ui.button('Style').props.onClick();expect(field('style.lineWidth').props.value).toBe('5');ui.button('Text').props.onClick();expect(field('text.value').props.value).toBe('SYNTHETIC tab draft');expect(ui.update).not.toHaveBeenCalled();submit(ui.form());expect(ui.record().style.lineWidth).toBe(5);expect(ui.record().text?.value).toBe('SYNTHETIC tab draft');expect(ui.update).toHaveBeenCalledTimes(1);
});
it('tab navigation retires old field callbacks and Reset restores every tab without switching away',()=>{
 const ui=fixture(),field=(path:string)=>find(ui.render(),node=>node.props['data-property']===path),old=field('style.lineWidth').props.onChange;
 ui.button('Text').props.onClick();const writes=hooks.writes;old({target:{value:'9'}});expect(hooks.writes).toBe(writes);field('text.value').props.onChange({target:{value:'SYNTHETIC discarded'}});ui.button('Reset').props.onClick();expect(ui.button('Text').props.className).toBe('active');expect(field('text.value').props.value).toBe('');ui.button('Style').props.onClick();expect(field('style.lineWidth').props.value).toBe('2');ui.button('Text').props.onClick();submit(ui.form());expect(ui.update.mock.calls[0][1]).toEqual({});
});
it('cancel and modal Escape callbacks discard the multi-tab draft without publishing',()=>{
 for(const action of ['Cancel','Escape']){hooks.cells=[];hooks.cursor=0;const ui=fixture();ui.color().props.onChange({target:{value:'#123456'}});ui.button('Text').props.onClick();find(ui.render(),node=>node.props['data-property']==='text.value').props.onChange({target:{value:'SYNTHETIC discard'}});const old=ui.form();if(action==='Cancel')ui.button('Cancel').props.onClick();else find(ui.render(),(node:any)=>node.type===Modal).props.onClose();submit(old);expect(ui.update).not.toHaveBeenCalled();expect(ui.props.onClose).toHaveBeenCalledTimes(1);}
});
it('Ray follows its recorded dialog: text settings on a Text tab, line settings on Style',()=>{
 const ui=fixture('ray');expect(ui.button('Text')).not.toBeNull();expect(find(ui.render(),node=>node.props['data-property']==='text.value')).toBeNull();expect(find(ui.render(),node=>node.props['data-property']==='style.lineColor')).not.toBeNull();
 ui.button('Text').props.onClick();expect(find(ui.render(),node=>node.props['data-property']==='text.value')).not.toBeNull();expect(find(ui.render(),node=>node.props['data-property']==='style.lineColor')).toBeNull();
});
it('a tool with no recorded dialog keeps its current field locations',()=>{
 const ui=fixture('hline');expect(ui.button('Text')).toBeNull();expect(find(ui.render(),node=>node.props['data-property']==='text.value')).not.toBeNull();expect(find(ui.render(),node=>node.props['data-property']==='style.lineColor')).not.toBeNull();
});
it('Text enabled stages a retaining flag and Reset restores the opening value before Apply',()=>{
 const ui=fixture(),control=()=>find(ui.render(),node=>node.props['data-property']==='text.lvAnnotation.enabled');ui.button('Text').props.onClick();expect(control().props.checked).toBe(true);
 control().props.onChange({target:{checked:false}});expect(ui.update).not.toHaveBeenCalled();ui.button('Reset').props.onClick();expect(control().props.checked).toBe(true);control().props.onChange({target:{checked:false}});submit(ui.form());expect((ui.record().text as any).lvAnnotation).toEqual({schemaVersion:1,enabled:false});expect(ui.update.mock.calls[0][1]).toEqual({'text.lvAnnotation.enabled':false});
});
it('unknown Trendline annotation metadata is explained without presenting an editable toggle',()=>{
 const ui=fixture();(ui.record() as any).text={value:'retained',lvAnnotation:{schemaVersion:99,enabled:false}};expect(text(ui.render())).toContain('Unknown or invalid text.lvAnnotation');ui.button('Text').props.onClick();expect(find(ui.render(),node=>node.props['data-property']==='text.lvAnnotation.enabled')).toBeNull();ui.button('Style').props.onClick();ui.color().props.onChange({target:{value:'#aabbcc'}});submit(ui.form());expect((ui.record().text as any).lvAnnotation).toEqual({schemaVersion:99,enabled:false});
});
it('cancellation retires retained Apply and every repeated close callback',()=>{
 const ui=fixture(),old=ui.form(),cancel=ui.button('Cancel').props.onClick;cancel();cancel();submit(old);expect(ui.update).not.toHaveBeenCalled();expect(ui.props.onChange).not.toHaveBeenCalled();expect(ui.props.onClose).toHaveBeenCalledTimes(1);
});
it('changed drafts retire an old Apply while current typed color edits commit exactly once',()=>{
 const ui=fixture(),old=ui.form();ui.color().props.onChange({target:{value:'#123456'}});submit(old);expect(ui.update).not.toHaveBeenCalled();submit(ui.form());expect(ui.update).toHaveBeenCalledTimes(1);expect(ui.record().style.lineColor).toBe('#123456');expect(ui.props.onChange).toHaveBeenCalledTimes(1);expect(ui.props.onClose).toHaveBeenCalledTimes(1);
});
it('does not submit composition Enter and leaves invalid styles editable for a corrected retry',()=>{
 const ui=fixture();submit(ui.form(),true);expect(ui.update).not.toHaveBeenCalled();ui.color().props.onChange({target:{value:'bad-color'}});submit(ui.form());expect(text(ui.render())).toContain('color');expect(ui.props.onClose).not.toHaveBeenCalled();
 find(ui.render(),node=>node.type==='input'&&node.props.value==='bad-color').props.onChange({target:{value:'#aabbcc'}});submit(ui.form());expect(ui.record().style.lineColor).toBe('#aabbcc');expect(ui.props.onClose).toHaveBeenCalledTimes(1);
});
it('an accepted native edit with failed publication is one-shot and reports recovery',()=>{
 const ui=fixture();ui.update.mockImplementation(()=>{throw new DrawingEditRecoveryError(true,[Error('observer')]);});const old=ui.form();submit(old);submit(old);submit(ui.form());expect(ui.update).toHaveBeenCalledTimes(1);expect(text(ui.render())).toContain('Reopen');expect(ui.props.onClose).not.toHaveBeenCalled();ui.button('Cancel').props.onClick();expect(ui.props.onClose).toHaveBeenCalledTimes(1);
});
it('accepted capture cannot close or write an error into a replacement parent',()=>{
 const ui=fixture();ui.props.onChange=()=>{ui.props.ownerToken={};ui.render();throw Error('retired observer');};submit(ui.form());expect(ui.update).toHaveBeenCalledTimes(1);expect(ui.props.onClose).not.toHaveBeenCalled();expect(text(ui.render())).not.toContain('retired observer');
});
it('uses typed style, locking, coordinates and visibility controls in one accepted edit',()=>{
 const ui=fixture(),control=(name:string)=>find(ui.render(),node=>node.props['data-property']===name||node.props['aria-label']===name),edit=(name:string,value:unknown)=>control(name).props.onChange({target:{value,checked:value}});
 edit('style.lineWidth','4');edit('style.lineStyle','dashed');edit('locked',true);ui.button('Text').props.onClick();edit('text.value','Synthetic trend');edit('text.bold',true);
 ui.button('Coordinates').props.onClick();edit('Anchor 1 price','105');edit('Anchor 2 date','2024-01-05');ui.button('Visibility').props.onClick();edit('Days',false);edit('Minutes from',5);submit(ui.form());
 expect(ui.record().style.lineWidth).toBe(4);expect(ui.record().style.lineStyle).toBe('dashed');expect(ui.record().locked).toBe(true);expect(ui.record().text?.value).toBe('Synthetic trend');expect(ui.record().text?.bold).toBe(true);expect(ui.record().anchors[0].price).toBe(105);
 // visibility v2: the Visibility tab edits per-unit rows and writes a v2 rule.
 const v2=defaultDrawingVisibilityV2();expect(ui.update.mock.calls[0][4]).toEqual({...v2,days:{...v2.days,enabled:false},minutes:{...v2.minutes,from:5}});expect(ui.props.onChange).toHaveBeenCalledTimes(1);
});
it('Reset restores the full opening draft and retires pre-reset submission',()=>{
 const ui=fixture();ui.color().props.onChange({target:{value:'#123456'}});const changed=ui.form();ui.button('Reset').props.onClick();submit(changed);expect(ui.update).not.toHaveBeenCalled();submit(ui.form());expect(ui.record().style.lineColor).not.toBe('#123456');expect(ui.update.mock.calls[0][1]).toEqual({});
});
it('StrictMode setup restores liveness while actual unmount retires native actions',()=>{
 const ui=fixture();ui.render();const setup=hooks.effects[0],cleanup=setup() as ()=>void;cleanup();const resumed=setup() as ()=>void;submit(ui.form());expect(ui.update).toHaveBeenCalledTimes(1);resumed();const writes=hooks.writes;submit(ui.form());expect(ui.update).toHaveBeenCalledTimes(1);expect(hooks.writes).toBe(writes);
});
it('source validation failure preserves the draft and parent-owned Cancel stays usable',()=>{
 const ui=fixture();ui.render();ui.props.assertOwner=()=>{throw Error('Source changed');};submit(ui.form());expect(ui.update).not.toHaveBeenCalled();expect(text(ui.render())).toContain('Source changed');ui.button('Cancel').props.onClick();expect(ui.props.onClose).toHaveBeenCalledTimes(1);
});
it('shows only useful axes for horizontal and vertical lines and both for rays',()=>{
 for(const [type,price,time]of [['hline',true,false],['vline',false,true],['hray',true,true]] as const){hooks.cells=[];hooks.cursor=0;hooks.effects=[];const ui=fixture(type);ui.button('Coordinates').props.onClick();
  expect(!!find(ui.render(),node=>node.props['aria-label']==='Anchor 1 price'),type).toBe(price);expect(!!find(ui.render(),node=>node.props['aria-label']==='Anchor 1 date'),type).toBe(time);
 }
});
it('an empty time grid does not prevent price-only horizontal editing or invent a bar ordinal',()=>{
 const ui=fixture('hline',true);ui.button('Coordinates').props.onClick();expect(find(ui.render(),node=>node.props['aria-label']==='Anchor 1 date')).toBeNull();
 find(ui.render(),node=>node.props['aria-label']==='Anchor 1 price').props.onChange({target:{value:'107'}});submit(ui.form());expect(ui.record().anchors[0].price).toBe(107);expect(ui.update.mock.calls[0][2]).toEqual([{price:107}]);
});
it('unavailable time mapping stays null while style editing remains usable',()=>{
 const ui=fixture('trendline',true);ui.button('Coordinates').props.onClick();expect(text(ui.render())).toMatch(/time|bar|grid/i);expect(find(ui.render(),node=>node.props['aria-label']==='Anchor 1 date')).toBeNull();
 ui.button('Style').props.onClick();ui.color().props.onChange({target:{value:'#abc123'}});submit(ui.form());expect(ui.record().style.lineColor).toBe('#abc123');expect(ui.update.mock.calls[0][2]).toBeUndefined();
});
it('provides an initially absent Fibonacci label editor without persisting an untouched blank',()=>{
 const ui=fixture('fibretracement');ui.button('Levels').props.onClick();const label=()=>find(ui.render(),node=>node.props['data-property']==='levels.0.label');expect(label()).not.toBeNull();expect(label().props.value).toBe('');
 label().props.onChange({target:{value:'Synthetic level'}});submit(ui.form());expect(ui.update.mock.calls[0][1]).toEqual({'levels.0.label':'Synthetic level'});expect(ui.props.onChange).toHaveBeenCalledTimes(1);
});
it('Fibonacci Reset leaves an absent level label omitted from deliberate changes',()=>{
 const ui=fixture('fibretracement');ui.button('Levels').props.onClick();find(ui.render(),node=>node.props['data-property']==='levels.0.label').props.onChange({target:{value:'temporary'}});ui.button('Reset').props.onClick();submit(ui.form());expect(ui.update.mock.calls[0][1]).toEqual({});
});
it('commits the seven real Fibonacci controls as deliberate typed settings',()=>{
 const ui=fixture('fibretracement'),edit=(path:string,value:unknown)=>find(ui.render(),node=>node.props['data-property']===path).props.onChange({target:{value,checked:value}});
 edit('reverse',true);edit('showPrices',false);edit('showRatios',false);edit('background',false);edit('labelSide','right');edit('numbersSize','huge');edit('labelsSize','large');submit(ui.form());
 const patch=ui.update.mock.calls[0][1];expect(patch).toMatchObject({reverse:true,showPrices:false,showRatios:false,background:false,labelSide:'right',numbersSize:'huge',labelsSize:'large'});expect(ui.props.onChange).toHaveBeenCalledTimes(1);
});
it('a native no-op receipt closes once without requesting a workspace history capture',()=>{
 const ui=fixture();ui.update.mockImplementation(()=>({accepted:true,changed:false}));submit(ui.form());submit(ui.form());expect(ui.update).toHaveBeenCalledTimes(1);expect(ui.props.onChange).not.toHaveBeenCalled();expect(ui.props.onClose).toHaveBeenCalledTimes(1);
});

it('statistics stage in Style and retain the shared draft through Text and Reset',()=>{
 const ui=fixture(),control=(key:string)=>find(ui.render(),node=>node.props['data-property']==='props.lvTrendlineStats.'+key);
 expect(find(ui.render(),node=>node.type==='legend'&&text(node)==='Stats')).not.toBeNull();
 for(const key of ['priceRange','percentChange','barsRange','dateTimeRange','alwaysShow'])expect(control(key).props.checked).toBe(false);
 expect(control('position').props.value).toBe('right');
 control('priceRange').props.onChange({target:{checked:true}});control('position').props.onChange({target:{value:'below'}});
 ui.button('Text').props.onClick();expect(control('priceRange')).toBeNull();find(ui.render(),node=>node.props['data-property']==='text.value').props.onChange({target:{value:'SYNTHETIC statistics annotation'}});
 ui.button('Style').props.onClick();expect(control('priceRange').props.checked).toBe(true);expect(control('position').props.value).toBe('below');expect(ui.update).not.toHaveBeenCalled();
 ui.button('Reset').props.onClick();expect(control('priceRange').props.checked).toBe(false);expect(control('position').props.value).toBe('right');submit(ui.form());expect(ui.update.mock.calls[0][1]).toEqual({});expect(ui.record().props?.lvTrendlineStats).toBeUndefined();
});
it('one mixed settings Apply saves all six statistics with text and line style',()=>{
 const ui=fixture(),control=(key:string)=>find(ui.render(),node=>node.props['data-property']==='props.lvTrendlineStats.'+key);
 for(const key of ['priceRange','percentChange','barsRange','dateTimeRange','alwaysShow'])control(key).props.onChange({target:{checked:true}});
 control('position').props.onChange({target:{value:'below'}});find(ui.render(),node=>node.props['data-property']==='style.lineWidth').props.onChange({target:{value:'4'}});
 ui.button('Text').props.onClick();find(ui.render(),node=>node.props['data-property']==='text.value').props.onChange({target:{value:'SYNTHETIC all metrics'}});submit(ui.form());
 expect(ui.update).toHaveBeenCalledTimes(1);expect(ui.props.onChange).toHaveBeenCalledTimes(1);expect(ui.record().props?.lvTrendlineStats).toEqual({schemaVersion:1,priceRange:true,percentChange:true,barsRange:true,dateTimeRange:true,alwaysShow:true,position:'below'});expect(ui.record().style.lineWidth).toBe(4);expect(ui.record().text?.value).toBe('SYNTHETIC all metrics');
});
it('invalid stats selection retains the draft for correction and Cancel/Escape publish nothing',()=>{
 for(const close of ['Cancel','Escape']){hooks.cells=[];hooks.cursor=0;const ui=fixture(),control=()=>find(ui.render(),node=>node.props['data-property']==='props.lvTrendlineStats.position');
 control().props.onChange({target:{value:'unsupported'}});submit(ui.form());expect(text(ui.render())).toContain('Unsupported option');expect(ui.props.onClose).not.toHaveBeenCalled();expect(ui.record().props?.lvTrendlineStats).toBeUndefined();
 control().props.onChange({target:{value:'below'}});const pending=ui.form();if(close==='Cancel')ui.button('Cancel').props.onClick();else find(ui.render(),(node:any)=>node.type===Modal).props.onClose();submit(pending);expect(ui.update).toHaveBeenCalledTimes(1);expect(ui.props.onChange).not.toHaveBeenCalled();expect(ui.record().props?.lvTrendlineStats).toBeUndefined();}
});
it('unknown statistics remain visible as unavailable while ordinary line edits preserve them',()=>{
 const ui=fixture(),opaque={schemaVersion:9,position:'sideways',future:{unit:'opaque'}};ui.record().props={retained:{key:'value'},lvTrendlineStats:opaque};
 expect(text(ui.render())).toContain('Unknown or invalid props.lvTrendlineStats');expect(find(ui.render(),node=>node.props['data-property']==='props.lvTrendlineStats.priceRange')).toBeNull();ui.color().props.onChange({target:{value:'#abcdef'}});submit(ui.form());expect(ui.record().props).toEqual({retained:{key:'value'},lvTrendlineStats:opaque});expect(ui.record().style.lineColor).toBe('#abcdef');
});
it('statistics controls do not appear on other native line types',()=>{
 const ui=fixture('ray');expect(find(ui.render(),node=>node.props['data-property']?.startsWith('props.lvTrendlineStats.'))).toBeNull();
});
it('Trendline endpoint dropdowns stage all four normal and arrow pairs without changing unrelated values',()=>{
 for(const left of ['normal','arrow'])for(const right of ['normal','arrow']){
  hooks.cells=[];hooks.cursor=0;const ui=fixture(),before=structuredClone(ui.record()),control=(side:string)=>find(ui.render(),node=>node.props['aria-label']===side+' end');
  for(const [side,value]of [['Left',left],['Right',right]]){const field=control(side);expect(field?.type).toBe('select');expect(field.props.children.map((item:any)=>[item.props.value,text(item)])).toEqual([['normal','Normal'],['arrow','Arrow']]);field.props.onChange({target:{value}});}
  expect(ui.update).not.toHaveBeenCalled();expect(ui.record()).toEqual(before);submit(ui.form());
  expect(ui.record().style.arrowLeft).toBe(left==='arrow');expect(ui.record().style.arrowRight).toBe(right==='arrow');
  const rest=(record:any)=>{const copy=structuredClone(record);delete copy.style.arrowLeft;delete copy.style.arrowRight;return copy;};expect(rest(ui.record())).toEqual(rest(before));expect(ui.update).toHaveBeenCalledTimes(1);
 }
});
it('endpoint Cancel and Escape retain exact stored fields and retire pending Apply',()=>{
 for(const close of ['Cancel','Escape']){hooks.cells=[];hooks.cursor=0;const ui=fixture(),before=structuredClone(ui.record());
  find(ui.render(),node=>node.props['aria-label']==='Left end').props.onChange({target:{value:'arrow'}});const pending=ui.form();
  if(close==='Cancel')ui.button('Cancel').props.onClick();else find(ui.render(),(node:any)=>node.type===Modal).props.onClose();submit(pending);expect(ui.record()).toEqual(before);expect(ui.update).not.toHaveBeenCalled();
 }
});
it('endpoint Reset restores exact opening flags and missing values are not written by unchanged Apply',()=>{
 const ui=fixture();delete ui.record().style.arrowLeft;delete ui.record().style.arrowRight;const before=structuredClone(ui.record()),field=(side:string)=>find(ui.render(),node=>node.props['aria-label']===side+' end');
 expect(field('Left').props.value).toBe('normal');expect(field('Right').props.value).toBe('normal');field('Left').props.onChange({target:{value:'arrow'}});ui.button('Reset').props.onClick();expect(field('Left').props.value).toBe('normal');submit(ui.form());expect(ui.record()).toEqual(before);expect(ui.update.mock.calls[0][1]).toEqual({});
});
it('endpoint unknown change events and retired callbacks cannot stage a default',()=>{
 const ui=fixture(),field=()=>find(ui.render(),node=>node.props['aria-label']==='Right end');field().props.onChange({target:{value:'arrow'}});const stale=field().props.onChange,writes=hooks.writes;
 field().props.onChange({target:{value:'unsupported'}});expect(hooks.writes).toBe(writes);expect(field().props.value).toBe('arrow');ui.button('Text').props.onClick();stale({target:{value:'normal'}});ui.button('Style').props.onClick();expect(field().props.value).toBe('arrow');submit(ui.form());expect(ui.record().style.arrowRight).toBe(true);
});
it('unsupported retained endpoint flags are unavailable instead of presenting a normal endpoint',()=>{
 for(const retained of ['future',null,17]){hooks.cells=[];hooks.cursor=0;const ui=fixture();(ui.record().style as any).arrowLeft=retained;const field=find(ui.render(),node=>node.props['aria-label']==='Left end');expect(field.type).toBe('select');expect(field.props.disabled).toBe(true);expect(field.props.value).toBe('unavailable');expect(text(field)).toContain('Unavailable');const writes=hooks.writes;field.props.onChange({target:{value:'normal'}});expect(hooks.writes).toBe(writes);expect((ui.record().style as any).arrowLeft).toBe(retained);}
});
it('own undefined and genuinely absent endpoint flags retain their exact presence through an unrelated edit',()=>{
 for(const present of [false,true]){hooks.cells=[];hooks.cursor=0;const ui=fixture();for(const key of ['arrowLeft','arrowRight'] as const){if(present)ui.record().style[key]=undefined;else delete ui.record().style[key];}
  const control=(side:string)=>find(ui.render(),node=>node.props['aria-label']===side+' end');expect(control('Left').props.value).toBe('normal');expect(control('Right').props.value).toBe('normal');ui.color().props.onChange({target:{value:'#123456'}});submit(ui.form());
  expect(ui.record().style.lineColor).toBe('#123456');for(const key of ['arrowLeft','arrowRight'] as const){expect(Object.hasOwn(ui.record().style,key)).toBe(present);expect(ui.record().style[key]).toBeUndefined();}
 }
});

// These controlled React-tree tests exercise the real dialog handlers. They do not establish DOM or packaged-window behavior.
function fibFixture(count=24){
 const ui=fixture('fibretracement');ui.record().props??={};
 ui.record().props!.levels=Array.from({length:count},(_,index)=>({ratio:index===0?-0:(index-1)/2,color:index%2?'#123456':'rgba(20,40,60,0.25)',enabled:index%3!==1,label:'SYNTHETIC '+index,retained:{own:undefined,value:-0}}));
 const one=()=>find(ui.render(),node=>node.type===ColorControl&&node.props.label==='All Fibonacci lines');
 const level=(index:number)=>find(ui.render(),node=>node.props['data-property']==='levels.'+index+'.color');
 return{...ui,one,level};
}
it.each([1,3,24,2048])('Fib common color stages every retained slot in one draft change, including disabled slots: %s',count=>{
 const ui=fibFixture(count),before=structuredClone(ui.record());expect(ui.one()).toBeNull();ui.button('Levels').props.onClick();
 expect(ui.one()).not.toBeNull();expect(ui.one().props.value).toBe('');
 const writes=hooks.writes;ui.one().props.onChange('rgba(51,102,153,0.5)');expect(hooks.writes-writes).toBe(1);expect(ui.update).not.toHaveBeenCalled();expect(ui.record()).toEqual(before);
 expect(ui.one().props.value).toBe('rgba(51,102,153,0.5)');submit(ui.form());expect(ui.update).toHaveBeenCalledTimes(1);
 const after=ui.record();expect(after.props?.levels).toHaveLength(count);expect(Object.keys(ui.update.mock.calls[0][1])).toHaveLength(count+1);
 expect(after.props?.lvFibTrendLine).toEqual({...before.props?.lvFibTrendLine as Record<string,unknown>,color:'rgba(51,102,153,0.5)'});
 for(let index=0;index<count;index++){const level=(after.props!.levels as any[])[index];expect(level.color).toBe('rgba(51,102,153,0.5)');const old=(before.props!.levels as any[])[index],{color:priorColor,...prior}=old,{color:nextColor,...next}=level;expect(next).toEqual(prior);expect(Object.is(next.retained.value,-0)).toBe(true);expect(Object.hasOwn(next.retained,'own')).toBe(true);}
 const rest=(row:any)=>{const copy=structuredClone(row);delete copy.props.levels;delete copy.props.lvFibTrendLine;return copy;};expect(rest(after)).toEqual(rest(before));
});
it('Fib common color is absent from other tools, even when their Levels tab exists',()=>{
 for(const type of ['trendline','fibextension'] as DrawingTypeKey[]){hooks.cells=[];hooks.cursor=0;const ui=fixture(type);const levels=ui.button('Levels');if(levels)levels.props.onClick();expect(find(ui.render(),node=>node.type===ColorControl&&node.props.label==='All Fibonacci lines')).toBeNull();}
});
it('an individual Fib level edit returns the derived common color to Mixed without a saved mode',()=>{
 const ui=fibFixture(3);ui.button('Levels').props.onClick();expect(text(ui.one())).toContain('Mixed');ui.one().props.onChange('#abcdef');expect(ui.one().props.value).toBe('#abcdef');
 ui.level(1).props.onChange({target:{value:'#123456'}});expect(ui.one().props.value).toBe('');expect(text(ui.one())).toContain('Mixed');submit(ui.form());
 expect((ui.record().props!.levels as any[]).map((level:any)=>level.color)).toEqual(['#abcdef','#123456','#abcdef']);expect(Object.hasOwn(ui.record().props!,'useOneColor')).toBe(false);
});
it.each(['Cancel','Escape'])('Fib common color %s discards every staged level and retires retained handlers',action=>{
 const ui=fibFixture(3),before=structuredClone(ui.record());ui.button('Levels').props.onClick();ui.one().props.onChange('#abcdef');const apply=ui.form(),choose=ui.one().props.onChange;
 if(action==='Cancel')ui.button('Cancel').props.onClick();else find(ui.render(),(node:any)=>node.type===Modal).props.onClose();const writes=hooks.writes;choose('#fedcba');submit(apply);expect(hooks.writes).toBe(writes);expect(ui.update).not.toHaveBeenCalled();expect(ui.record()).toEqual(before);
});
it('Fib common color Reset restores mixed opening values and does not materialize a persistent mode',()=>{
 const ui=fibFixture(3),before=structuredClone(ui.record());ui.button('Levels').props.onClick();ui.one().props.onChange('#abcdef');const apply=ui.form();ui.button('Reset').props.onClick();submit(apply);expect(ui.update).not.toHaveBeenCalled();expect(ui.one().props.value).toBe('');submit(ui.form());expect(ui.update.mock.calls[0][1]).toEqual({});expect(ui.record()).toEqual(before);
});
it('Fib common color callbacks retire on another draft change or a replacement owner',()=>{
 const ui=fibFixture(3);ui.button('Levels').props.onClick();const old=ui.one().props.onChange;ui.level(1).props.onChange({target:{value:'#456789'}});let writes=hooks.writes;old('#abcdef');expect(hooks.writes).toBe(writes);const replacement=ui.one().props.onChange;ui.props.ownerToken={};ui.render();writes=hooks.writes;replacement('#fedcba');expect(hooks.writes).toBe(writes);expect(ui.update).not.toHaveBeenCalled();
});
it('Fib common color rejects invalid and presentation-only values without staging them',()=>{
 const ui=fibFixture(3),before=structuredClone(ui.record());ui.button('Levels').props.onClick();for(const color of ['', 'Mixed','url(https://example.invalid)','rgba(1,2,3,2)']){expect(ui.one().props.onChange(color)).toBe(false);expect(ui.one().props.value).toBe('');}submit(ui.form());expect(ui.update.mock.calls[0][1]).toEqual({});expect(ui.record()).toEqual(before);
});
it.each(['transparent','#1234','rgba(1,2,3,0.5)','hsl(200 50% 25% / 100%)'])('Fib common color retains valid alpha-bearing choices exactly: %s',color=>{
 const ui=fibFixture(3);ui.button('Levels').props.onClick();ui.one().props.onChange(color);submit(ui.form(),true);expect(ui.update).not.toHaveBeenCalled();submit(ui.form());expect((ui.record().props!.levels as any[]).every((level:any)=>level.color===color)).toBe(true);
});
it('Fib common color Apply rejects a changed source and retains a usable Cancel',()=>{
 const ui=fibFixture(3),before=structuredClone(ui.record());ui.button('Levels').props.onClick();ui.one().props.onChange('#abcdef');ui.props.assertOwner=()=>{throw Error('Fib source changed');};submit(ui.form());expect(ui.update).not.toHaveBeenCalled();expect(ui.record()).toEqual(before);expect(text(ui.render())).toContain('Fib source changed');ui.button('Cancel').props.onClick();expect(ui.props.onClose).toHaveBeenCalledTimes(1);
});
it('malformed retained Fib levels do not expose a common-color control that silently repairs data',()=>{
 const ui=fibFixture(3);(ui.record().props!.levels as any[])[1].color='url(https://example.invalid)';expect(ui.one()).toBeNull();expect(text(ui.render())).toContain('retained');expect(ui.update).not.toHaveBeenCalled();
});

it('Fib baseline has separate Style controls and stages one complete edit without altering level geometry',()=>{
 const ui=fibFixture(3),before=structuredClone(ui.record()),field=(path:string)=>find(ui.render(),node=>node.props['data-property']===path);
 const section=find(ui.render(),node=>node.type==='fieldset'&&text(node.props.children?.[0])==='Trend line');expect(section).not.toBeNull();
 expect(field('style.lineWidth').props['aria-label']).toBe('Level line width');expect(field('style.lineStyle').props['aria-label']).toBe('Level line style');
 field('lvFibTrendLine.enabled').props.onChange({target:{checked:true}});field('lvFibTrendLine.color').props.onChange({target:{value:'rgba(1,2,3,0.35)'}});field('lvFibTrendLine.width').props.onChange({target:{value:'10'}});field('lvFibTrendLine.style').props.onChange({target:{value:'dotted'}});
 expect(ui.record()).toEqual(before);expect(ui.update).not.toHaveBeenCalled();ui.button('Levels').props.onClick();expect(field('lvFibTrendLine.enabled')).toBeNull();ui.button('Style').props.onClick();expect(field('lvFibTrendLine.enabled').props.checked).toBe(true);submit(ui.form());
 expect(ui.record().props?.lvFibTrendLine).toEqual({schemaVersion:1,enabled:true,color:'rgba(1,2,3,0.35)',width:10,style:'dotted'});
 const rest=(row:any)=>{const result=structuredClone(row);delete result.props.lvFibTrendLine;return result;};expect(rest(ui.record())).toEqual(rest(before));expect(ui.update).toHaveBeenCalledTimes(1);
});
it.each(['Cancel','Escape','Reset'])('Fib baseline %s restores the opening state and retires pending Apply',action=>{
 const ui=fibFixture(3),before=structuredClone(ui.record()),field=(path:string)=>find(ui.render(),node=>node.props['data-property']===path);
 field('lvFibTrendLine.enabled').props.onChange({target:{checked:true}});field('lvFibTrendLine.width').props.onChange({target:{value:'8'}});const pending=ui.form(),stale=field('lvFibTrendLine.color').props.onChange;
 if(action==='Escape')find(ui.render(),(node:any)=>node.type===Modal).props.onClose();else ui.button(action).props.onClick();const writes=hooks.writes;stale({target:{value:'#abcdef'}});submit(pending);expect(hooks.writes).toBe(writes);expect(ui.update).not.toHaveBeenCalled();expect(ui.record()).toEqual(before);
 if(action==='Reset'){submit(ui.form());expect(ui.update.mock.calls[0][1]).toEqual({});expect(ui.record()).toEqual(before);}
});
it.each(['0','11','1.5',''])('invalid Fib baseline width %s rejects the entire staged edit and permits correction',value=>{
 const ui=fibFixture(3),before=structuredClone(ui.record()),field=(path:string)=>find(ui.render(),node=>node.props['data-property']===path);
 field('lvFibTrendLine.enabled').props.onChange({target:{checked:true}});field('lvFibTrendLine.width').props.onChange({target:{value}});submit(ui.form());expect(ui.record()).toEqual(before);expect(ui.props.onClose).not.toHaveBeenCalled();
 field('lvFibTrendLine.width').props.onChange({target:{value:'1'}});submit(ui.form());expect(ui.record().props?.lvFibTrendLine).toMatchObject({enabled:true,width:1});expect(ui.props.onClose).toHaveBeenCalledTimes(1);
});
it('unknown Fib baseline remains unavailable while an individual level edit preserves its exact retained member',()=>{
 const ui=fibFixture(3),opaque={schemaVersion:7,color:'#123456',future:{own:undefined,zero:-0}};ui.record().props!.lvFibTrendLine=opaque;
 expect(text(ui.render())).toContain('Unsupported Fibonacci trend line');expect(find(ui.render(),node=>node.props['data-property']==='lvFibTrendLine.enabled')).toBeNull();ui.button('Levels').props.onClick();expect(ui.one()).toBeNull();ui.level(1).props.onChange({target:{value:'#abcdef'}});submit(ui.form());
 expect(ui.record().props?.lvFibTrendLine).toEqual(opaque);expect(Object.hasOwn((ui.record().props!.lvFibTrendLine as any).future,'own')).toBe(true);expect(Object.is((ui.record().props!.lvFibTrendLine as any).future.zero,-0)).toBe(true);
});
it('legacy Fib unchanged Apply retains absence while an explicit baseline edit materializes only the documented LV defaults',()=>{
 const ui=fibFixture(3);delete ui.record().props!.lvFibTrendLine;const before=structuredClone(ui.record());submit(ui.form());expect(ui.record()).toEqual(before);expect(Object.hasOwn(ui.record().props!,'lvFibTrendLine')).toBe(false);
 hooks.cells=[];hooks.cursor=0;const next=fibFixture(3);delete next.record().props!.lvFibTrendLine;const editor=drawingEditor(next.record(),next.props.chart.getSourceBars()),opening=editor.fibTrendLine;expect(opening?.state).toBe('legacy');find(next.render(),node=>node.props['data-property']==='lvFibTrendLine.enabled').props.onChange({target:{checked:true}});submit(next.form());expect(next.record().props?.lvFibTrendLine).toEqual({...('settings' in opening!?opening.settings:{}),enabled:true});
});
