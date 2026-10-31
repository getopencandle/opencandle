import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {IndicatorDialog,IndicatorSettings} from '../../src/ui/IndicatorDialog';
import {IndicatorTemplatesDialog} from '../../src/ui/IndicatorTemplatesDialog';
import {createIndicatorLibrary,instanceDefaults} from '../../src/ui/indicator-library';
import {createIndicatorTemplates,restoreIndicatorTemplates,saveIndicatorTemplate,type IndicatorTemplateContent,type IndicatorTemplates,type TemplateSource} from '../../src/ui/indicator-templates';
import {indicatorDataStatus,indicatorInstanceLabels,indicatorPaneChoices,indicatorWarmupBars} from '../../src/ui/indicator-dialog-model';
import {createIndicatorPort} from '../../src/chart/indicator-port';
import {DOMAIN_INDICATORS} from '../../src/chart/indicator-settings';
import {calculateIndicator,type IndicatorId} from '../../src/domain/indicators';
import {nativeCoreHarness} from '../chart/native-core-harness';

// Independent second review. Component handlers with deterministic
// hook cells, driven against the REAL indicator port on the pinned Vela core harness where
// pane routing matters. Not a DOM mount and not packaged GUI evidence.
// Tests named "FIXED:" were "FINDING:" tests in the first review and now assert the fixed behavior.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return {...actual,
 useState:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]=typeof initial==='function'?initial():initial;return [cells[i],(value:any)=>{cells[i]=typeof value==='function'?value(cells[i]):value;}];},
 useRef:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]={current:initial};return cells[i];},
 useEffect:(effect:()=>void)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells)){cells[i]=true;effect();}}};});
const text=(node:any):string=>typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';
function findAll(tree:any,predicate:(node:any)=>boolean):any[]{const out:any[]=[];const visit=(node:any)=>{if(Array.isArray(node))return node.forEach(visit);if(!node?.props)return;if(predicate(node))out.push(node);visit(node.props.children);};visit(tree);return out;}
function find(tree:any,predicate:(node:any)=>boolean):any{const found=findAll(tree,predicate)[0];if(!found)throw new Error('Handler target missing');return found;}
const scopes=new Map<string,any[]>();
function renderIn<T>(scope:string,fn:()=>T):T{if(!scopes.has(scope))scopes.set(scope,[]);hooks.cells=scopes.get(scope)!;hooks.cursor=0;return fn();}
beforeEach(()=>{scopes.clear();});afterEach(()=>vi.unstubAllGlobals());
const button=(value:string)=>(node:any)=>node.type==='button'&&text(node)===value;
const bars=Array.from({length:40},(_,i)=>({time:1700000000000+i*60000,open:10+i,high:12+i,low:9+i,close:11+i,volume:i+1}));

async function realDialog(){
 const t=await nativeCoreHarness();const port=createIndicatorPort(t.chart,undefined,undefined,undefined,t.bridge.claim,()=>({resolution:'1m'}));t.core.bars=bars;
 const chart:any={indicators:port,chart:t.chart,getCalculationBars:()=>structuredClone(t.core.bars)};let library=createIndicatorLibrary();
 const props:any={chart,ownerToken:{},onLibraryChange:(next:any)=>{library=next;return true;},onClose:vi.fn(),onChange:vi.fn(()=>true)};
 const render=()=>renderIn('dialog',()=>IndicatorDialog({...props,instances:port.list(),library}));
 let key:string|null=null;
 const settings=()=>{const element=findAll(render(),node=>node.type===IndicatorSettings)[0];if(!element)throw new Error('No editor');if(key!==element.key){scopes.delete('s:'+element.key);key=element.key;}return renderIn('s:'+element.key,()=>IndicatorSettings(element.props));};
 return {t,port,render,settings,dispose(){port.dispose();t.dispose();},
  click:(label:string)=>find(render(),node=>node.props?.['aria-label']===label).props.onClick()};
}

