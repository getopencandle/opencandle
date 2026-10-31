import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {IndicatorDialog,IndicatorSettings} from '../../src/ui/IndicatorDialog';
import {IndicatorTemplatesDialog} from '../../src/ui/IndicatorTemplatesDialog';
import {createIndicatorLibrary,factoryIndicatorDefault,restoreIndicatorLibrary,saveIndicatorDefault,toggleIndicatorFavorite,type IndicatorLibrary} from '../../src/ui/indicator-library';
import {createIndicatorTemplates,saveIndicatorTemplate,type IndicatorTemplateContent,type IndicatorTemplates,type TemplateSource} from '../../src/ui/indicator-templates';
import {indicatorWarmupBars,filterIndicatorCatalog,indicatorDataStatus,indicatorDraftDirty,indicatorInstanceLabels,indicatorPaneChoices,indicatorRowDraft} from '../../src/ui/indicator-dialog-model';
import {DOMAIN_INDICATORS,indicatorInputSchema} from '../../src/chart/indicator-settings';
import {calculateIndicator} from '../../src/domain/indicators';
import type {IndicatorInstanceView} from '../../src/chart/indicator-port';
import type {IndicatorId} from '../../src/domain/indicators';

// Actual component handlers with deterministic per-component hook cells. This is
// neither a React DOM mount nor packaged GUI evidence; focus and native panes are excluded.
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

const overlay=new Set<IndicatorId>(['sma','ema','bb','vwap']);
/** Minimal in-memory stand-in for the indicator port: real ids, panes and settings, no calculation. */
function fakeChart(bars=120){
 let next=0;const rows:IndicatorInstanceView[]=[];
 const indicators={catalog:[...DOMAIN_INDICATORS],inputSchema:indicatorInputSchema,list:()=>structuredClone(rows),
  add:vi.fn((kind:IndicatorId,inputs:Record<string,unknown>,saved:any)=>{const id='ind-'+(++next);rows.push({id,kind,...structuredClone(saved),inputs:{...structuredClone(saved.inputs),...structuredClone(inputs)},paneId:overlay.has(kind)?'price':'pane-'+id,rendererId:'native-'+id,diagnostics:[],policies:[],series:[{id:kind,label:kind}],presentationDiagnostics:[],informationBars:bars,latestInformationTime:bars?1:null});return id;}),
  update:vi.fn((id:string,patch:any)=>{const row=rows.find(item=>item.id===id);if(!row)throw new Error('missing');Object.assign(row,structuredClone(patch));return true;}),
  remove:vi.fn((id:string)=>{const index=rows.findIndex(item=>item.id===id);if(index>=0)rows.splice(index,1);}),
  move:vi.fn((id:string,target:any)=>{const row=rows.find(item=>item.id===id)!;if(typeof target==='object'&&'pane' in target&&!rows.some(item=>item.paneId===target.pane))return;// like Vela: an unknown pane is a silent no-op
  row.paneId=target==='price'?'price':'newPane' in target?'pane-new-'+(++next):target.pane;})};
 // Renderer pane membership; extras simulate script or comparison series sharing a pane.
 const extras=new Map<string,number>(),chart={panes:{list:()=>[...new Set(rows.map(row=>row.paneId))].filter(Boolean).map(id=>({id:id!,kind:id==='price'?'price':'study',indicators:[...rows.filter(row=>row.paneId===id).map(row=>({id:row.rendererId,title:row.kind,ownScale:true})),...Array.from({length:extras.get(id!)??0},(_,i)=>({id:'extra-'+i,title:'script',ownScale:true}))]}))}};
 return {indicators,rows,chart,extras,getCalculationBars:()=>Array.from({length:bars},(_,i)=>({time:i}))};
}
function dialog(options:{bars?:number;library?:IndicatorLibrary;initialSelected?:string;seed?:IndicatorId[]}={}){
 const chart=fakeChart(options.bars),onChange=vi.fn(()=>true);let library=options.library??createIndicatorLibrary();
 for(const kind of options.seed??[])chart.indicators.add(kind,{},factoryIndicatorDefault(kind));
 const props:any={chart,get instances(){return chart.indicators.list();},get library(){return library;},ownerToken:{},onLibraryChange:vi.fn((value:IndicatorLibrary)=>{library=value;return true;}),onClose:vi.fn(),onChange,initialSelected:options.initialSelected};
 const render=()=>renderIn('dialog',()=>IndicatorDialog({...props,instances:props.instances,library:props.library}));
 let mountedKey:string|null=null;// React remounts a keyed editor after it was unmounted.
 const settings=()=>{const tree=render(),element=findAll(tree,node=>node.type===IndicatorSettings)[0];if(!element){mountedKey=null;return null;}if(mountedKey!==element.key){scopes.delete('settings:'+element.key);mountedKey=element.key;}return {element,tree:renderIn('settings:'+element.key,()=>IndicatorSettings(element.props))};};
 const S=()=>{const value=settings();if(!value)throw new Error('No settings editor');return value;};
 const label=(value:string)=>(node:any)=>node.props?.['aria-label']===value;
 const buttonText=(value:string)=>(node:any)=>node.type==='button'&&text(node)===value;
 return {chart,props,render,settings,
  click:(name:string)=>find(render(),label(name)).props.onClick(),
  clickText:(value:string)=>find(render(),buttonText(value)).props.onClick(),
  sClick:(value:string)=>find(S().tree,buttonText(value)).props.onClick(),
  sButton:(value:string)=>find(S().tree,buttonText(value)),
  sEdit:(name:string,value:string)=>find(S().tree,label(name)).props.onChange({target:{value}}),
  sField:(name:string)=>find(S().tree,label(name)),
  sSubmit:()=>S().tree.props.onSubmit({preventDefault(){}}),
  sText:()=>text(S().tree),
  text:()=>text(render()),
  get library(){return library;},
  selected:()=>settings()?.element.props.row.id??null};
}

