// App-level preferences, shown in Settings (Data sources tab, "Application" section).
// - keepRunningInTray: "Keep running in the notification area when closed" ("for now yeah just
//   tray it"). Factory: on. The main process keeps its own copy (electron/tray.cjs) so a close before the workspace loads
//   follows the last choice too.
// - defaultChartTimezone: "Default chart timezone" for new charts ("make it a user setting").
//   Factory: Exchange (FACTORY_TIMEZONE_CHOICE), so US stocks show New York time and crypto shows UTC. A chart's own timezone
//   setting overrides it, and saved charts keep their saved timezone.
// - wickAlwaysOnTop / wickOnLeave: "Keep Wick mode on top of other windows" (factory:
//   on) and "Switch to Wick mode when I leave OpenCandle" (factory: off). Optional fields, written only when they differ from the
//   factory value; the main process keeps its own copy (electron/wick.cjs) like the tray choice.
// Absent from the workspace means the factory values, so a factory workspace stays byte-identical.
import type {Instrument} from '../domain/types';
import {TIMEZONE_EXCHANGE,timezoneOptions,type ChartSettingsOption} from '../chart/chart-settings-facts';
import {FACTORY_TIMEZONE,FACTORY_TIMEZONE_CHOICE} from '../chart/chart-settings-bindings';

export interface AppPreferences {keepRunningInTray:boolean;defaultChartTimezone:string;
 /** Wick mode stays on top of other windows. Absent: on. */
 wickAlwaysOnTop?:boolean;
 /** Leaving OpenCandle for another app collapses it to Wick mode. Absent: off. */
 wickOnLeave?:boolean}
export const APP_PREFERENCE_DEFAULTS:Readonly<AppPreferences>=Object.freeze({keepRunningInTray:true,defaultChartTimezone:FACTORY_TIMEZONE_CHOICE});
export const APP_PREFERENCE_LABELS=Object.freeze({
 section:'Application',
 keepRunningInTray:'Keep running in the notification area when closed',
 keepRunningNote:'Alerts, background alert feeds and paper orders keep working while the window is closed. Right-click the tray icon, or use Quit OpenCandle in the main menu, to quit.',
 trayUnavailable:'This computer offers no notification area, so closing the window quits OpenCandle.',
 defaultChartTimezone:'Default chart timezone',
 wickAlwaysOnTop:'Keep Wick mode on top of other windows',
 wickOnLeave:'Switch to Wick mode when I leave OpenCandle',
 wickNote:'Wick mode shrinks OpenCandle to its row of tabs with their live quotes (Ctrl+Shift+M, or the button beside the tabs). Click the active tab, double-click the strip or press Esc to open the full window again; right-click the strip for more.',
 defaultChartTimezoneNote:'New charts use this timezone. Exchange shows each symbol\'s exchange time: New York for US stocks, UTC for crypto. A chart\'s own timezone setting overrides it, and saved charts keep theirs.',
});

const ZONE_PATTERN=/^[A-Za-z][A-Za-z0-9_+\-]*(?:\/[A-Za-z0-9_+\-]+){0,2}$/;
/** An IANA zone this computer can format. */
export function availableZone(value:unknown):value is string{
 if(typeof value!=='string'||value.length>64||!ZONE_PATTERN.test(value))return false;
 try{new Intl.DateTimeFormat('en',{timeZone:value});return true;}catch{return false;}
}
/** A Default chart timezone choice: Exchange or an available zone. */
export function validTimezoneChoice(value:unknown):value is string{return value===TIMEZONE_EXCHANGE||availableZone(value);}

