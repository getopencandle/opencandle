/** The retained recovery payload has passed main's plain JSON boundary, but has
 * not passed workspace/domain validation. Never mount or autosave it. */
export type WorkspaceStartup=
 | {phase:'loading'|'ready'|'preview'|'unavailable';error:string}
 | {phase:'recoverable';error:string;data:Record<string,unknown>};
export function assertStartupStorageAvailable(state:WorkspaceStartup):void{
 if(state.phase==='loading')throw Error('Local storage is still loading. Wait before exporting, resetting or replacing it.');
 if(state.phase==='unavailable')throw Error('Saved storage is unreadable or unavailable. Retry loading before exporting, resetting or replacing it.');
}
export function assertStartupEditable(state:WorkspaceStartup):void{
 if(state.phase!=='ready'&&state.phase!=='preview')throw Error('Resolve local workspace recovery before changing the workspace.');
}
