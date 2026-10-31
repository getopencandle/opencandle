import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {IndicatorDialog,IndicatorSettings} from '../../src/ui/IndicatorDialog';
import {createIndicatorLibrary,factoryIndicatorDefault,saveIndicatorDefault,type IndicatorLibrary} from '../../src/ui/indicator-library';
import {indicatorInputSchema} from '../../src/chart/indicator-settings';
import {VWAP_BAND_INPUT_KEYS,type IndicatorId} from '../../src/domain/indicators';
import type {IndicatorInstanceView} from '../../src/chart/indicator-port';

// Actual component callbacks, deterministic hooks. No DOM/native execution claim.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,cleanups:[] as (()=>void)[],writes:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return {...actual,useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return [hooks.cells[i],(value:any)=>{hooks.writes++;hooks.cells[i]=typeof value==='function'?value(hooks.cells[i]):value;}];},useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},useEffect:(effect:()=>void|(()=>void))=>{const i=hooks.cursor++;if(!(i in hooks.cells)){hooks.cells[i]=true;const cleanup=effect();if(cleanup)hooks.cleanups.push(cleanup);}}};});
const text=(node:any):string=>typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';
function find(tree:any,predicate:(node:any)=>boolean):any{let found:any;const visit=(node:any)=>{if(found)return;if(Array.isArray(node))return node.forEach(visit);if(!node?.props)return;if(predicate(node))found=node;else visit(node.props.children);};visit(tree);if(!found)throw new Error('Handler target missing');return found;}
function setup(kind:IndicatorId='rsi',legacy=false){
 let active=true,library=createIndicatorLibrary(),row:IndicatorInstanceView={id:'one',kind,...factoryIndicatorDefault(kind),paneId:'oscillator',rendererId:'native-one',diagnostics:[],presentationDiagnostics:[],policies:[],series:[],informationBars:3,latestInformationTime:3};
 if(legacy){delete row.presentation;if(['sma','ema','rsi','obv'].includes(kind)){delete row.inputs.smoothingType;delete row.inputs.smoothingLength;delete row.inputs.smoothingMultiplier;}if(kind==='rsi'){delete row.inputs.divergenceBodyOnly;delete row.inputs.divergence;}/* Creation-only seeds (RSI2 also seeds divergence:true) */if(kind==='vwap')for(const key of VWAP_BAND_INPUT_KEYS)delete row.inputs[key];}
 const onApply=vi.fn((patch:any)=>{row={...row,...structuredClone(patch)};return true;}),onMove=vi.fn(()=>true),onLibraryChange=vi.fn((next:IndicatorLibrary,expected:IndicatorLibrary)=>{expect(expected).toBe(library);library=next;return true;});
 const props={get row(){return row;},chart:{indicators:{list:()=>[row],inputSchema:indicatorInputSchema}} as any,get library(){return library;},getLibrary:()=>library,assertCurrent:()=>{if(!active)throw new Error('retired');},onApply,onMove,onLibraryChange};
 const render=()=>{hooks.cursor=0;return IndicatorSettings(props);};const button=(label:string)=>find(render(),node=>node.type==='button'&&text(node)===label),click=(label:string)=>button(label).props.onClick(),field=(label:string)=>find(render(),node=>node.props['aria-label']===label),edit=(label:string,value:string)=>field(label).props.onChange({target:{value}}),check=(label:string,checked:boolean)=>field(label).props.onChange({target:{checked}}),submit=()=>render().props.onSubmit({preventDefault(){}});
 return {props,render,click,button,field,edit,check,submit,onApply,onLibraryChange,get row(){return row;},get library(){return library;},retire:()=>{active=false;},replaceRow:(next:IndicatorInstanceView)=>{row=next;},saveDefault:()=>{library=saveIndicatorDefault(library,kind,factoryIndicatorDefault(kind));},status:()=>text(render())};
}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.cleanups=[];hooks.writes=0;});afterEach(()=>hooks.cleanups.forEach(fn=>fn()));