it('real port: "Move to pane with" uses the renderer pane id and lands in the intended pane, persisting one shared logical id',async()=>{
 const d=await realDialog();try{
  d.click('Add Relative Strength Index');d.click('Add MACD');
  const [rsi,macd]=d.port.list();expect(rsi.paneId).not.toBe('price');expect(macd.paneId).not.toBe(rsi.paneId);
  d.click('Edit '+indicatorInstanceLabels(d.port.list()).get(rsi.id));
  find(d.settings(),button('Placement')).props.onClick();
  const macdLabel=indicatorInstanceLabels(d.port.list()).get(macd.id)!;
  // RSI is alone in its renderer pane: new-pane move is disabled with a reason, not inert.
  expect(find(d.settings(),button('Move to new pane')).props.disabled).toBe(true);
  find(d.settings(),button('Move to pane with '+macdLabel)).props.onClick();
  const after=d.port.list();expect(after.find(r=>r.id===rsi.id)!.paneId).toBe(macd.paneId);
  const saved=d.port.serialize();expect(saved[0].paneId).toBe(saved[1].paneId);expect(saved[0].paneId).toMatch(/^lv-pane-/);
  expect(text(d.settings())).toContain('Separate pane shared with '+macdLabel);
  // A pane holding two built-ins: new-pane move is offered again.
  expect(find(d.settings(),button('Move to new pane')).props.disabled).toBe(false);
 }finally{d.dispose();}
});

it('FIXED L1: a stale "Move to pane with" target is a silent native no-op and the editor reports "Not moved"',async()=>{
 const d=await realDialog();try{
  d.click('Add Relative Strength Index');d.click('Add MACD');
  const [rsi,macd]=d.port.list();
  d.click('Edit '+indicatorInstanceLabels(d.port.list()).get(rsi.id));find(d.settings(),button('Placement')).props.onClick();
  const stale=find(d.settings(),button('Move to pane with '+indicatorInstanceLabels(d.port.list()).get(macd.id)));
  d.port.remove(macd.id);// the target pane disappears before the click is handled
  expect(()=>d.port.move(rsi.id,{pane:macd.paneId!})).not.toThrow();// port accepts an unknown renderer pane
  stale.props.onClick();
  expect(d.port.list()[0].paneId).toBe(rsi.paneId);// nothing moved
  const body=text(d.settings());expect(body).not.toContain('Indicator moved to the selected pane.');
  expect(body).toContain('Not moved: the target pane no longer exists or did not accept the indicator.');
 }finally{d.dispose();}
});

it('real port: freshly added instances of all ten built-ins open with "No unapplied changes" and a non-zero data state',async()=>{
 const d=await realDialog();try{
  for(const kind of DOMAIN_INDICATORS){const saved=instanceDefaults(createIndicatorLibrary(),kind);d.port.add(kind,saved.inputs,saved);d.port.add(kind);}
  const rows=d.port.list();expect(rows).toHaveLength(20);
  const labels=indicatorInstanceLabels(rows);expect(new Set(labels.values()).size).toBe(20);
  for(const row of rows){
   scopes.delete('dialog');d.click('Edit '+labels.get(row.id));const body=text(d.settings());
   expect(body,row.kind).toContain('No unapplied changes.');
   const status=indicatorDataStatus(row);expect(status.text,row.kind).not.toMatch(/\b0 (?:supplied|loaded) bars|from 0 bars/);
  }
 }finally{d.dispose();}
});

it('labels stay unique for N identical copies and for copies differing only outside the label inputs',()=>{
 const base={kind:'sma' as const,inputs:{length:9,source:'close'}};
 const rows=[{id:'a',...base},{id:'b',...base},{id:'c',...base},{id:'d',kind:'sma' as const,inputs:{length:9,source:'close',smoothingType:'SMA'}}];
 const labels=indicatorInstanceLabels(rows);expect([...labels.values()]).toEqual(['SMA 9 close #1','SMA 9 close #2','SMA 9 close #3','SMA 9 close #4']);
});

