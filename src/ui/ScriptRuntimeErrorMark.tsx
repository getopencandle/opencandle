import React from 'react';
import {useScriptRuntimeError} from './script-runtime-errors';

/** The legend error state of a script whose last run failed: a red "!" with the message. */
export function ScriptRuntimeErrorMark({bindingId,name}:{bindingId:string;name:string}){
 const text=useScriptRuntimeError(bindingId);if(!text)return null;
 return <span className="lv-legend-error" role="img" data-legend-error="" aria-label={"Script error in "+name+": "+text} title={text} style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:14,height:14,margin:"0 4px",borderRadius:7,background:"var(--lv-negative-text, #f23645)",color:"#fff",fontWeight:700,fontSize:10,lineHeight:1,flex:"none",cursor:"help"}}>!</span>;
}
