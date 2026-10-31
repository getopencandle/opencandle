import type {ReactNode} from 'react';

/** Presentation placement only. This never carries or grants numerical/command authority. */
export interface ScriptLegendOwnedRow {readonly id:string;readonly actualPaneId:string|null;readonly node:ReactNode}
export interface BuiltinLegendOwnedRow {readonly id:string;readonly paneId:string|null;readonly node:ReactNode}
export interface ActiveLegendNode {readonly key:string;readonly node:ReactNode}
export interface ActiveLegendPane {readonly paneId:string;readonly rows:readonly ActiveLegendNode[]}
export interface ActiveLegendPaneRows {readonly price:readonly ActiveLegendNode[];readonly panes:readonly ActiveLegendPane[];readonly unplaced:readonly ActiveLegendNode[]}

/** Existing builtin null-placement policy stays local to builtins. Scripts never guess a pane. */
export function groupActiveStudyPaneRows(builtins:readonly BuiltinLegendOwnedRow[],scripts:readonly ScriptLegendOwnedRow[]):ActiveLegendPaneRows{
 const groups=new Map<string,ActiveLegendNode[]>(),unplaced:ActiveLegendNode[]=[];
 const add=(pane:string,node:ActiveLegendNode)=>{const rows=groups.get(pane)??[];rows.push(node);groups.set(pane,rows);};
 for(const row of builtins)add(row.paneId??'price',{key:'builtin:'+row.id,node:row.node});
 for(const row of scripts){const node={key:'script:'+row.id,node:row.node};if(row.actualPaneId===null)unplaced.push(node);else add(row.actualPaneId,node);}
 return{price:groups.get('price')??[],panes:[...groups].filter(([pane])=>pane!=='price').map(([paneId,rows])=>({paneId,rows})),unplaced};
}

/** Bounded primitive placement comparison; fresh metadata records alone do not trigger rendering. */
export function scriptPanePlacements(rows:readonly {readonly id:string;readonly actualPaneId:string|null}[]):ReadonlyMap<string,string|null>{return new Map(rows.map(row=>[row.id,row.actualPaneId]));}
export function sameScriptPanePlacements(left:ReadonlyMap<string,string|null>,right:ReadonlyMap<string,string|null>):boolean{
 if(left.size!==right.size)return false;for(const[id,pane]of left)if(!right.has(id)||right.get(id)!==pane)return false;return true;
}
