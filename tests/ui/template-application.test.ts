import {expect,it} from 'vitest';
import {prepareTemplateApplication,prepareTemplateDrawings,prepareTemplateSources} from '../../src/ui/template-application';
import {createIndicatorTemplates,saveIndicatorTemplate,templateSource} from '../../src/ui/indicator-templates';
// The app's demo 1D source is now demoDailyDataset (3,900 bars); a test that stands in for it uses the same dataset, or saved source bases no longer match.
import {fixtureDataset,demoDailyDataset} from '../../src/domain/fixtures';
import {defaultTheme} from '../../src/ui/themes';
import {ensureWorkspaceGrid} from '../../src/ui/workspace-grid';
import {resizeMultiChartState} from '../../src/ui/MultiChartGrid';
import {transitionDrawingScope} from '../../src/ui/drawing-scopes';

const pane=(paneId:string,replaceable:boolean)=>({paneId,replaceable,logicalPaneId:paneId,owners:paneId==='price'?[]:[{kind:'built',id:paneId+'-owner'}]});
const record=(id:string,paneId:string)=>({id,paneId,type:'future-tool',opaque:{retained:[1,2]},lvPaneBinding:{schemaVersion:1,target:paneId==='price'?{kind:'price'}:{kind:'logical',id:paneId,owners:pane(paneId,true).owners}}});
function state(){const basic=ensureWorkspaceGrid({symbol:'GME',sourceId:null,imports:[],chartStyle:'candles',themeId:defaultTheme.id,appearance:defaultTheme.appearance,chartOptions:{source:'close',scale:'linear',auto:true,invert:false,timezone:'UTC'},drawings:{version:1,drawings:[]},indicators:[],comparisons:[],scriptBindings:[]} as any);return {...basic,grid:resizeMultiChartState(basic.grid,'two-columns')};}
function template(symbol='SPY',resolution='1D'){return saveIndicatorTemplate(createIndicatorTemplates(),'Target',{indicators:[],scripts:[],rememberSymbol:true,rememberInterval:true,source:{...templateSource(demoDailyDataset(symbol)),resolution}},()=> 'template').records[0];}
it('removes only explicitly owned replaced panes and reconciles groups while preserving price and unaffected panes',()=>{
 const document={version:1,drawings:[record('price','price'),record('rsi','native-rsi'),record('comparison','native-comparison')],lvDrawingManager:{schemaVersion:1,groups:[{id:'folder',name:'Mixed',memberIds:['price','rsi']}],templates:[]}},before=JSON.stringify(document);
 const result=prepareTemplateDrawings(document,[pane('price',false),pane('native-rsi',true),pane('native-comparison',false)]);
 expect(result.removedIds).toEqual(['rsi']);expect((result.document.drawings as any[]).map(row=>row.id)).toEqual(['price','comparison']);expect((result.document.lvDrawingManager as any).groups[0].memberIds).toEqual(['price']);expect(JSON.stringify(document)).toBe(before);
});
it('blocks unresolved ownership and unknown mutable manager metadata rather than losing records',()=>{
 expect(()=>prepareTemplateDrawings({version:1,drawings:[{id:'opaque',type:'future'}]},[{paneId:'price',replaceable:false}])).toThrow('ownership');
 const document={version:1,drawings:[record('one','rsi')],lvDrawingManager:{schemaVersion:99,future:{references:['one']}}};expect(()=>prepareTemplateDrawings(document,[pane('price',false),pane('rsi',true)])).toThrow('Drawings are unavailable. No template was applied.');
 expect(()=>prepareTemplateDrawings({version:1,drawings:document.drawings,future:{references:['one']}},[pane('price',false),pane('rsi',true)])).toThrow('unknown fields');
});
it('preflights linked symbol and interval targets before returning any changed workspace',()=>{
 const workspace=state();workspace.grid.layout.sync.symbol=true;workspace.grid.layout.sync.interval=false;const before=JSON.stringify(workspace),prepared=prepareTemplateSources(workspace,template());
 expect(prepared.workspace.grid.layout.cells.map((row:any)=>row.symbol)).toEqual(['SPY','SPY']);expect(JSON.stringify(workspace)).toBe(before);
 const other=workspace.grid.layout.cells[1];other.interval='1W';workspace.grid.cells[other.id].datasetId='gme-weekly';workspace.imports=[{...demoDailyDataset('GME'),resolution:'1W',provenance:{...demoDailyDataset('GME').provenance,datasetId:'gme-weekly'}}];const pinned=JSON.stringify(workspace);
 expect(()=>prepareTemplateSources(workspace,template())).toThrow();expect(JSON.stringify(workspace)).toBe(pinned);
});
it('interval-only recall follows interval links without changing independent symbols or providers',()=>{
 const workspace=state(),other=workspace.grid.layout.cells[1],spy=demoDailyDataset('SPY');other.symbol='SPY';workspace.grid.cells[other.id]=transitionDrawingScope({...workspace.grid.cells[other.id],datasetId:spy.provenance.datasetId},demoDailyDataset('GME'),spy);workspace.grid.layout.sync.interval=true;workspace.grid.layout.sync.symbol=false;
 workspace.imports=['GME','SPY'].map(symbol=>({...demoDailyDataset(symbol),resolution:'1W',provenance:{...demoDailyDataset(symbol).provenance,datasetId:symbol+'-weekly'}}));
 const remembered={...template('GME','1W'),rememberSymbol:false},prepared=prepareTemplateSources(workspace,remembered);
 expect(prepared.workspace.grid.layout.cells.map((row:any)=>[row.symbol,row.interval])).toEqual([['GME','1W'],['SPY','1W']]);expect(prepared.changedSourceIds).toHaveLength(2);
});
it('keeps source and unrelated chart settings while replacing only active analysis with fresh identities',()=>{
 const workspace=state(),row={...template(),rememberSymbol:false,rememberInterval:false,indicators:[{id:'old',kind:'sma' as const,inputs:{length:3,source:'close'},plots:{},offset:0,visible:true,paneId:'price'}]},before=JSON.stringify(workspace);
 const result=prepareTemplateApplication(workspace,row,[{paneId:'price',replaceable:false}],['occupied'],()=> 'new');
 expect(result.sourceChanged).toBe(false);expect(result.changedSourceIds).toEqual([]);expect(result.workspace.indicators[0].id).toBe('new');expect(result.workspace.grid.cells[workspace.grid.layout.cells[1].id].indicators).toEqual([]);expect(JSON.stringify(workspace)).toBe(before);
});
