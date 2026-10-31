// The header symbol button hint names the key that opens the symbol search now. Ctrl+K is Quick search
//, so the hint follows the generated shortcut reference instead of a stale chord. Unit test, not GUI evidence.
import {describe,expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {HeaderSymbolButton,headerSymbolButtonView,HEADER_SYMBOL_SEARCH_HINT} from '../../src/ui/HeaderSymbolButton';
import {keyboardShortcutRows} from '../../src/ui/keyboard-shortcuts';
import {symbolEntryFromKey} from '../../src/ui/symbol-search';

describe(' header symbol button hint',()=>{
 it('matches the shortcut registry: typing the symbol opens symbol search, Ctrl+K is Quick search',()=>{
  const rows=keyboardShortcutRows(),row=(action:string)=>rows.find(entry=>entry.action===action);
  expect(row('Quick search')?.keys).toEqual(['Ctrl+K']);
  expect(row('Symbol search')).toBeUndefined();
  const typed=row('Symbol search ('+HEADER_SYMBOL_SEARCH_HINT+')');
  expect(typed).toMatchObject({group:'Chart',keys:['A to Z']});
  expect(symbolEntryFromKey({key:'g',ctrlKey:false,metaKey:false,altKey:false,shiftKey:false,isComposing:false,repeat:false},false)).toEqual({initialQuery:'G',origin:'typed'});
  expect(symbolEntryFromKey({key:'k',ctrlKey:true,metaKey:false,altKey:false,shiftKey:false,isComposing:false,repeat:false},false)).toBeNull();
 });
 it('the title names that key and no longer claims Ctrl+K',()=>{
  expect(headerSymbolButtonView('GME').title).toBe('Symbol search: GME (type the symbol)');
  expect(headerSymbolButtonView('  ').title).toBe('Symbol search: Symbol (type the symbol)');
  const html=renderToStaticMarkup(createElement(HeaderSymbolButton,{symbol:'GME',onOpen:()=>{}}));
  expect(html).toContain('title="Symbol search: GME (type the symbol)"');
  expect(html).not.toContain('Ctrl+K');
 });
});