it('Volume MA selector preserves omitted legacy inputs until an explicit choice is applied',()=>{
 const ui=setup('volume',true),select=ui.field('Volume MA type');expect(select.props.value).toBe('SMA');expect(select.props.children.map((x:any)=>x.props.value)).toEqual(['SMA','EMA','WMA']);
 ui.submit();expect(ui.row.inputs).toEqual({length:20});ui.click('Save as default');expect(ui.library.defaults.volume?.inputs).toEqual({length:20});
 ui.edit('Volume MA type','WMA');expect(ui.row.inputs).toEqual({length:20});ui.submit();expect(ui.row.inputs).toEqual({length:20,maType:'WMA'});expect(ui.status()).toContain('EMA starts with the first supplied volume');
 ui.edit('Volume MA type','SMA');ui.submit();expect(ui.row.inputs.maType).toBe('SMA');
});
it('Volume MA defaults, discard and factory reset keep accepted instance edits separate',()=>{
 const ui=setup('volume',true);ui.edit('Volume MA type','EMA');ui.click('Save as default');expect(ui.library.defaults.volume?.inputs.maType).toBe('EMA');expect(ui.row.inputs).toEqual({length:20});
 ui.click('Discard draft and reload');expect(ui.field('Volume MA type').props.value).toBe('SMA');ui.click('Reset draft to saved defaults');expect(ui.field('Volume MA type').props.value).toBe('EMA');ui.submit();expect(ui.row.inputs.maType).toBe('EMA');
 ui.click('Reset draft to factory');expect(ui.field('Volume MA type').props.value).toBe('SMA');expect(ui.row.inputs.maType).toBe('EMA');ui.submit();expect(ui.row.inputs).toEqual({length:20});
});
it('Volume MA invalid and rejected edits retain the draft and cannot publish through older handlers',()=>{
 const ui=setup('volume',true),old=ui.field('Volume MA type').props.onChange;ui.edit('Volume MA type','WMA');old({target:{value:'EMA'}});expect(ui.field('Volume MA type').props.value).toBe('WMA');
 ui.onApply.mockReturnValueOnce(false);ui.submit();expect(ui.row.inputs).toEqual({length:20});expect(ui.field('Volume MA type').props.value).toBe('WMA');
 ui.edit('Volume MA type','wma');ui.submit();expect(ui.onApply).toHaveBeenCalledTimes(1);expect(ui.row.inputs).toEqual({length:20});expect(ui.button('Apply indicator settings').props.disabled).toBe(true);
 ui.edit('Volume MA type','EMA');const apply=ui.render().props.onSubmit;ui.retire();const writes=hooks.writes;apply({preventDefault(){}});expect(hooks.writes).toBe(writes);expect(ui.onApply).toHaveBeenCalledTimes(1);
});
it('Volume MA source replacement and reentrant publication retirement do not overwrite the replacement',()=>{
 const ui=setup('volume',true);ui.edit('Volume MA type','WMA');ui.replaceRow({...ui.row,inputs:{length:5,maType:'EMA'}});ui.submit();expect(ui.onApply).not.toHaveBeenCalled();expect(ui.row.inputs).toEqual({length:5,maType:'EMA'});
 ui.click('Discard draft and reload');ui.edit('Volume MA type','SMA');ui.onApply.mockImplementationOnce(()=>{ui.retire();return false;});const writes=hooks.writes;ui.submit();expect(hooks.writes).toBe(writes);expect(ui.row.inputs).toEqual({length:5,maType:'EMA'});
});

