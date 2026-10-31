import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {StrategyDialog,COMMISSION_LABELS,TradeAnalysis,sameStrategyConfig,type StrategyDialogProps,type StrategyExecution} from '../../src/ui/StrategyDialog';
import {SavedReportPanel} from '../../src/strategy-report/SavedReport';
import {DEFAULT_STRATEGY_CONFIG,type StrategyConfig} from '../../src/domain/strategy';
import {ReportLoopbackPort} from './strategy-report-test-port';
// Strategy Properties and report-control handlers with controlled hooks, same harness as
// strategy-dialog-handlers. No DOM, native focus, keyboard dispatch or packaged window is exercised.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as (()=>void)[]}));
vi.mock('react',async()=>{
 const actual=await vi.importActual<any>('react');
 const same=(a:any[]|undefined,b:any[]|undefined)=>Boolean(a&&b&&a.length===b.length&&a.every((value,index)=>Object.is(value,b[index])));
 return {...actual,useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(next:any)=>{hooks.cells[index]=typeof next==='function'?next(hooks.cells[index]):next;}];},
  useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},
  useMemo:(factory:any,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||!same(old.deps,deps))hooks.cells[index]={deps,value:factory()};return hooks.cells[index].value;},
  useEffect:(effect:any,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||!same(old.deps,deps)){const cell={deps,cleanup:old?.cleanup};hooks.cells[index]=cell;hooks.effects.push(()=>{cell.cleanup?.();cell.cleanup=effect();});}},
 };
});
function text(node:any):string{return typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
function find(node:any,predicate:(value:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const found=find(child,predicate);if(found)return found;}}else if(node?.props){if(predicate(node))return node;return find(node.props.children,predicate);}return null;}
function all(node:any,predicate:(value:any)=>boolean,out:any[]=[]):any[]{if(Array.isArray(node))for(const child of node)all(child,predicate,out);else if(node?.props){if(predicate(node))out.push(node);all(node.props.children,predicate,out);}return out;}
function execution():StrategyExecution{
 const bars=[100,100,120].map((close,index)=>({time:1000+index*60,open:close,high:close,low:close,close,volume:1})),barIds=bars.map((_,index)=>'lv-c12-props:'+index);
 return {bars,barIds,identity:'lv-c12-props',source:'Explicit synthetic provider; no real security prices',currency:'USD',timezone:'UTC',chartType:'standard',result:{plots:[],alerts:[],state:null,diagnostics:[],elapsedMs:0,provisional:false,provenance:{kind:'synthetic',label:'Synthetic OpenCandle-C12 properties test'},orders:[{sequence:1,side:'buy',quantity:1,event:{id:barIds[0],revision:1,time:bars[0].time},virtual:true},{sequence:2,side:'sell',quantity:1,event:{id:barIds[1],revision:1,time:bars[1].time},virtual:true}]}};
}
function setup(){
 const change=vi.fn((_config:StrategyConfig)=>true),props:StrategyDialogProps={execution:execution(),config:{...DEFAULT_STRATEGY_CONFIG,commission:{kind:'fixed',value:0},initialCapital:1000},onChange:change,onClose:vi.fn()};
 const render=()=>{hooks.cursor=0;return StrategyDialog(props);};
 const flush=()=>{for(const effect of hooks.effects.splice(0))effect();};
 const button=(label:string)=>{const value=find(render(),node=>node.type==='button'&&text(node)===label);if(!value)throw Error('Missing button '+label);return value;};
 const input=(label:string)=>find(render(),node=>node.type==='label'&&text(node).startsWith(label)).props.children[1];
 return {props,change,render,flush,button,input,click:(label:string)=>button(label).props.onClick(),message:()=>text(find(render(),node=>node.type==='output'&&node.props.role==='alert')),status:()=>text(find(render(),node=>node.type==='output'&&node.props.role==='status'))};
}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];vi.stubGlobal('window',{lv:{exportData:vi.fn()}});vi.stubGlobal('Worker',ReportLoopbackPort);});
afterEach(()=>{for(const cell of hooks.cells)if(cell&&typeof cell==='object'&&typeof cell.cleanup==='function')cell.cleanup();vi.unstubAllGlobals();});

