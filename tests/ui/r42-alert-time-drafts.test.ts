import {beforeEach,describe,expect,it,vi} from 'vitest';
import {setup,saved,invoke} from '../helpers/alert-dialog-harness';
import * as times from '../../src/ui/alert-time';
import {buildAlertDefinition,type AlertDraft} from '../../src/ui/AlertDialog';
import {alertHistoryCsv} from '../../src/domain/alert-history-export';
const epoch=(value:string)=>Date.parse(value)/1000,ny='America/New_York';
let systemZone=ny;
beforeEach(()=>{systemZone=ny;vi.spyOn(times,'systemAlertClock').mockImplementation(()=>({zone:systemZone,hours:'24'}));});
const submit=(ui:ReturnType<typeof setup>)=>{const form=ui.find(node=>node.type==='form');invoke(form.props.onSubmit,{preventDefault:vi.fn()});ui.settle();};

describe(' expiry instant and wall-time policy on synthetic timestamps',()=>{
 it('preserves untouched seconds and the later fold occurrence when redisplayed in another OS zone',()=>{
  const instant=epoch('2026-11-01T06:30:17Z'),draft=times.alertExpiryFromInstant(instant,ny),view=times.alertExpiryView(draft,'Asia/Kolkata');expect(draft.value).toBe('2026-11-01T01:30');expect(view.value).toBe('2026-11-01T12:00');expect(times.resolveAlertExpiry(view)).toBe(instant);expect(draft.zone).toBe(ny);
 });
 it('strictly refuses invalid calendars, incomplete values, seconds syntax and spring gaps',()=>{
  for(const value of ['2026-02-30T12:00','2026-03-08T02:30','2026-03-08T','2026-03-08T12:00:30','2026-03-08T12:00Z'])expect(()=>times.alertExpiryCandidates(value,ny)).toThrow();
 });
 it('exposes both autumn fold instants and requires an explicit choice only after editing',()=>{
  const values=times.alertExpiryCandidates('2026-11-01T01:30',ny);expect(values).toEqual([epoch('2026-11-01T05:30:00Z'),epoch('2026-11-01T06:30:00Z')]);const draft=times.alertExpiryForText('2026-11-01T01:30',ny);expect(()=>times.resolveAlertExpiry(draft)).toThrow('occurs twice');expect(times.resolveAlertExpiry(times.chooseAlertExpiry(draft,values[1]))).toBe(values[1]);expect(()=>times.chooseAlertExpiry(draft,values[1]+60)).toThrow('occurrence');
 });
 it('handles non-hour offsets and Lord Howe half-hour folds',()=>{
  expect(times.alertExpiryCandidates('2026-10-23T12:00','Asia/Kolkata')).toEqual([epoch('2026-10-23T06:30:00Z')]);expect(times.alertExpiryCandidates('2026-04-05T01:45','Australia/Lord_Howe')).toEqual([epoch('2026-04-04T14:45:00Z'),epoch('2026-04-04T15:15:00Z')]);
 });
 it('keeps edited text in its original labelled zone across an OS-zone change and clears a choice on further edits',()=>{
  const original=times.alertExpiryFromInstant(epoch('2026-10-23T20:00:17Z'),ny),edited=times.editAlertExpiry(original,ny,'2026-11-01T01:30'),chosen=times.chooseAlertExpiry(edited,epoch('2026-11-01T06:30:00Z'));expect(times.alertExpiryView(chosen,'UTC')).toEqual(chosen);expect(times.editAlertExpiry(chosen,'UTC','2026-11-01T01:31')).toMatchObject({zone:ny,value:'2026-11-01T01:31',choice:null});
 });
 it('formats history in the explicit OS zone/hour cycle while CSV remains UTC',()=>{
  const instant=epoch('2026-11-01T06:30:17Z');expect(times.formatAlertTime(instant,{zone:ny,hours:'24'})).toBe('2026-11-01 01:30:17 UTC-5');expect(times.formatAlertTime(instant,{zone:ny,hours:'12'})).toBe('2026-11-01 1:30:17 AM UTC-5');const alert=saved('a');alert.history=[{...alert.history[0],at:instant}];const csv=alertHistoryCsv([alert]);expect(csv).toContain('\"observed_at_unix_seconds\"');expect(csv).toContain(','+instant+',');systemZone='Asia/Kolkata';expect(alertHistoryCsv([alert])).toBe(csv);
 });
 it('builds unchanged persisted definitions and rejects edited gaps without changing lifecycle rules',()=>{
  const instant=epoch('2026-11-01T06:30:17Z'),expiry=times.alertExpiryFromInstant(instant,ny),draft:AlertDraft={name:'SYNTHETIC',message:'SYNTHETIC',kind:'greater',value:'10',lower:'',upper:'',amount:'1',bars:'1',percent:false,frequency:'every-time',expirationEnabled:true,expiresAt:expiry.value,expiry},context={id:'synthetic-a',instrumentId:saved('a').definition.instrumentId,now:100,mode:'ordinary' as const,runId:'ordinary'};
  expect(buildAlertDefinition(draft,context).expiresAt).toBe(instant);expect(buildAlertDefinition({...draft,expirationEnabled:false},context).expiresAt).toBeNull();expect(()=>buildAlertDefinition({...draft,expiresAt:'2026-03-08T02:30'},context)).toThrow('does not exist');expect(buildAlertDefinition(draft,context)).not.toHaveProperty('expiry');
 });
});