it('Volume length and MA visibility keep an untouched legacy directional tuple absent',()=>{
 const ui=setup('volume',true);expect(ui.field('Volume coloring').props.value).toBe('uniform');expect(ui.field('MA Length').props.value).toBe('20');ui.edit('MA Length','3');ui.submit();expect(ui.row.inputs.length).toBe(3);expect(ui.row.presentation).toBeUndefined();
 ui.click('Style');ui.check('ma visible',true);ui.edit('ma color','#f1b733');ui.submit();expect(ui.row.plots.ma).toMatchObject({visible:true,color:'#f1b733'});expect(ui.row.presentation).toBeUndefined();expect(ui.status()).toContain('Volume moving average');
});
it('Volume direction and colors stage a complete explicit tuple without changing its numerical inputs',()=>{
 const ui=setup('volume',true),inputs=structuredClone(ui.row.inputs),originalColor=ui.row.plots.volume.color;ui.edit('Volume coloring','previous-close');expect(ui.row.presentation).toBeUndefined();ui.click('Style');expect(ui.field('Volume up color').props.value).toBe(originalColor);expect(ui.field('Volume down color').props.value).toBe('#ef5350');expect(ui.field('volume color').props.disabled).toBe(true);
 ui.edit('Volume up color','rgba(10, 20, 30, 0.5)');ui.edit('Volume down color','#abcdef');ui.edit('volume opacity','40');ui.submit();expect(ui.row.presentation?.volumePalette).toEqual({schemaVersion:1,mode:'previous-close',upColor:'rgba(10, 20, 30, 0.5)',downColor:'#abcdef'});expect(ui.row.inputs).toEqual(inputs);expect(ui.row.plots.volume).toMatchObject({color:originalColor,opacity:40});
});
it('Volume single color cannot change while directional mode is active and both colors survive a uniform switch',()=>{
 const ui=setup('volume',true),original=ui.row.plots.volume.color;ui.click('Style');const oldUniform=ui.field('volume color').props.onChange;ui.click('Inputs');ui.edit('Volume coloring','open-close');ui.click('Style');oldUniform({target:{value:'#000001'}});ui.edit('volume color','#000002');expect(ui.field('volume color').props.value).toBe(original);ui.edit('Volume up color','#abc123');ui.submit();
 ui.click('Inputs');ui.edit('Volume coloring','uniform');ui.click('Style');expect(ui.field('volume color').props.disabled).toBe(false);ui.edit('volume color','#123abc');ui.submit();expect(ui.row.presentation?.volumePalette).toMatchObject({mode:'uniform',upColor:'#abc123',downColor:'#ef5350'});expect(ui.row.plots.volume.color).toBe('#123abc');ui.click('Inputs');ui.edit('Volume coloring','previous-close');ui.click('Style');expect(ui.field('Volume up color').props.value).toBe('#abc123');
});
it('Volume defaults keep the full directional tuple without editing existing instances and factory reset removes it',()=>{
 const ui=setup('volume',true);ui.edit('Volume coloring','open-close');ui.click('Style');ui.edit('Volume down color','#019283');ui.click('Save as default');expect(ui.row.presentation).toBeUndefined();expect(ui.library.defaults.volume?.presentation?.volumePalette).toMatchObject({mode:'open-close',downColor:'#019283'});ui.submit();expect(ui.row.presentation?.volumePalette?.downColor).toBe('#019283');
 ui.click('Reset draft to factory');ui.submit();expect(ui.row.presentation?.volumePalette).toBeUndefined();expect(ui.library.defaults.volume?.presentation?.volumePalette?.downColor).toBe('#019283');ui.click('Reset draft to saved defaults');ui.submit();expect(ui.row.presentation?.volumePalette?.mode).toBe('open-close');
});
it('Volume invalid colors and directional area remain visible drafts until a supported correction',()=>{
 const ui=setup('volume',true);ui.edit('Volume coloring','open-close');ui.click('Style');ui.edit('Volume up color','not-a-color');ui.submit();expect(ui.onApply).not.toHaveBeenCalled();expect(ui.field('Volume up color').props.value).toBe('not-a-color');ui.edit('Volume up color','#abcdef');
 expect(find(ui.field('volume plot type'),node=>node.type==='option'&&node.props.value==='area').props.disabled).toBe(true);ui.edit('volume plot type','area');ui.submit();expect(ui.onApply).not.toHaveBeenCalled();expect(ui.field('volume plot type').props.value).toBe('area');expect(ui.button('Apply indicator settings').props.disabled).toBe(true);ui.click('Inputs');expect(find(ui.field('Volume coloring'),node=>node.type==='option'&&node.props.value==='previous-close').props.disabled).toBe(true);
 ui.click('Style');ui.edit('volume plot type','columns');ui.submit();expect(ui.row.plots.volume.kind).toBe('columns');expect(ui.row.presentation?.volumePalette?.mode).toBe('open-close');
});
it('Volume mode validation and replaced editor handlers cannot publish a draft',()=>{
 const ui=setup('volume',true);for(const bad of ['', 'previous', 'open-close ', 'OPEN-CLOSE']){ui.edit('Volume coloring',bad);expect(ui.field('Volume coloring').props.value).toBe('uniform');}const old=ui.field('Volume coloring').props.onChange;ui.edit('Volume coloring','open-close');old({target:{value:'previous-close'}});expect(ui.field('Volume coloring').props.value).toBe('open-close');
 const retained=ui.field('Volume coloring').props.onChange,apply=ui.render().props.onSubmit;ui.retire();const writes=hooks.writes;retained({target:{value:'uniform'}});apply({preventDefault(){}});expect(hooks.writes).toBe(writes);expect(ui.onApply).not.toHaveBeenCalled();
});
it('Volume rejected Apply retains the local draft and discard reloads an externally changed current instance',()=>{
 const ui=setup('volume',true);ui.edit('Volume coloring','previous-close');ui.onApply.mockReturnValueOnce(false);ui.submit();expect(ui.row.presentation).toBeUndefined();expect(ui.field('Volume coloring').props.value).toBe('previous-close');expect(ui.status()).toContain('draft is retained');ui.replaceRow({...ui.row,offset:2});ui.submit();expect(ui.onApply).toHaveBeenCalledTimes(1);expect(ui.status()).toContain('Discard the draft');ui.click('Discard draft and reload');expect(ui.field('Volume coloring').props.value).toBe('uniform');ui.submit();expect(ui.row.offset).toBe(2);expect(ui.row.presentation).toBeUndefined();
});