it('search matches full names, acronyms and multiple terms; empty Favorites differs from no match',()=>{
 const all=[...DOMAIN_INDICATORS];
 expect(filterIndicatorCatalog(all,'All',[],'bollinger').rows).toEqual(['bb']);
 expect(filterIndicatorCatalog(all,'All',[],'STOCH').rows).toEqual(['stochastic']);
 expect(filterIndicatorCatalog(all,'All',[],'moving exponential').rows).toEqual(['ema']);
 expect(filterIndicatorCatalog(all,'All',[],'  ').rows).toEqual(['atr','bb','ema','macd','obv','rsi','sma','stochastic','volume','vwap']);// alphabetical by name
 expect(filterIndicatorCatalog(all,'All',[],'zzz')).toEqual({rows:[],empty:'no-match'});
 expect(filterIndicatorCatalog(all,'Favorites',[],'rsi')).toEqual({rows:[],empty:'favorites-empty'});
 expect(filterIndicatorCatalog(all,'Favorites',['rsi','atr'],'average')).toEqual({rows:['atr'],empty:''});
 expect(filterIndicatorCatalog(all,'Favorites',['rsi'],'macd')).toEqual({rows:[],empty:'no-match'});
 const ui=dialog();ui.click('Favorite Relative Strength Index');ui.clickText('Favorites');find(ui.render(),node=>node.props?.['aria-label']==='Search indicators').props.onChange({target:{value:'macd'}});
 expect(ui.text()).toContain('No favorite matches this search.');expect(ui.text()).not.toContain('Star an indicator');expect(ui.library.favorites).toEqual(['rsi']);
});

it('adding the same indicator twice creates two distinct, labelled instances and announces the duplicate',()=>{
 const ui=dialog();ui.click('Add Simple Moving Average');ui.click('Add Simple Moving Average');
 expect(ui.chart.indicators.add).toHaveBeenCalledTimes(2);expect(ui.chart.rows.map(row=>row.id)).toEqual(['ind-1','ind-2']);
 expect(ui.text()).toContain('Simple Moving Average added (2 on chart)');
 expect(ui.selected()).toBeNull();expect(ui.text()).toContain('2 on chart');
 expect(find(ui.render(),node=>node.props?.['aria-label']==='Edit SMA 9 close #1')).toBeTruthy();
 expect(indicatorInstanceLabels(ui.chart.rows).get('ind-2')).toBe('SMA 9 close #2');
});

