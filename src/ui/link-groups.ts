import type {LayoutSnapshot} from '../chart/layout-port';

// Link groups. Charts in one group follow each other when a sync switch (symbol, interval, ...) is on; a
// chart set to "Not linked" follows nobody. The layout stores a plain string per cell: a color id, or `none:<cellId>`
// (a group of one). The earlier saved value `default` is kept as the first choice, so saved layouts behave as before.
export type LinkChoiceId='default'|'red'|'green'|'blue'|'orange'|'none';
export interface LinkGroupChoice {id:LinkChoiceId;label:string;color:string|null}
export const LINK_GROUP_CHOICES:readonly LinkGroupChoice[]=Object.freeze([
 {id:'default',label:'All charts',color:'#9db2bd'},
 {id:'red',label:'Red group',color:'#f23645'},
 {id:'green',label:'Green group',color:'#089981'},
 {id:'blue',label:'Blue group',color:'#2962ff'},
 {id:'orange',label:'Orange group',color:'#ff9800'},
 {id:'none',label:'Not linked',color:null},
]);
const IDS=new Set<string>(LINK_GROUP_CHOICES.map(row=>row.id));
/** The choice a stored group string stands for. Unknown stored names read as the shared default group. */
export function linkChoiceOf(group:string):LinkChoiceId{
 if(group.startsWith('none:'))return 'none';
 return IDS.has(group)&&group!=='none'?group as LinkChoiceId:'default';
}
export function groupForChoice(choice:LinkChoiceId,cellId:string):string{return choice==='none'?'none:'+cellId:choice;}
/** A copy of the layout with one cell's group changed. */
export function setCellLinkGroup(layout:LayoutSnapshot,cellId:string,choice:LinkChoiceId):LayoutSnapshot{
 if(!IDS.has(choice))throw new Error('Unknown link group');
 if(!layout.cells.some(cell=>cell.id===cellId))throw new Error('Unknown chart');
 const next=structuredClone(layout);next.cells.find(cell=>cell.id===cellId)!.group=groupForChoice(choice,cellId);return next;
}