describe(' real AlertDialog callbacks under controlled hooks',()=>{
 it('shows the OS timezone and redisplays untouched expiry without losing the saved instant',()=>{
  const instant=epoch('2026-11-01T06:30:17Z'),ui=setup([saved('a','active',instant)]);expect(ui.text()).toContain('system timezone: America/New_York');ui.rowButton('a','Edit');expect(ui.field('Alert expiration').props.value).toBe('2026-11-01T01:30');systemZone='UTC';ui.settle();expect(ui.field('Alert expiration').props.value).toBe('2026-11-01T06:30');ui.change('Alert name','SYNTHETIC renamed');submit(ui);expect(ui.props.alerts[0].definition.expiresAt).toBe(instant);
 });
 it('refuses gaps, exposes fold choices and saves exactly the chosen occurrence',()=>{
  const ui=setup([saved('a','active',epoch('2026-10-23T20:00:00Z'))]);ui.rowButton('a','Edit');ui.change('Alert expiration','2026-03-08T02:30');submit(ui);expect(ui.publish).not.toHaveBeenCalled();expect(ui.text()).toContain('does not exist');ui.change('Alert expiration','2026-11-01T01:30');submit(ui);expect(ui.publish).not.toHaveBeenCalled();expect(ui.text()).toContain('occurs twice');ui.change('Alert expiration occurrence',String(epoch('2026-11-01T06:30:00Z')));submit(ui);expect(ui.props.alerts[0].definition.expiresAt).toBe(epoch('2026-11-01T06:30:00Z'));
 });
 it('retains edited-zone ownership after the OS timezone changes and refuses a stale old-zone input callback',()=>{
  const ui=setup([saved('a','active',epoch('2026-10-23T20:00:00Z'))]);ui.rowButton('a','Edit');const stale=ui.field('Alert expiration').props.onChange;systemZone='UTC';ui.settle();invoke(stale,{target:{value:'2026-11-01T01:30'}});ui.settle();expect(ui.text()).toContain('draft or timezone changed');expect(ui.field('Alert expiration').props.value).toBe('2026-10-23T20:00');
  ui.change('Alert expiration','2026-10-24T12:00');systemZone='Asia/Kolkata';ui.settle();expect(ui.text()).toContain('being edited in UTC');expect(ui.field('Alert expiration').props.value).toBe('2026-10-24T12:00');submit(ui);expect(ui.props.alerts[0].definition.expiresAt).toBe(epoch('2026-10-24T12:00:00Z'));
 });
 it('fresh edits after Undo, Redo and restored layouts use each saved exact instant',()=>{
  const a=saved('a','active',epoch('2026-11-01T05:30:17Z')),b=saved('a','active',epoch('2026-11-01T06:30:29Z')),ui=setup([a]);
  for(const restored of [a,b,a,b,structuredClone(a)]){ui.props.alerts=[restored];ui.settle();ui.rowButton('a','Edit');submit(ui);expect(ui.props.alerts[0].definition.expiresAt).toBe(restored.definition.expiresAt);}
 });
 it('old expiry callbacks and submitters cannot overwrite a changed or closed draft',()=>{
  const ui=setup([saved('a','active',epoch('2026-10-23T20:00:00Z'))]);ui.rowButton('a','Edit');const staleField=ui.field('Alert expiration').props.onChange,staleSubmit=ui.find(node=>node.type==='form').props.onSubmit;ui.change('Alert expiration','2026-10-24T12:00');invoke(staleField,{target:{value:'2026-10-25T12:00'}});ui.settle();expect(ui.field('Alert expiration').props.value).toBe('2026-10-24T12:00');invoke(staleSubmit,{preventDefault:vi.fn()});ui.settle();expect(ui.publish).not.toHaveBeenCalled();ui.props.open=false;ui.settle();invoke(staleSubmit,{preventDefault:vi.fn()});expect(ui.publish).not.toHaveBeenCalled();
 });
 it('a retired editor cannot publish its expiry after a replacement layout owner mounts',()=>{
  const old=setup([saved('a','active',epoch('2026-10-23T20:00:00Z'))]);old.rowButton('a','Edit');const stale=old.find(node=>node.type==='form').props.onSubmit;old.dispose();const next=setup([saved('a','active',epoch('2026-10-24T20:00:29Z'))]);invoke(stale,{preventDefault:vi.fn()});expect(old.publish).not.toHaveBeenCalled();expect(next.publish).not.toHaveBeenCalled();expect(next.props.alerts[0].definition.expiresAt).toBe(epoch('2026-10-24T20:00:29Z'));
 });
});
