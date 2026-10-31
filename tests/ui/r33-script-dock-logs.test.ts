import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {ReactElement} from 'react';
import {ScriptLibraryPanel} from '../../src/ui/ScriptLibraryPanel';
import {ScriptLogsPanel,scriptLogRows,scriptLogTime,defaultScriptLogFilter,SCRIPT_LOG_DISPLAY_LIMIT,type ScriptLogSource} from '../../src/ui/ScriptLogsPanel';
import {ScriptSettingsDialog} from '../../src/ui/ScriptSettingsDialog';
import {Modal} from '../../src/ui/Modal';
import {createScriptLibrary,type ScriptBinding} from '../../src/ui/script-library';
import {initialScript} from '../../src/ui/ScriptPanel';
import {compileLVScript} from '../../src/ui/script-editor-commands';

// The docked script editor, the Logs tab and the hline/fill rows of the Style tab. Real component
// handlers; hooks and effects are controlled (no DOM). SYNTHETIC data only.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');const effect=(fn:()=>void|(()=>void),deps:any[]=[])=>{const at=hooks.cursor++,old=hooks.cells[at];if(!old||deps.some((v,i)=>!Object.is(v,old.deps[i]))){old?.cleanup?.();const cleanup=fn();hooks.cells[at]={deps,cleanup};}};return {...actual,useState:(initial:any)=>{const at=hooks.cursor++;if(!(at in hooks.cells))hooks.cells[at]=typeof initial==='function'?initial():initial;return[hooks.cells[at],(value:any)=>{hooks.cells[at]=typeof value==='function'?value(hooks.cells[at]):value;}];},useRef:(initial:any)=>{const at=hooks.cursor++;if(!(at in hooks.cells))hooks.cells[at]={current:initial};return hooks.cells[at];},useMemo:(fn:()=>any)=>fn(),useCallback:(fn:any)=>fn,useEffect:effect,useLayoutEffect:effect};});
const text=(value:any):string=>typeof value==='string'?value:typeof value==='number'?String(value):Array.isArray(value)?value.map(text).join(''):value?.props?text(value.props.children):'';
function findAll(tree:any,match:(node:ReactElement<any>)=>boolean):ReactElement<any>[]{const found:ReactElement<any>[]=[];const visit=(node:any)=>{if(Array.isArray(node)){node.forEach(visit);return;}if(!node?.props)return;if(match(node))found.push(node);visit(node.props.children);};visit(tree);return found;}
function find(tree:any,match:(node:ReactElement<any>)=>boolean){const found=findAll(tree,match)[0];if(!found)throw Error('Synthetic target missing.');return found;}
function mount(component:(props:any)=>any,props:any){const render=()=>{hooks.cursor=0;return component(props);};const button=(label:string)=>find(render(),node=>node.type==='button'&&(text(node.props.children)===label||node.props['aria-label']===label));return{props,render,button,click:(label:string)=>button(label).props.onClick(),field:(label:string)=>find(render(),node=>node.props['aria-label']===label)};}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;});
const style=(color:string,extra:Record<string,unknown>={})=>({visible:true,color,width:1,lineStyle:'dashed' as const,kind:'line' as const,priceScale:true,legend:true,dataWindow:true,...extra});
const sources:ScriptLogSource[]=[
 {id:'a',title:'RSI',entries:[{time:7200,index:1,level:'info',message:'first'},{time:10800,index:2,level:'warn',message:'Overbought'}],dropped:0},
 {id:'b',title:'Breakout',entries:[{time:3600,index:0,level:'error',message:'boom'},{time:10800,index:2,level:'info',message:'second'}],dropped:7},
];

describe(' script logs',()=>{
 it('orders rows by bar time and filters by level, instance and text',()=>{
  const all=scriptLogRows(sources,defaultScriptLogFilter());
  expect(all.rows.map(row=>row.message)).toEqual(['boom','first','Overbought','second']);expect(all).toMatchObject({total:4,shown:4,hidden:0,dropped:7});
  expect(scriptLogRows(sources,{...defaultScriptLogFilter(),levels:{info:false,warn:true,error:true}}).rows.map(row=>row.level)).toEqual(['error','warn']);
  expect(scriptLogRows(sources,{...defaultScriptLogFilter(),instance:'a'}).rows.map(row=>row.instance)).toEqual(['RSI','RSI']);
  expect(scriptLogRows(sources,{...defaultScriptLogFilter(),text:'OVERBOUGHT'}).rows.map(row=>row.message)).toEqual(['Overbought']);
  expect(scriptLogTime(3600)).toBe('1970-01-01 01:00:00');
  const many=[{id:'m',title:'Many',entries:Array.from({length:SCRIPT_LOG_DISPLAY_LIMIT+5},(_,index)=>({time:index,index,level:'info' as const,message:'n'+index})),dropped:0}];
  const capped=scriptLogRows(many,defaultScriptLogFilter());expect(capped.shown).toBe(SCRIPT_LOG_DISPLAY_LIMIT);expect(capped.hidden).toBe(5);expect(capped.rows[0].message).toBe('n5');
 });
 it('the Logs panel reads the chart script port and follows its notifications',()=>{
  let listener=()=>{},current=sources;const chart={scripts:{logs:()=>current,subscribe:(fn:()=>void)=>{listener=fn;return()=>true;}}} as any;
  const ui=mount(ScriptLogsPanel,{chart});
  const rows=()=>findAll(ui.render(),node=>node.type==='tr'&&node.props['data-level']).map(row=>text(row));
  expect(rows()).toEqual(['1970-01-01 01:00:000ErrorBreakoutboom','1970-01-01 02:00:001InfoRSIfirst','1970-01-01 03:00:002WarningRSIOverbought','1970-01-01 03:00:002InfoBreakoutsecond']);
  expect(text(find(ui.render(),node=>node.props.role==='status'))).toContain('7 further messages were not kept');
  ui.field('Show info messages').props.onChange({target:{checked:false}});expect(rows()).toHaveLength(2);
  current=[];listener();ui.render();expect(text(ui.render())).toContain('No log messages yet');
 });
});

