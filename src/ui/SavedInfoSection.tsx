import React,{useEffect,useRef,useState} from 'react';
import {describeKeyProtection,type DataSourceSettings,type DataSourceSettingsBridge,type DataSourcesInfo} from '../domain/data-source-settings';

/**
 * Data sources > Where your settings are saved. Shows the profile folder the desktop process saves into
 * (the workspace, the encrypted key and the caches), opens it, and exports or imports the non-secret data source choices.
 * The folder path comes from the desktop process; this component never names a path. Keys never pass through here.
 */
export interface SavedInfoSectionProps {
 bridge:DataSourceSettingsBridge|null;
 /** The current non-secret choices (what Export writes). */
 settings:DataSourceSettings;
 /** Applies imported choices. Throws on a value the workspace refuses. */
 onImport:(settings:DataSourceSettings)=>void;
}
export const SETTINGS_FILE_NOTE='The settings file holds your data source choices: crypto on or off, the Alpaca plan and symbols, and FRED downloads on or off. It never contains API keys, so after importing on another computer, enter your key again.';
export const INSIDE_APP_FOLDER_WARNING='This folder is inside the OpenCandle program folder, so copying or sharing the program folder would include your saved settings (keys stay encrypted for your Windows account). Start OpenCandle normally, without a custom profile, to save in your own Windows app data folder instead.';
export function SavedInfoSection({bridge,settings,onImport}:SavedInfoSectionProps){
 const mounted=useRef(true);
 const [info,setInfo]=useState<DataSourcesInfo|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const refresh=()=>{if(bridge)void bridge.dataSourcesInfo().then(result=>{if(!mounted.current)return;if(result.ok)setInfo(result.value);else setMessage(result.error.message);}).catch(()=>undefined);};
 useEffect(()=>{mounted.current=true;refresh();return()=>{mounted.current=false;};},[bridge]);
 async function run(action:()=>Promise<string|null>){
  if(!bridge||busy)return;setBusy(true);setMessage('');
  try{const text=await action();if(mounted.current&&text)setMessage(text);}
  catch(cause){if(mounted.current)setMessage(cause instanceof Error?cause.message:String(cause));}
  finally{if(mounted.current)setBusy(false);}
 }
 const openFolder=()=>run(async()=>{const result=await bridge!.openDataFolder();if(!result.ok)throw Error(result.error.message);return null;});
 const exportSettings=()=>run(async()=>{const result=await bridge!.exportDataSourceSettings({settings});if(!result.ok){if(result.error.code==='CANCELLED')return null;throw Error(result.error.message);}return 'Saved '+result.value.fileName+' (no API keys inside).';});
 const importSettings=()=>run(async()=>{const result=await bridge!.importDataSourceSettings();if(!result.ok){if(result.error.code==='CANCELLED')return null;throw Error(result.error.message);}onImport(result.value.settings);refresh();return 'Imported '+result.value.fileName+'. Enter your Alpaca key again if this computer does not have it yet.';});
 const directory=info?.directory??(bridge?'Checking...':'Needs the desktop app');
 return <section className="lv-saved-info" aria-label="Where your settings are saved">
  <h3>Where your settings are saved</h3>
  <p className="lv-live-note">Your API keys, data source choices, workspace and downloaded data are saved on this computer only (nothing is uploaded), in this folder:</p>
  <div className="lv-saved-path"><textarea aria-label="Settings folder" readOnly rows={Math.max(1,Math.min(5,Math.ceil(directory.length/44)))} value={directory} onFocus={event=>event.currentTarget.select()}/><button type="button" disabled={busy||!bridge||!info} onClick={()=>void openFolder()}>Open folder</button></div>
  {info?.insideAppFolder&&<p className="lv-live-note lv-saved-warning" role="note">{INSIDE_APP_FOLDER_WARNING}</p>}
  <p className="lv-live-note">{bridge?describeKeyProtection(info):'Keys can only be saved in the desktop app.'}</p>
  <div className="lv-live-key-actions">
   <button type="button" disabled={busy||!bridge} onClick={()=>void exportSettings()}>Export settings...</button>
   <button type="button" disabled={busy||!bridge} onClick={()=>void importSettings()}>Import settings...</button>
  </div>
  <p className="lv-live-note">{SETTINGS_FILE_NOTE}</p>
  {message&&<p className="lv-live-message" role="status">{message}</p>}
 </section>;
}