it('edits one of two instances, keeps the other untouched, and Cancel discards a draft without mutation',()=>{
 const ui=dialog({seed:['sma','sma'],initialSelected:'ind-2'});expect(ui.selected()).toBe('ind-2');
 ui.sEdit('Length','20');expect(ui.sText()).toContain('Unapplied changes.');expect(ui.chart.indicators.update).not.toHaveBeenCalled();
 ui.sClick('Cancel');expect(ui.selected()).toBeNull();expect(ui.chart.rows.map(row=>row.inputs.length)).toEqual([9,9]);expect(ui.chart.indicators.update).not.toHaveBeenCalled();
 ui.click('Edit SMA 9 close #2');expect(ui.sField('Length').props.value).toBe('9');expect(ui.sText()).toContain('No unapplied changes.');
 ui.sEdit('Length','20');ui.sSubmit();expect(ui.chart.rows.map(row=>row.inputs.length)).toEqual([9,20]);expect(ui.props.onChange).toHaveBeenCalledTimes(1);
 expect(ui.text()).toContain('SMA 20 close');expect(ui.text()).not.toContain('#2');
});

it('switching instances with an unapplied draft asks first; Keep editing retains it and Discard switches',()=>{
 const ui=dialog({seed:['rsi','rsi'],initialSelected:'ind-1'});ui.sEdit('Length','5');
 ui.click('Edit RSI 14 close #2');expect(ui.selected()).toBe('ind-1');expect(ui.text()).toContain('RSI 14 close #1 has unapplied changes. Discard them and edit RSI 14 close #2?');
 ui.clickText('Keep editing');expect(ui.selected()).toBe('ind-1');expect(ui.sField('Length').props.value).toBe('5');
 ui.click('Edit RSI 14 close #2');ui.clickText('Discard changes and switch');expect(ui.selected()).toBe('ind-2');expect(ui.chart.rows.map(row=>row.inputs.length)).toEqual([14,14]);
 ui.click('Edit RSI 14 close #1');expect(ui.selected()).toBe('ind-1');expect(ui.sField('Length').props.value).toBe('14');
});

it('Reset draft to factory restores defaults only after Apply; Apply and close closes the editor',()=>{
 const ui=dialog({seed:['bb'],initialSelected:'ind-1'});ui.sEdit('Length','30');ui.sEdit('Standard deviations','3');ui.sSubmit();expect(ui.chart.rows[0].inputs).toMatchObject({length:30,multiplier:3});
 ui.sClick('Reset draft to factory');expect(ui.chart.rows[0].inputs).toMatchObject({length:30,multiplier:3});expect(ui.sText()).toContain('Unapplied changes.');
 ui.sClick('Apply and close');expect(ui.chart.rows[0].inputs).toEqual(factoryIndicatorDefault('bb').inputs);expect(ui.selected()).toBeNull();
});

it('remove deletes only the chosen duplicate and clears its editor',()=>{
 const ui=dialog({seed:['ema','ema'],initialSelected:'ind-1'});ui.click('Remove EMA 9 close #1');
 expect(ui.chart.rows.map(row=>row.id)).toEqual(['ind-2']);expect(ui.selected()).toBeNull();expect(ui.text()).toContain('Removed EMA 9 close #1.');expect(ui.text()).toContain('EMA 9 close');
 ui.click('Hide EMA 9 close');expect(ui.chart.rows[0].visible).toBe(false);
});

