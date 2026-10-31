import {describe,expect,it,vi,beforeEach} from 'vitest';
import {settingsDefaults,chartSettingsSchema} from '../../src/chart/chart-settings';
import {tpoBlockMinutes,tpoProfileStart,tpoProfiles} from '../../src/chart/tpo';
import {AlertBlinkTracker,alertLabelBlinkAlpha} from '../../src/chart/alert-lines-data';
import {ALERT_POPUP_AUTOHIDE_MS,alertUserAway,resetAlertActivity,scheduleActivityAutoHide} from '../../src/domain/alert-delivery';
import {defaultChartSettingsDocument} from '../../src/chart/chart-settings-document';

// Defaults from the recorded facts/#tpo.styles and the recorded facts
describe('TPO defaults',()=>{
 it('match the reference facts',()=>{
  expect(settingsDefaults('tpo')).toMatchObject({periodsNum:1,blockSize:'30m',ticksPerRow:100,blocks:true,letters:true,singlePrints:false,poorHigh:false,poorLow:false,volumeProfile:true,volumeProfileValues:true,summary:false,rowSizeMode:'Auto'});
  expect(chartSettingsSchema('tpo').fields.find(field=>field.key==='blockSize')?.options).toEqual(['5m','10m','15m','30m','60m']);
  expect(tpoBlockMinutes('30m')).toBe(30);expect(tpoBlockMinutes('30')).toBe(30);
 });
 it('groups several periods into one profile and spreads volume over rows',()=>{
  const day=86400;
  expect(tpoProfileStart(day*1+5,'Day',2)).toBe(0);expect(tpoProfileStart(day*2+5,'Day',2)).toBe(day*2);
  const bars=[{time:0,open:1,high:3,low:1,close:2,volume:30},{time:day,open:2,high:3,low:2,close:3,volume:10}];
  const merged=tpoProfiles(bars,{profilePeriod:'Day',blockMinutes:30,rowSize:1,valueAreaPercent:70,initialBalanceBlocks:2,periodsNum:2});
  expect(merged).toHaveLength(1);expect(merged[0].rows.reduce((sum,row)=>sum+row.volume,0)).toBeCloseTo(40);
 });
});
describe('alerts',()=>{
 beforeEach(()=>{resetAlertActivity();});
 it('labels are a separate setting, on by default',()=>{expect(defaultChartSettingsDocument().alerts.labelsVisible).toBe(true);});
 it('blink fades out and in twice over 2.4 s',()=>{
  expect(alertLabelBlinkAlpha(0)).toBe(1);expect(alertLabelBlinkAlpha(600)).toBe(0);expect(alertLabelBlinkAlpha(1200)).toBe(1);expect(alertLabelBlinkAlpha(1800)).toBe(0);expect(alertLabelBlinkAlpha(2400)).toBe(1);
  const tracker=new AlertBlinkTracker();
  tracker.observe([{alertId:'a',triggerMark:null}],0);expect(tracker.active(0)).toBe(false);
  tracker.observe([{alertId:'a',triggerMark:'b:1'}],1000);expect(tracker.alpha('a',1600)).toBe(0);expect(tracker.active(3399)).toBe(true);expect(tracker.active(3400)).toBe(false);
 });
 it('auto-hide is 20 s and waits while the user is away',()=>{
  expect(ALERT_POPUP_AUTOHIDE_MS).toBe(20_000);
  expect(alertUserAway(100_000,50_000,false)).toBe(true);expect(alertUserAway(100_000,90_000,false)).toBe(false);expect(alertUserAway(1,null,true)).toBe(true);
  vi.useFakeTimers();try{
   const hide=vi.fn();scheduleActivityAutoHide(Date.now(),hide);
   vi.advanceTimersByTime(19_999);expect(hide).not.toHaveBeenCalled();vi.advanceTimersByTime(1);expect(hide).toHaveBeenCalledTimes(1);
  }finally{vi.useRealTimers();}
 });
});
