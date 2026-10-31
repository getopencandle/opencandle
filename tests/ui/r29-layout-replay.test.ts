import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import type {ReplaySavedSession,ReplaySession} from '../../src/domain/replay-session';
import {createLayoutReplayStash,switchLayoutReplay,layoutReplayNote,LAYOUT_REPLAY_STASH_LIMIT} from '../../src/ui/layout-replay-stash';

// goal 3: a layout tab switch pauses the replay of the tab being left; going back
// offers Continue. Synthetic session records only.
const participants=[{cellId:'c1',instrumentId:'LV:GME',symbol:'GME',interval:'1D',datasetId:'import:gme',revision:'r1',chartType:'candles'}];
const active=(clock:number|null,phase:'active'|'selecting-start'='active'):ReplaySession=>({schemaVersion:1,sessionId:'s1',generation:3,runId:'run-3',phase,scope:'current',activeCellId:'c1',participants,intervalChoice:'1D',interval:{} as never,clock,playing:true,stepsPerSecond:2,remainderMilliseconds:0} as unknown as ReplaySession);
const remembered:ReplaySavedSession={schemaVersion:1,sessionId:'old',scope:'current',activeCellId:'c1',participants:[{cellId:'c1',instrumentId:'LV:GME',symbol:'GME',interval:'1D',datasetId:'import:gme',revision:'r1'}],intervalChoice:'1D',clock:50,stepsPerSecond:1,savedAt:1};

describe(' layout tabs keep a replay paused per layout',()=>{
 it('leaving a layout with an active replay remembers it at its clock; returning hands it back once',()=>{
  const stash=createLayoutReplayStash();
  const out=switchLayoutReplay(stash,'A','B',active(1234),null,99);
  expect(out.paused).toBe(true);expect(out.restored).toBeNull();
  const back=switchLayoutReplay(stash,'B','A',null,null,100);
  expect(back.paused).toBe(false);
  expect(back.restored).toMatchObject({sessionId:'s1',clock:1234,stepsPerSecond:2,activeCellId:'c1'});
  expect(back.restored!.participants[0]).not.toHaveProperty('chartType');
  expect(switchLayoutReplay(stash,'A','B',null,null,101).restored).toBeNull();
  expect(switchLayoutReplay(stash,'B','A',null,null,102).restored).toBeNull();
 });
 it('a remembered (closed) session follows its own layout too; a replay still choosing its start is not kept',()=>{
  const stash=createLayoutReplayStash();
  expect(switchLayoutReplay(stash,'A','B',null,remembered,1).paused).toBe(false);
  expect(switchLayoutReplay(stash,'B','A',active(null,'selecting-start'),null,2).restored).toEqual(remembered);
  expect(switchLayoutReplay(stash,'A','B',null,null,3).restored).toBeNull();
 });
 it('reopening the same layout keeps today\'s behaviour (no hand-off) and the stash is bounded',()=>{
  const stash=createLayoutReplayStash();
  expect(switchLayoutReplay(stash,'A','A',active(5),null,1)).toEqual({paused:false,restored:null,same:true});
  for(let i=0;i<LAYOUT_REPLAY_STASH_LIMIT+3;i++)switchLayoutReplay(stash,'L'+i,'X'+i,active(i+1),null,i);
  expect(stash.size).toBe(LAYOUT_REPLAY_STASH_LIMIT);
  expect(switchLayoutReplay(stash,'Z','L0',null,null,50).restored).toBeNull();
  expect(switchLayoutReplay(stash,'Z','L'+(LAYOUT_REPLAY_STASH_LIMIT+2),null,null,51).restored?.clock).toBe(LAYOUT_REPLAY_STASH_LIMIT+3);
 });
 it('says what happened in plain words',()=>{
  expect(layoutReplayNote({paused:true,restored:null,same:false})).toBe('Bar Replay on the previous layout is paused. Open that layout again to continue it.');
  expect(layoutReplayNote({paused:false,restored:remembered,same:false})).toBe('Its paused Bar Replay can be continued from the replay panel.');
  expect(layoutReplayNote({paused:false,restored:null,same:false})).toBeNull();
 });
 it('App hands the replay off on a tab switch (source check)',()=>{
  const app=readFileSync(new URL('../../src/ui/App.tsx',import.meta.url),'utf8');
  expect(app).toContain("from './layout-replay-stash'");
  expect(app).toMatch(/switchLayoutReplay\(layoutReplays\.current,/);
  expect(app).toMatch(/setReplaySaved\(replayHandoff\.restored\)/);
 });
});