it('pane controls move into an existing indicator pane, disable no-op moves and keep the draft',()=>{
 const ui=dialog({seed:['rsi','macd'],initialSelected:'ind-1'});ui.sEdit('Length','7');ui.sClick('Placement');
 expect(ui.sText()).toContain('Current placement: Separate pane');expect(ui.sButton('Move to new pane').props.disabled).toBe(true);expect(ui.sText()).toContain('Already alone in its own pane.');
 ui.sClick('Move to pane with MACD 12 26 9');expect(ui.chart.indicators.move).toHaveBeenCalledWith('ind-1',{pane:'pane-ind-2'});expect(ui.chart.rows[0].paneId).toBe('pane-ind-2');
 expect(ui.sText()).toContain('Separate pane shared with MACD 12 26 9');expect(ui.sButton('Move to new pane').props.disabled).toBe(false);
 ui.sClick('Inputs');expect(ui.sField('Length').props.value).toBe('7');ui.sSubmit();expect(ui.chart.rows[0].inputs.length).toBe(7);
 ui.sClick('Placement');ui.sClick('Move to price pane');expect(ui.chart.rows[0].paneId).toBe('price');expect(ui.sButton('Move to price pane').props.disabled).toBe(true);
 const choices=indicatorPaneChoices({id:'x',paneId:null},[{id:'x',paneId:null}],new Map());expect(choices.choices.every(choice=>choice.disabled)).toBe(true);
 const unknownNative=indicatorPaneChoices({id:'x',paneId:'p'},[{id:'x',paneId:'p'}],new Map());expect(unknownNative.choices.find(choice=>choice.key==='new')?.disabled).toBe(false);expect(unknownNative.current).toContain('not reported');
});

it('a pane shared with a script or comparison series still offers a new pane',()=>{
 const ui=dialog({seed:['stochastic'],initialSelected:'ind-1'});ui.chart.extras.set('pane-ind-1',1);ui.sClick('Placement');
 expect(ui.sText()).toContain('shared with 1 other series (script or comparison)');expect(ui.sButton('Move to new pane').props.disabled).toBe(false);
 ui.sClick('Move to new pane');expect(ui.chart.indicators.move).toHaveBeenCalledWith('ind-1',{newPane:true});
});
it('adding while the open editor has unapplied changes keeps that editor and draft',()=>{
 const ui=dialog({seed:['rsi'],initialSelected:'ind-1'});ui.sEdit('Length','6');ui.click('Add Relative Strength Index');
 expect(ui.chart.rows).toHaveLength(2);expect(ui.selected()).toBe('ind-1');expect(ui.sField('Length').props.value).toBe('6');expect(ui.text()).toContain(' added');expect(ui.text()).not.toContain('Its settings are open');
});
it('dirty state ignores explicit legacy defaults and trimmed interval text after Apply',()=>{
 const row:any={id:'v',kind:'vwap',...factoryIndicatorDefault('vwap'),paneId:'price',rendererId:'n',diagnostics:[],policies:[],series:[],presentationDiagnostics:[],informationBars:1,latestInformationTime:1};
 for(const key of Object.keys(row.inputs))if(key.startsWith('band'))delete row.inputs[key];
 expect(indicatorDraftDirty({...indicatorRowDraft(row),inputs:{...factoryIndicatorDefault('vwap').inputs,...row.inputs}},row)).toBe(false);
 expect(indicatorDraftDirty({...indicatorRowDraft(row),inputs:{...row.inputs,band1Enabled:true}},row)).toBe(true);
 const ui=dialog({seed:['rsi'],initialSelected:'ind-1'});ui.sClick('Visibility');ui.sEdit('Indicator interval visibility','include');ui.sEdit('Indicator exact intervals','1D, 1W');ui.sSubmit();
 expect(ui.chart.rows[0].presentation?.visibility?.intervals).toEqual(['1D','1W']);expect(ui.sText()).toContain('No unapplied changes.');
});
it('externally moved or replaced instances reject a stale Apply instead of overwriting',()=>{
 const ui=dialog({seed:['atr'],initialSelected:'ind-1'});ui.sEdit('Length','21');ui.chart.rows[0].paneId='pane-elsewhere';ui.sSubmit();
 expect(ui.chart.indicators.update).not.toHaveBeenCalled();expect(ui.sText()).toContain('Discard the draft and reload');
});

