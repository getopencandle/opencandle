/** An edit may already be accepted when publication fails. Never retry it blindly. */
export class DrawingEditRecoveryError extends Error {
 readonly recoveryRequired=true;
 constructor(readonly accepted:boolean,readonly causes:unknown[],publicationUnconfirmed=false){
  super((accepted?'The drawing changed, but publication failed.':publicationUnconfirmed?'Drawing publication was not confirmed. Native and saved drawing values may differ; native history cannot be restored exactly.':'The drawing edit failed and recovery was incomplete.')+' Reopen this chart before editing again. '+causes.map(String).join(' | '));
  this.name='DrawingEditRecoveryError';
 }
}
export interface DrawingEditTransaction {
 begin:()=>void;
 apply:()=>void;
 rollback:()=>void;
 end:()=>void;
}
/** Caller validates first. end releases the notification hold exactly once. */
export function commitDrawingEdit(host:DrawingEditTransaction):{accepted:true}{
 host.begin();let accepted=false,failed=false;const failures:unknown[]=[];
 try{host.apply();accepted=true;}catch(error){failed=true;failures.push(error);try{host.rollback();}catch(rollback){failures.push(rollback);}}
 try{host.end();}catch(publication){failures.push(publication);}
 if(accepted&&failures.length||!accepted&&failures.length>1)throw new DrawingEditRecoveryError(accepted,failures);
 if(failed)throw failures[0];
 return{accepted:true};
}
/** The renderer's drawing settings panel applies every control change live (one native edit, so one
 * workspace publication and one undo step per property), and its OK only closes. A whole dialog edit should undo in one
 * step, so a session holds drawing publications from the panel opening to its closing (OK, Cancel, Escape, the drawing going away)
 * and publishes the held change once. A Cancel that put every value back publishes nothing. */
export interface DrawingSettingsSessionHost {
 /** Publish the drawing document (one workspace change and undo step). */
 publish:()=>void;
 /** The canonical drawing document now. */
 snapshot:()=>unknown;
 same:(a:unknown,b:unknown)=>boolean;
}
export interface DrawingSettingsSession {
 begin():void;
 /** Called by the publication path: true when the open session holds this publication. */
 hold():boolean;
 /** Ends the session and publishes the held change once (no-op when none is open). */
 end():void;
 holding():boolean;
}
export function createDrawingSettingsSession(host:DrawingSettingsSessionHost):DrawingSettingsSession{
 let open=false,dirty=false,opening:unknown;
 const session:DrawingSettingsSession={
  begin(){session.end();opening=host.snapshot();dirty=false;open=true;},
  hold(){if(!open)return false;dirty=true;return true;},
  end(){if(!open)return;open=false;const held=dirty,before=opening;dirty=false;opening=undefined;if(held&&!host.same(before,host.snapshot()))host.publish();},
  holding:()=>open,
 };
 return session;
}
type PanelMethod=(this:unknown,...args:unknown[])=>unknown;
/** Wraps the open and close of a renderer settings panel instance (own members, removed again by the returned release).
 * A renderer without the panel leaves publication unchanged. */
export function installDrawingSettingsSession(panel:unknown,session:DrawingSettingsSession):()=>void{
 if(!panel||typeof panel!=='object')return()=>{};
 const target=panel as Record<string,unknown>,open=target.open,close=target.close;
 if(typeof open!=='function'||typeof close!=='function'||Object.hasOwn(target,'open')||Object.hasOwn(target,'close'))return()=>{};
 const ownOpen:PanelMethod=function(...args){session.end();const result=Reflect.apply(open,this,args);session.begin();return result;};
 const ownClose:PanelMethod=function(...args){try{return Reflect.apply(close,this,args);}finally{session.end();}};
 Object.defineProperty(target,'open',{configurable:true,writable:true,value:ownOpen});Object.defineProperty(target,'close',{configurable:true,writable:true,value:ownClose});
 return()=>{for(const [key,value] of [['open',ownOpen],['close',ownClose]] as const){const now=Object.getOwnPropertyDescriptor(target,key);if(now&&now.value===value)delete target[key];}session.end();};
}
