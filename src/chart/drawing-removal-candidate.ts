import {measureWorkspaceJSON} from '../ui/workspace-json';
import {sameDrawingData} from './drawing-data-equality';

type Row=Record<string,unknown>;
export interface DrawingRemovalCandidate {
 readonly ids:readonly string[];
 readonly candidate:Record<string,unknown>;
}
const record=(value:unknown):value is Row=>!!value&&typeof value==='object'&&!Array.isArray(value);
const identity=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=4096;

/** Data-only one-target removal. This preview grants no native or publication authority. */
export function buildDrawingRemovalCandidate(document:Readonly<Row>,expectedInput:readonly Row[]):DrawingRemovalCandidate{
 const metrics=measureWorkspaceJSON({document,expected:expectedInput});
 if(metrics.bytes>16*1024*1024||metrics.nodes>300000||metrics.depth>40)throw Error('Drawing removal exceeds its resource limit.');
 if(!Array.isArray(expectedInput)||expectedInput.length!==1)throw Error('Drawing removal requires exactly one dense expected row.');
 const source=structuredClone(document) as Row,expected=structuredClone(expectedInput[0]),rows=source.drawings;
 if(!Array.isArray(rows)||rows.length>10000)throw Error('Drawing removal requires at most 10000 canonical records.');
 const existing=new Map<string,Row>();
 for(const row of rows){
  if(!record(row)||!identity(row.id)||!identity(row.type)||existing.has(row.id))throw Error('Drawing removal requires unique canonical identities.');
  existing.set(row.id,row);
 }
 if(!record(expected)||!identity(expected.id)||!identity(expected.type)||!sameDrawingData(existing.get(expected.id),expected))throw Error('Drawing removal no longer matches its exact canonical target.');
 const id=expected.id,manager=source.lvDrawingManager;
 if(manager!==undefined){
  if(!record(manager))throw Error('Drawing manager metadata is invalid and has been retained.');
  if(manager.schemaVersion!==1||!Array.isArray(manager.groups)||!Array.isArray(manager.templates))throw Error('Drawing manager schema is unavailable and has been retained.');
  const groupIds=new Set<string>(),members=new Set<string>();
  for(const group of manager.groups){
   if(!record(group)||typeof group.id!=='string'||!group.id||groupIds.has(group.id)||typeof group.name!=='string'||!Array.isArray(group.memberIds))throw Error('Invalid drawing group metadata has been retained.');
   groupIds.add(group.id);
   for(const member of group.memberIds){
    if(typeof member!=='string'||members.has(member)||!existing.has(member))throw Error('Overlapping, duplicate or orphan drawing group membership has been retained.');
    members.add(member);
   }
  }
  const templateIds=new Set<string>();
  for(const template of manager.templates){
   if(!record(template)||typeof template.id!=='string'||!template.id||templateIds.has(template.id)||typeof template.name!=='string'||typeof template.type!=='string'||!record(template.properties))throw Error('Invalid drawing template metadata has been retained.');
   templateIds.add(template.id);
  }
  // Preserve supported metadata, including empty groups and future fields. Only
  // the exact target's membership changes; group selection never expands a hit.
  manager.groups=manager.groups.map(group=>{
   const value=group as Row,memberIds=value.memberIds as string[];
   return memberIds.includes(id)?{...value,memberIds:memberIds.filter(member=>member!==id)}:value;
  });
 }
 source.drawings=rows.filter(row=>(row as Row).id!==id);
 return{ids:Object.freeze([id]),candidate:source};
}
