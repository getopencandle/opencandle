import type {CompoundAlertBook,CompoundBookChange} from './compound-alert-book';
import {encodeCompoundPrivateDocument,refuseCompoundDocumentShare,type CompoundPrivateDocument} from './compound-alert-document';

/** Capture private flat data only at an explicit workspace save boundary. The
 * runtime stores and linked journal never become Workspace or chart Undo data. */
export function captureCompoundWorkspaceSave(book:CompoundAlertBook,now:number):Readonly<{version:bigint;reviewVersion:bigint;data:Readonly<{compoundAlerts?:CompoundPrivateDocument}>}>{
 const version=book.version,reviewVersion=book.reviewVersion,snapshots=book.documentSnapshots();
 const data=snapshots.length?{compoundAlerts:JSON.parse(encodeCompoundPrivateDocument(snapshots,now)) as CompoundPrivateDocument}:{};
 if(book.version!==version)throw Error('The local alerts changed while preparing the save. Retry the current state.');
 return Object.freeze({version,reviewVersion,data:Object.freeze(data)});
}

/** Sharing is a separate operation from private persistence. The recoverable
 * raw payload is checked before any JSON encoding or file-writing request. */
export function assertCompoundWorkspaceShareable(book:CompoundAlertBook,recoverableData?:Record<string,unknown>):void{
 if(book.entries().length>0||recoverableData&&Object.hasOwn(recoverableData,'compoundAlerts'))refuseCompoundDocumentShare();
}

/** Called only for actual load/reset/replacement. Canonical stores are prepared
 * here once, separately from preview validation and ordinary private saving. */
export function prepareCompoundWorkspaceAdoption(book:CompoundAlertBook,document:CompoundPrivateDocument|undefined,now:number):CompoundBookChange{
 return book.prepareAdopt(document?JSON.stringify(document):encodeCompoundPrivateDocument([],now),now);
}