it.each(['volume','sma','ema','rsi','macd','bb','vwap','stochastic','atr','obv'] as const)('%s interval tab stages exact aliases and an inclusive family range before one validated Apply',kind=>{
 const ui=setup(kind,true);ui.click('Visibility');expect(ui.field('Indicator interval visibility').props.value).toBe('all');ui.submit();expect(ui.row.presentation).toBeUndefined();
 ui.edit('Indicator interval visibility','include');ui.edit('Indicator exact intervals','1h, 1D');ui.click('Add interval range');ui.edit('Interval range 1 min','5');ui.edit('Interval range 1 max','30');
 expect(ui.row.presentation).toBeUndefined();ui.submit();expect(ui.row.presentation?.visibility).toEqual({schemaVersion:1,mode:'include',intervals:['60m','1D'],ranges:[{unit:'minute',min:5,max:30}]});expect(ui.onApply).toHaveBeenCalledTimes(2);
});
it('keeps an invalid visibility draft editable and rejects stale apply and duplicate canonical aliases',()=>{
 const ui=setup('sma',true);ui.click('Visibility');const old=ui.render().props.onSubmit;ui.edit('Indicator exact intervals','1h,60m');old({preventDefault(){}});expect(ui.onApply).not.toHaveBeenCalled();ui.submit();expect(ui.onApply).not.toHaveBeenCalled();expect(ui.field('Indicator exact intervals').props.value).toBe('1h,60m');
 ui.edit('Indicator exact intervals','1h,');expect(ui.button('Apply indicator settings').props.disabled).toBe(true);ui.submit();expect(ui.onApply).not.toHaveBeenCalled();ui.edit('Indicator exact intervals','1h');ui.click('Add interval range');ui.edit('Interval range 1 min','61');expect(ui.button('Save as default').props.disabled).toBe(true);ui.edit('Interval range 1 max','120');ui.submit();expect(ui.row.presentation?.visibility).toMatchObject({mode:'all',intervals:['60m'],ranges:[{min:61,max:120}]});
});
it('visibility defaults preserve all filters without changing an instance and rejected Apply retains the draft',()=>{
 const ui=setup('rsi',true);ui.click('Visibility');ui.edit('Indicator interval visibility','exclude');ui.edit('Indicator exact intervals','1D,1W');ui.click('Add interval range');ui.click('Save as default');expect(ui.row.presentation).toBeUndefined();expect(ui.library.defaults.rsi?.presentation?.visibility).toMatchObject({mode:'exclude',intervals:['1D','1W'],ranges:[{unit:'minute',min:1,max:60}]});
 ui.onApply.mockReturnValueOnce(false);ui.submit();expect(ui.row.presentation).toBeUndefined();expect(ui.field('Indicator exact intervals').props.value).toBe('1D,1W');expect(ui.status()).toContain('draft is retained');ui.submit();expect(ui.row.presentation?.visibility?.mode).toBe('exclude');
 ui.edit('Indicator interval visibility','all');ui.submit();expect(ui.row.presentation?.visibility).toMatchObject({mode:'all',intervals:['1D','1W'],ranges:[{unit:'minute',min:1,max:60}]});
});
it('explicit range removal, empty interval selection, discard and factory reset retain their separate draft behavior',()=>{
 const ui=setup('obv',true);ui.click('Visibility');ui.edit('Indicator interval visibility','include');ui.edit('Indicator exact intervals','');ui.click('Add interval range');ui.click('Remove interval range 1');ui.submit();expect(ui.row.presentation?.visibility).toEqual({schemaVersion:1,mode:'include',intervals:[],ranges:[]});
 ui.edit('Indicator exact intervals','1M');ui.click('Discard draft and reload');expect(ui.field('Indicator exact intervals').props.value).toBe('');ui.click('Reset draft to factory');expect(ui.field('Indicator interval visibility').props.value).toBe('all');expect(ui.row.presentation?.visibility?.mode).toBe('include');ui.submit();expect(ui.row.presentation?.visibility).toBeUndefined();
});
it('retired interval handlers and cancelled drafts cannot publish or alter replacement settings',()=>{
 const ui=setup('atr');ui.click('Visibility');ui.edit('Indicator exact intervals','2m');const retained=ui.field('Indicator exact intervals').props.onChange,apply=ui.render().props.onSubmit,original=structuredClone(ui.row);ui.retire();const writes=hooks.writes;retained({target:{value:'1D'}});apply({preventDefault(){}});expect(hooks.writes).toBe(writes);expect(ui.onApply).not.toHaveBeenCalled();expect(ui.row).toEqual(original);
});

