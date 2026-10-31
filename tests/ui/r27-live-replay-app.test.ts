import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';

// App wiring of Bar Replay on live charts (source checks; the behaviour is covered by
// tests/domain/r27-replay-live-snapshot.test.ts).
const app=()=>readFileSync('src/ui/App.tsx','utf8');

it('a live chart is no longer refused: it replays a frozen copy, refused only without closed bars',()=>{
 const text=app();
 expect(text).not.toContain('Bar Replay is not available on a live chart');
 expect(text).toContain('if(isLiveDatasetId(activeId)&&!frozen[activeId]){setReplayRefusal(REPLAY_LIVE_NO_HISTORY);return null;}');
 expect(text).toContain('replayParticipantsOf(ws,pinReplayDatasets(raw,frozen))');
});
it('the snapshot follows the session setter and the chart reads it while replay holds it',()=>{
 const text=app();
 expect(text).toContain('replaySnapshotsFor(prior,next,workspaceDatasets(current.current))');
 // sessions: freeze selection still precedes the workspace fallback and each cell's exact override; raw source identity is restored before filtering.
 expect(text).toContain('const frozenRaw=replaySnapshots?.[rawDataset.provenance.datasetId],pinnedRaw=frozenRaw&&frozenRaw.instrument.id===rawDataset.instrument.id&&frozenRaw.resolution===rawDataset.resolution?frozenRaw:rawDataset;');
 expect(text).toContain('const dataset=useMemo(()=>cellSessionDataset(sessionDataset(rawCellSessionDataset(pinnedRaw),workspaceSessionMode),{session:activeSession}),[pinnedRaw,workspaceSessionMode,activeSession]);');
 // All-chart replay now applies every participant's own session rather than one global dataset view.
 expect(text).toContain('cellReplayLayoutFrames(replaySession,workspace.grid,replayUniverse)');
 expect(text).toContain('liveNote={liveReplayHeld?REPLAY_SNAPSHOT_NOTE:null}');
});
it('alerts and ordinary paper stay on the live feed while a live chart replays; replay trading keeps the replay account',()=>{
 const text=app();
 expect(text).toContain("activeInstrumentId={liveReplayHeld?'':dataset.instrument.id}");
 // F2: the routing is liveReplayPaperRouting (tests/ui/r27-live-review.test.ts covers its table).
 expect(text).toContain("const paperBackgroundKey=paperRouting.background==='all'?paperBackgroundSymbols(paper,'').join('|'):paperRouting.background==='none'?'':paperBackgroundSymbols(paper,dataset.instrument.id).join('|');");
 expect(text).toContain("const account=financial.current.paper,inputs=paperBackgroundInputs(account,'',paperBackground)");
 expect(text).toContain("const account=replay?currentReplayPaper.current:financial.current.paper;"); // unchanged: the chart trades the replay account
});
it('the ticket and the DOM show the live bid and ask outside replay only',()=>{
 const text=app();
 // The quote moved out of App. LiveBookBinding (tests/ui/r30-live-store.test.ts) builds the DOM's book and
 // source from the same instrument and the same action quote; App keeps the instrument watched with the same condition.
 expect(text).toContain("<LiveBookBinding instrumentId={chartQuoteInstrument} actionQuote={virtualActionQuote} mode=\"dock\">{reuse('dock:panel',<PaperTradingDock ");
 expect(text).toContain(' quote={virtualActionQuote}/>)}</LiveBookBinding>)}');
 expect(text).toContain('const chartQuoteInstrument=!replay&&!liveReplayHeld&&isLiveDatasetId(dataset.provenance.datasetId)?dataset.instrument.id:null;');
 expect(text).toContain('useEffect(()=>chartQuoteInstrument?liveQuotes.subscribe(chartQuoteInstrument,()=>{}):undefined,[chartQuoteInstrument]);');
 expect(text).not.toContain('useLiveQuote(');
 // merge with: a relayed ticket (another window's chart) now follows that instrument's own live book through
 // the same binding (relayQuoteInstrument, null in replay, a layout window or a non-Alpaca instrument), and prices on the
 // relayed quote (relayedTicketQuote; tests/ui/r30-paper-polish.test.ts).
 // LiveBookBinding is keyed on the cursor seed (tab|price) so a new seed remounts the ticket.
 expect(text).toContain('<LiveBookBinding key={(orderSeed.tab??\'\')+\'|\'+(orderSeed.price??\'\')} instrumentId={orderSeed.relay?relayQuoteInstrument:chartQuoteInstrument} mode="ticket">{reuse(\'dialog:order-ticket\',<PaperOrderTicket ');
 expect(text).toContain('quote={orderSeed.relay?relayedTicketQuote(activeAccount,orderSeed.relay):virtualActionQuote} quoteSource=');
});
