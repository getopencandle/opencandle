// Replay speed kept per session, every script example fits 5,000 bars, the trade box is see-through
// in multi-chart cells, plain drawing-toolbar arrow names, and no "supplied" wording in the strategy policies.
import React from 'react';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {makeFixture} from '../../src/domain/fixtures';
import {scriptExamples} from '../../src/ui/ScriptPanel';
import {scriptBarIds,clearScriptBarIdCache} from '../../src/ui/script-input';
import {ChartTradingButtons} from '../../src/ui/ChartTradingButtons';
import {plainDrawingArrowName,retitleDrawingArrows} from '../../src/chart/adapter';
import {STRATEGY_POLICIES} from '../../src/domain/strategy';
import {openReplay} from '../../src/domain/replay-session';

const require=createRequire(import.meta.url);
const {ScriptJobs}=require('../../electron/script-jobs.cjs');
const DAY=86400,BUDGET=512*1024;

describe('WRAP-FIXES script examples',()=>{
 it('every built-in example runs on 5,000 bars inside the output budget, at low and high price levels',{timeout:120000},async()=>{
  const plain=makeFixture('GME',500);
  clearScriptBarIdCache();
  // The second pass scales to crypto-like levels with full-precision prices (no rounding in the data).
  for(const scale of [1,3000.123456789]){
   const bars=Array.from({length:5000},(_,index)=>{const bar=plain[index%500]!;return{...bar,open:bar.open*scale,high:bar.high*scale,low:bar.low*scale,close:bar.close*scale,time:1500000000+index*DAY};});
   const ids=await scriptBarIds('wrap-fixes-'+scale,bars),input=bars.map((bar,index)=>({id:ids[index],revision:1,...bar}));
   for(const [name,source] of Object.entries(scriptExamples)){
    const jobs=new ScriptJobs();
    try{
     const result=await jobs.run({requestId:'wrap-fixes',source,bars:input,chartPositionMode:'logical-v1'});
     expect(result.ok,name+' x'+scale+': '+result.error?.message).toBe(true);
     expect(new TextEncoder().encode(JSON.stringify(result.value)).length,name).toBeLessThan(BUDGET);
     // The logical snapshot is compact: no per-bar ID list and no per-point title list.
     expect(result.value.state.processedIds).toEqual([]);expect(result.value.state.plots).toEqual([]);expect(result.value.state.processedCount).toBe(5000);
    }finally{jobs.close();}
   }
  }
 });
 it('a logical result cannot be fed back as a snapshot',async()=>{
  const plain=makeFixture('GME',30),ids=await scriptBarIds('wrap-fixes-resume',plain),bars=plain.map((bar,index)=>({id:ids[index],revision:1,...bar}));
  const jobs=new ScriptJobs();
  try{
   const source=scriptExamples['SMA 20']!,first=await jobs.run({requestId:'wrap-a',source,bars,chartPositionMode:'logical-v1'});expect(first.ok).toBe(true);
   const again=await jobs.run({requestId:'wrap-b',source,bars:[],snapshot:first.value.state});expect(again.ok).toBe(false);
  }finally{jobs.close();}
 });
});

describe('WRAP-FIXES replay speed',()=>{
 it('reopening Bar Replay uses the last speed of this app session',()=>{
  const app=readFileSync('src/ui/App.tsx','utf8');
  expect(app).toContain('if(replaySession)replaySpeedMemory.current=replaySession.stepsPerSecond;');
  expect(app).toContain('stepsPerSecond:prior?.stepsPerSecond??replaySpeedMemory.current');
  const session=openReplay({participants:[{cellId:'a',instrumentId:'i',symbol:'GME',interval:'1D',chartType:'candles',datasetId:'d',revision:'1'}],activeCellId:'a',stepsPerSecond:3});
  expect(session.stepsPerSecond).toBe(3);
 });
});

describe('WRAP-FIXES trade box in multi-chart cells',()=>{
 const props={visible:true,legend:'normal' as const,legendBottom:0,quote:{bid:10,ask:10.02},digits:2,presetName:null,presetTooltip:null,oneClick:false,onBuy:()=>true,onSell:()=>true,quantity:'',onQuantity:()=>{}};
 it('is see-through only when asked, and only its controls take the pointer',()=>{
  expect(renderToStaticMarkup(React.createElement(ChartTradingButtons,props))).not.toContain('data-lv-see-through');
  expect(renderToStaticMarkup(React.createElement(ChartTradingButtons,{...props,seeThrough:true}))).toContain('data-lv-see-through="true"');
  const css=readFileSync('src/ui/chart-commands.css','utf8');
  expect(css).toContain('.lv-trade-buttons[data-lv-see-through=true]{pointer-events:none;opacity:.55;');
  expect(css).toContain('.lv-trade-buttons[data-lv-see-through=true] :is(button,input){pointer-events:auto}');
  expect(css).toContain('.lv-trade-buttons[data-lv-see-through=true]:is(:hover,:focus-within){opacity:1}');
  expect(readFileSync('src/ui/App.tsx','utf8')).toContain('<ChartTradingButtons seeThrough={(workspace.grid?.layout.cells.length??1)>1}');
 });
});

describe('WRAP-FIXES drawing toolbar arrow names',()=>{
 const groups=['Lines','Fibonacci','Patterns','Measurements','Shapes','Text','Icons','Magnet snap'];
 it('rewrites the eight "X — more" names without a dash',()=>{
  expect(groups.map(group=>plainDrawingArrowName(group+' — more'))).toEqual(['More lines','More Fibonacci tools','More patterns','More measurements','More shapes','More text tools','More icons','More magnet options']);
  expect(plainDrawingArrowName('Brushes — more')).toBe('More brushes');
  expect(plainDrawingArrowName('More lines')).toBeNull();expect(plainDrawingArrowName('Lines')).toBeNull();
 });
 it('retitles arrow buttons found under a root',()=>{
  const make=(label:string)=>{const attrs:Record<string,string>={'aria-label':label};return{nodeType:1,getAttribute:(name:string)=>attrs[name]??null,setAttribute:(name:string,value:string)=>{attrs[name]=value;},attrs};};
  const arrow=make('Fibonacci — more'),other=make('Undo'),root={querySelectorAll:()=>[arrow,other]} as unknown as ParentNode;
  retitleDrawingArrows(root);
  expect(arrow.attrs['aria-label']).toBe('More Fibonacci tools');expect(other.attrs['aria-label']).toBe('Undo');
 });
});

describe('WRAP-FIXES plain wording',()=>{
 it('strategy policies and the news, import and report text no longer say supplied',()=>{
  expect(STRATEGY_POLICIES.join(' ')).not.toMatch(/supplied/i);
  for(const file of ['src/ui/NewsDialog.tsx','src/ui/ImportDialog.tsx','src/strategy-report/ReportChart.tsx']){
   const visible=readFileSync(file,'utf8').replace(/All supplied news/g,'').replace(/\.supplied|notSupplied|supplied:/g,'');
   expect(visible,file).not.toMatch(/[Ss]upplied/);
  }
 });
});
