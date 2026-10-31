// ChartSettingsDialog through its real handlers under a controlled hook model (no DOM, no
// native input events, no GUI). Each render calls the component; handlers are invoked from
// the returned element tree exactly as React would wire them.
import {beforeEach,describe,expect,it,vi} from 'vitest';
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,
 useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(next:any)=>{hooks.cells[i]=typeof next==='function'?next(hooks.cells[i]):next;}];},
 useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},
 useEffect:()=>{hooks.cursor++;}};});
import {ChartSettingsDialog,type ChartSettingsDialogProps} from '../../src/ui/chart-settings-dialog';
import {ColorControl} from '../../src/ui/ColorControl';
import {factoryAppearance,factoryPriceScale} from '../../src/chart/chart-settings-bindings';
import {defaultChartSettingsDocument} from '../../src/chart/chart-settings-document';
import {createMemoryTabMemory} from '../../src/chart/chart-settings-session';
import {LV_MEDIUM_DARK_THEME_ID} from '../../src/ui/themes';

type Node={type:any;props:any};
const isNode=(value:any):value is Node=>!!value&&typeof value==='object'&&'props' in value;
function all(node:any,predicate:(node:Node)=>boolean):Node[]{if(Array.isArray(node))return node.flatMap(child=>all(child,predicate));if(!isNode(node))return[];return[...(predicate(node)?[node]:[]),...all(node.props.children,predicate)];}
function text(node:any):string{return typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):isNode(node)?text(node.props.children):'';}
const one=(node:any,predicate:(node:Node)=>boolean,what:string)=>{const found=all(node,predicate);if(found.length!==1)throw Error(`${what}: found ${found.length}`);return found[0];};
const key=(key:string)=>({key,preventDefault(){},stopPropagation(){},nativeEvent:{isComposing:false}});

function harness(extra:Partial<ChartSettingsDialogProps>={}){
 const memory=createMemoryTabMemory(),calls={preview:[] as any[],apply:[] as any[],cancel:0,templates:[] as any[]};
 const props:ChartSettingsDialogProps={themeId:'basic',appearance:factoryAppearance(),document:defaultChartSettingsDocument(),priceScale:factoryPriceScale(),ratio:0.5,timezone:'UTC',exchangeTimezone:'America/New_York',chartStyle:'candles',tabMemory:memory,dataSources:'Synthetic data sources',scaleMode:{scale:'linear',invert:false,auto:true},
  onPreview:(appearance,preview)=>{calls.preview.push({appearance,preview});},onApply:(themeId,appearance,commit)=>{calls.apply.push({themeId,appearance,commit});return true;},onCancel:()=>{calls.cancel++;},
  onTemplatesChange:templates=>{calls.templates.push(templates);return true;},makeId:()=>'tpl1',...extra};
 const render=()=>{hooks.cursor=0;return ChartSettingsDialog(props) as any;};
 return{props,memory,calls,render};
}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;});
const tab=(tree:any,label:string)=>one(tree,node=>node.props.role==='tab'&&text(node)===label,'tab '+label);
const checkbox=(tree:any,label:string)=>one(tree,node=>node.type==='input'&&node.props.type==='checkbox'&&node.props['aria-label']===label,'checkbox '+label);
const button=(tree:any,name:string)=>one(tree,node=>node.type==='button'&&(node.props['aria-label']===name||text(node)===name),'button '+name);
const dialogNode=(tree:any)=>one(tree,node=>node.props.role==='dialog','dialog');
const submit=(tree:any)=>one(tree,node=>node.type==='form','form').props.onSubmit({preventDefault(){},nativeEvent:{isComposing:false}});