it('FIXED M1: hidden instances read "not calculated while hidden" with the chart bar count, never import guidance or a stale count',async()=>{
 // Vela EngineOrchestrator.startNativeIndicator returns early when record.hidden, and setVisible(false)
 // suspends a started instance, so informationBars is 0 or stale for a hidden built-in.
 for(const informationBars of [0,500]){
  const status=indicatorDataStatus({diagnostics:[],informationBars,inputs:{length:14},visible:false,series:[]},40);
  expect(status.state).toBe('hidden');expect(status.text).toBe('Hidden: not calculated while hidden. The chart has 40 bars; show the indicator to calculate it.');
 }
 expect(indicatorDataStatus({diagnostics:[],informationBars:0,inputs:{},visible:false,series:[]},0).text).toBe('Hidden: not calculated while hidden. The chart has no bars loaded.');
 expect(indicatorDataStatus({diagnostics:[],informationBars:0,inputs:{},visible:false,series:[]},null).text).toBe('Hidden: not calculated while hidden.');
 expect(indicatorDataStatus({diagnostics:[],informationBars:0,inputs:{},visible:true,series:[]},40).text).not.toContain('Load or import');
 // Real port: hide through the list's Hide button; list and editor both use the hidden text.
 const d=await realDialog();try{
  d.click('Add Relative Strength Index');const [rsi]=d.port.list();const label=indicatorInstanceLabels(d.port.list()).get(rsi.id)!;
  d.click('Hide '+label);expect(d.port.list()[0].visible).toBe(false);
  const listText=text(d.render());expect(listText).toContain('Hidden: not calculated while hidden. The chart has 40 bars');expect(listText).not.toContain('Load or import');
  expect(listText).toContain('Show, Hide and Remove apply immediately');
 }finally{d.dispose();}
});

it('L2: Cancel discards the draft only; a prior move remains, and the disclosure is visible somewhere after Cancel',async()=>{
 const d=await realDialog();try{
  d.click('Add Relative Strength Index');d.click('Add Simple Moving Average');const [rsi]=d.port.list();
  d.click('Edit '+indicatorInstanceLabels(d.port.list()).get(rsi.id));
  find(d.settings(),node=>node.props?.['aria-label']==='Length').props.onChange({target:{value:'21'}});
  find(d.settings(),button('Placement')).props.onClick();expect(text(d.settings())).toContain('Moves apply immediately.');
  find(d.settings(),button('Move to price pane')).props.onClick();expect(d.port.list()[0].paneId).toBe('price');
  find(d.settings(),button('Cancel')).props.onClick();
  const live=d.port.list()[0];expect(live.inputs.length).toBe(14);expect(live.paneId).toBe('price');// draft gone, move kept
  expect(findAll(d.render(),node=>node.type===IndicatorSettings)).toHaveLength(0);// editor closed
  // Cancel's own status line is set and then unmounted with the editor, so it is not visible after Cancel.
  // The standing disclosures (list line, Placement line) carry L2 instead.
  expect(text(d.render())).not.toContain('Placement and Show/Hide changes were already applied');
  expect(text(d.render())).toContain('Cancel does not undo them');
 }finally{d.dispose();}
});

it('FIXED L4 (independent cases): warm-up equals the first bar count where every plot has a last value in calculateIndicator',()=>{
 const rows=Array.from({length:150},(_,i)=>{const close=50+7*Math.cos(i/4)+(i%7)*0.3;return {time:1700000000+i*3600,open:close-0.5,high:close+1+(i%4)*0.2,low:close-1-(i%3)*0.2,close,volume:500+(i*37)%211};});
 const cases:[IndicatorId,Record<string,unknown>][]=[
  ['macd',{fast:5,slow:10,signal:4,source:'close',oscillatorType:'SMA',signalType:'SMA'}],['macd',{fast:5,slow:10,signal:4,source:'close',oscillatorType:'EMA',signalType:'SMA'}],['macd',{}],
  ['stochastic',{length:5,smoothK:2,smoothD:4}],['bb',{length:7,multiplier:2,basisType:'WMA',source:'close'}],['bb',{length:7,multiplier:2,basisType:'RMA',source:'close'}],
  ['atr',{length:6,smoothing:'WMA'}],['atr',{length:6,smoothing:'SMA'}],['volume',{length:5,maType:'WMA'}],['rsi',{length:3,source:'close'}],
  ['rsi',{length:5,source:'close',smoothingType:'RMA',smoothingLength:4,smoothingMultiplier:2}],['obv',{smoothingType:'SMA+BB',smoothingLength:6,smoothingMultiplier:2}],['sma',{length:4,source:'close',smoothingType:'VWMA',smoothingLength:3,smoothingMultiplier:2}],['ema',{length:4,source:'close',smoothingType:'WMA',smoothingLength:5,smoothingMultiplier:2}],
 ];
 for(const [kind,inputs] of cases){
  const filled=(count:number)=>calculateIndicator(kind,rows.slice(0,count),inputs as any).series.every(series=>series.values.at(-1)!==null);
  let first=1;while(first<=rows.length&&!filled(first))first++;
  expect(indicatorWarmupBars(kind,inputs),kind+' '+JSON.stringify(inputs)).toBe(first);
 }
});

