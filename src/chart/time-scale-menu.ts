// Time scale (time axis) context menu model: rows, checkmarks, hotkey hint and availability.
//
// Rows:
//  - Reset time scale and its Ctrl + Alt + Q hint.
//  - Timezone: the bottom toolbar's Timezone menu with the same rows (bottom-toolbar.ts timezoneMenuRows: the Chart settings
//    timezone list).
//  - Session breaks: the time-axis context menu controls session-break lines; the setting is the canvas.sessionBreaks.
//  - Day of week on labels, Date format, Time hours format: the same labels and option labels as Chart settings.
// The row order and grouping are OpenCandle's
// (chart-context-menu-contract.md "Time axis" rows); every row writes the same setting its Chart settings row writes.
import {resolveTimezoneChoice,timezoneMenuRows} from './bottom-toolbar';
import {DATE_FORMAT_OPTIONS,DATE_FORMAT_WEEKDAY_PREFIX} from './chart-settings-facts';
import type {PriceScaleMenuSeparator} from './price-scale-menu';
import type {ScaleMenuEntry,ScaleMenuItem,ScaleMenuSubmenu} from './price-scale-menu-view';

export type TimeScaleHours='24'|'12';
export type TimeScaleActionId='resetTimeScale'|'sessionBreaks'|'dayOfWeek'|`timezone:${string}`|`dateFormat:${string}`|`timeHours:${TimeScaleHours}`;
export type TimeScaleSubmenuId='timezone'|'dateFormat'|'timeHours';
export type TimeScaleMenuItem=ScaleMenuItem<TimeScaleActionId>;
export type TimeScaleSubmenu=ScaleMenuSubmenu<TimeScaleActionId,TimeScaleSubmenuId>;
export type TimeScaleMenuEntry=ScaleMenuEntry<TimeScaleActionId,TimeScaleSubmenuId>;
/** The saved settings these rows read and write (Chart settings document scales.* and canvas.sessionBreaks). */
export interface TimeScaleMenuSettings {dayOfWeek:boolean;dateFormat:string;timeHours:TimeScaleHours;sessionBreaks:boolean}
export interface TimeScaleMenuContext {
 /** The chart timezone (IANA zone or 'UTC'); null when the chart is not connected to its timezone setting. */
 timezone:string|null;
 /** The symbol's exchange timezone, when the source names one. */
 exchangeTimezone:string|null;
 /** The saved time scale settings; null when the chart is not connected to its settings document. */
 settings:TimeScaleMenuSettings|null;
 /** Which host actions exist. A missing action renders its row disabled with a reason; nothing is faked. */
 host:{reset:boolean;timezone:boolean;settings:boolean};
 /** Date used for the timezone offsets (DST-dependent labels). */
 at?:Date;
}

export const TIME_SCALE_UNAVAILABLE={
 reset:'This chart is not connected to its time scale yet.',
 timezone:'This chart is not connected to its timezone setting.',
 settings:'This chart is not connected to its saved workspace settings.',
} as const;
export const RESET_TIME_SCALE_SHORTCUT='Ctrl + Alt + Q';

const sep=(factId:string):PriceScaleMenuSeparator=>({kind:'separator',factId});
const radio=(id:TimeScaleActionId,factId:string,label:string,checked:boolean,disabled?:string):TimeScaleMenuItem=>({kind:'item',id,factId,label,role:'menuitemradio',checked,...(disabled?{disabled}:{})});