describe('Chart Settings dialog handlers',()=>{
 it('renders the tabs with working rows plus Data sources, switches with a click and remembers the last tab',()=>{
  const test=harness();let tree=test.render();
  // Trading has working rows (executions, labels, sound).
  // Alerts has working rows (Alert lines, Only active alerts).
  // Events has working rows (Dividends, Splits).
  expect(all(tree,node=>node.props.role==='tab').map(text)).toEqual(['Symbol','Status line','Scales and lines','Canvas','Trading','Alerts','Events','Data sources']);
  expect(tab(tree,'Symbol').props['aria-selected']).toBe(true);
  tab(tree,'Canvas').props.onClick();tree=test.render();
  expect(tab(tree,'Canvas').props['aria-selected']).toBe(true);expect(test.memory.read()).toBe('canvas');
  expect(dialogNode(tree).props.style).toEqual({width:750,height:'min(600px, calc(100vh - 40px))'});
  tab(tree,'Symbol').props.onClick();tree=test.render();expect(dialogNode(tree).props.style.height).toBe('min(600px, calc(100vh - 40px))');
  tab(tree,'Canvas').props.onClick();tree=test.render();
  one(tree,node=>node.props.role==='tablist','tablist').props.onKeyDown(key('ArrowDown'));tree=test.render();expect(tab(tree,'Trading').props['aria-selected']).toBe(true);
  one(tree,node=>node.props.role==='tablist','tablist').props.onKeyDown(key('ArrowDown'));tree=test.render();expect(tab(tree,'Alerts').props['aria-selected']).toBe(true);
  one(tree,node=>node.props.role==='tablist','tablist').props.onKeyDown(key('ArrowDown'));tree=test.render();expect(tab(tree,'Events').props['aria-selected']).toBe(true);
  one(tree,node=>node.props.role==='tablist','tablist').props.onKeyDown(key('ArrowDown'));tree=test.render();expect(tab(tree,'Data sources').props['aria-selected']).toBe(true);expect(text(one(tree,node=>node.props.role==='tabpanel','panel'))).toContain('Synthetic data sources');
 });
 it('a checkbox change previews live and Cancel reverts through onCancel without applying',()=>{
  const test=harness();let tree=test.render();
  checkbox(tree,'Color bars based on previous close').props.onChange({target:{checked:true}});tree=test.render();
  expect(test.calls.preview).toHaveLength(1);expect(test.calls.preview[0].appearance.colorPreviousClose).toBe(true);expect(test.calls.preview[0].preview.changed).toEqual(['appearance']);
  expect(checkbox(tree,'Color bars based on previous close').props.checked).toBe(true);
  button(tree,'Cancel').props.onClick();tree=test.render();
  expect(test.calls.cancel).toBe(1);expect(test.calls.apply).toHaveLength(0);
  submit(tree);expect(test.calls.apply).toHaveLength(0);
 });
 it('Ok applies one commit with the changed stores, once',()=>{
  const test=harness();let tree=test.render();
  tab(tree,'Scales and lines').props.onClick();tree=test.render();
  checkbox(tree,'Countdown to bar close').props.onChange({target:{checked:false}});tree=test.render();
  checkbox(tree,'Lock price to bar ratio').props.onChange({target:{checked:true}});tree=test.render();
  submit(tree);tree=test.render();
  expect(test.calls.apply).toHaveLength(1);const {themeId,appearance,commit}=test.calls.apply[0];
  expect(themeId).toBe('basic');expect(appearance.countdownVisible).toBe(false);expect(commit.changed).toEqual(['appearance','priceScale']);expect(commit.priceScale.lockRatio).toBe(true);
  submit(tree);expect(test.calls.apply).toHaveLength(1);expect(test.calls.cancel).toBe(0);
 });
 it('a refused Ok keeps the dialog open with its values and a message',()=>{
  const test=harness({onApply:()=>false});let tree=test.render();
  checkbox(tree,'Color bars based on previous close').props.onChange({target:{checked:true}});tree=test.render();
  submit(tree);tree=test.render();
  expect(text(one(tree,node=>node.props.role==='alert','alert'))).toContain('did not accept');
  expect(checkbox(tree,'Color bars based on previous close').props.checked).toBe(true);expect(button(tree,'OK').props.disabled).toBe(false);
 });
 it('Escape closes an open dropdown only; a second Escape closes the dialog; X closes too',()=>{
  const test=harness();let tree=test.render();
  button(tree,'Timezone').props.onClick();tree=test.render();
  expect(all(tree,node=>node.props.role==='listbox')).toHaveLength(1);
  dialogNode(tree).props.onKeyDown(key('Escape'));tree=test.render();
  expect(all(tree,node=>node.props.role==='listbox')).toHaveLength(0);expect(test.calls.cancel).toBe(0);
  dialogNode(tree).props.onKeyDown(key('Escape'));expect(test.calls.cancel).toBe(1);
  const other=harness();hooks.cells=[];const view=other.render();button(view,'Close menu').props.onClick();expect(other.calls.cancel).toBe(1);
 });
 it('choosing a dropdown option writes the value and closes the list',()=>{
  const test=harness();let tree=test.render();
  button(tree,'Timezone').props.onClick();tree=test.render();
  one(tree,node=>node.props.role==='option'&&text(node)==='Exchange','option').props.onClick();tree=test.render();
  expect(all(tree,node=>node.props.role==='listbox')).toHaveLength(0);expect(text(button(tree,'Timezone'))).toMatch(/New York/);
  expect(test.calls.preview.at(-1).preview.timezone).toBe('America/New_York');
 });
 it('multi-check menu toggles an item and stays open; color swatches publish through ColorControl',()=>{
  const test=harness();let tree=test.render();
  tab(tree,'Scales and lines').props.onClick();tree=test.render();
  button(tree,'Symbol labels and lines').props.onClick();tree=test.render();
  one(tree,node=>node.props.role==='menuitemcheckbox'&&text(node).endsWith('Line'),'Line item').props.onClick();tree=test.render();
  expect(test.calls.preview.at(-1).appearance.priceLineVisible).toBe(false);expect(all(tree,node=>node.props.role==='menu')).toHaveLength(1);
  expect(text(button(tree,'Symbol labels and lines'))).toBe('Value');expect(all(tree,node=>node.props.role==='menuitemcheckbox').map(text)).toEqual(['Name','✓Value','Line']);/* Name is live (symbol name label), unchecked by default. */
  tab(tree,'Symbol').props.onClick();tree=test.render();
  const swatch=one(tree,node=>node.type===ColorControl&&node.props.label==='Body up color','Body up color');
  expect(swatch.props.onChange('#123456')).toBe(true);tree=test.render();
  expect(test.calls.preview.at(-1).appearance.upColor).toBe('#123456');
 });
 it('number fields keep a draft, apply valid numbers and report invalid text',()=>{
  const test=harness();let tree=test.render();
  tab(tree,'Canvas').props.onClick();tree=test.render();
  const top=()=>one(tree,node=>node.type==='input'&&node.props['aria-label']==='Top (%)','top margin');
  top().props.onChange({target:{value:'15'}});tree=test.render();expect(test.calls.preview.at(-1).appearance.topMargin).toBe(15);
  top().props.onChange({target:{value:'abc'}});tree=test.render();expect(top().props.value).toBe('abc');expect(text(one(tree,node=>node.props.role==='alert','alert'))).toContain('Enter a number');
  top().props.onBlur();tree=test.render();expect(top().props.value).toBe('15');
 });
 it('Template menu: Apply defaults previews factory values; Save as… stores a template at once',()=>{
  const test=harness();let tree=test.render();
  checkbox(tree,'Color bars based on previous close').props.onChange({target:{checked:true}});tree=test.render();
  button(tree,'Template').props.onClick();tree=test.render();
  const menu=one(tree,node=>node.props.role==='menu','template menu');
  expect(all(menu,node=>node.props.role==='menuitem').map(text).slice(-2)).toEqual(['Apply defaults','Save as…']);
  one(menu,node=>node.props.role==='menuitem'&&text(node)==='Apply defaults','apply').props.onClick();tree=test.render();
  expect(test.calls.preview.at(-1).appearance).toEqual(factoryAppearance());
  button(tree,'Template').props.onClick();tree=test.render();
  one(tree,node=>node.props.role==='menuitem'&&text(node)==='Save as…','save').props.onClick();tree=test.render();
  one(tree,node=>node.type==='input'&&node.props['aria-label']==='Template name','name').props.onChange({target:{value:'Mine'}});tree=test.render();
  button(tree,'Save').props.onClick();tree=test.render();
  expect(test.calls.templates).toHaveLength(1);expect(test.calls.templates[0].map((row:any)=>row.name)).toEqual(['Mine']);
  submit(tree);expect(test.calls.apply[0].themeId).toBe(LV_MEDIUM_DARK_THEME_ID);// Palette: Apply defaults selects the new default theme
  expect(test.calls.apply[0].commit.document).toBeUndefined();
 });
 it('entry tab, unconnected document and a retired owner',()=>{
  const scales=harness({initialTab:'scales'});expect(tab(scales.render(),'Scales and lines').props['aria-selected']).toBe(true);
  // A tab with no working rows cannot be entered; document-backed tabs disappear without a saved document.
  hooks.cells=[];const entered=harness({initialTab:'events'});expect(tab(entered.render(),'Events').props['aria-selected']).toBe(true);
  hooks.cells=[];const unbound=harness({document:undefined});const tree=unbound.render();
  expect(all(tree,node=>node.props.role==='tab').map(text)).toEqual(['Symbol','Status line','Scales and lines','Canvas','Data sources']);
  hooks.cells=[];let current=true;const retired=harness({isCurrent:()=>current});let view=retired.render();current=false;
  checkbox(view,'Color bars based on previous close').props.onChange({target:{checked:true}});button(view,'Cancel').props.onClick();submit(view);view=retired.render();
  expect(retired.calls.preview).toHaveLength(0);expect(retired.calls.cancel).toBe(0);expect(retired.calls.apply).toHaveLength(0);
 });
});