it('FIXED: factory smoothing-capable built-ins retain saved fill styles without inactive smoothing warnings',async()=>{
 const d=await realDialog();try{
  const smoothingKinds=['ema','obv','rsi','sma'];
  for(const kind of DOMAIN_INDICATORS){const saved=instanceDefaults(createIndicatorLibrary(),kind);const id=d.port.add(kind,saved.inputs,saved);const row=d.port.list().find(r=>r.id===id)!;
   // Other calculation/presentation warnings keep their own meaning. This
   // regression refuses only the prior warning for an inactive optional fill.
   expect(row.diagnostics.some(m=>/smoothing fill is unavailable/.test(m)),kind).toBe(false);
   expect(row.presentationDiagnostics.some(m=>/smoothing fill is unavailable/.test(m)),kind).toBe(false);
   if(smoothingKinds.includes(kind)){
    expect(saved.inputs.smoothingType,kind).toBe(kind==='rsi'?'SMA':'None');/* New RSIs seed the RSI-based MA SMA 21 */expect(saved.presentation!.fills.smoothing!.visible,kind).toBe(true);
    const persisted=d.port.serialize().find(item=>item.id===id)!;
    expect(persisted.inputs,kind).toEqual(saved.inputs);expect(persisted.presentation!.fills.smoothing,kind).toEqual(saved.presentation!.fills.smoothing);
   }
  }
  // Forty valid increasing closes exceed RSI's 15-bar warmup. With optional
  // smoothing disabled, the normal instance is calculated rather than partial.
  const rsi=d.port.list().find(r=>r.kind==='rsi')!;
  expect(indicatorDataStatus(rsi,40)).toEqual({state:'calculated',text:'Calculated from 40 bars.'});
 }finally{d.dispose();}
});

it('active smoothing-band overflow still reaches real-port diagnostics and partial data status',async()=>{
 const d=await realDialog();try{
  // Both input prices are finite; their two-point population deviation is
  // 5e303. Multiplication by 100000 exceeds the finite range, so the optional
  // band cannot be rendered even though the base length-1 SMA remains supplied.
  d.t.core.bars=[1e304,2e304].map((close,index)=>({time:1700000000000+index*60000,open:close,high:close,low:close,close,volume:1}));
  const saved=instanceDefaults(createIndicatorLibrary(),'sma');saved.inputs={...saved.inputs,length:1,smoothingType:'SMA+BB',smoothingLength:2,smoothingMultiplier:100000};
  const id=d.port.add('sma',saved.inputs,saved),row=d.port.list().find(item=>item.id===id)!;
  const warning='smoothing fill is unavailable because its required boundaries are absent or unavailable.';
  expect(row.informationBars).toBe(2);expect(row.series.some(plot=>plot.id==='sma')).toBe(true);
  expect(row.inputs.smoothingType).toBe('SMA+BB');expect(row.presentation!.fills.smoothing!.visible).toBe(true);
  expect(row.diagnostics.join(' ')).toMatch(/overflow/i);expect(row.diagnostics).toContain(warning);expect(row.presentationDiagnostics).toContain(warning);
  const status=indicatorDataStatus(row,2);expect(status.state).toBe('partial');expect(status.text).toContain('with warnings:');expect(status.text).toContain(warning);
 }finally{d.dispose();}
});