it('missing data, unavailable results and short history are distinct states, never zero values',()=>{
 const base={diagnostics:[] as string[],inputs:{length:14},visible:true,series:[{id:'rsi',label:'RSI'}]};
 expect(indicatorDataStatus({...base,informationBars:0})).toMatchObject({state:'waiting'});
 expect(indicatorDataStatus({...base,series:[],informationBars:10,diagnostics:['Volume is unavailable.']})).toEqual({state:'unavailable',text:'Unavailable: Volume is unavailable.'});
 expect(indicatorDataStatus({...base,informationBars:20,diagnostics:['Band 2 overflowed.']})).toEqual({state:'partial',text:'Calculated from 20 bars with warnings: Band 2 overflowed.'});
 expect(indicatorDataStatus({...base,informationBars:10}).text).toBe('Length 14 is longer than the 10 loaded bars, so some values stay empty.');
 expect(indicatorDataStatus({...base,informationBars:14,visible:false})).toEqual({state:'hidden',text:'Hidden: not calculated while hidden.'});
 expect(indicatorDataStatus({...base,informationBars:0,visible:false},40).text).toBe('Hidden: not calculated while hidden. The chart has 40 bars; show the indicator to calculate it.');
 expect(indicatorDataStatus({...base,informationBars:14,visible:false},0).text).toBe('Hidden: not calculated while hidden. The chart has no bars loaded.');
 expect(indicatorDataStatus({...base,informationBars:0},40)).toMatchObject({state:'waiting',text:'Waiting for a calculation. The chart has 40 bars, but this indicator has not reported a result yet.'});
 expect(indicatorDataStatus({...base,informationBars:0},0).text).toBe('No bars are loaded on this chart. Load or import data for this chart.');
 expect(indicatorDataStatus({...base,kind:'rsi',informationBars:14}).text).toBe('Needs 15 bars for every line to have a value; 14 loaded, so some values stay empty.');expect(indicatorDataStatus({...base,informationBars:3900}).text).toBe('Calculated from 3,900 bars.');
 const ui=dialog({bars:0,seed:['obv'],initialSelected:'ind-1'});expect(ui.text()).toContain('No bars are loaded on this chart.');expect(ui.sText()).toContain('No bars are loaded');
});

it('saved defaults and favorites survive a JSON round trip and seed only new instances',()=>{
 let library=toggleIndicatorFavorite(createIndicatorLibrary(),'sma');library=saveIndicatorDefault(library,'sma',{...factoryIndicatorDefault('sma'),inputs:{...factoryIndicatorDefault('sma').inputs,length:50}});
 const restored=restoreIndicatorLibrary(JSON.parse(JSON.stringify(library)));expect(restored).toEqual(library);
 const ui=dialog({library:restored,seed:['sma']});ui.click('Add Simple Moving Average');expect(ui.chart.rows.map(row=>row.inputs.length)).toEqual([9,50]);
 expect(ui.text()).toContain('Simple Moving Average added (2 on chart)');
});

