// Interval names, About layout, alert wording, add-on colors, text placeholder,
// quiet focus after a dialog, and the save dialog title.
import React from 'react';
import {readFileSync} from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {seriesTitle} from '../../src/ui/object-tree-model';
import {watermarkView} from '../../src/chart/chart-watermark';
import {chartExportFooterText} from '../../src/chart/image-export';
import {AboutDialog} from '../../src/ui/AboutDialog';
import {ALERT_NO_SOURCE_TEXT,ALERT_SOURCE_FAILED_TEXT,alertDiagnosticsLine} from '../../src/ui/AlertDialog';
import {distinctAddOnPlots} from '../../src/ui/indicator-dialog-model';
import {factoryIndicatorDefault} from '../../src/ui/indicator-library';
import {defaultPlotStyle} from '../../src/chart/indicator-rendering';
import {TEXT_TOOL_PLACEHOLDER,retitleTextPlaceholders} from '../../src/chart/adapter';

describe('FIX-RI7 interval names follow the toolbar',()=>{
 it('240m reads 4h in the Object tree, the watermark and the image footer; 1D stays 1D',()=>{
  expect(seriesTitle({symbol:'AAPL',exchange:'US',interval:'240m'})).toBe('AAPL · US, 4h');
  expect(seriesTitle({symbol:'AAPL',exchange:'US',interval:'1D'})).toBe('AAPL · US, 1D');
  const settings={ticker:true,interval:true,description:false,replay:true,color:'rgba(0,0,0,0.3)'} as Parameters<typeof watermarkView>[0];
  expect(watermarkView(settings,{symbol:'AAPL',interval:'240m',replay:true})?.lines[0].text).toBe('AAPL, 4h');
  expect(chartExportFooterText({symbol:'AAPL',interval:'240m',dateText:'2026-10-30'})).toBe('AAPL · 4h · 2026-10-30');
  expect(chartExportFooterText({symbol:'AAPL',interval:'45m',dateText:'2026-10-30'})).toBe('AAPL · 45m · 2026-10-30');
 });
});

describe('FIX-RI7 About box',()=>{
 it('the notices sit in the padded body and Close is a footer button',()=>{
  const html=renderToStaticMarkup(React.createElement(AboutDialog,{onClose:()=>{}}));
  const body=html.indexOf('about-larryvision-body'),notice=html.indexOf('about-larryvision-notice'),footer=html.indexOf('<footer');
  expect(body).toBeGreaterThan(-1);expect(notice).toBeGreaterThan(body);expect(footer).toBeGreaterThan(notice);
  expect(html.slice(footer)).toMatch(/<button type="button">Close<\/button>/);
  expect(readFileSync('src/ui/styles.css','utf8')).toMatch(/\.about-larryvision-body\{padding:16px 24px 8px\}/);
 });
});

describe('FIX-RI7 alert source wording',()=>{
 it('developer wording becomes one plain line; plain diagnostics pass through',()=>{
  const proof='The chart trading session request proof does not match its source basis.';
  expect(alertDiagnosticsLine([proof],true)).toBe(ALERT_NO_SOURCE_TEXT);
  expect(alertDiagnosticsLine([proof],false)).toBe(ALERT_SOURCE_FAILED_TEXT);
  expect(alertDiagnosticsLine([],true)).toBe(ALERT_NO_SOURCE_TEXT);
  expect(alertDiagnosticsLine(['price: Waiting for the next bar.'],false)).toBe('Waiting for the next bar.');
  for(const text of [ALERT_NO_SOURCE_TEXT,ALERT_SOURCE_FAILED_TEXT]){expect(text).not.toMatch(/—|proof|basis/);}
  const source=readFileSync('src/ui/AlertDialog.tsx','utf8');
  expect(source).not.toContain('Selected source unavailable');expect(source).not.toContain('Added conditions read price or indicator values');
 });
});

describe('FIX-RI7 add-on indicator color',()=>{
 it('SMA on RSI takes a color different from the RSI line; a saved custom color is kept',()=>{
  const saved=factoryIndicatorDefault('sma'),rsiColor=defaultPlotStyle('rsi','rsi',0).color;
  const placed=distinctAddOnPlots('sma',saved,{kind:'rsi'},'rsi'),plot=Object.keys(placed.plots??{})[0];
  expect(placed.plots?.[plot]?.color.toLowerCase()).not.toBe(rsiColor.toLowerCase());
  const custom={...saved,plots:{...saved.plots,[plot]:{...saved.plots![plot]!,color:'#123456'}}};
  expect(distinctAddOnPlots('sma',custom,{kind:'rsi'},'rsi')).toBe(custom);
  expect(distinctAddOnPlots('sma',saved,{kind:'rsi',plots:{rsi:{color:'#ff00ff'}}},'rsi')).toBe(saved);
 });
});

describe('FIX-RI7 small items',()=>{
 it('the inline text editor placeholder reads "Type text"',()=>{
  const area={tagName:'TEXTAREA',placeholder:'Enter Text'};const root={querySelectorAll:()=>[area]} as unknown as ParentNode;
  retitleTextPlaceholders(root);expect(area.placeholder).toBe(TEXT_TOOL_PLACEHOLDER);expect(TEXT_TOOL_PLACEHOLDER).toBe('Type text');
 });
 it('a clicked opener gets focus back without a ring; the drawing dialog is top-anchored',()=>{
  expect(readFileSync('src/ui/styles.css','utf8')).toMatch(/\[data-lv-quiet-focus\]:focus-visible\{outline:none\}/);
  expect(readFileSync('src/ui/Modal.tsx','utf8')).toMatch(/focusVisible:false/);
  expect(readFileSync('src/ui/styles.css','utf8')).toMatch(/\.drawing-dialog-scope>\.modal-shade\{align-items:flex-start/);
 });
 it('the save dialog has a plain title and blocks the asking window',()=>{
  const main=readFileSync('electron/main.cjs','utf8');
  expect(main).not.toContain('Export locally');expect(main).toContain("'Save image'");expect(main).toMatch(/setEnabled\(false\)/);expect(main).toMatch(/setEnabled\(true\)/);
 });
});
