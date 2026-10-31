import {beforeEach,describe,expect,it,vi} from 'vitest';
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return {...actual,
 useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return [hooks.cells[i],(next:any)=>{hooks.cells[i]=typeof next==='function'?next(hooks.cells[i]):next;}];},
 useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},
 useEffect:()=>{hooks.cursor++;}};});
import {ChartSettingsDialog,type ChartSettingsDialogProps} from '../../src/ui/chart-settings-dialog';
import {factoryAppearance,factoryPriceScale} from '../../src/chart/chart-settings-bindings';
import {defaultChartSettingsDocument} from '../../src/chart/chart-settings-document';
import {createMemoryTabMemory} from '../../src/chart/chart-settings-session';

// SYNTHETIC controlled React-handler evidence. No DOM, trusted key event, packaged UI or reference pass is implied.
const all=(tree:any,predicate:(node:any)=>boolean):any[]=>Array.isArray(tree)?tree.flatMap(node=>all(node,predicate)):tree?.props?[...(predicate(tree)?[tree]:[]),...all(tree.props.children,predicate)]:[];
const text=(tree:any):string=>typeof tree==='string'||typeof tree==='number'?String(tree):Array.isArray(tree)?tree.map(text).join(''):tree?.props?text(tree.props.children):'';
const one=(tree:any,predicate:(node:any)=>boolean)=>{const rows=all(tree,predicate);if(rows.length!==1)throw Error('Expected one handler, found '+rows.length);return rows[0];};
function harness(){
 const saved=defaultChartSettingsDocument();saved.canvas.rightMarginBars=200;
 let preview=structuredClone(saved),tree:any;
 const apply=vi.fn((_theme:string,_appearance:any,commit:any)=>{if(commit.document)Object.assign(saved,structuredClone(commit.document));return true;});
 const cancel=vi.fn(()=>{preview=structuredClone(saved);});
 const props:ChartSettingsDialogProps={themeId:'lv-dark',appearance:factoryAppearance(),document:saved,priceScale:factoryPriceScale(),timezone:'UTC',chartStyle:'candles',initialTab:'canvas',tabMemory:createMemoryTabMemory(),
  onPreview:(_appearance,commit)=>{if(commit.document)preview=structuredClone(commit.document);},onApply:apply,onCancel:cancel};
 const render=()=>{hooks.cursor=0;tree=ChartSettingsDialog(props);return tree;};
 const field=(label:string)=>one(tree,node=>node.type==='input'&&node.props['aria-label']===label);
 const button=(name:string)=>one(tree,node=>node.type==='button'&&text(node)===name);
 const change=(label:string,value:string)=>{field(label).props.onChange({target:{value}});render();};
 const submit=(composing=false)=>one(tree,node=>node.type==='form').props.onSubmit({preventDefault(){},nativeEvent:{isComposing:composing}});
 render();
 return {props,render,field,button,change,submit,apply,cancel,get tree(){return tree;},get saved(){return saved;},get preview(){return preview;},error:()=>text(one(tree,node=>node.props.role==='alert'))};
}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;});
describe(' settings validation protects the displayed numeric draft',()=>{
 it('200 -> typed prefixes 2,20 -> invalid201 blocks Ok and the actual form submission path',()=>{
  const h=harness();for(const value of ['2','20','201'])h.change('Right (bars)',value);
  expect(h.preview.canvas.rightMarginBars).toBe(20);// live preview of accepted prefixes is preserved
  expect(h.field('Right (bars)').props.value).toBe('201');expect(h.error()).toBe('Enter a right margin from 0 to 200 bars.');
  expect(h.button('OK').props.disabled).toBe(true);h.submit();
  expect(h.apply).not.toHaveBeenCalled();expect(h.saved.canvas.rightMarginBars).toBe(200);
 });
 it('numeric refusal survives blur, tab changes and another successful control edit',()=>{
  const h=harness();h.change('Right (bars)','20');h.change('Right (bars)','201');
  h.field('Right (bars)').props.onBlur();h.render();expect(h.field('Right (bars)').props.value).toBe('201');
  const tab=(name:string)=>one(h.tree,node=>node.props.role==='tab'&&text(node)===name);
  tab('Scales and lines').props.onClick();h.render();
  const checkbox=one(h.tree,node=>node.type==='input'&&node.props['aria-label']==='Countdown to bar close');checkbox.props.onChange({target:{checked:!checkbox.props.checked}});h.render();
  expect(h.error()).toBe('Enter a right margin from 0 to 200 bars.');expect(h.button('OK').props.disabled).toBe(true);
  h.submit();expect(h.apply).not.toHaveBeenCalled();
  tab('Canvas').props.onClick();h.render();expect(h.field('Right (bars)').props.value).toBe('201');
 });
 it('correcting the invalid field enables Ok and commits only the corrected150',()=>{
  const h=harness();h.change('Right (bars)','20');h.change('Right (bars)','201');h.change('Right (bars)','150');
  expect(h.button('OK').props.disabled).toBe(false);expect(h.error()).toBe('');expect(h.preview.canvas.rightMarginBars).toBe(150);
  h.submit(true);expect(h.apply).not.toHaveBeenCalled();// IME composition never submits
  h.submit();expect(h.apply).toHaveBeenCalledTimes(1);expect(h.saved.canvas.rightMarginBars).toBe(150);
 });
 it('Cancel rolls a refused201 and valid preview20 back to the saved200 without a commit',()=>{
  const h=harness();h.change('Right (bars)','20');h.change('Right (bars)','201');expect(h.preview.canvas.rightMarginBars).toBe(20);
  h.button('Cancel').props.onClick();h.render();expect(h.cancel).toHaveBeenCalledTimes(1);expect(h.apply).not.toHaveBeenCalled();
  expect(h.preview.canvas.rightMarginBars).toBe(200);expect(h.saved.canvas.rightMarginBars).toBe(200);h.submit();expect(h.apply).not.toHaveBeenCalled();
 });
 it('a stale submit handler cannot bypass a newer numeric refusal before rerender',()=>{
  const h=harness(),stale=one(h.tree,node=>node.type==='form').props.onSubmit;
  h.field('Right (bars)').props.onChange({target:{value:'201'}});
  stale({preventDefault(){},nativeEvent:{isComposing:false}});expect(h.apply).not.toHaveBeenCalled();h.render();expect(h.button('OK').props.disabled).toBe(true);
 });
 it('correcting one rejected number leaves another rejected field blocking commit',()=>{
  const h=harness();h.change('Right (bars)','201');h.change('Top (%)','-1');h.change('Right (bars)','200');
  expect(h.button('OK').props.disabled).toBe(true);h.submit();expect(h.apply).not.toHaveBeenCalled();
  h.change('Top (%)','10');expect(h.button('OK').props.disabled).toBe(false);h.submit();expect(h.apply).toHaveBeenCalledTimes(1);
 });
 it('nonnumeric blur keeps its established normalization but cannot silently commit a valid prefix',()=>{
  const h=harness();h.change('Right (bars)','20');h.change('Right (bars)','abc');h.field('Right (bars)').props.onBlur();h.render();
  expect(h.field('Right (bars)').props.value).toBe('20');expect(h.button('OK').props.disabled).toBe(true);h.submit();expect(h.apply).not.toHaveBeenCalled();
  h.change('Right (bars)','200');h.submit();expect(h.apply).toHaveBeenCalledTimes(1);expect(h.saved.canvas.rightMarginBars).toBe(200);
 });
});
