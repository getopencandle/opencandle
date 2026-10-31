import React from 'react';
import {APP_PREFERENCE_LABELS,defaultTimezoneChoices,validTimezoneChoice,wickPreferencesOf,withWickPreferences,type AppPreferences} from './app-preferences';
import {useMinuteTick} from './use-minute-tick';
/**
 * The "Application" section of the General tab in Settings. Like the Data sources tab it is outside the
 * settings draft: each change applies at once and Cancel does not undo it.
 */
export interface AppPreferencesSectionProps {
 preferences:AppPreferences;
 /** False where the desktop app has no notification area (or in a browser): the tray row is shown off and disabled. */
 trayAvailable:boolean;
 onChange(next:AppPreferences):void;
 /** The desktop main window offers Wick mode; its two rows are shown only then. */
 wickAvailable?:boolean;
 /** Timezone offsets are labelled for this date (tests). */
 at?:Date;
}
export function AppPreferencesSection({preferences,trayAvailable,onChange,at,wickAvailable}:AppPreferencesSectionProps){
 const choices=defaultTimezoneChoices(preferences.defaultChartTimezone,at),wick=wickPreferencesOf(preferences);
 return <section className="lv-app-preferences" aria-label={APP_PREFERENCE_LABELS.section}>
  <h3>{APP_PREFERENCE_LABELS.section}</h3>
  <label className="lv-live-toggle"><input type="checkbox" checked={trayAvailable&&preferences.keepRunningInTray} disabled={!trayAvailable} onChange={event=>onChange({...preferences,keepRunningInTray:event.target.checked})}/> {APP_PREFERENCE_LABELS.keepRunningInTray}</label>
  <p className="lv-live-note">{trayAvailable?APP_PREFERENCE_LABELS.keepRunningNote:APP_PREFERENCE_LABELS.trayUnavailable}</p>
  <label>{APP_PREFERENCE_LABELS.defaultChartTimezone} <select value={preferences.defaultChartTimezone} aria-label={APP_PREFERENCE_LABELS.defaultChartTimezone} onChange={event=>{const value=event.target.value;if(validTimezoneChoice(value))onChange({...preferences,defaultChartTimezone:value});}}>
   {choices.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}
  </select></label>
  <p className="lv-live-note">{APP_PREFERENCE_LABELS.defaultChartTimezoneNote}</p>
  {wickAvailable&&<>
   <label className="lv-live-toggle"><input type="checkbox" checked={wick.alwaysOnTop} onChange={event=>onChange(withWickPreferences(preferences,{...wick,alwaysOnTop:event.target.checked}))}/> {APP_PREFERENCE_LABELS.wickAlwaysOnTop}</label>
   <label className="lv-live-toggle"><input type="checkbox" checked={wick.collapseOnBlur} onChange={event=>onChange(withWickPreferences(preferences,{...wick,collapseOnBlur:event.target.checked}))}/> {APP_PREFERENCE_LABELS.wickOnLeave}</label>
   <p className="lv-live-note">{APP_PREFERENCE_LABELS.wickNote}</p>
  </>}
 </section>;
}
/** The section as the General tab shows it. The offset labels read the clock, so without a fixed `at` it re-renders
 * at each whole minute and a DST change relabels the offsets while the panel stays open. */
export function ClockedAppPreferencesSection(props:AppPreferencesSectionProps){
 useMinuteTick(!props.at);
 return <AppPreferencesSection {...props}/>;
}