const WICK_KEYS=['wickAlwaysOnTop','wickOnLeave'] as const;
/** A saved value must be exact: both fields, optionally the two Wick mode fields, nothing else. */
export function restoreAppPreferences(value:unknown):AppPreferences{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid application preferences.');
 const record=value as Record<string,unknown>,keys=Object.keys(record);
 if(!keys.includes('keepRunningInTray')||!keys.includes('defaultChartTimezone')||keys.some(key=>key!=='keepRunningInTray'&&key!=='defaultChartTimezone'&&!(WICK_KEYS as readonly string[]).includes(key)))throw new Error('Invalid application preferences.');
 if(typeof record.keepRunningInTray!=='boolean')throw new Error('Invalid application preference: keep running in the notification area.');
 if(!validTimezoneChoice(record.defaultChartTimezone))throw new Error('Invalid application preference: default chart timezone.');
 for(const key of WICK_KEYS)if(Object.hasOwn(record,key)&&typeof record[key]!=='boolean')throw new Error('Invalid application preference: Wick mode.');
 return{keepRunningInTray:record.keepRunningInTray,defaultChartTimezone:record.defaultChartTimezone,
  ...(typeof record.wickAlwaysOnTop==='boolean'?{wickAlwaysOnTop:record.wickAlwaysOnTop}:{}),...(typeof record.wickOnLeave==='boolean'?{wickOnLeave:record.wickOnLeave}:{})};
}
/** The Wick mode choices as main takes them (electron/wick.cjs wickPreferenceInput). */
export interface WickPreferences {alwaysOnTop:boolean;collapseOnBlur:boolean}
export const WICK_PREFERENCE_DEFAULTS:Readonly<WickPreferences>=Object.freeze({alwaysOnTop:true,collapseOnBlur:false});
export function wickPreferencesOf(preferences:AppPreferences):WickPreferences{
 return{alwaysOnTop:typeof preferences.wickAlwaysOnTop==='boolean'?preferences.wickAlwaysOnTop:WICK_PREFERENCE_DEFAULTS.alwaysOnTop,collapseOnBlur:typeof preferences.wickOnLeave==='boolean'?preferences.wickOnLeave:WICK_PREFERENCE_DEFAULTS.collapseOnBlur};
}
/** The preferences with these Wick mode choices. A factory value is left out, so turning a row back leaves no trace. */
export function withWickPreferences(preferences:AppPreferences,wick:WickPreferences):AppPreferences{
 const {wickAlwaysOnTop:_top,wickOnLeave:_leave,...rest}=preferences;
 return{...rest,...(wick.alwaysOnTop!==WICK_PREFERENCE_DEFAULTS.alwaysOnTop?{wickAlwaysOnTop:wick.alwaysOnTop}:{}),...(wick.collapseOnBlur!==WICK_PREFERENCE_DEFAULTS.collapseOnBlur?{wickOnLeave:wick.collapseOnBlur}:{})};
}
/** The workspace's preferences, or the factory values when absent (or, defensively, unreadable). */
export function appPreferencesOf(workspace:{appPreferences?:unknown}):AppPreferences{
 if(workspace.appPreferences===undefined)return{...APP_PREFERENCE_DEFAULTS};
 try{return restoreAppPreferences(workspace.appPreferences);}catch{return{...APP_PREFERENCE_DEFAULTS};}
}

/** The zone a new chart of `instrument` gets for a Default chart timezone choice. Exchange: crypto uses UTC; any other symbol
 * its exchange zone; an unknown or unavailable zone falls back to UTC. */
export function resolveChartTimezone(choice:string,instrument:Pick<Instrument,'assetClass'|'timezone'>|null|undefined):string{
 if(choice!==TIMEZONE_EXCHANGE)return availableZone(choice)?choice:FACTORY_TIMEZONE;
 if(!instrument)return FACTORY_TIMEZONE;
 if(instrument.assetClass==='crypto')return 'UTC';
 return availableZone(instrument.timezone)?instrument.timezone:FACTORY_TIMEZONE;
}
/** The zone for a new chart showing `instrument`, from the workspace's Default chart timezone. */
export function newChartTimezone(workspace:{appPreferences?:unknown},instrument:Pick<Instrument,'assetClass'|'timezone'>|null|undefined):string{
 return resolveChartTimezone(appPreferencesOf(workspace).defaultChartTimezone,instrument);
}
/** A chart that still shows the factory UTC zone takes the Default chart timezone when a live
 * feed opens on it (so a US stock opens at 09:30 on Exchange). Any other zone was chosen and is kept. Null: no change. */
export function liveOpenTimezone(current:string|undefined,workspace:{appPreferences?:unknown},instrument:Pick<Instrument,'assetClass'|'timezone'>):string|null{
 if(current!==FACTORY_TIMEZONE)return null;
 const next=newChartTimezone(workspace,instrument);
 return next!==current?next:null;
}
/** The Default chart timezone choices: the chart timezone list (UTC, Exchange, then cities by offset). A saved choice this
 * computer no longer lists is kept as its own row. */
export function defaultTimezoneChoices(current:string,at?:Date):ChartSettingsOption[]{
 const options=timezoneOptions(at);
 return options.some(row=>row.value===current)?options:[...options,{value:current,label:current}];
}
