import {expect,it} from 'vitest';
import {captureReplayFrameCompletion,closeReplay,continueReplaySession,replayChartView,selectReplayStart,stepReplaySession,replayTimeline} from '../../src/domain/replay-session';
import {hourlyReplayDataset,selectHourlyReplay} from '../fixtures/nyse-hourly-replay';
function savedSource(){const data=hourlyReplayDataset(),session=selectHourlyReplay(data),saved=closeReplay(session,session.clock!+10).saved!;return{data,session,saved};}

it('gives a restored generation-two replay a genuinely new execution identity',()=>{
 const {data,session,saved}=savedSource(),restored=continueReplaySession(saved,[data],{hourly:'candles'},'60m');
 expect(restored.sessionId).toBe(session.sessionId);expect(restored.clock).toBe(session.clock);expect(restored.runId).not.toBe(session.runId);
});
it('does not reuse an execution identity across two restores of the same saved clock',()=>{
 const {data,saved}=savedSource(),a=continueReplaySession(saved,[data],{hourly:'candles'},'60m'),b=continueReplaySession(saved,[data],{hourly:'candles'},'60m');expect(a.runId).not.toBe(b.runId);
});
it('retires an actual prior completion observation when restoring the identical source and clock',()=>{
 const {data,session,saved}=savedSource(),before=replayChartView(session,data,null),lease=captureReplayFrameCompletion(before.frame.bars,data)!;expect(lease).not.toBeNull();lease.assertCurrent();
 const restored=continueReplaySession(saved,[data],{hourly:'candles'},'60m'),after=replayChartView(restored,data,null);expect(after.frame.bars).toEqual(before.frame.bars);expect(()=>lease.assertCurrent()).toThrow();expect(captureReplayFrameCompletion(after.frame.bars,data)?.execution).toBe(restored.runId);
});
it('keeps the restored incarnation distinct after an ordinary step followed by another seek',()=>{
 const {data,session,saved}=savedSource(),originalSeek=selectReplayStart(session,data,data.bars[1].time,'60m');
 const restored=continueReplaySession(saved,[data],{hourly:'candles'},'60m'),stepped=stepReplaySession(restored,replayTimeline([data])),restoredSeek=selectReplayStart(stepped,data,data.bars[1].time,'60m');
 expect(restoredSeek.sessionId).toBe(originalSeek.sessionId);expect(restoredSeek.clock).toBe(originalSeek.clock);expect(restoredSeek.runId).not.toBe(originalSeek.runId);
});