it('stages decimal precision, preserves legacy omission on untouched Apply, and restores defaults without premature mutation',()=>{
 const ui=setup('volume',true);ui.click('Style');expect(ui.field('Decimal precision').props.value).toBe('auto');ui.submit();expect(ui.row.presentation).toBeUndefined();
 ui.edit('Decimal precision','16');expect(ui.onApply).toHaveBeenCalledTimes(1);expect(ui.row.presentation).toBeUndefined();ui.click('Save as default');expect(ui.library.defaults.volume?.presentation?.precision).toBe(16);expect(ui.row.presentation).toBeUndefined();
 ui.submit();expect(ui.row.presentation?.precision).toBe(16);ui.edit('Decimal precision','0');ui.click('Discard draft and reload');expect(ui.field('Decimal precision').props.value).toBe('16');ui.click('Reset draft to factory');expect(ui.field('Decimal precision').props.value).toBe('auto');expect(ui.row.presentation?.precision).toBe(16);ui.click('Reset draft to saved defaults');expect(ui.field('Decimal precision').props.value).toBe('16');
});
it('decimal selection rejects malformed options and stale handlers while Automatic remains an explicit saved choice',()=>{
 const ui=setup('rsi',true);ui.click('Style');const stale=ui.field('Decimal precision').props.onChange;for(const bad of ['','17','-1','1.5','1e1',' 2']){ui.edit('Decimal precision',bad);expect(ui.field('Decimal precision').props.value).toBe('auto');expect(ui.status()).toContain('Choose Automatic');}
 ui.edit('Decimal precision','3');stale({target:{value:'7'}});expect(ui.field('Decimal precision').props.value).toBe('3');ui.submit();expect(ui.row.presentation?.precision).toBe(3);ui.edit('Decimal precision','auto');ui.submit();expect(ui.row.presentation?.precision).toBe('auto');
 const retired=ui.field('Decimal precision').props.onChange;ui.retire();const writes=hooks.writes;retired({target:{value:'8'}});expect(hooks.writes).toBe(writes);
});