it('pane choices: unknown pane disables every move; price pane disables only move-to-price',()=>{
 const labels=new Map([['a','RSI 14 close'],['b','MACD 12 26 9']]);
 const unknown=indicatorPaneChoices({id:'a',paneId:null},[{id:'a',paneId:null},{id:'b',paneId:'pane-b'}],labels);
 expect(unknown.choices.every(c=>c.disabled)).toBe(true);
 const price=indicatorPaneChoices({id:'a',paneId:'price'},[{id:'a',paneId:'price'},{id:'b',paneId:'pane-b'}],labels,()=>1);
 expect(price.choices.map(c=>[c.key,c.disabled])).toEqual([['price',true],['new',false],['pane:pane-b',false]]);
});

const source:TemplateSource={datasetId:'demo',resolution:'1D',instrumentId:'demo-gme',symbol:'GME',exchange:'NYSE',currency:'USD',assetClass:'stock',providerId:'synthetic-fixture',fixture:true,coverage:'synthetic demo bars',adjustment:'raw',session:'regular',timezone:'America/New_York'};
function templates(captured:IndicatorTemplateContent,initial:IndicatorTemplates){
 let library=initial;
 const props={onLibraryChange:vi.fn((next:IndicatorTemplates)=>{library=next;}),capture:()=>({content:captured,assertCurrent:()=>{}}),previewApply:vi.fn(),onClose:vi.fn()};
 const render=()=>renderIn('templates',()=>IndicatorTemplatesDialog({...props,library}));
 const click=(value:string)=>find(render(),button(value)).props.onClick();
 return {render,click,get library(){return library;},nameInput:()=>find(render(),node=>node.type==='input'&&node.props.required),checks:()=>findAll(render(),node=>node.type==='input'&&node.props.type==='checkbox')};
}

it('templates: an older saved library round-trips through JSON and shows each stored scope',()=>{
 const empty:IndicatorTemplateContent={indicators:[],scripts:[],rememberSymbol:false,rememberInterval:false,source:null};
 let lib=saveIndicatorTemplate(createIndicatorTemplates(),'Plain',empty,()=>'plain');lib=saveIndicatorTemplate(lib,'Both',{...empty,rememberSymbol:true,rememberInterval:true,source},()=>'both');
 const restored=restoreIndicatorTemplates(JSON.parse(JSON.stringify(lib)));const ui=templates(empty,restored);const body=text(ui.render());
 expect(body).toContain('Keeps the current symbol and interval.');expect(body).toContain('Recalls symbol GME and interval 1D.');
 ui.click('Both · 0 indicators · 0 scripts');ui.click('Save current chart');expect(ui.checks().map(n=>n.props.checked)).toEqual([true,true]);
});

it('FIXED L3: a typed-name collision loads the stored scope, keeps it on replacement, and Save stores a changed scope (DRAW-EDIT-FIX: one Save)',()=>{
 const empty:IndicatorTemplateContent={indicators:[],scripts:[],rememberSymbol:false,rememberInterval:false,source:null};
 const lib=saveIndicatorTemplate(createIndicatorTemplates(),'Scoped',{...empty,rememberInterval:true,source},()=>'scoped');
 const ui=templates({...empty,source},lib);ui.click('Save current chart');ui.nameInput().props.onChange({target:{value:'scoped'}});
 expect(ui.checks().map(n=>n.props.checked)).toEqual([false,true]);
 find(ui.render(),(node:any)=>node.type==='form').props.onSubmit({preventDefault(){}});
 const row=ui.library.records[0];expect(row.id).toBe('scoped');expect(row.revision).toBe(2);expect(row.rememberInterval).toBe(true);
 ui.click('Save current chart');ui.nameInput().props.onChange({target:{value:'SCOPED '}});expect(ui.checks().map(n=>n.props.checked)).toEqual([false,true]);
 ui.checks()[1].props.onChange({target:{checked:false}});find(ui.render(),(node:any)=>node.type==='form').props.onSubmit({preventDefault(){}});
 expect(ui.library.records[0]).toMatchObject({id:'scoped',revision:3,rememberInterval:false});
});