describe('Settings dialog: single timezone, scale rows, draft semantics, frame-safe apply',()=>{
 it('the only timezone control is Symbol > Timezone',()=>{
  const test=harness();let tree=test.render();
  for(const label of ['Symbol','Status line','Scales and lines','Canvas']){tab(tree,label).props.onClick();tree=test.render();
   const zones=all(tree,node=>node.type==='button'&&/time ?zone/i.test(String(node.props['aria-label']??'')));expect(zones.length,label).toBe(label==='Symbol'?1:0);}
 });
 it('scale type, invert and auto scale are draft values: preview does not apply them, Ok reports chartOptions, Cancel drops them',()=>{
  const test=harness();let tree=test.render();tab(tree,'Scales and lines').props.onClick();tree=test.render();
  button(tree,'Scale type').props.onClick();tree=test.render();
  one(tree,node=>node.props.role==='option'&&text(node)==='Logarithmic','option').props.onClick();tree=test.render();
  checkbox(tree,'Invert scale').props.onChange({target:{checked:true}});tree=test.render();
  expect(test.calls.preview.at(-1).preview.chartOptions).toEqual({scale:'logarithmic',invert:true,auto:true});expect(test.calls.preview.at(-1).preview.changed).toEqual(['chartOptions']);
  submit(tree);expect(test.calls.apply).toHaveLength(1);expect(test.calls.apply[0].commit.chartOptions).toEqual({scale:'logarithmic',invert:true,auto:true});expect(test.calls.apply[0].commit.changed).toEqual(['chartOptions']);
  hooks.cells=[];const other=harness();let view=other.render();tab(view,'Scales and lines').props.onClick();view=other.render();checkbox(view,'Auto scale').props.onChange({target:{checked:false}});view=other.render();
  button(view,'Cancel').props.onClick();expect(other.calls.cancel).toBe(1);expect(other.calls.apply).toHaveLength(0);
 });
 it('the moved last-price line swatch allows Automatic and the pane separator swatch edits the appearance',()=>{
  const test=harness();let tree=test.render();tab(tree,'Scales and lines').props.onClick();tree=test.render();
  const line=one(tree,node=>node.type===ColorControl&&node.props.label==='Symbol color','Symbol color');expect(line.props.automatic).toBe(true);
  expect(line.props.onChange('#112233')).toBe(true);tree=test.render();expect(test.calls.preview.at(-1).appearance.priceLineColor).toBe('#112233');
  expect(one(tree,node=>node.type===ColorControl&&node.props.label==='Symbol color','again').props.onChange('')).toBe(true);expect(test.calls.preview.at(-1).appearance.priceLineColor).toBe('');
  tab(tree,'Canvas').props.onClick();tree=test.render();
  expect(one(tree,node=>node.type===ColorControl&&node.props.label==='Pane separators color','sep').props.onChange('#445566')).toBe(true);expect(test.calls.preview.at(-1).appearance.separatorColor).toBe('#445566');
 });
 it('Data sources actions are outside the draft: they add nothing to the commit and the tab is inert while Applying',async()=>{
  let release!:(value:boolean)=>void;const seen:any[]=[];const test=harness({onApply:(_t,_a,commit)=>{seen.push(commit);return new Promise<boolean>(done=>{release=done;});}});let tree=test.render();
  checkbox(tree,'Color bars based on previous close').props.onChange({target:{checked:true}});tree=test.render();
  submit(tree);tree=test.render();
  expect(text(button(tree,'Applying…'))).toBe('Applying…');expect(button(tree,'Applying…').props.disabled).toBe(true);
  expect(one(tree,node=>node.props.role==='tabpanel','panel').props.inert).toBe(true);
  button(tree,'Cancel').props.onClick();expect(test.calls.cancel).toBe(0);
  release(true);await Promise.resolve();await Promise.resolve();tree=test.render();expect(test.memory.read()).toBe('symbol');
  expect(seen[0].changed).toEqual(['appearance']);
 });
 it('an asynchronous refusal or throw keeps the dialog open in editing with the message',async()=>{
  const test=harness({onApply:()=>Promise.reject(new Error('The chart changed while the settings were open. Reopen the settings.'))});let tree=test.render();
  checkbox(tree,'Color bars based on previous close').props.onChange({target:{checked:true}});tree=test.render();
  submit(tree);await Promise.resolve();await Promise.resolve();await Promise.resolve();tree=test.render();
  expect(text(one(tree,node=>node.props.role==='alert','alert'))).toContain('Reopen the settings');expect(button(tree,'OK').props.disabled).toBe(false);
  expect(checkbox(tree,'Color bars based on previous close').props.checked).toBe(true);
 });
 it('Cancel waits while a Data sources action runs',()=>{
  let busy=true;const test=harness({dataSourcesBusy:()=>busy});let tree=test.render();
  button(tree,'Cancel').props.onClick();expect(test.calls.cancel).toBe(0);tree=test.render();expect(text(one(tree,node=>node.props.role==='alert','alert'))).toContain('Wait');
  busy=false;button(tree,'Cancel').props.onClick();expect(test.calls.cancel).toBe(1);
 });
});