it('retains inactive smoothing controls, validates blank values, and refuses a retained older submit',()=>{
 const ui=setup('sma');expect(ui.field('Smoothing length').props.disabled).toBe(true);expect(ui.field('BB standard deviations').props.disabled).toBe(true);
 const oldSubmit=ui.render().props.onSubmit;ui.edit('Smoothing type','SMA+BB');oldSubmit({preventDefault(){}});expect(ui.onApply).not.toHaveBeenCalled();expect(ui.field('Smoothing length').props.disabled).toBe(false);
 ui.edit('Smoothing length','2');ui.edit('BB standard deviations','3');ui.edit('Smoothing type','None');expect(ui.field('Smoothing length').props.value).toBe('2');expect(ui.field('BB standard deviations').props.value).toBe('3');ui.edit('Length','');ui.submit();expect(ui.onApply).not.toHaveBeenCalled();expect(ui.status()).toContain('Invalid numeric input');ui.edit('Length','4');ui.submit();expect(ui.row.inputs).toMatchObject({length:4,smoothingType:'None',smoothingLength:2,smoothingMultiplier:3});
});
it('keeps legacy presentation absent for unrelated styles and opts into only explicit guide/fill edits',()=>{
 const ui=setup('rsi',true);ui.click('Style');ui.edit('rsi opacity','35');ui.check('rsi trackPrice',true);ui.submit();expect(ui.row.plots.rsi.opacity).toBe(35);expect(ui.row.plots.rsi.trackPrice).toBe(true);expect(Object.hasOwn(ui.row,'presentation')).toBe(false);expect(ui.row.inputs).toEqual({length:14,source:'close'});
 ui.check('upper guide visible',true);ui.edit('upper guide value','75');ui.edit('band fill opacity','23');ui.submit();expect(ui.row.presentation?.guides.upper).toMatchObject({visible:true,value:75});expect(ui.row.presentation?.guides.lower?.visible).toBe(false);expect(ui.row.presentation?.fills.band).toMatchObject({visible:false,opacity:23});expect(ui.row.presentation?.precision).toBe('auto');
});
it('applies MACD palette, fixed zero guide and plot options through the validated draft',()=>{
 const ui=setup('macd');ui.click('Style');/* The zero guide Value is now an editable field (default 0), no longer the fixed text 'Value: 0'. */expect(ui.status()).toContain('zero guide');ui.edit('zero guide value','2');ui.edit('zero guide value','0');ui.edit('Histogram negativeRising','#123456');ui.edit('histogram plot type','columns');ui.edit('histogram opacity','50');ui.check('zero guide visible',false);ui.submit();expect(ui.row.presentation?.histogramPalette?.negativeRising).toBe('#123456');expect(ui.row.presentation?.guides.zero).toMatchObject({value:0,visible:false});expect(ui.row.plots.histogram).toMatchObject({kind:'columns',opacity:50});
});
it('rejects stale native settings and reloads without silently enabling legacy decorations',()=>{
 const ui=setup('rsi',true);ui.edit('Length','7');ui.replaceRow({...ui.row,offset:3});ui.submit();expect(ui.onApply).not.toHaveBeenCalled();expect(ui.status()).toContain('Discard the draft');ui.click('Discard draft and reload');expect(ui.field('Length').props.value).toBe('14');expect(ui.field('Display offset (bars)').props.value).toBe(3);ui.submit();expect(Object.hasOwn(ui.row,'presentation')).toBe(false);
});
it('retains rejected drafts and suppresses writes after publication reentrantly retires the owner',()=>{
 const ui=setup();ui.edit('Length','8');ui.onApply.mockReturnValueOnce(false);ui.submit();expect(ui.field('Length').props.value).toBe('8');expect(ui.status()).toContain('draft is retained');ui.onApply.mockImplementationOnce(()=>{ui.retire();return false;});const writes=hooks.writes;ui.submit();expect(hooks.writes).toBe(writes);
});
it('cancelled or replaced factory confirmations cannot clear or execute a later confirmation',()=>{
 const ui=setup();ui.saveDefault();ui.click('Discard draft and reload');ui.click('Restore factory default');const oldConfirm=ui.button('Confirm factory default').props.onClick,oldCancel=ui.button('Cancel factory reset').props.onClick;ui.click('Cancel factory reset');ui.click('Restore factory default');oldCancel();oldConfirm();expect(ui.onLibraryChange).not.toHaveBeenCalled();expect(ui.button('Confirm factory default')).toBeTruthy();ui.click('Confirm factory default');expect(ui.library.defaults.rsi).toBeUndefined();
});
it('saving defaults preserves all controls and native instances remain unchanged until Apply',()=>{
 const ui=setup();ui.click('Style');ui.edit('upper guide value','79');ui.edit('band fill opacity','44');ui.click('Save as default');expect(ui.library.defaults.rsi?.presentation?.guides.upper?.value).toBe(79);expect(ui.library.defaults.rsi?.presentation?.fills.band?.opacity).toBe(44);expect(ui.row.presentation?.guides.upper?.value).toBe(70);expect(ui.onApply).not.toHaveBeenCalled();ui.submit();expect(ui.row.presentation?.guides.upper?.value).toBe(79);
});
it('a replaced parent token cannot lend old indicator catalog handlers new authority',()=>{
 const add=vi.fn(()=> 'new'),closeA=vi.fn(),closeB=vi.fn(),assertA=vi.fn(),assertB=vi.fn();let props:any={chart:{indicators:{catalog:['sma'],add,list:()=>[]}},instances:[],library:createIndicatorLibrary(),ownerToken:{},assertOwner:assertA,onLibraryChange:vi.fn(()=>true),onClose:closeA,onChange:vi.fn()};const render=()=>{hooks.cursor=0;return IndicatorDialog(props);};const first=render(),oldAdd=find(first,node=>node.props['aria-label']==='Add Simple Moving Average').props.onClick,oldClose=find(first,node=>node.type==='button'&&text(node)==='Close').props.onClick;props={...props,ownerToken:{},assertOwner:assertB,onClose:closeB};render();oldAdd();oldClose();expect(add).not.toHaveBeenCalled();expect(closeA).not.toHaveBeenCalled();expect(closeB).not.toHaveBeenCalled();expect(assertB).not.toHaveBeenCalled();find(render(),node=>node.props['aria-label']==='Add Simple Moving Average').props.onClick();expect(add).toHaveBeenCalledOnce();
});
it('edits all VWAP pairs with real boolean inputs, retaining inactive values and rejecting older submits',()=>{
 const ui=setup('vwap',true);expect(ui.field('Band 1 enabled').props.type).toBe('checkbox');expect(ui.status()).toContain('Standard Deviation bands');
 ui.edit('Source','close');ui.submit();expect(VWAP_BAND_INPUT_KEYS.some(key=>Object.hasOwn(ui.row.inputs,key))).toBe(false);
 const oldSubmit=ui.render().props.onSubmit;ui.check('Band 1 enabled',true);oldSubmit({preventDefault(){}});expect(ui.onApply).toHaveBeenCalledTimes(1);
 ui.edit('Band 1 percentage multiplier','1.23');ui.check('Band 2 enabled',true);ui.edit('Band 2 percentage multiplier','0');ui.check('Band 3 enabled',true);ui.edit('Band 3 percentage multiplier','5');ui.check('Band 1 enabled',false);expect(ui.field('Band 1 percentage multiplier').props.value).toBe('1.23');ui.check('Hide VWAP on daily and above',true);ui.submit();
 expect(ui.row.inputs).toMatchObject({bandMode:'Percentage',band1Enabled:false,band1Multiplier:1.23,band2Enabled:true,band2Multiplier:0,band3Enabled:true,band3Multiplier:5});expect(ui.row.presentation?.hideOnDaily).toBe(true);
 ui.edit('Band 1 percentage multiplier','');ui.submit();expect(ui.onApply).toHaveBeenCalledTimes(2);expect(ui.status()).toContain('Invalid numeric input');ui.click('Discard draft and reload');expect(ui.field('Band 1 percentage multiplier').props.value).toBe('1.23');
});
it('retains all VWAP fill/line controls in defaults and leaves an untouched legacy tuple absent',()=>{
 const ui=setup('vwap',true);ui.click('Style');ui.edit('upper2 opacity','27');ui.check('upper2 visible',false);ui.check('upper2 trackPrice',true);ui.check('band2 fill visible',true);ui.edit('band2 fill opacity','33');ui.click('Save as default');
 expect(ui.library.defaults.vwap?.plots.upper2).toMatchObject({opacity:27,visible:false,trackPrice:true});expect(ui.library.defaults.vwap?.presentation?.fills.band2).toMatchObject({visible:true,opacity:33});expect(VWAP_BAND_INPUT_KEYS.some(key=>Object.hasOwn(ui.library.defaults.vwap!.inputs,key))).toBe(false);expect(ui.row.presentation).toBeUndefined();
 ui.submit();expect(ui.row.presentation?.fills.band2?.opacity).toBe(33);expect(VWAP_BAND_INPUT_KEYS.some(key=>Object.hasOwn(ui.row.inputs,key))).toBe(false);
});