const source:TemplateSource={datasetId:'demo',resolution:'1D',instrumentId:'demo-gme',symbol:'GME',exchange:'NYSE',currency:'USD',assetClass:'stock',providerId:'synthetic-fixture',fixture:true,coverage:'synthetic demo bars',adjustment:'raw',session:'regular',timezone:'America/New_York'};
function templates(captured:IndicatorTemplateContent){
 const empty:IndicatorTemplateContent={indicators:[],scripts:[],rememberSymbol:false,rememberInterval:false,source:null};
 let library:IndicatorTemplates=saveIndicatorTemplate(createIndicatorTemplates(),'Existing',empty,()=> 'existing');library=saveIndicatorTemplate(library,'Scoped',{...empty,rememberSymbol:true,source},()=> 'scoped');
 const props={get library(){return library;},onLibraryChange:vi.fn((next:IndicatorTemplates)=>{library=next;}),capture:()=>({content:captured,assertCurrent:()=>{}}),previewApply:vi.fn(),onClose:vi.fn()};
 const render=()=>renderIn('templates',()=>IndicatorTemplatesDialog({...props,library}));
 const click=(value:string)=>find(render(),node=>node.type==='button'&&text(node)===value).props.onClick();
 return {props,render,click,get library(){return library;},nameInput:()=>find(render(),node=>node.type==='input'&&node.props.required),submitSave:()=>find(render(),node=>node.type==='form').props.onSubmit({preventDefault(){}}),checks:()=>findAll(render(),node=>node.type==='input'&&node.props.type==='checkbox'),status:()=>text(find(render(),node=>node.props.role==='status'))};
}
it('template name collision: Save replaces in place, keeping identity and bumping revision (DRAW-EDIT-FIX: one Save button)',()=>{
 const captured:IndicatorTemplateContent={indicators:[],scripts:[],rememberSymbol:false,rememberInterval:false,source:null},ui=templates(captured);
 ui.click('Save current chart');ui.nameInput().props.onChange({target:{value:'  existing '}});
 expect(text(ui.render())).toContain('Saving replaces the template named Existing.');
 ui.submitSave();expect(ui.props.onClose).toHaveBeenCalledOnce();
 const row=ui.library.records.find(item=>item.id==='existing')!;expect(row.revision).toBe(2);expect(row.name).toBe('existing');expect(ui.library.records).toHaveLength(2);
});
it('template scope loads from the selected template and a remembered symbol without a source basis is rejected',()=>{
 const ui=templates({indicators:[],scripts:[],rememberSymbol:false,rememberInterval:false,source:null});
 ui.click('Scoped · 0 indicators · 0 scripts');expect(text(ui.render())).toContain('Saved symbol: GME.');ui.click('Save current chart');expect(ui.checks().map(node=>node.props.checked)).toEqual([true,false]);
 ui.nameInput().props.onChange({target:{value:'New scoped'}});ui.submitSave();expect(ui.status()).toContain('needs an explicit source basis');expect(ui.props.onLibraryChange).not.toHaveBeenCalled();
 ui.checks()[0].props.onChange({target:{checked:false}});ui.submitSave();expect(ui.library.records.map(row=>row.name)).toEqual(['Existing','Scoped','New scoped']);
 expect(ui.library.records[2]).toMatchObject({rememberSymbol:false,rememberInterval:false,revision:1});
});
it('template list shows each scope and Delete removes only the pinned record',()=>{
 const ui=templates({indicators:[],scripts:[],rememberSymbol:false,rememberInterval:false,source:null});
 expect(text(ui.render())).toContain('Recalls symbol GME.');expect(text(ui.render())).toContain('Keeps the current symbol and interval.');
 ui.click('Existing · 0 indicators · 0 scripts');ui.click('Delete');expect(ui.library.records).toHaveLength(2);ui.click('Delete template');expect(ui.library.records.map(row=>row.id)).toEqual(['scoped']);
});

