import {describe,expect,it} from 'vitest';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync,readdirSync} from 'node:fs';
import {INDICATOR_KINDS} from '../../src/chart/indicator-settings';
import {REFERENCE_ALIASES,REFERENCE_EXTRAS,confidenceNote,loadToolReference,parseBlocks,parseFrontMatter,parseInline,parseToolReference,referenceFileFor,referenceFileNames,referenceMeta,safeLinkHref,sourceTitle} from '../../src/ui/tool-reference';
import {ToolAboutView,referenceBlocks} from '../../src/ui/ToolAbout';
import {drawingCatalogRows,drawingRowReference,drawingTypeReference} from '../../src/ui/drawing-reference';

const DIR='docs/reference/tools/';
const files=readdirSync(DIR).filter(name=>name.endsWith('.md')&&name!=='README.md');
const raw=(name:string)=>readFileSync(DIR+name+'.md','utf8');
const html=(node:React.ReactNode)=>renderToStaticMarkup(React.createElement(React.Fragment,null,node));
const opener=()=>{};
/** Optional last section, being added to the files; when present it must come last. */
const OURS='How OpenCandle does it';

/** Indicators with no reference file yet. A new indicator without a file fails here; so does a gap that got its file. */
const KNOWN_INDICATOR_GAPS:readonly string[]=[];
/** Drawing toolbar rows with no reference file: the cursors and the eraser are not tools with a method. */
const KNOWN_DRAWING_GAPS:readonly string[]=['DW.CURSOR.CROSS','DW.CURSOR.DOT','DW.CURSOR.ARROW_CURSOR','DW.CURSOR.DEMONSTRATION','DW.CURSOR.MAGIC','DW.CURSOR.ERASER'];

describe('tool reference front matter',()=>{
 it('reads scalars, source lists with colons in values, and inline lists',()=>{
  const {data,body}=parseFrontMatter('---\nid: x\nname: "Quoted: name"\nalso: [a, b]\nsources:\n  - title: T: subtitle\n    author: A\n    year: 1978\n    url: https://example.org/a?b=c\n    type: primary\n  - title: Book only\n    url: book\nconfidence: low\n---\n\n## Purpose\nText');
  expect(data.name).toBe('Quoted: name');expect(data.also).toEqual(['a','b']);
  expect(data.sources).toEqual([{title:'T: subtitle',author:'A',year:'1978',url:'https://example.org/a?b=c',type:'primary'},{title:'Book only',url:'book'}]);
  expect(referenceMeta(data)).toMatchObject({id:'x',confidence:'low',also:['a','b']});
  expect(body.trim()).toBe('## Purpose\nText');
  expect(parseFrontMatter('no front matter').data).toEqual({});
 });
 it('parses every bundled file with an id equal to its name, a name, a kind and titled sources',()=>{
  expect(referenceFileNames().sort()).toEqual(files.map(name=>name.slice(0,-3)).sort());
  for(const name of files){
   const {meta,sections}=parseToolReference(readFileSync(DIR+name,'utf8'));
   expect(meta.id,name).toBe(name.slice(0,-3));expect(meta.name,name).not.toBe('');
   expect(['indicator','pattern','profile','drawing'],name).toContain(meta.kind);
   expect(meta.sources.length,name).toBeGreaterThan(0);expect(confidenceNote(meta.confidence),name).not.toBeNull();
   expect(sections[0]?.title,name).toBe('Purpose');
  }
 });
 it('keeps the alias table equal to the files\' also lists, and extras point at files',()=>{
  const also:Record<string,string>={};
  for(const name of files)for(const id of referenceMeta(parseFrontMatter(readFileSync(DIR+name,'utf8')).data).also)also[id]=name.slice(0,-3);
  expect(also).toEqual(REFERENCE_ALIASES);
  for(const [owner,extras] of Object.entries(REFERENCE_EXTRAS)){expect(referenceFileFor(owner)).toBe(owner);for(const extra of extras)expect(referenceFileFor(extra)).toBe(extra);}
 });
 it('drops research bookkeeping from source titles and keeps other remarks',()=>{
  expect(sourceTitle('ChartSchool, Relative Strength Index (retrieved this session)')).toBe('ChartSchool, Relative Strength Index');
  expect(sourceTitle('Linear regression (TA-Lib LINEARREG, ta_LINEARREG.c; retrieved this session)')).toBe('Linear regression (TA-Lib LINEARREG, ta_LINEARREG.c)');
  expect(sourceTitle('Stochastic Oscillator (Fast, Slow, and Full) (retrieved this session; cites an interview with Lane)')).toBe('Stochastic Oscillator (Fast, Slow, and Full) (cites an interview with Lane)');
  expect(sourceTitle('Part 1 (article abstract retrieved this session), Stocks & Commodities')).toBe('Part 1, Stocks & Commodities');
  for(const name of files)for(const source of parseToolReference(readFileSync(DIR+name,'utf8')).meta.sources)expect(sourceTitle(source.title),name).not.toMatch(/this session/i);
 });
});

