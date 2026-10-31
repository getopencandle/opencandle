// The toolbar Fullscreen button and Shift+F. They used document.documentElement.requestFullscreen(), which
// the desktop app refuses (main's permission handler denies every web permission, fullscreen included), so the button did
// nothing. In the desktop app they now ask main to toggle the window's own full screen, the same mode F11 uses; F11, Esc
// and the button all leave it. A plain browser preview (no bridge) keeps the HTML fullscreen request.

export type FullScreenBridgeResult={ok:true;value:{fullScreen:boolean}}|{ok:false;error:{code:string;message:string}};
export interface FullScreenBridge{toggleFullScreen?():Promise<FullScreenBridgeResult>}
export interface FullScreenDocument{fullscreenElement:unknown;exitFullscreen?():Promise<void>;documentElement?:{requestFullscreen?():Promise<void>}|null}
export const FULLSCREEN_UNAVAILABLE='Fullscreen is unavailable';

/** Toggles full screen. Resolves to the new state, or to 'unavailable' after reporting why through `report`. */
export async function toggleAppFullScreen(input:{bridge:FullScreenBridge|null|undefined;doc:FullScreenDocument|null|undefined;report:(message:string)=>void}):Promise<'entered'|'exited'|'unavailable'>{
 const {bridge,doc,report}=input;
 const fail=(cause:unknown)=>{report(FULLSCREEN_UNAVAILABLE+': '+(cause instanceof Error?cause.message:String(cause)));return 'unavailable' as const;};
 if(bridge&&typeof bridge.toggleFullScreen==='function'){
  try{const result=await bridge.toggleFullScreen();if(result&&result.ok===true)return result.value.fullScreen?'entered':'exited';return fail(result&&result.ok===false?result.error.message:'no answer');}
  catch(cause){return fail(cause);}
 }
 if(!doc)return fail('no document');
 try{
  if(doc.fullscreenElement){await doc.exitFullscreen?.();return 'exited';}
  const request=doc.documentElement?.requestFullscreen;if(typeof request!=='function')return fail('not supported');
  await request.call(doc.documentElement);return 'entered';
 }catch(cause){return fail(cause);}
}