/** Root menu rows (LV order, see the header). */
export function timeScaleMenuEntries(context:TimeScaleMenuContext):TimeScaleMenuEntry[]{
 const settings=context.settings,settingsReason=!context.host.settings||!settings?TIME_SCALE_UNAVAILABLE.settings:undefined;
 const rows:TimeScaleMenuEntry[]=[];
 rows.push({kind:'item',id:'resetTimeScale',factId:'static-price-scale#hotkey.5',label:'Reset time scale',role:'menuitem',shortcut:RESET_TIME_SCALE_SHORTCUT,...(context.host.reset?{}:{disabled:TIME_SCALE_UNAVAILABLE.reset})});
 rows.push(sep('lv.timeScale.sep1'));
 const zoneReason=!context.host.timezone||context.timezone===null?TIME_SCALE_UNAVAILABLE.timezone:undefined;
 const zones=context.timezone===null?[]:timezoneMenuRows(context.timezone,{exchangeTimezone:context.exchangeTimezone,at:context.at});
 rows.push({kind:'submenu',id:'timezone',factId:'static-price-scale#bottom.right.timeZones',label:'Timezone',items:zones.map(row=>radio(`timezone:${row.value}`,'visual-dialogs-chart-settings#symbol.candleSymbolTimezone',row.label,row.checked,row.disabled)),...(zoneReason?{disabled:zoneReason}:{})});
 rows.push(sep('lv.timeScale.sep2'));
 const check=(id:'sessionBreaks'|'dayOfWeek',factId:string,label:string,checked:boolean):TimeScaleMenuItem=>({kind:'item',id,factId,label,role:'menuitemcheckbox',checked,...(settingsReason?{disabled:settingsReason}:{})});
 rows.push(check('sessionBreaks','lv.canvas.sessionBreaks','Session breaks',settings?.sessionBreaks===true));
 rows.push(check('dayOfWeek','visual-dialogs-chart-settings#scales.showWeekdayOnTimeScaleLabels','Day of week on labels',settings?.dayOfWeek===true));
 const prefix=settings?.dayOfWeek?DATE_FORMAT_WEEKDAY_PREFIX:'';
 rows.push({kind:'submenu',id:'dateFormat',factId:'visual-dialogs-chart-settings#scales.dateFormat',label:'Date format',items:settings?DATE_FORMAT_OPTIONS.map(row=>radio(`dateFormat:${row.value}`,'visual-dialogs-chart-settings#scales.dateFormat',prefix+row.label,settings.dateFormat===row.value)):[],...(settingsReason?{disabled:settingsReason}:{})});
 const hours=(value:TimeScaleHours,label:string)=>radio(`timeHours:${value}`,'visual-dialogs-chart-settings#scales.timeHoursFormat',label,settings?.timeHours===value);// 12-hours is live: time-axis ticks and the Chart settings row follow it
 rows.push({kind:'submenu',id:'timeHours',factId:'visual-dialogs-chart-settings#scales.timeHoursFormat',label:'Time hours format',items:settings?[hours('24','24-hours'),hours('12','12-hours')]:[],...(settingsReason?{disabled:settingsReason}:{})});
 return rows;
}

/** What a row does, resolved against the menu it came from. */
export type TimeScaleCommand=
 |{kind:'reset'}
 |{kind:'timezone';zone:string}
 |{kind:'settings';patch:Partial<TimeScaleMenuSettings>};
/** Resolves an enabled row to its command. Throws the row's reason when it is disabled or not on the menu. */
export function timeScaleCommand(id:TimeScaleActionId,context:TimeScaleMenuContext):TimeScaleCommand{
 const entries=timeScaleMenuEntries(context);
 const flat=entries.flatMap(row=>row.kind==='item'?[{row,parent:null as TimeScaleSubmenu|null}]:row.kind==='submenu'?row.items.filter((item):item is TimeScaleMenuItem=>item.kind==='item').map(item=>({row:item,parent:row})):[]);
 const found=flat.find(entry=>entry.row.id===id);
 if(!found)throw Error('This time scale action is not available here.');
 const reason=found.row.disabled??found.parent?.disabled;if(reason)throw Error(reason);
 const settings=context.settings;
 if(id==='resetTimeScale')return{kind:'reset'};
 if(id.startsWith('timezone:'))return{kind:'timezone',zone:resolveTimezoneChoice(id.slice('timezone:'.length),context.exchangeTimezone)};
 if(!settings)throw Error(TIME_SCALE_UNAVAILABLE.settings);
 if(id==='sessionBreaks')return{kind:'settings',patch:{sessionBreaks:!settings.sessionBreaks}};
 if(id==='dayOfWeek')return{kind:'settings',patch:{dayOfWeek:!settings.dayOfWeek}};
 if(id.startsWith('dateFormat:'))return{kind:'settings',patch:{dateFormat:id.slice('dateFormat:'.length)}};
 return{kind:'settings',patch:{timeHours:id.slice('timeHours:'.length) as TimeScaleHours}};
}
