import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {ChartSettingsDialog} from '../../src/ui/chart-settings-dialog';
import {createMemoryTabMemory} from '../../src/chart/chart-settings-session';
import {IntervalDialog} from '../../src/ui/IntervalDialog';
import {ImportDialog} from '../../src/ui/ImportDialog';
import {StrategyDialog} from '../../src/ui/StrategyDialog';
import {IndicatorDialog} from '../../src/ui/IndicatorDialog';
import {defaultTheme} from '../../src/ui/themes';
import {fixtureDataset} from '../../src/domain/fixtures';
import {createIntervalMenuState} from '../../src/domain/intervals';
import {createIndicatorLibrary} from '../../src/ui/indicator-library';
import {DEFAULT_STRATEGY_CONFIG} from '../../src/domain/strategy';
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
// Controlled handler tests. These do not exercise DOM rendering or native input.
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(next:any)=>{hooks.cells[i]=typeof next==='function'?next(hooks.cells[i]):next;}];},useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},useEffect:()=>{hooks.cursor++;},useMemo:(fn:()=>any)=>{hooks.cursor++;return fn();}};});
function text(node:any):string{return typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
function find(tree:any,predicate:(node:any)=>boolean):any{if(Array.isArray(tree)){for(const child of tree){const found=find(child,predicate);if(found)return found;}}else if(tree?.props){if(predicate(tree))return tree;return find(tree.props.children,predicate);}return null;}
const renderer=(fn:()=>any)=>()=>{hooks.cursor=0;return fn();};
const event=()=>({preventDefault:vi.fn()});
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;vi.stubGlobal('CSS',{supports:()=>true});});afterEach(()=>vi.unstubAllGlobals());
it('theme rejection retains the preview draft and permits deliberate retry',()=>{
 const onApply=vi.fn(()=>false),onCancel=vi.fn(),render=renderer(()=>ChartSettingsDialog({themeId:defaultTheme.id,appearance:defaultTheme.appearance,onPreview:vi.fn(),onApply,onCancel,tabMemory:createMemoryTabMemory()}));
 find(render(),node=>node.type==='form').props.onSubmit({...event(),nativeEvent:{isComposing:false}});expect(onApply).toHaveBeenCalledOnce();expect(onCancel).not.toHaveBeenCalled();expect(text(render())).toContain('did not accept');
 onApply.mockReturnValue(true);find(render(),node=>node.type==='form').props.onSubmit({...event(),nativeEvent:{isComposing:false}});expect(text(render())).not.toContain('did not accept');
});
it('interval rejection keeps the choice open without losing its selected source',()=>{
 const data=fixtureDataset('GME',5),onApply=vi.fn((..._args:unknown[])=>false),onClose=vi.fn(),render=renderer(()=>IntervalDialog({datasets:[data],current:data,state:createIntervalMenuState(),onApply,onClose}));
 find(render(),node=>node.type==='button'&&text(node)==='Apply').props.onClick();expect(onApply).toHaveBeenCalledOnce();expect(onApply.mock.calls[0][0]).toEqual(data);expect(onClose).not.toHaveBeenCalled();expect(text(render())).toContain('interval change was rejected');
});
it('historical import rejection retains the actual parsed CSV draft',()=>{
 const onImport=vi.fn(()=>false),onClose=vi.fn(),render=renderer(()=>ImportDialog({onImport,onClose})),csv='time,open,high,low,close,volume\n2024-01-02,10,12,9,11,1000';
 find(render(),node=>node.type==='textarea').props.onChange({target:{value:csv}});find(render(),node=>node.type==='form').props.onSubmit(event());expect(onImport).toHaveBeenCalledOnce();expect(onClose).not.toHaveBeenCalled();expect(find(render(),node=>node.type==='textarea').props.value).toBe(csv);expect(text(render())).toContain('import was rejected');
});
it('strategy publication rejection keeps property editing active',()=>{
 const onChange=vi.fn(()=>false),render=renderer(()=>StrategyDialog({execution:null,config:DEFAULT_STRATEGY_CONFIG,onChange,onClose:vi.fn()}));
 find(render(),node=>node.type==='button'&&text(node)==='Properties').props.onClick();find(render(),node=>node.type==='button'&&text(node)==='Apply properties').props.onClick();expect(onChange).toHaveBeenCalledOnce();expect(text(render())).toContain('settings were rejected');expect(find(render(),node=>node.type==='button'&&text(node)==='Apply properties')).not.toBeNull();
});
it('indicator favorite rejection does not report a successful local library update',()=>{
 const onLibraryChange=vi.fn(()=>false),onChange=vi.fn(),render=renderer(()=>IndicatorDialog({chart:{indicators:{catalog:['sma']}} as any,instances:[],library:createIndicatorLibrary(),onLibraryChange,onChange,onClose:vi.fn()}));
 find(render(),node=>node.props['aria-label']==='Favorite Simple Moving Average').props.onClick();expect(onLibraryChange).toHaveBeenCalledOnce();expect(onChange).not.toHaveBeenCalled();expect(text(render())).toContain('library change was rejected');
});
