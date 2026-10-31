import {closeReplay,type ReplaySavedSession,type ReplaySession} from '../domain/replay-session';
import type {PaperAccount} from '../domain/paper';

/**
 * A layout tab switch no longer throws away the replay of the tab being left.
 *
 * The session is closed exactly as the replay panel's Close does (closeReplay), which keeps its remembered record: clock,
 * interval, speed and the exact participant sources. That record is kept for the layout it belongs to. Going back to that
 * layout hands it back as the remembered session, so the replay panel offers Continue, which restores it paused at the
 * same clock through the ordinary Continue checks (same charts and sources, live charts on a fresh frozen copy). A replay
 * still choosing its start bar has no clock and is not kept. A remembered session that was already closed follows its
 * own layout the same way. At most LAYOUT_REPLAY_STASH_LIMIT layouts are remembered, least recent dropped;
 * nothing is persisted.
 *
 * The left tab's replay paper account goes with its paused replay. It is carried with the remembered record
 * (by record identity, so it follows the record through later switches until Continue) and Continue binds it to the
 * restored run, so orders, positions and funds come back as they were. A replay closed from the replay panel still
 * starts a fresh replay account on Continue, as before.
 */
export const LAYOUT_REPLAY_STASH_LIMIT=8;
export type LayoutReplayStash=Map<string,ReplaySavedSession>;
export interface LayoutReplayHandoff {paused:boolean;restored:ReplaySavedSession|null;same:boolean}
export function createLayoutReplayStash():LayoutReplayStash{return new Map();}
const carried=new WeakMap<ReplaySavedSession,PaperAccount>();
/** paper: the replay paper account of `session`, carried with the paused record. */
export function switchLayoutReplay(stash:LayoutReplayStash,leaving:string,entering:string,session:ReplaySession|null,remembered:ReplaySavedSession|null,now:number,paper:PaperAccount|null=null):LayoutReplayHandoff{
 if(leaving===entering)return{paused:false,restored:null,same:true};
 const closed=session?closeReplay(session,now).saved:null,kept=closed??remembered;
 if(closed&&paper&&session&&paper.mode==='replay-paper'&&paper.runId===session.runId)carried.set(closed,paper);
 stash.delete(leaving);
 if(kept){stash.set(leaving,kept);while(stash.size>LAYOUT_REPLAY_STASH_LIMIT)stash.delete(stash.keys().next().value!);}
 const restored=stash.get(entering)??null;stash.delete(entering);
 return{paused:!!closed,restored,same:false};
}
/** Status text for the switch, or null when there is nothing to say about replay. */
export function layoutReplayNote(handoff:LayoutReplayHandoff):string|null{
 if(handoff.paused)return 'Bar Replay on the previous layout is paused. Open that layout again to continue it.';
 if(handoff.restored)return 'Its paused Bar Replay can be continued from the replay panel.';
 return null;
}
/** The replay paper account carried with a remembered record, bound to the run Continue restored, or null
 * (no carried account: Continue starts a fresh one as before). */
export function carriedReplayPaper(saved:ReplaySavedSession|null,runId:string):PaperAccount|null{
 const account=saved?carried.get(saved):undefined;return account?{...account,runId}:null;
}
