import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {createDrawing} from '@luxalgo/vela';
import {ColorControl} from '../../src/ui/ColorControl';
import {ChartSettingsDialog} from '../../src/ui/chart-settings-dialog';
import {createMemoryTabMemory} from '../../src/chart/chart-settings-session';
import {DrawingDialog} from '../../src/ui/DrawingDialog';
import {IndicatorSettings} from '../../src/ui/IndicatorDialog';
import {ComparisonDialog} from '../../src/ui/ComparisonDialog';
import {themePresets,serializeAppearance,normalizeAppearance} from '../../src/ui/themes';
import {supportedColor} from '../../src/chart/color-validation';
import {drawingEditor} from '../../src/chart/drawing-port';
import {chartSettingsSchema,settingsDefaults} from '../../src/chart/chart-settings';
import {createIndicatorLibrary,factoryIndicatorDefault} from '../../src/ui/indicator-library';
import {indicatorInputSchema} from '../../src/chart/indicator-settings';
import {fixtureDataset} from '../../src/domain/fixtures';
import {sourceContextForDataset} from '../../src/chart/source-context';
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,writes:0,effects:[] as Array<()=>any>}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useState:(initial:any)=>{const n=hooks.cursor++;if(!(n in hooks.cells))hooks.cells[n]=typeof initial==='function'?initial():initial;return[hooks.cells[n],(value:any)=>{hooks.writes++;hooks.cells[n]=typeof value==='function'?value(hooks.cells[n]):value;}];},useRef:(value:any)=>{const n=hooks.cursor++;if(!(n in hooks.cells))hooks.cells[n]={current:value};return hooks.cells[n];},useEffect:(effect:()=>any)=>{const n=hooks.cursor++;if(!(n in hooks.cells)){hooks.cells[n]=true;hooks.effects.push(effect);}}};});
const text=(tree:any):string=>typeof tree==='string'?tree:Array.isArray(tree)?tree.map(text).join(''):tree?.props?text(tree.props.children):'';
function find(tree:any,test:(node:any)=>boolean):any{if(Array.isArray(tree)){for(const child of tree){const found=find(child,test);if(found)return found;}}else if(tree?.props){if(test(tree))return tree;return find(tree.props.children,test);}return null;}
function parent(component:(props:any)=>any,props:any){const render=()=>{hooks.cursor=0;return component(props);};return{props,render,color:(key:string)=>find(render(),n=>n.type===ColorControl&&n.props.fieldKey===key),button:(name:string)=>find(render(),n=>n.type==='button'&&text(n)===name),form:()=>find(render(),n=>n.type==='form')};}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.writes=0;hooks.effects=[];vi.stubGlobal('CSS',{supports:(_key:string,color:unknown)=>supportedColor(color)});});
afterEach(()=>vi.unstubAllGlobals());

function theme(extra:any={}){let alive=true;const props:any={themeId:themePresets[0].id,appearance:structuredClone(themePresets[0].appearance),ownerToken:{},isCurrent:()=>alive,onPreview:vi.fn(),onApply:vi.fn(()=>false),onCancel:vi.fn(),tabMemory:createMemoryTabMemory(),...extra};
 const ui=parent(ChartSettingsDialog,props);return{...ui,retire:()=>{alive=false;},tab:(name:string)=>find(ui.render(),n=>n.props?.role==='tab'&&text(n)===name),submit:()=>find(ui.render(),n=>n.type==='form').props.onSubmit({preventDefault(){},nativeEvent:{isComposing:false}})};}
