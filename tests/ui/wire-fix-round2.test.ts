import {readFileSync} from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {createHeldKeyGate,type HeldKeyCommand} from '../../src/ui/held-key-gate';
import {ReplayPanel,type ReplayPanelProps} from '../../src/ui/ReplayPanel';
import {closeReplay,openReplay,selectReplayStart} from '../../src/domain/replay-session';
import {fixtureDataset} from '../../src/domain/fixtures';
import {calculationBarsForStyle} from '../../src/chart/calculation-bars';
// Root fence grant: the replay held-key kind, the Select bar control with no session, and plain
// calculation-bars messages. Pure modules and static markup; not interface evidence.

describe('round 2.1: replay is a HeldKeyCommand kind',()=>{
 it('the gate queues a typed replay command behind the background write and runs it after the write',()=>{
  let state:'idle'|'background'|'blocking'='background';const waiters:Array<()=>void>=[],ran:HeldKeyCommand[]=[],messages:string[]=[];
  const gate=createHeldKeyGate({state:()=>state,afterWrite:run=>{waiters.push(run);return()=>{};},capture:()=>()=>true,run:command=>{ran.push(command);},report:message=>messages.push(message)});
  const step:HeldKeyCommand={kind:'replay',action:'step',runId:'synthetic-run'};
  expect(gate.accept(step)).toBe(true);expect(ran).toEqual([]);
  state='idle';for(const run of waiters.splice(0))run();
  expect(ran).toEqual([step]);expect(messages).toEqual([]);
 });
 it('held-key-gate declares the kind and App carries it without a cast',()=>{
  // merge: added Shift+Left (Back one step) as a held-key replay action, so the declared kind gains 'step-back'.
  expect(readFileSync('src/ui/held-key-gate.ts','utf8')).toContain("{kind:'replay';action:'toggle-play'|'step'|'step-back';runId:string}");
  const app=readFileSync('src/ui/App.tsx','utf8');
  expect(app).not.toContain('as unknown as HeldKeyCommand');expect(app).not.toContain('ReplayHeldCommand');
 });
});

describe('round 2.2: Select bar is never a dead control',()=>{
 const chart=fixtureDataset('PANEL',30),participant={cellId:'c1',instrumentId:chart.instrument.id,symbol:'PANEL',interval:'1D',chartType:'candles',datasetId:chart.provenance.datasetId,revision:'1'};
 const active=selectReplayStart(openReplay({participants:[participant],activeCellId:'c1',sessionId:'r2'}),chart,chart.bars[9].time,'1D'),saved=closeReplay(active,Date.UTC(2026,9,17)).saved;
 const noop=()=>{};
 const render=(extra:Partial<ReplayPanelProps>)=>renderToStaticMarkup(React.createElement(ReplayPanel,{session:active,saved:null,intervalMenu:{auto:{id:'1D',reason:'Auto uses the chart interval.'},options:[]},multiChart:false,atEnd:false,unsupportedReason:null,clockLabel:'',onSelectStart:noop,onTogglePlay:noop,onStep:noop,onSpeed:noop,onInterval:noop,onScope:noop,onRealtime:noop,onClose:noop,onContinue:noop,...extra}));
 const selectBar=(html:string)=>html.match(/<button[^>]*aria-label="Select bar"[^>]*>/)![0];
 it('after a replay ends, Select bar stays enabled and the panel says it starts a new replay',()=>{
  expect(saved).not.toBeNull();const html=render({session:null,saved});
  expect(selectBar(html)).not.toContain('disabled');expect(selectBar(html)).toContain('title="Select bar to start a new replay"');
  expect(html).toContain('Continue session');expect(html).toContain('or select a bar to start a new replay');
 });
 it('with no session and nothing remembered, Select bar is disabled',()=>{
  expect(selectBar(render({session:null,saved:null}))).toContain('disabled=""');
 });
 it('an active session keeps the existing Select bar wording',()=>{
  const html=render({});expect(selectBar(html)).not.toContain('disabled');expect(selectBar(html)).toContain('title="Select bar"');
 });
});

describe('round 2.3: calculation-bars messages are plain text',()=>{
 const bars=[10,11,12.5,15,13].map((close,index)=>({time:1000+index*60,open:close,high:close,low:close,close,volume:1}));
 it('uses the chart type label, never the style id or the diagnostic code; the code stays on the error',()=>{
  expect(()=>calculationBarsForStyle(bars,'pointfigure')).toThrow('Point & figure calculation inputs are unavailable. No standard-bar substitute is supplied.');
  let error:unknown;try{calculationBarsForStyle(bars,'range',{settings:{range:10,phantomBars:false}});}catch(caught){error=caught;}
  expect(error).toBeInstanceOf(Error);const message=(error as Error).message;
  expect(message.startsWith('Range calculation inputs are unavailable: ')).toBe(true);expect(message).not.toMatch(/DERIVED_|\(|range calculation/);
  expect((error as {diagnosticCode?:string}).diagnosticCode).toBe('DERIVED_TICK_SIZE_UNAVAILABLE');
 });
});
