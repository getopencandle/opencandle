// The replay paper account carried across seeks of one replay session (forward: kept; back: the last recorded
// state at or before the new time). SYNTHETIC virtual accounts; no real broker, account or key.
import { describe, expect, it } from 'vitest';
import { createPaperAccount, processPaperQuote, submitPaperOrder, type PaperAccount } from '../../src/domain/paper';
import { fixtureInstrument } from '../../src/domain/fixtures';
import { REPLAY_PAPER_CHECKPOINT_LIMIT, REPLAY_PAPER_REWIND_NOTICE, REPLAY_PAPER_TRIMMED_NOTICE, carryReplayPaper, recordReplayPaper } from '../../src/ui/replay-paper-carry';

const instrument = fixtureInstrument('CRY');
const fresh = (runId = 'replay-session:s:2') => createPaperAccount({ id: 'replay-paper', mode: 'replay-paper', runId, name: 'Replay virtual account', now: 0 });
function quote(account: PaperAccount, time: number, price = 100): PaperAccount {
  const result = processPaperQuote(account, { instrumentId: instrument.id, bid: price, ask: price, eventTime: time, availableAt: time, receivedAt: time, sequence: time, fixture: true, session: 'regular' } as never, time);
  expect(result.ok).toBe(true); return result.account;
}
function buy(account: PaperAccount, time: number): PaperAccount {
  const result = submitPaperOrder(account, { instrument, type: 'market', side: 'buy', quantity: 1 } as never, time);
  expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true); return result.account;
}

describe(' replay account across seeks', () => {
  it('a seek forward keeps the account and binds it to the new run', () => {
    const traded = buy(quote(fresh(), 1000), 1000);
    const ledger = recordReplayPaper(recordReplayPaper(null, 's', fresh()), 's', traded);
    const carried = carryReplayPaper(ledger, { sessionId: 's', runId: 'replay-session:s:3', time: 5000 });
    expect(carried.notice).toBeNull();
    expect(carried.account).toMatchObject({ id: 'replay-paper', mode: 'replay-paper', runId: 'replay-session:s:3', cash: traded.cash });
    expect(carried.account!.orders).toEqual(traded.orders); expect(carried.account!.fills).toEqual(traded.fills);
  });
  it('a seek back returns to the last state at or before the new time and says trades were undone', () => {
    const start = fresh(), early = buy(quote(start, 1000), 1000), late = buy(quote(early, 3000), 3000);
    let ledger = recordReplayPaper(null, 's', start); ledger = recordReplayPaper(ledger, 's', early); ledger = recordReplayPaper(ledger, 's', late);
    const back = carryReplayPaper(ledger, { sessionId: 's', runId: 'replay-session:s:4', time: 2000 });
    expect(back.notice).toBe(REPLAY_PAPER_REWIND_NOTICE);
    expect(back.account!.orders).toEqual(early.orders); expect(back.account!.runId).toBe('replay-session:s:4');
    expect(back.ledger!.checkpoints).toHaveLength(2);
    const before = carryReplayPaper(back.ledger, { sessionId: 's', runId: 'replay-session:s:5', time: 500 });
    expect(before.account!.orders).toEqual([]); expect(before.notice).toBe(REPLAY_PAPER_REWIND_NOTICE);
  });
  it('a seek back with no trade in between restores silently', () => {
    const start = fresh(), marked = quote(start, 4000);
    const ledger = recordReplayPaper(recordReplayPaper(null, 's', start), 's', marked);
    expect(ledger!.checkpoints).toHaveLength(1);
    const back = carryReplayPaper(ledger, { sessionId: 's', runId: 'replay-session:s:3', time: 1000 });
    expect(back.notice).toBeNull(); expect(back.account!.clock).toBeLessThanOrEqual(1000);
  });
  it('another session, ordinary paper or no ledger start a fresh account', () => {
    const ledger = recordReplayPaper(null, 's', fresh());
    expect(carryReplayPaper(ledger, { sessionId: 'other', runId: 'r', time: 1 })).toEqual({ account: null, ledger: null, notice: null });
    expect(carryReplayPaper(null, { sessionId: 's', runId: 'r', time: 1 }).account).toBeNull();
    const ordinary = createPaperAccount({ now: 0 });
    expect(recordReplayPaper(null, 's', ordinary)).toBeNull();
    expect(recordReplayPaper(recordReplayPaper(null, 'old', fresh()), 's', fresh())?.sessionId).toBe('s');
  });
  it('keeps at most the checkpoint limit and refuses to invent a state before the oldest kept one', () => {
    expect(REPLAY_PAPER_CHECKPOINT_LIMIT).toBe(2000);
    let account = quote(fresh(), 1), ledger = recordReplayPaper(null, 's', account, 3);
    for (let index = 0; index <= 3; index++) { account = buy(quote(account, 10 + index), 10 + index); ledger = recordReplayPaper(ledger, 's', account, 3); }
    expect(ledger!.checkpoints).toHaveLength(3); expect(ledger!.trimmed).toBe(true);
    const gone = carryReplayPaper(ledger, { sessionId: 's', runId: 'r', time: 5 });
    expect(gone).toEqual({ account: null, ledger: null, notice: REPLAY_PAPER_TRIMMED_NOTICE });
  });
});
