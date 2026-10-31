// Symbol info rows and the generated Keyboard shortcuts reference. SYNTHETIC data; unit tests, not GUI evidence.
import {describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
import {fixtureDataset} from '../../src/domain/fixtures';
import {alpacaInstrument,ALPACA_HYBRID_COVERAGE} from '../../src/domain/alpaca-live';
import {forgetAlpacaAssets,rememberAlpacaAssets,rememberedAlpacaAsset,symbolInfoRows} from '../../src/domain/symbol-info';
import {alpacaAssetCandidates} from '../../src/ui/symbol-search';
import {HeaderSymbolButton} from '../../src/ui/HeaderSymbolButton';
import {SymbolInfoDialog} from '../../src/ui/SymbolInfoDialog';
import {classifyWorkspaceKey,type FocusContext} from '../../src/ui/shortcut-dispatch';
import {keyboardShortcutRows,LISTENER_ONLY_KEYS,CONTEXT_DEPENDENT_KEYS} from '../../src/ui/keyboard-shortcuts';
import type {BarDataset} from '../../src/domain/types';

const value=(rows:{id:string;value:string}[],id:string)=>rows.find(row=>row.id===id)?.value;
function alpaca(symbol:string,coverage='IEX exchange only'):BarDataset{
 const base=fixtureDataset('GME',3);
 return{...base,instrument:alpacaInstrument(symbol),provenance:{...base.provenance,providerId:'alpaca-iex',providerName:'Alpaca Market Data (owner key, Basic plan)',fixture:false,coverage,adjustment:'split-adjusted',datasetId:'live:alpaca-iex:'+symbol+':1D'}};
}
describe(' Symbol info',()=>{
 it('shows symbol, description, exchange, type, currency, session, timezone, tick, point value, source, feed and adjustment',()=>{
  forgetAlpacaAssets();const rows=symbolInfoRows(alpaca('GME'));
  expect(rows.map(row=>row.label)).toEqual(['Symbol','Description','Exchange','Type','Currency','Session','Timezone','Tick size','Point value','Lot size','Data source','Feed','Adjustment']);
  expect(value(rows,'symbol')).toBe('GME');expect(value(rows,'type')).toBe('Stock');expect(value(rows,'currency')).toBe('USD');expect(value(rows,'timezone')).toBe('America/New_York');
  expect(value(rows,'session')).toContain('Regular 09:30 to 16:00');expect(value(rows,'session')).toContain('after-hours to 20:00');
  expect(value(rows,'tick')).toBe('0.01');expect(value(rows,'point')).toBe('1');
  expect(value(rows,'feed')).toContain('IEX exchange only');expect(value(rows,'adjustment')).toBe('Adjusted for splits');
  expect(value(symbolInfoRows(alpaca('GME',ALPACA_HYBRID_COVERAGE)),'feed')).toBe('History from all exchanges (15 minutes delayed), live from IEX');
 });
 it('uses Alpaca listings the app already received (symbol search), never a new request',()=>{
  forgetAlpacaAssets();
  alpacaAssetCandidates([{symbol:'GME.WS',name:'GameStop Corp. Warrants',exchange:'NYSE',tradable:true,status:'active',chartable:true,warrant:true}],'1D');
  expect(rememberedAlpacaAsset('gme.ws')?.name).toBe('GameStop Corp. Warrants');
  const rows=symbolInfoRows(alpaca('GME.WS'));expect(value(rows,'description')).toBe('GameStop Corp. Warrants');expect(value(rows,'exchange')).toBe('NYSE');expect(value(rows,'listing')).toBe('Active on Alpaca, tradable');
  rememberAlpacaAssets(Array.from({length:2100},(_,i)=>({symbol:'S'+i,name:'n',exchange:'X',tradable:true,status:'active',chartable:true,warrant:false})));
  expect(rememberedAlpacaAsset('GME.WS')).toBeNull(); // bounded
  for(const file of ['src/domain/symbol-info.ts','src/ui/SymbolInfoDialog.tsx'])expect(readFileSync(file,'utf8')).not.toMatch(/fetch\(|searchAlpacaAssets|window\.lv/);
 });
 it('labels synthetic data and an unknown adjustment plainly; the card renders every row',()=>{
  const data=fixtureDataset('GME',3),rows=symbolInfoRows({...data,provenance:{...data.provenance,adjustment:'unknown'}},null);
  expect(value(rows,'feed')).toContain('SYNTHETIC');expect(value(rows,'adjustment')).toBe('Not stated by the source');
  const markup=renderToStaticMarkup(SymbolInfoDialog({dataset:data,asset:null,onClose:()=>{}}));
  expect(markup).toContain('Symbol info');for(const row of symbolInfoRows(data,null))expect(markup).toContain('data-symbol-info="'+row.id+'"');
 });
 it('the header symbol opens Symbol info on right-click and from its info button; without onInfo it stays one button',()=>{
  const info=vi.fn(),tree:any=HeaderSymbolButton({symbol:'GME',onOpen:()=>{},onInfo:info});
  const [open,button]=tree.props.children;const event={preventDefault:vi.fn()};open.props.onContextMenu(event);expect(event.preventDefault).toHaveBeenCalled();
  button.props.onClick();expect(info).toHaveBeenCalledTimes(2);expect(button.props['aria-label']).toBe('Symbol info');expect(button.props.title).toBe('Symbol info…');
  const plain:any=HeaderSymbolButton({symbol:'GME',onOpen:()=>{}});expect(plain.type).toBe('button');expect(plain.props.onContextMenu).toBeUndefined();
 });
});
const CONTEXT:FocusContext={editable:false,composing:false,dialogOpen:false,menuOpen:false,dropdownOpen:false,chartFocus:true,loaded:true,placementActive:false,toolArmed:false,selectedDrawings:0,hasSelection:false};
const key=(k:string,mods:Record<string,boolean>={})=>({key:k,ctrlKey:false,metaKey:false,altKey:false,shiftKey:false,...mods});
describe(' Keyboard shortcuts reference',()=>{
 it('Ctrl+/ is a new binding that did not conflict; / alone stays Indicators; text and dialogs keep the key',()=>{
  expect(classifyWorkspaceKey(key('/',{ctrlKey:true}),CONTEXT)).toEqual({command:'shortcuts'});
  expect(classifyWorkspaceKey(key('/'),CONTEXT)).toEqual({command:'indicators'});
  expect(classifyWorkspaceKey(key('/',{ctrlKey:true}),{...CONTEXT,dialogOpen:true}).command).toBe('none');
  expect(classifyWorkspaceKey(key('/',{ctrlKey:true}),{...CONTEXT,editable:true}).command).toBe('none');
  const owners=keyboardShortcutRows().filter(row=>row.keys.includes('Ctrl+/'));expect(owners.map(row=>row.action)).toEqual(['Keyboard shortcuts']);
 });
 it('lists the bindings the classifiers actually return, grouped',()=>{
  const rows=keyboardShortcutRows(),keys=(action:string)=>rows.find(row=>row.action===action)?.keys;
  expect(keys('Save the layout')).toEqual(['Ctrl+S']);expect(keys('Undo')).toEqual(['Ctrl+Z']);expect(keys('Redo')).toEqual(['Ctrl+Y','Ctrl+Shift+Z']);
  expect(keys('Play or pause')).toEqual(['Shift+Down']);expect(keys('Forward one step')).toEqual(['Shift+Right']);
  expect(keys('Symbol search (type the symbol)')).toEqual(['A to Z']);expect(keys('Symbol search')).toBeUndefined();expect(keys('Quick search')).toEqual(['Ctrl+K']);
  expect(keys('Change the interval (type it)')).toEqual(['0 to 9']);expect(keys('Change the interval')).toEqual([',']);
  expect(keys('Invert the price scale')).toEqual(['Alt+I']);expect(keys('Reset the time scale')).toEqual(['Ctrl+Alt+Q']);
  expect(keys('Draw: Trend line')).toEqual(['Alt+T']);expect(keys('Draw: Rectangle')).toEqual(['Alt+Shift+R']);expect(keys('Horizontal line at the crosshair')).toEqual(['Alt+H']);
  expect(keys('Hide or show all drawings')).toEqual(['Ctrl+Alt+H']);expect(keys('Remove the selected drawing')).toEqual(['Delete','Backspace']);
  expect(keys('Buy with the order preset')).toEqual(['Shift+B']);expect(keys('Next watchlist symbol')).toEqual(['Space']);expect(keys('Previous watchlist symbol')).toEqual(['Shift+Space']);
  expect(keys('Maximize or restore the chart in a layout')).toEqual(['Alt+Enter','Alt+click']);expect(keys('Fullscreen')).toEqual(['Shift+F']);
  expect(rows.map(row=>row.group).filter((group,index,all)=>all.indexOf(group)===index)).toEqual(['General','Chart','Drawings','Price and time scales','Watchlist','Bar replay','Paper trading']);
  // Context-dependent keys are listed under each meaning; every other key names one action only.
  const byKey=new Map<string,string[]>();for(const row of rows)for(const k of row.keys)byKey.set(k,[...(byKey.get(k)??[]),row.action]);
  // The renderer keys add Left, Right and Shift+Right to the context-dependent keys (keyboard-shortcuts.ts).
  for(const [k,actions] of byKey)if(!CONTEXT_DEPENDENT_KEYS.includes(k))expect(actions,k).toHaveLength(1);
 });
 it('the listener-only keys are still handled inline where the list says',()=>{
  for(const row of LISTENER_ONLY_KEYS)expect(readFileSync(row.file,'utf8'),row.action).toContain(row.source);
 });
});