describe('tool reference markdown subset',()=>{
 it('parses paragraphs, headings, lists with continuation lines, and tables',()=>{
  expect(parseBlocks('One\nline.\n\n### Sub\n- a\n  more\n- b\nAfter\n\n1. x\n2. y\n\n| A | B |\n|---|---|\n| 1 | 2 |')).toEqual([
   {t:'p',c:[{t:'text',v:'One line.'}]},{t:'h',c:[{t:'text',v:'Sub'}]},{t:'ul',items:[[{t:'text',v:'a more'}],[{t:'text',v:'b'}]]},{t:'p',c:[{t:'text',v:'After'}]},
   {t:'ol',items:[[{t:'text',v:'x'}],[{t:'text',v:'y'}]]},{t:'table',head:[[{t:'text',v:'A'}],[{t:'text',v:'B'}]],rows:[[[{t:'text',v:'1'}],[{t:'text',v:'2'}]]]}]);
 });
 it('reads bold, italic, inline code and http links, and leaves formula asterisks alone',()=>{
  expect(parseInline('a **bold** and *it* and _it2_ with `x*y` [site](https://example.org/p)')).toEqual([{t:'text',v:'a '},{t:'strong',c:[{t:'text',v:'bold'}]},{t:'text',v:' and '},{t:'em',c:[{t:'text',v:'it'}]},{t:'text',v:' and '},{t:'em',c:[{t:'text',v:'it2'}]},{t:'text',v:' with '},{t:'code',v:'x*y'},{t:'text',v:' '},{t:'link',href:'https://example.org/p',c:[{t:'text',v:'site'}]}]);
  for(const formula of ['n*Sum(xy) - Sum(x)*Sum(y)','width = k * sd','2*P0 + 2(1-t)t*P1','(x)*(y) and (a)*b','snake_case_name'])expect(parseInline(formula)).toEqual([{t:'text',v:formula}]);
 });
 it('never turns a javascript:, data: or relative target into a link',()=>{
  for(const href of ['javascript:alert(1)','JAVASCRIPT:alert(1)',' javascript:x','data:text/html,x','file:///c:/x','/relative','vbscript:x','https://user:pw@example.org/'])expect(safeLinkHref(href),href).toBeNull();
  const nodes=parseInline('[click](javascript:alert(1)) [ok](https://example.org/)');
  expect(nodes.filter(node=>node.t==='link').map(node=>(node as {href:string}).href)).toEqual(['https://example.org/']);
  const out=html(referenceBlocks([{t:'p',c:nodes}],opener));
  expect(out).not.toContain('javascript:');expect(out).toContain('click');expect(out.match(/<a /g)?.length).toBe(1);
 });
 it('shows markup in a file as text',()=>{
  const out=html(referenceBlocks(parseBlocks('<script>alert(1)</script> <img src=x onerror=alert(1)> <b>bold</b>'),opener));
  expect(out).not.toMatch(/<script|<img|<b>/);expect(out).toContain('&lt;script&gt;');
 });
 it('renders links only when an opener exists, and never with raw HTML injection',()=>{
  const blocks=parseBlocks('See [ChartSchool](https://chartschool.stockcharts.com/x).');
  expect(html(referenceBlocks(blocks,opener))).toContain('<a href="https://chartschool.stockcharts.com/x"');
  expect(html(referenceBlocks(blocks))).toBe('<p>See ChartSchool.</p>');
 });
});