describe(' docked editor',()=>{
 const base={open:true,onClose:vi.fn(),chart:null,bars:[],fixture:true,identity:'Synthetic dock',library:createScriptLibrary(initialScript),onChange:vi.fn(),bindings:[],onBindingsChange:vi.fn()};
 it('docked, it is a bottom panel region with Editor and Logs tabs and an Open floating action',()=>{
  const onPlacement=vi.fn(),ui=mount(ScriptLibraryPanel,{...base,placement:'docked',onPlacement,dockHost:null});
  const region=find(ui.render(),node=>node.type==='section'&&node.props.role==='region');expect(region.props['aria-label']).toBe('Script editor');
  expect(findAll(ui.render(),node=>node.type===Modal)).toHaveLength(0);
  expect(find(ui.render(),node=>node.props.className==='lv-script-editor-tab').props.hidden).toBe(false);
  ui.click('Logs');expect(find(ui.render(),node=>node.props.className==='lv-script-editor-tab').props.hidden).toBe(true);expect(findAll(ui.render(),node=>node.type===ScriptLogsPanel)).toHaveLength(1);
  ui.click('Editor');expect(findAll(ui.render(),node=>node.type===ScriptLogsPanel)).toHaveLength(0);
  ui.click('Open floating');expect(onPlacement).toHaveBeenCalledWith('floating');
  ui.click('Close script editor');expect(base.onClose).toHaveBeenCalled();
  // The editor commands are the same in the dock.
  for(const label of ['Compile','Run and add to chart','Save script'])expect(()=>ui.button(label)).not.toThrow();
 });
 it('without a placement it stays the floating dialog, with Dock to bottom when the host offers it',()=>{
  const plain=mount(ScriptLibraryPanel,base);expect(findAll(plain.render(),node=>node.type===Modal)).toHaveLength(1);expect(()=>plain.button('Dock to bottom')).toThrow();
  hooks.cells=[];const onPlacement=vi.fn(),ui=mount(ScriptLibraryPanel,{...base,placement:'floating',onPlacement});ui.click('Dock to bottom');expect(onPlacement).toHaveBeenCalledWith('docked');
 });
 it('the editor check knows the new ctx members',()=>{
  const result=compileLVScript("({ onBar(ctx) { ctx.barcolor('#00ff00'); const id = ctx.label.new({ text: 'x' }); ctx.line.new(); ctx.box.new(); ctx.table.new(); ctx.log.info('x', id); } })");
  expect(result.diagnostics.filter(row=>row.code==='UNKNOWN_API')).toEqual([]);
 });
});

describe(' Style tab rows for hlines and fills',()=>{
 it('edits an hline colour, width and line style; untouched visual rows are not saved as overrides',()=>{
  const binding:ScriptBinding={id:'bound',documentId:'doc',version:1,name:'Levels',source:'({onBar(){}})',pane:'price',visible:true,plots:{},paneId:null,ownScale:false};
  const onApply=vi.fn(()=>true),ui=mount(ScriptSettingsDialog,{binding,entry:null,renderedPlots:{'lvplot:RSI':style('#9c7cf4',{lineStyle:'solid'})},renderedVisuals:{'lvhline:Upper':style('#787b86'),'lvfill:Band':style('rgba(111,168,255,0.2)',{lineStyle:'solid'})},onApply,onClose:vi.fn()});
  ui.click('Style');
  expect(()=>ui.field('Fill: Band color')).not.toThrow();expect(()=>ui.field('Fill: Band width')).toThrow();expect(()=>ui.field('Line: Upper plot type')).toThrow();
  ui.field('Line: Upper color').props.onChange({target:{value:'#ff0000'}});ui.field('Line: Upper width').props.onChange({target:{value:'3'}});ui.field('Line: Upper line style').props.onChange({target:{value:'solid'}});
  find(ui.render(),node=>node.type==='form').props.onSubmit({preventDefault(){}});
  const saved=(onApply.mock.calls[0] as any)[0].plots;
  expect(saved['lvhline:Upper']).toMatchObject({color:'#ff0000',width:3,lineStyle:'solid',visible:true});expect(Object.hasOwn(saved,'lvfill:Band')).toBe(false);expect(Object.hasOwn(saved,'lvplot:RSI')).toBe(true);
 });
});
