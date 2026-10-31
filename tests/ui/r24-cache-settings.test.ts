import {expect,it,vi} from 'vitest';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MarketDataCacheSection} from '../../src/ui/MarketDataCacheSection';
import {DataSourcesPanel} from '../../src/ui/data-sources-panel';
import {describeCacheStatus,formatCacheSize} from '../../src/domain/live-cache';

// Data sources > Cached market data, markup and pure helpers only. Not executable UI evidence.
it('renders the size line and a plain Clear cached market data button (no nested form, no em dash)',()=>{
  const bridge={barCacheStatus:vi.fn(async()=>({ok:true as const,value:{schemaVersion:1 as const,bytes:0,entries:0,maxBytes:200*1024*1024}})),clearBarCache:vi.fn()};
  const html=renderToStaticMarkup(React.createElement('form',null,React.createElement(MarketDataCacheSection,{bridge})));
  expect(html).toContain('Cached market data');
  expect(html).toMatch(/<button type="button"[^>]*>Clear cached market data<\/button>/);
  expect(html).toContain('Checking cached market data...');expect(html).toContain('Not part of your saved workspace');
  expect(html.match(/<form/g)).toHaveLength(1);expect(html).not.toMatch(/type="submit"/);expect(html).not.toMatch(/\u2014/);
  const none=renderToStaticMarkup(React.createElement(MarketDataCacheSection,{bridge:null}));
  expect(none).toContain('Cached market data needs the desktop app.');expect(none).toMatch(/<button[^>]*disabled=""[^>]*>Clear cached market data/);
});
it('describes the cache size in plain words',()=>{
  expect(formatCacheSize(0)).toBe('0 KB');expect(formatCacheSize(300)).toBe('1 KB');expect(formatCacheSize(52_000)).toBe('51 KB');expect(formatCacheSize(12.34*1024*1024)).toBe('12 MB');expect(formatCacheSize(3.24*1024*1024)).toBe('3.2 MB');expect(formatCacheSize(200*1024*1024)).toBe('200 MB');expect(formatCacheSize(1.5*1024*1024*1024)).toBe('1.5 GB');
  expect(describeCacheStatus(null,true)).toBe('Checking cached market data...');
  expect(describeCacheStatus({schemaVersion:1,bytes:0,entries:0,maxBytes:200*1024*1024},true)).toBe('Empty (limit 200 MB)');
  expect(describeCacheStatus({schemaVersion:1,bytes:3*1024*1024,entries:1,maxBytes:200*1024*1024},true)).toBe('3 MB of 200 MB used, 1 chart');
  expect(describeCacheStatus({schemaVersion:1,bytes:3*1024*1024,entries:4,maxBytes:200*1024*1024},true)).toBe('3 MB of 200 MB used, 4 charts');
});
it('the Data sources panel shows the section only when given a cache prop',()=>{
  const live={coinbaseEnabled:false,onCoinbaseEnabledChange:vi.fn(),alpacaSymbols:[],onAlpacaSymbolsChange:vi.fn(),bridge:null};
  const storage={directory:'C:\\Synthetic\\Profile',onExport:vi.fn(),onReset:vi.fn(),onRestore:vi.fn()} as any;
  expect(renderToStaticMarkup(React.createElement(DataSourcesPanel,{live,storage}))).not.toContain('Clear cached market data');
  expect(renderToStaticMarkup(React.createElement(DataSourcesPanel,{live,storage,cache:{bridge:null}}))).toContain('Clear cached market data');
});