describe('tool About view',()=>{
 it('never shows Open questions, and shows the sections in order with sources and the confidence note',()=>{
  for(const name of files){
   const reference=parseToolReference(readFileSync(DIR+name,'utf8')),out=html(React.createElement(ToolAboutView,{reference,open:opener}));
   expect(out,name).not.toMatch(/Open questions/i);
   expect(reference.sections.map(section=>section.title),name).not.toContain('Open questions');
   expect(out,name).toContain('<h4>Sources</h4>');
   const titles=reference.sections.map(section=>section.title);if(titles.includes(OURS))expect(titles.at(-1),name).toBe(OURS);
  }
  const rsi=parseToolReference(raw('rsi')),out=html(React.createElement(ToolAboutView,{reference:rsi,open:opener}));
  expect(rsi.sections.map(section=>section.title).filter(title=>title!==OURS)).toEqual(['Purpose','How the author meant it to be used','How you interact with it','Calculation','Standard defaults','Reading it','Common mistakes and edge cases']);
  expect(out).toContain('Based on primary sources.');expect(out).toContain('New Concepts in Technical Trading Systems');expect(out).toContain('J. Welles Wilder Jr., 1978, book');
  expect(out).not.toContain('n/a');expect(out).not.toMatch(/this session/);
  const ray=parseToolReference(raw('dw-trend-ray'));
  expect(ray.sections.map(section=>section.title).filter(title=>title!==OURS)).toEqual(['Purpose','How the author meant it to be used','How you draw it','Geometry and levels','Standard defaults','Reading it','Common mistakes and edge cases']);
  expect(html(React.createElement(ToolAboutView,{reference:ray,open:opener}))).toContain('Based on secondary sources.');
 });
 it('shows How OpenCandle does it from the file after the common mistakes and before Sources, and nothing without it',()=>{
  const file=['---','id: t','name: T','kind: indicator','sources:','  - title: S','    url: book','confidence: low','---','## Open questions','Hidden.','## How OpenCandle does it','- A flat window is unavailable.','## Common mistakes and edge cases','- One.','## Purpose','P.','## Something else','Not shown.'].join('\n');
  const reference=parseToolReference(file);
  expect(reference.sections.map(section=>section.title)).toEqual(['Purpose','Common mistakes and edge cases','How OpenCandle does it']);
  const out=html(React.createElement(ToolAboutView,{reference,open:opener}));
  expect(out).toContain('<h4>How OpenCandle does it</h4><ul><li>A flat window is unavailable.</li></ul></section><section><h4>Sources</h4>');
  expect(out).not.toMatch(/Open questions|Hidden|Something else/);
  expect(html(React.createElement(ToolAboutView,{reference:parseToolReference(file.replace(/## How OpenCandle does it\n[^#]*/,'')),open:opener}))).not.toContain('How OpenCandle does it');
 });
 it('adds an extra feature section',()=>{
  const out=html(React.createElement(ToolAboutView,{reference:parseToolReference(raw('rsi')),extras:[parseToolReference(raw('rsi-divergence'))],open:opener}));
  expect(out).toContain('<h4>RSI divergence');
 });
 it('loads a bundled file on demand',async()=>{
  const rsi=await loadToolReference('rsi');expect(rsi.meta.name).toBe('Relative Strength Index');
  await expect(loadToolReference('not-a-tool')).rejects.toThrow();
 });
});

describe('tool reference coverage',()=>{
 it('every indicator resolves to a file or is a listed gap',()=>{
  const gaps=INDICATOR_KINDS.filter(kind=>!referenceFileFor(kind));
  expect(gaps).toEqual([...KNOWN_INDICATOR_GAPS]);
 });
 it('every drawing toolbar row resolves to a file or is a listed gap',()=>{
  const rows=drawingCatalogRows(),gaps=rows.filter(row=>!drawingRowReference(row)).map(row=>row.id);
  expect(gaps).toEqual([...KNOWN_DRAWING_GAPS]);
  // The settings dialog finds the same file from the drawing type.
  for(const row of rows)if(row.target.kind==='tool'&&drawingRowReference(row))expect(drawingTypeReference(row.target.type),row.id).not.toBeNull();
  expect(drawingTypeReference('fibretracement')).toBe('fibretracement');expect(drawingTypeReference('lvshortposition')).toBe('position');
 });
});