it('settings stage an exact alpha color and a rejected Ok retains the same raw draft',()=>{
 const ui=theme();ui.tab('Canvas').props.onClick();ui.color('canvas.chartBackground:0').props.onChange('rgba(1,2,3,0.5019607843137255)');expect(ui.props.onApply).not.toHaveBeenCalled();ui.submit();
 expect(ui.props.onApply.mock.calls[0][1][ui.props.appearance.backgroundType==='gradient'?'gradientStart':'background']).toBe('rgba(1,2,3,0.5019607843137255)');expect(ui.color('canvas.chartBackground:0').props.value).toBe('rgba(1,2,3,0.5019607843137255)');expect(text(ui.render())).toMatch(/did not accept|still open/i);
});
it('settings publication cannot write an old error into a retired owner',()=>{
 const ui=theme();let during=0;ui.props.onApply.mockImplementation(()=>{ui.retire();during=hooks.writes;return false;});ui.submit();expect(ui.props.onApply).toHaveBeenCalledTimes(1);expect(hooks.writes).toBe(during);
});
it('explicit global indicator display choices survive the actual appearance serializer-normalizer roundtrip',()=>{
 const original={...themePresets[0].appearance,indicatorLabelsVisible:false,indicatorValuesVisible:false};
 expect(normalizeAppearance(serializeAppearance(original))).toEqual(original);
 expect(Object.hasOwn(normalizeAppearance(serializeAppearance(themePresets[0].appearance)),'indicatorLabelsVisible')).toBe(false);
});
it('preset changes retain only explicit global choices and never modify the source preset',()=>{
 const ui=theme();ui.props.appearance={...ui.props.appearance,indicatorLabelsVisible:false};const untouched=structuredClone(themePresets[1].appearance);
 find(ui.render(),n=>n.type==='button'&&text(n)==='Template').props.onClick();find(ui.render(),n=>n.props?.['data-lv-preset']===themePresets[1].id).props.onClick();ui.submit();
 const sent=ui.props.onApply.mock.calls[0][1];expect(sent.indicatorLabelsVisible).toBe(false);expect(Object.hasOwn(sent,'indicatorValuesVisible')).toBe(false);expect(themePresets[1].appearance).toEqual(untouched);
});
it('new optional global appearance keys reject malformed explicit values rather than adopting defaults',()=>{
 const source=serializeAppearance(themePresets[0].appearance);
 for(const value of [undefined,null,0,1,'false',{},[]])expect(()=>normalizeAppearance({...source,'lv.indicatorLabelsVisible':value})).toThrow();
});
it('drawing line and Fib-level pickers stage only their color until owned Apply',()=>{
 for(const type of ['trendline','fibretracement'] as const){hooks.cells=[];hooks.cursor=0;hooks.effects=[];const dataset=fixtureDataset('GME',3),record=createDrawing(type,{id:'independent-'+type,paneId:'price',anchors:[{time:dataset.bars[0].time*1000,price:100},{time:dataset.bars[2].time*1000,price:200}]})!.serialize(),editor={...drawingEditor(record,dataset.bars),recordFingerprint:JSON.stringify(record)},update=vi.fn(()=>({accepted:true,changed:true}));
  const ui=parent(DrawingDialog,{chart:{getDrawingEditor:()=>editor,getSourceBars:()=>dataset.bars,getSourceContext:()=>sourceContextForDataset(dataset),updateDrawingEdit:update},id:record.id,ownerToken:{},onClose:vi.fn(),onChange:vi.fn(),assertOwner(){}});if(type==='fibretracement')ui.button('Levels').props.onClick();const path=type==='trendline'?'style.lineColor':'levels.0.color',color=ui.color(record.id+':'+path);expect(color).not.toBeNull();expect(color.props.children.props['data-property']).toBe(path);color.props.onChange('rgba(9,8,7,0.4)');expect(update).not.toHaveBeenCalled();const old=ui.color(record.id+':'+path);ui.button('Cancel').props.onClick();const writes=hooks.writes;old.props.onChange('#abcdef');expect(hooks.writes).toBe(writes);expect(update).not.toHaveBeenCalled();
 }
});
it('indicator color picker preserves separate plot opacity and rejected Apply retains the draft',()=>{
 const library=createIndicatorLibrary(),settings=factoryIndicatorDefault('sma'),row:any={id:'independent-sma',kind:'sma',...settings,diagnostics:[],rendererId:'native',paneId:'price',series:[],presentationDiagnostics:[],policies:[]},apply=vi.fn((_value:any)=>false),ui=parent(IndicatorSettings,{row,chart:{indicators:{inputSchema:indicatorInputSchema,list:()=>[row]}},library,getLibrary:()=>library,assertCurrent(){},onApply:apply,onMove:()=>false,onLibraryChange:()=>true});
 ui.button('Style').props.onClick();find(ui.render(),n=>n.props['aria-label']==='sma opacity').props.onChange({target:{value:'37'}});ui.color(row.id+':plot:sma').props.onChange('rgba(1,2,3,0.5)');ui.form().props.onSubmit({preventDefault(){}});expect(apply.mock.calls[0][0].plots.sma).toMatchObject({color:'rgba(1,2,3,0.5)',opacity:37});expect(ui.color(row.id+':plot:sma').props.value).toBe('rgba(1,2,3,0.5)');
});
it('chart-type picker stages intrinsic alpha while retaining independent line opacity',()=>{
 const values={...settingsDefaults('line'),colorType:'solid',opacity:.25},ui=theme({chartStyle:'line',typeSettings:values,document:undefined});
 ui.color('type.line.color:0').props.onChange('rgba(1,2,3,0.5)');expect(ui.color('type.line.color:0').props.value).toBe('rgba(1,2,3,0.5)');expect(values.opacity).toBe(.25);expect(ui.props.onApply).not.toHaveBeenCalled();
 ui.submit();const commit=ui.props.onApply.mock.calls[0][2];expect(commit.typeSettings.settings).toMatchObject({color:'rgba(1,2,3,0.5)',opacity:.25});expect(commit.changed).toEqual(['typeSettings']);
});
it('comparison picker rejects unsupported syntax before immediate native mutation',()=>{
 const dataset=fixtureDataset('GME',2),row={id:'independent-comparison',dataset,mode:'absolute',color:'#abcdef',width:2,visible:true,baseline:'first-loaded-match'},update=vi.fn(),ui=parent(ComparisonDialog,{chart:{comparisons:{list:()=>[row],subscribe:()=>()=>{},update}},datasets:[dataset],ownerToken:{},assertOwner(){},onClose:vi.fn(),onChange:vi.fn()});
 expect(ui.color(row.id+':color').props.onChange('url(https://example.invalid)')).toBe(false);expect(update).not.toHaveBeenCalled();expect(ui.color(row.id+':color').props.onChange('rgba(1,2,3,0.5)')).toBe(true);expect(update).toHaveBeenCalledWith(row.id,{color:'rgba(1,2,3,0.5)'});
});