it('second review M1: a hidden instance with bars on the chart says not calculated, never import guidance or a stale count',()=>{
 const ui=dialog({bars:40,seed:['rsi'],initialSelected:'ind-1'});ui.click('Hide RSI 14 close');
 expect(ui.text()).toContain('Hidden: not calculated while hidden. The chart has 40 bars; show the indicator to calculate it.');expect(ui.text()).not.toContain('Load or import');expect(ui.text()).not.toContain('Calculated from 40');
 expect(ui.sText()).toContain('Hidden: not calculated while hidden.');
});
it('second review L1: a stale "Move to pane with" target reports that nothing moved',()=>{
 const ui=dialog({seed:['rsi','macd'],initialSelected:'ind-1'});ui.sClick('Placement');const stale=ui.sButton('Move to pane with MACD 12 26 9');
 ui.chart.indicators.remove('ind-2');stale.props.onClick();expect(ui.chart.rows[0].paneId).toBe('pane-ind-1');
 expect(ui.sText()).toContain('Not moved: the target pane no longer exists');expect(ui.sText()).not.toContain('Indicator moved to the selected pane.');
});
it('second review L2: immediate list and placement actions are labelled as outside the Cancel draft',()=>{
 const ui=dialog({seed:['atr'],initialSelected:'ind-1'});expect(ui.text()).toContain('Show, Hide and Remove apply immediately');ui.sClick('Placement');expect(ui.sText()).toContain('Moves apply immediately.');ui.sClick('Cancel');expect(ui.text()).not.toContain('Moves apply');
});
it('second review L3: typing a colliding name loads its stored scope and Save keeps or changes it as checked',()=>{
 const ui=templates({indicators:[],scripts:[],rememberSymbol:false,rememberInterval:false,source});ui.click('Save current chart');ui.nameInput().props.onChange({target:{value:' scoped'}});
 expect(ui.checks().map(node=>node.props.checked)).toEqual([true,false]);ui.submitSave();
 expect(ui.library.records.find(row=>row.id==='scoped')).toMatchObject({revision:2,rememberSymbol:true,rememberInterval:false});
 ui.click('Save current chart');ui.nameInput().props.onChange({target:{value:'Scoped'}});ui.checks()[1].props.onChange({target:{checked:true}});ui.submitSave();// replaces 'scoped' (renamed by the save above)
 expect(ui.library.records.find(row=>row.id==='scoped')).toMatchObject({revision:3,rememberSymbol:true,rememberInterval:true});
});
// Warm-up derived from the engine definitions, then checked against calculateIndicator itself.
const warmBars=Array.from({length:120},(_,i)=>{const close=100+10*Math.sin(i/3)+i%5;return {time:1700000000+i*86400,open:close-1,high:close+2+i%3,low:close-2-i%2,close,volume:1000+i};});
// The EMA indicator and the MACD EMAs are SMA-seeded (reference ARM 1D: EMA 9 first on bar 8, MACD on bar 25
// signal on bar 33), so EMA 9 needs 9 bars (was 1) and MACD 12/26/9 needs 34 with an EMA signal (was 1 and 26).
const warmCases:[IndicatorId,Record<string,unknown>,number][]=[
 ['sma',{length:9,source:'close'},9],['ema',{length:9,source:'close'},9],['rsi',{length:14,source:'close'},15],
 ['macd',{fast:12,slow:26,signal:9,source:'close',oscillatorType:'EMA',signalType:'EMA'},34],['macd',{fast:12,slow:26,signal:9,source:'close',oscillatorType:'SMA',signalType:'SMA'},34],['macd',{fast:12,slow:26,signal:9,source:'close',oscillatorType:'SMA',signalType:'EMA'},34],
 ['bb',{length:20,multiplier:2,basisType:'EMA',source:'close'},20],['stochastic',{length:14,smoothK:3,smoothD:3},18],['atr',{length:14,smoothing:'RMA'},14],['atr',{length:14,smoothing:'EMA'},1],
 ['volume',{length:20},20],['volume',{length:20,maType:'EMA'},1],['vwap',{anchor:'Session',timezone:'UTC',source:'hlc3'},1],['obv',{},1],
 ['sma',{length:9,source:'close',smoothingType:'SMA',smoothingLength:14,smoothingMultiplier:2},22],['rsi',{length:14,source:'close',smoothingType:'SMA+BB',smoothingLength:5,smoothingMultiplier:2},19],['ema',{length:9,source:'close',smoothingType:'EMA',smoothingLength:14,smoothingMultiplier:2},9],
];
it.each(warmCases)('second review L4: %s warm-up matches the engine (%j -> %i bars)',(kind,inputs,expected)=>{
 expect(indicatorWarmupBars(kind,inputs)).toBe(expected);
 const lastFilled=(count:number)=>calculateIndicator(kind,warmBars.slice(0,count),inputs as any).series.every(series=>series.values.at(-1)!==null);
 expect(lastFilled(expected)).toBe(true);if(expected>1)expect(lastFilled(expected-1)).toBe(false);
});