it('labels the engine commission models and shows unsupported recalculation options disabled with reasons',()=>{
 const ui=setup();ui.click('Properties');const tree=ui.render();
 const select=find(tree,node=>node.type==='select'&&node.props['aria-label']===undefined);expect(select.props.children.map((option:any)=>[option.props.value,text(option)])).toEqual([['percent',COMMISSION_LABELS.percent],['per-unit',COMMISSION_LABELS['per-unit']],['fixed',COMMISSION_LABELS.fixed]]);
 // The commission type and the limit-fill rule, which maps to the engine's limitVerifyTicks, are the only
 // selects: there is still no order-size dropdown the engine would ignore.
 // The Account currency select (Default or USD) joins them in the Capital section.
 expect(all(tree,node=>node.type==='select').map(node=>node.props['aria-label']??'commission')).toEqual(['Backtest date range','Account currency','commission','Limit order fills']); // The date range select leads the Properties form.
 // Recalculate on every tick and the Bar Magnifier became real settings;: so did recalculation after a fill, so nothing stays disabled.
 const unsupported=all(tree,node=>node.type==='input'&&node.props.disabled===true);expect(unsupported).toHaveLength(0);
 expect(all(tree,node=>node.type==='input'&&['Recalculate after order is filled','Recalculate on every tick','Bar Magnifier'].includes(node.props['aria-label'])).map(node=>[node.props['aria-label'],node.props.checked,node.props.disabled])).toEqual([['Recalculate after order is filled',false,undefined],['Recalculate on every tick',false,undefined],['Bar Magnifier',false,undefined]]);
 const body=text(tree);expect(body).toContain('Bar Magnifier');expect(body).toContain('Default (USD)');expect(body).toContain('explicit units');expect(body).toContain('The draft matches the applied properties.');
});
it('shows live configuration problems and keeps Apply from committing them',()=>{
 const ui=setup();ui.click('Properties');ui.input('Initial virtual capital').props.onChange({target:{value:'-5'}});
 expect(text(ui.render())).toContain('Fix before applying: Initial capital must be positive');expect(text(ui.render())).toContain('Unapplied changes');
 ui.click('Apply properties');expect(ui.change).not.toHaveBeenCalled();expect(ui.message()).toMatch(/Initial capital/);
});
it('applies once from Enter in a number field with the edited values',()=>{
 const ui=setup();ui.click('Properties');ui.input('Adverse slippage (ticks)').props.onChange({target:{value:'3'}});
 const form=find(ui.render(),node=>typeof node.props.onKeyDown==='function'&&node.type==='div');let prevented=0;
 form.props.onKeyDown({key:'Enter',nativeEvent:{isComposing:true},target:{type:'number'},preventDefault(){prevented++;}});expect(ui.change).not.toHaveBeenCalled();
 form.props.onKeyDown({key:'Enter',nativeEvent:{isComposing:false},target:{type:'checkbox'},preventDefault(){prevented++;}});expect(ui.change).not.toHaveBeenCalled();
 form.props.onKeyDown({key:'Enter',nativeEvent:{isComposing:false},target:{type:'number'},preventDefault(){prevented++;}});
 expect(prevented).toBe(1);expect(ui.change).toHaveBeenCalledOnce();expect(ui.change.mock.calls[0][0].slippageTicks).toBe(3);expect(ui.status()).toBe('Strategy properties applied.');
});
it('loads verified saved-report properties as an unapplied draft that only Apply commits',()=>{
 const ui=setup();const panel=find(ui.render(),node=>node.type===SavedReportPanel);expect(panel).toBeTruthy();
 const saved:StrategyConfig={...DEFAULT_STRATEGY_CONFIG,initialCapital:5000,commission:{kind:'percent',value:0.5},chartType:'heikin-ashi',fillBasis:'standard-ohlc'};
 panel.props.onLoadProperties(saved);
 expect(ui.change).not.toHaveBeenCalled();expect(ui.status()).toMatch(/unapplied draft/);expect(ui.input('Initial virtual capital').props.value).toBe(5000);
 ui.click('Apply properties');expect(ui.change).toHaveBeenCalledOnce();
 // Saved commission is kept; the chart transform stays the live chart's, not the saved one.
 expect(ui.change.mock.calls[0][0]).toMatchObject({initialCapital:5000,commission:{kind:'percent',value:0.5},chartType:DEFAULT_STRATEGY_CONFIG.chartType,fillBasis:'chart-prices'});
 // The pasted saved report lives outside the tab branch, so it survives the switch to Properties.
 expect(find(ui.render(),node=>node.type===SavedReportPanel)).toBeTruthy();
});
it('compares Properties field by field, so key order alone is not an unapplied change',()=>{
 const reordered=Object.fromEntries(Object.entries(DEFAULT_STRATEGY_CONFIG).reverse()) as unknown as StrategyConfig;
 expect(sameStrategyConfig(reordered,DEFAULT_STRATEGY_CONFIG)).toBe(true);expect(sameStrategyConfig({...reordered,commission:{kind:'fixed',value:1}},DEFAULT_STRATEGY_CONFIG)).toBe(false);
});
it('renders trade analysis for the selected direction with undefined shares for an empty side',()=>{
 const bucket=(key:number)=>({key,trades:0,wins:0,losses:0,even:0,net:0,winRate:null});
 const side=(trades:number)=>({outcomes:{trades,wins:trades,losses:0,even:0,winShare:trades?100:null,lossShare:trades?0:null,evenShare:trades?0:null},streaks:{longestWins:trades,longestLosses:0,bestWinRun:trades?7:null,worstLossRun:null,finalKind:trades?'win' as const:null,finalCount:trades},hour:Array.from({length:24},(_,key)=>key===9&&trades?{...bucket(key),trades,wins:trades,net:7,winRate:100}:bucket(key)),weekday:Array.from({length:7},(_,key)=>bucket(key)),month:Array.from({length:12},(_,key)=>bucket(key))});
 const analysis={basis:'Synthetic basis.',timezone:'UTC',sides:{all:side(1),long:side(1),short:side(0)}};
 const long=text(TradeAnalysis({analysis,side:'long'}));expect(long).toContain('100%');expect(long).toContain('09:00');expect(long).toContain('Best winning run net: 7');
 const short=text(TradeAnalysis({analysis,side:'short'}));expect(short).toContain('Undefined (no closed trades)');expect(short).toContain('No closed trades in this direction.');
});
it('Recalculate on every tick and Bar Magnifier toggle into the draft and Apply commits them', () => {
 const ui = setup(); ui.click('Properties');
 const box = (label: string) => find(ui.render(), node => node.type === 'input' && node.props['aria-label'] === label);
 box('Recalculate on every tick').props.onChange({ target: { checked: true } }); box('Bar Magnifier').props.onChange({ target: { checked: true } });
 const body = text(ui.render()); expect(body).toContain('Unapplied changes'); expect(body).not.toContain('Fix before applying');
 ui.click('Apply properties'); expect(ui.change).toHaveBeenCalledTimes(1);
 expect(ui.change.mock.calls[0][0]).toMatchObject({ calcOnEveryTick: true, barMagnifier: true, calcOnOrderFills: false });
});
it('Recalculate after order is filled and the USD account currency toggle into the draft and Apply commits them', () => {
 const ui = setup(); ui.click('Properties');
 find(ui.render(), node => node.type === 'input' && node.props['aria-label'] === 'Recalculate after order is filled').props.onChange({ target: { checked: true } });
 find(ui.render(), node => node.type === 'select' && node.props['aria-label'] === 'Account currency').props.onChange({ target: { value: 'USD' } });
 const body = text(ui.render()); expect(body).toContain('Unapplied changes'); expect(body).not.toContain('Fix before applying');
 ui.click('Apply properties'); expect(ui.change).toHaveBeenCalledTimes(1);
 expect(ui.change.mock.calls[0][0]).toMatchObject({ calcOnOrderFills: true, accountCurrency: 'USD' });
});
