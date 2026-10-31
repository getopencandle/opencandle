import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';

// App and port wiring of symbol math and second-symbol indicators (source checks; the behaviour is covered by
// tests/domain/r28-symbol-math.test.ts and tests/domain/r28-second-symbol-indicators.test.ts).
const app=()=>readFileSync('src/ui/App.tsx','utf8');

it('symbol search offers typed symbol math and opens it as a live derived chart',()=>{
 const text=app();
 expect(text).toContain('...symbolMathCandidates(query,dataset.resolution,symbol=>rows.some(row=>row.symbol===symbol))');
 expect(text).toContain("if(request.providerId===SYMBOL_MATH_PROVIDER_ID){const ok=openLive(SYMBOL_MATH_PROVIDER_ID,request.symbol,request.resolution);");
 expect(text).toContain('if(providerId===SYMBOL_MATH_PROVIDER_ID)symbol=handle.dataset().instrument.symbol;');
});
it('one provider table serves charts, restored charts and background alerts, including derived feeds',()=>{
 const text=app();
 expect(text).toContain('function liveProviderFor(providerId:string)');
 expect(text).toContain('const provider=liveProviderFor(providerId);');
 expect(text).toContain('feed.providerId===SYMBOL_MATH_PROVIDER_ID?liveProviderFor(feed.providerId):null');
 // Restored live charts still reopen through attachLive (the same provider table); the loop moved into
 // reopenLiveEntries so saved FRED charts, which are not feeds, reopen through the FRED cache instead.
 expect(text).toContain('reopenLiveEntries(r.reopen,r.fredReopen);');
 expect(text).toContain('for(const entry of entries)if(entry.providerId!==FRED_PROVIDER_ID)attachLive(entry.providerId,entry.symbol,entry.interval);');
});
it('components open through the chart loaders and count toward the Alpaca limit',()=>{
 const text=app();
 expect(text).toContain('const imported=importedComponent(symbol,resolution);if(imported)return staticComponentHandle(imported);');
 expect(text).toContain("if(!liveDataOf(current.current).coinbase)throw new Error('Coinbase live data is turned off. Open Data sources to turn it on.');");
 expect(text).toContain('...(symbolMathProvider.current?.componentSymbols()??[]).filter(symbol=>symbolMathComponentSource(symbol)!==\'coinbase\'&&ALPACA_SYMBOL.test(symbol))');
 expect(text).toContain('symbolMathProvider.current?.dispose();symbolMathProvider.current=null;');
});
it('the second-symbol loader is installed in every window (layout windows too) and cleaned up',()=>{
 const text=app();
 expect(text).toContain('// Layout windows load second-symbol series too (their feeds count toward the shared Alpaca cap in main).\r\n  const SECOND_SYMBOL_FEEDS=8,SECOND_SYMBOL_RETRY_MS=15000,SECOND_SYMBOL_DELAY_MS=600;'.replace(/\r\n/g,text.includes('\r\n')?'\r\n':'\n'));
 // typing SPY never streams S and SP: a newer lookup that extends or shortens the text supersedes an unopened one
 expect(text).toContain('row.resolution===resolution&&!row.handle&&(row.symbol.startsWith(symbol)||symbol.startsWith(row.symbol))');
 expect(text).toContain('return()=>{disposed=true;secondSymbolPrune.current=()=>{};setSecondSymbolLoader(null);for(const key of [...feeds.keys()])drop(key);};');
 const port=readFileSync('src/chart/indicator-port.ts','utf8');
 expect(port).toContain('nativeUnsubscribes.push(subscribeSecondSymbols(()=>{if(disposed)return;');
});
it('follow-up 1: every paper entry point refuses a derived chart with the plain reason',()=>{
 const text=app();
 expect(text).toContain('const derivedTrade=derivedPaperRefusal({instrument:dataset.instrument,datasetId:dataset.provenance.datasetId});');
 expect(text).toContain("const openOrderTicket=(side:'buy'|'sell',quantity?:string)=>{if(derivedTrade){setMessage(derivedTrade);return;}");
 expect(text).toContain("const openPaperTicket=(side:'buy'|'sell'|null)=>{if(side&&derivedTrade){setMessage(derivedTrade);return;}");
 expect(text).toMatch(/function chartPresetAction\(side:'buy'\|'sell',commandId:string,quantity\?:string\):boolean\{\r?\n  if\(derivedTrade\)\{setMessage\(derivedTrade\);return false;\}/);
 expect(text).toContain("disabledReason={!loaded||workspaceBusy?'Wait for the workspace change to finish.':derivedTrade}");
 expect(text).toContain('<PaperTradingDock tradingRefusal={derivedTrade} account=');
 expect(text).toContain('<PaperPanel tradingRefusal={derivedTrade} account=');
 expect(text).toContain("if(action==='paper-ticket'){const refusal=derivedPaperRefusal(snapshot);if(refusal)throw new Error(refusal);}");
 const dock=readFileSync('src/ui/PaperTradingDock.tsx','utf8');
    // The inline ladder yields to the floating DOM pane when it is open.
 expect(dock).toContain("{tab === 'dom' && !props.tradingRefusal && !domPane.open && <PaperDom ");
 expect(dock).toContain("className=\"buy\" disabled={!!props.tradingRefusal}");
 const panel=readFileSync('src/ui/PaperPanel.tsx','utf8');
 expect(panel).toContain('if (tradingRefusal) throw new Error(tradingRefusal);');
 expect(readFileSync('src/chart/adapter.ts','utf8')).toContain('paperRefusal:derivedPaperRefusal({datasetId:currentSource?.datasetId})');
});
it('follow-up 2 and 4: Coinbase off closes Coinbase-derived charts to a Disconnected stand-in; unused second-symbol feeds close',()=>{
 const text=app();
 expect(text).toContain("if(!ref||ref.providerId!==SYMBOL_MATH_PROVIDER_ID||!liveRefDependsOn(ref,'coinbase'))continue;closeLiveHandle(id);const holder=liveChartPlaceholder(ref,false);if(holder){registerLiveDataset(holder);setLiveDatasets(prior=>({...prior,[id]:holder}));}");
 expect(text).toContain('useEffect(()=>{secondSymbolPrune.current(secondSymbolDemand(workspace.grid));},[workspace.grid]);');
 expect(text).toContain('secondSymbolPrune.current=keep=>{for(const key of [...feeds.keys()])if(!keep.has(key))drop(key);};');
 expect(text).toContain('recent={readRecentSymbols(recentStorage())} resolution={dataset.resolution}');
});
