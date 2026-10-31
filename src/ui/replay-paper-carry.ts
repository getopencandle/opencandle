import type {PaperAccount} from '../domain/paper';

/**
 * The replay paper account no longer resets on every seek.
 *
 * Every seek (Select bar, a start-point menu entry, Step back, an interval or scope change, a restart after Jump to real time)
 * still creates a new replay run identity, so chart, indicator, script and alert consumers recompute from the new clock. The
 * replay virtual account is carried across those runs within one replay session instead of starting from zero:
 * - a seek forward (the new replay time is at or after the account clock) carries the account as it is (cash, positions,
 *   working orders, fills), bound to the new run;
 * - a seek back (an earlier replay time) cannot keep trades made after that time, because the virtual account clock never runs
 *   backwards. The account returns to its last recorded state at or before the new time (rewind: "restore a matching
 *   checkpoint"); a plain notice says when trades were undone.
 * A new session (Close, then Continue; a different chart; a fresh session for a live chart) starts a fresh account as before.
 * Ordinary paper is never touched. The reference behaviour of the replay account across seeks is not recorded.
 *
 * Checkpoints are kept only when the account changes in more than its quotes and clock, so a long replay of marks alone adds
 * nothing. At most REPLAY_PAPER_CHECKPOINT_LIMIT are kept; a seek back before the oldest kept one starts a fresh account.
 * Paper accounts are immutable values (every action returns a copy), so the ledger holds them by reference.
 */
export const REPLAY_PAPER_CHECKPOINT_LIMIT=2000;
export const REPLAY_PAPER_REWIND_NOTICE='Bar Replay moved back in time, so the replay account returned to its state at that time. Replay trades made after it were undone.';
export const REPLAY_PAPER_TRIMMED_NOTICE='Bar Replay moved back past the oldest kept replay account record, so a new replay account starts.';
export interface ReplayPaperLedger {readonly sessionId:string;readonly checkpoints:readonly PaperAccount[];readonly latest:PaperAccount;readonly trimmed:boolean}
export interface ReplayPaperCarry {account:PaperAccount|null;ledger:ReplayPaperLedger|null;notice:string|null}

/** What a checkpoint is compared on: everything except the marks (quotes), the clock and the run binding. */
function material(account:PaperAccount):string{const {quotes:_quotes,clock:_clock,runId:_runId,...rest}=account;return JSON.stringify(rest);}

/** Records an accepted replay account for `sessionId`. A different session starts a new ledger; ordinary paper is ignored. */
export function recordReplayPaper(ledger:ReplayPaperLedger|null,sessionId:string,account:PaperAccount,limit=REPLAY_PAPER_CHECKPOINT_LIMIT):ReplayPaperLedger|null{
 if(account.mode!=='replay-paper')return ledger;
 if(!ledger||ledger.sessionId!==sessionId)return{sessionId,checkpoints:[account],latest:account,trimmed:false};
 if(ledger.latest===account)return ledger;
 const last=ledger.checkpoints[ledger.checkpoints.length-1];
 if(last&&material(last)===material(account))return{...ledger,latest:account};
 const checkpoints=[...ledger.checkpoints.filter(row=>row.clock<=account.clock),account];
 const over=checkpoints.length-Math.max(1,limit);
 return{sessionId,checkpoints:over>0?checkpoints.slice(over):checkpoints,latest:account,trimmed:ledger.trimmed||over>0};
}

/**
 * The replay account for a new run of the same session at replay time `time` (the last revealed bar time, the account's own
 * time base), or account null (start a fresh one) when the ledger belongs to another session or has nothing to restore.
 */
export function carryReplayPaper(ledger:ReplayPaperLedger|null,target:{sessionId:string;runId:string;time:number}):ReplayPaperCarry{
 if(!ledger||ledger.sessionId!==target.sessionId)return{account:null,ledger:null,notice:null};
 const latest=ledger.latest;
 if(latest.clock<=target.time){const account={...latest,runId:target.runId};return{account,ledger:{...ledger,latest:account},notice:null};}
 let index=ledger.checkpoints.length-1;while(index>=0&&ledger.checkpoints[index].clock>target.time)index--;
 if(index<0)return{account:null,ledger:null,notice:ledger.trimmed?REPLAY_PAPER_TRIMMED_NOTICE:null};
 const restored=ledger.checkpoints[index],account={...restored,runId:target.runId};
 return{account,ledger:{sessionId:ledger.sessionId,checkpoints:ledger.checkpoints.slice(0,index+1),latest:account,trimmed:ledger.trimmed},notice:material(restored)===material(latest)?null:REPLAY_PAPER_REWIND_NOTICE};
}
