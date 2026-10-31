import React,{useState} from 'react';
import {importPineScript,pineReportSummary,type PineImportResult} from '../domain/pine-import';
import {addScript,type ScriptLibrary} from './script-library';

// "Import Pine script" in the script editor. Paste Pine Script v5/v6 source, translate it (nothing runs),
// read the report of what was and was not translated, then open the result as a new local CandleScript document. The
// translation is done by the clean-room importer in src/domain/pine-import; CandleScript stays the scripting language.

/** Adds a translated script as a new, selected local document (not saved, run or attached). */
export function openPineImport(library:ScriptLibrary,result:PineImportResult,makeId:()=>string):ScriptLibrary{
 if(!result.ok||!result.source)throw new Error('This Pine script could not be translated. See the report.');
 return addScript(library,{id:makeId(),name:result.name.trim()||'Imported Pine script',source:result.source,pane:result.pane},result.kind);
}

export interface PineImportSectionProps {onOpen(result:PineImportResult):void;disabled?:boolean}
export function PineImportSection(props:PineImportSectionProps){
 const [text,setText]=useState(''),[result,setResult]=useState<PineImportResult|null>(null);
 const report=result?.report;
 return <details className="lv-pine-import"><summary>Import Pine script</summary>
  <p className="help">Paste a Pine Script v5 or v6 indicator or strategy. It is translated into a new CandleScript script; nothing runs until you choose to run it. Parts that cannot be translated are marked with TODO(pine) comments.</p>
  <textarea aria-label="Pine script source" rows={6} spellCheck={false} value={text} onChange={event=>{setText(event.target.value);setResult(null);}}/>
  <button type="button" disabled={props.disabled||!text.trim()} onClick={()=>setResult(importPineScript(text))}>Translate Pine script</button>
  {report&&<section aria-label="Pine translation report">
   <ul className="help">{pineReportSummary(report).map((line,index)=><li key={index}>{line}</li>)}</ul>
   {report.unsupported.length>0&&<details open><summary>Not translated ({report.unsupported.length})</summary><ul>{report.unsupported.map((row,index)=><li key={index}>{row.line?'Line '+row.line+': ':''}{row.construct}. {row.reason}.</li>)}</ul></details>}
   {report.notes.length>0&&<details><summary>Translated with differences ({report.notes.length})</summary><ul>{report.notes.map((row,index)=><li key={index}>{row}</li>)}</ul></details>}
   {report.errors.length>0&&<details open><summary>Source problems ({report.errors.length})</summary><ul>{report.errors.map((row,index)=><li key={index}>{row.line?'Line '+row.line+': ':''}{row.message}</li>)}</ul></details>}
   {result.ok&&<details><summary>CandleScript preview</summary><pre aria-label="Translated CandleScript" style={{maxHeight:240,overflow:'auto'}}>{result.source}</pre></details>}
   <button type="button" className="primary" disabled={props.disabled||!result.ok} onClick={()=>{props.onOpen(result);setText('');setResult(null);}}>Open as new CandleScript script</button>
  </section>}
 </details>;
}
