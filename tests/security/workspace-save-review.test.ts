import {expect,it} from 'vitest';
import {createRequire} from 'node:module';
import {createMultiChartState} from '../../src/ui/MultiChartGrid';
import {fixtureDataset} from '../../src/domain/fixtures';
import {defaultTheme} from '../../src/ui/themes';
import {createPaperAccount} from '../../src/domain/paper';
import {restoreScriptBindings} from '../../src/ui/script-library';
import {prepareWorkspaceJSON,WORKSPACE_JSON_LIMITS} from '../../src/ui/workspace-json';
const require=createRequire(import.meta.url),{saveInput,exportInput}=require('../../electron/validation.cjs');

it('raw optional model fields require deliberate preparation before the strict native save/export boundary',()=>{
 const grid=createMultiChartState(fixtureDataset('GME',5),{themeId:defaultTheme.id,appearance:defaultTheme.appearance,chartTypeSettings:{},scriptBindings:[],style:'candles',drawings:{version:1,drawings:[]},indicators:[],comparisons:[],chartOptions:{source:'close',scale:'linear',auto:true,invert:false,timezone:'UTC'}});
 const data={grid,paper:createPaperAccount(),alerts:[]};
 expect(()=>saveInput({schemaVersion:1,expectedRevision:0,data})).toThrow();expect(()=>exportInput({schemaVersion:1,data})).toThrow();
 const prepared=prepareWorkspaceJSON(data),preparedGrid=prepared.grid as typeof grid;expect(()=>saveInput({schemaVersion:1,expectedRevision:0,data:prepared})).not.toThrow();expect(()=>exportInput({schemaVersion:1,data:prepared})).not.toThrow();expect(preparedGrid.cells[preparedGrid.layout.activeCellId]).not.toHaveProperty('viewport');expect(grid.cells[grid.layout.activeCellId]).toHaveProperty('viewport',undefined);
});

it('restored null-prototype script style maps become safe main-compatible own-property JSON without losing settings',()=>{
 const scripts=restoreScriptBindings([{id:'original',documentId:'source-original',version:1,name:'Synthetic original',source:'({onBar(){}})',pane:'price',visible:true,plots:{}}]);expect(Object.getPrototypeOf(scripts[0].plots)).toBeNull();
 const data=prepareWorkspaceJSON({scriptBindings:scripts});expect(Object.getPrototypeOf((data.scriptBindings as typeof scripts)[0].plots)).toBe(Object.prototype);expect(saveInput({schemaVersion:1,expectedRevision:0,data}).data.scriptBindings).toEqual(scripts);
});

it('only undefined object data fields may disappear; arrays, behavior, unsafe keys and custom prototypes reject without getter calls',()=>{
 let calls=0;const getter={};Object.defineProperty(getter,'value',{enumerable:true,get(){calls++;return 1;}});expect(()=>prepareWorkspaceJSON(getter)).toThrow(/accessors/);expect(calls).toBe(0);
 const original={optional:undefined,retained:null};expect(prepareWorkspaceJSON(original)).toEqual({retained:null});expect(Object.hasOwn(original,'optional')).toBe(true);
 for(const input of [{rows:[undefined]},{rows:Array(1)},{value:()=>1},{value:Infinity},{[Symbol('value')]:1},Object.create({inherited:1}),JSON.parse('{"__proto__":{}}'),{API_KEY:undefined},{authorization:'not stored'}])expect(()=>prepareWorkspaceJSON(input)).toThrow();
 const hidden={};Object.defineProperty(hidden,'value',{value:1,enumerable:false});expect(()=>prepareWorkspaceJSON(hidden)).toThrow(/hidden/);
 const cyclic:any={};cyclic.self=cyclic;expect(()=>prepareWorkspaceJSON(cyclic)).toThrow(/cycles/);
 const shared={synthetic:2};expect(prepareWorkspaceJSON({first:shared,second:shared})).toEqual({first:{synthetic:2},second:{synthetic:2}});
});

it('enforces exact compact UTF-8 bytes, escaping, nodes and depth before crossing main',()=>{
 const length=WORKSPACE_JSON_LIMITS.bytes-11,text='\u00e9'.repeat(Math.floor(length/2))+'x',exact={text};expect(new TextEncoder().encode(JSON.stringify(exact)).length).toBe(WORKSPACE_JSON_LIMITS.bytes);expect(prepareWorkspaceJSON(exact)).toEqual(exact);expect(()=>prepareWorkspaceJSON({text:text+'x'})).toThrow(/32 MiB/);
 expect(()=>prepareWorkspaceJSON({text:'\u0000'.repeat(Math.floor(WORKSPACE_JSON_LIMITS.bytes/6)+1)})).toThrow(/32 MiB/);
 expect(()=>prepareWorkspaceJSON({rows:Array(WORKSPACE_JSON_LIMITS.nodes).fill(null)})).toThrow(/node/);
 const deep=(count:number)=>{let value:any={synthetic:1};for(let i=1;i<count;i++)value={value};return value;};expect(()=>prepareWorkspaceJSON(deep(80))).not.toThrow();expect(()=>prepareWorkspaceJSON(deep(81))).toThrow(/nesting/);
});
