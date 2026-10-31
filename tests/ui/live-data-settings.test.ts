import {expect,it,vi} from 'vitest';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {LiveDataSettings,AlpacaSymbolPicker,addStreamSymbols,parseAlpacaSymbols,describeKeyStatus} from '../../src/ui/LiveDataSettings';

// Live data settings markup and pure helpers only. Not executable UI evidence.
it('renders the Coinbase switch off by default and masked Alpaca key inputs with no stored value',()=>{
  const html=renderToStaticMarkup(React.createElement(LiveDataSettings,{coinbaseEnabled:false,onCoinbaseEnabledChange:vi.fn(),alpacaSymbols:['AAPL'],onAlpacaSymbolsChange:vi.fn(),bridge:null}));
  expect(html).toContain('Live crypto data (Coinbase public feed)');
  expect(html).not.toMatch(/type="checkbox"[^>]*checked/);
  expect(html.match(/type="password"/g)).toHaveLength(2);
  expect(html.match(/autoComplete="off"/g)).toHaveLength(3);/* two key fields plus the Add symbol box */
  expect(html).toContain('Test connection');expect(html).toContain('Remove key');
  expect(html).toMatch(/IEX exchange only/);
  expect(html).not.toMatch(/—/);
});
it('validates owner symbols and describes key status without any secret',()=>{
  expect(parseAlpacaSymbols('aapl, msft BRK.B aapl')).toEqual({symbols:['AAPL','MSFT','BRK.B'],error:null});
  expect(parseAlpacaSymbols('AAPL, $$$').error).toMatch(/Not a US stock symbol/);
  expect(parseAlpacaSymbols(Array.from({length:31},(_,i)=>'S'+String.fromCharCode(65+i%26)+String.fromCharCode(65+Math.floor(i/26))).join(' ')).symbols).toHaveLength(30);
  expect(describeKeyStatus({configured:true,keyIdHint:'****ABCD',encryption:true})).toBe('Key saved (ID ending ABCD). Stored encrypted on this computer.');
  expect(describeKeyStatus({configured:false,keyIdHint:null,encryption:false})).toMatch(/encryption is unavailable/);
});
it('has no nested form: Save is a plain button so it cannot submit the Settings dialog form it renders inside',()=>{
  const html=renderToStaticMarkup(React.createElement('form',null,React.createElement(LiveDataSettings,{coinbaseEnabled:false,onCoinbaseEnabledChange:vi.fn(),alpacaSymbols:[],onAlpacaSymbolsChange:vi.fn(),bridge:null})));
  expect(html.match(/<form/g)).toHaveLength(1);
  expect(html).not.toMatch(/type="submit"/);
  expect(html).toMatch(/<button type="button"[^>]*>Save key<\/button>/);
});
it('saved symbols are removable chips with a count, and the add box waits for a key',()=>{
  const html=renderToStaticMarkup(React.createElement(LiveDataSettings,{coinbaseEnabled:false,onCoinbaseEnabledChange:vi.fn(),alpacaSymbols:['AAPL','MSFT'],onAlpacaSymbolsChange:vi.fn(),bridge:null}));
  expect(html).toContain('aria-label="Remove AAPL"');expect(html).toContain('aria-label="Remove MSFT"');
  expect(html).toMatch(/2 (<!-- -->)?of(<!-- -->)? (<!-- -->)?30/);
  expect(html).toMatch(/role="combobox"[^>]*aria-label="Add symbol"|aria-label="Add symbol"[^>]*role="combobox"/);
  expect(html).toMatch(/<input[^>]*disabled[^>]*/);
  expect(html).toContain('Suggestions appear once a key is saved.');
  expect(html).toContain('Or search any stock on the chart. It&#x27;s added here automatically.');
  expect(html).not.toContain('The list is full');
  expect(html).not.toMatch(/Alpaca symbols|—/);
});
it('a full list says so, and adding drops the oldest saved symbol',()=>{
  const full=Array.from({length:30},(_,i)=>'S'+String.fromCharCode(65+i%26)+String.fromCharCode(65+Math.floor(i/26)));
  const html=renderToStaticMarkup(React.createElement(AlpacaSymbolPicker,{symbols:full,onChange:vi.fn(),keySaved:true}));
  expect(html).toContain('The list is full. Adding one drops the oldest.');
  const next=addStreamSymbols(full,['AAPL']);
  expect(next).toHaveLength(30);expect(next[29]).toBe('AAPL');expect(next).not.toContain(full[0]);expect(next[0]).toBe(full[1]);
  expect(addStreamSymbols(['AAPL'],['aapl','MSFT','AAPL','$$'].map(s=>s.toUpperCase()))).toEqual(['AAPL','MSFT']);
});
