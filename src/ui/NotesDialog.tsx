import {demoDataLabel} from '../domain/demo-mode';
import React,{useEffect,useRef,useState} from 'react';
import {Modal} from './Modal';
import {restoreWatchBook,type WatchBook} from '../watchlists/model';
import {addWatchNote,deleteWatchNote,editWatchNote,noteMarketKey,notesForMarket,restoreNoteMarket,type NoteMarket,type WatchNote} from '../watchlists/notes';
import {plainErrorText} from './user-error';
interface Props {book:WatchBook;initialMarket:NoteMarket|null;initialNoteId?:string;startNew?:boolean;onChange:(next:WatchBook,expected:WatchBook)=>boolean|void;onClose:()=>void}
interface Destination {market:NoteMarket|null;noteId?:string;newNote?:boolean;all?:boolean}
interface Draft {id:string|null;revision:number;market:NoteMarket|null;text:string;original:string;owner:WatchBook}
const label=(market:NoteMarket|null)=>market?(market.synthetic?market.symbol+' · '+demoDataLabel():market.exchange+':'+market.symbol):'Unassociated legacy notes';
function draftFor(book:WatchBook,target:Destination):Draft{
 const market=restoreNoteMarket(target.market),note=target.newNote?null:target.noteId?(book.notes??[]).find(row=>row.id===target.noteId):notesForMarket(book.notes??[],market)[0];
 if(target.noteId&&(!note||noteMarketKey(note.market)!==noteMarketKey(market)))throw new Error('The selected note changed or was removed.');
 return{id:note?.id??null,revision:note?.revision??0,market,text:note?.text??'',original:note?.text??'',owner:book};
}
export function NotesDialog(props:Props){
 const latest=useRef(props);latest.current=props;const alive=useRef(true),publishing=useRef(false);
 const [draft,setDraft]=useState(()=>draftFor(props.book,{market:props.initialMarket,noteId:props.initialNoteId,newNote:props.startNew})),current=useRef(draft);current.current=draft;
 const [all,setAll]=useState(false),[pending,setPending]=useState<Destination|null>(null),[deleting,setDeleting]=useState<{note:WatchNote;owner:WatchBook}|null>(null),[error,setError]=useState('');
 const pendingOwner=useRef<Destination|null>(null),deletionOwner=useRef<{note:WatchNote;owner:WatchBook}|null>(null);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;pendingOwner.current=null;deletionOwner.current=null;};},[]);
 function changePending(value:Destination|null){pendingOwner.current=value;setPending(value);}
 function changeDeleting(value:{note:WatchNote;owner:WatchBook}|null){deletionOwner.current=value;setDeleting(value);}
 function retireConfirmations(){changePending(null);changeDeleting(null);}
 function publishDraft(next:Draft){current.current=next;setDraft(next);}
 function close(){if(!alive.current)return;alive.current=false;pendingOwner.current=null;deletionOwner.current=null;latest.current.onClose();}
 function applyDestination(target:Destination){if(!alive.current)return;try{const next=draftFor(latest.current.book,target);retireConfirmations();publishDraft(next);if(target.all!==undefined)setAll(target.all);setError('');}catch(cause){setError(plainErrorText(cause));}}
 function navigate(target:Destination){if(!alive.current||publishing.current)return;if(current.current.text!==current.current.original){changePending(target);changeDeleting(null);}else applyDestination(target);}
 function save():boolean{
  if(!alive.current||publishing.current)return false;const before=current.current;if(before.id&&before.text===before.original)return true;
  publishing.current=true;try{
   if(latest.current.book!==before.owner)throw new Error('Local notes changed while this draft was open. Copy your draft, then reopen the current note.');
   const now=Math.floor(Date.now()/1000),id=before.id??crypto.randomUUID(),notes=before.id?editWatchNote(before.owner.notes??[],id,before.revision,before.text,now):addWatchNote(before.owner.notes??[],id,before.market,before.text,now),next=restoreWatchBook({...before.owner,notes});
   if(latest.current.onChange(next,before.owner)===false)throw new Error('Local note update was rejected. Your draft is retained.');
   if(!alive.current)return true;latest.current={...latest.current,book:next};const accepted=next.notes!.find(note=>note.id===id)!;retireConfirmations();publishDraft({id,revision:accepted.revision,market:accepted.market,text:accepted.text,original:accepted.text,owner:next});setError('Saved locally.');return true;
  }catch(cause){if(alive.current)setError(cause instanceof Error?cause.message:String(cause));return false;}finally{publishing.current=false;}
 }
 function requestDelete(){if(!alive.current||publishing.current||!current.current.id)return;const note=(current.current.owner.notes??[]).find(row=>row.id===current.current.id);if(note){changeDeleting({note,owner:current.current.owner});changePending(null);}}
 function confirmDelete(){if(!alive.current||publishing.current||!deleting||deletionOwner.current!==deleting)return;publishing.current=true;try{
  if(latest.current.book!==deleting.owner)throw new Error('Local notes changed while deletion was pending. Cancel and review the current note.');
  const next=restoreWatchBook({...deleting.owner,notes:deleteWatchNote(deleting.owner.notes??[],deleting.note.id,deleting.note.revision)});if(latest.current.onChange(next,deleting.owner)===false)throw new Error('Note deletion was rejected. The note remains saved.');if(!alive.current)return;latest.current={...latest.current,book:next};changeDeleting(null);applyDestination({market:deleting.note.market});setError('Deleted locally.');
 }catch(cause){if(alive.current)setError(plainErrorText(cause));}finally{publishing.current=false;}}
 function pendingAction(target:Destination|null,action:'save'|'discard'|'cancel'){if(!alive.current||publishing.current||!target||pendingOwner.current!==target)return;if(action==='cancel'){changePending(null);return;}if(action==='discard'||save())applyDestination(target);}
 function cancelDeletion(target:typeof deleting){if(!alive.current||publishing.current||!target||deletionOwner.current!==target)return;changeDeleting(null);}
 const groups=new Map<string,NoteMarket|null>();for(const note of props.book.notes??[])groups.set(noteMarketKey(note.market),note.market);const rows=notesForMarket(props.book.notes??[],draft.market);
 return <Modal title="Local symbol notes" onClose={close} wide><div className="notes-body">
  <style>{`.notes-body{padding:14px;overflow:auto;flex:1}.notes-layout{display:grid;grid-template-columns:minmax(150px,1fr) minmax(240px,3fr);gap:14px}.notes-list button,.notes-groups button{display:block;width:100%;text-align:left;margin:5px 0;overflow-wrap:anywhere}.notes-editor textarea{width:100%;min-height:240px;resize:vertical;background:#111c2c;color:inherit;padding:12px}.notes-confirm{border:1px solid #d2a75a;padding:12px;margin-top:10px}.notes-body p{color:#a9b9cf}.notes-editor small{display:block;white-space:pre-wrap;overflow-wrap:anywhere}@media(max-width:700px){.notes-layout{grid-template-columns:1fr}}`}</style>
  <div className="button-row"><button onClick={()=>navigate({market:current.current.market,noteId:current.current.id??undefined,newNote:!current.current.id,all:!all})}>{all?'Hide all notes':'All notes'}</button><button onClick={()=>navigate({market:current.current.market,newNote:true})}>Add note</button></div>
  <p>Stored only on this computer and included in local workspace and watchlist JSON exports. Browsing notes does not switch charts.</p>
  {all&&<div className="notes-groups" aria-label="Markets with notes">{[...groups].map(([key,market])=><button key={key} onClick={()=>navigate({market,all:true})}>{label(market)} ({notesForMarket(props.book.notes??[],market).length})</button>)}{!groups.size&&<p>No saved notes.</p>}</div>}
  <h3>{label(draft.market)}</h3><div className="notes-layout"><div className="notes-list" aria-label="Notes for this market">{rows.map(note=><button key={note.id} aria-pressed={draft.id===note.id} onClick={()=>navigate({market:note.market,noteId:note.id})}>{note.text.slice(0,100)}<small>{new Date(note.updatedAt*1000).toISOString()}</small></button>)}{!rows.length&&<p>No saved notes for this market.</p>}</div><div className="notes-editor"><label>Plain-text note<textarea aria-label="Note text" value={draft.text} maxLength={65536} onChange={event=>{if(!alive.current||publishing.current)return;retireConfirmations();publishDraft({...current.current,text:event.target.value});setError('');}}/></label><small>Up to 64 KiB UTF-8. Enter inserts a new line.</small>{draft.id&&<small>Revision {draft.revision}</small>}<div className="button-row"><button onClick={save}>{draft.id?'Save note':'Add note locally'}</button>{draft.id&&<button onClick={requestDelete}>Delete note</button>}</div></div></div>
  {pending&&<div className="notes-confirm" role="group" aria-label="Unsaved note"><p>Save this draft before changing the note view?</p><button onClick={()=>pendingAction(pending,'save')}>Save and continue</button><button onClick={()=>pendingAction(pending,'discard')}>Discard draft</button><button onClick={()=>pendingAction(pending,'cancel')}>Keep editing</button></div>}
  {deleting&&<div className="notes-confirm" role="group" aria-label="Confirm note deletion"><p>Delete this saved note? Local undo can restore the prior workspace while it remains in history.</p><button onClick={()=>cancelDeletion(deleting)}>Cancel deletion</button><button onClick={confirmDelete}>Confirm deletion</button></div>}
  <output role="status">{error}</output>
 </div><footer><button onClick={close}>Cancel / Close</button></footer></Modal>;
}
