import type {PaperAccount} from '../domain/paper';
import type {LocalAlert} from '../domain/alerts';
import {measureWorkspaceJSON,WORKSPACE_JSON_LIMITS,type WorkspaceJSONMetrics} from './workspace-json';
import {writtenWorkspaceShape} from './workspace-derived-imports';

/** Models are immutable. Cache only the unchanged workspace and alert collection;
 * every proposed financial account is inspected before it can replace local state. */
export function createFinancialPublicationGuard(){
 const workspaces=new WeakMap<object,WorkspaceJSONMetrics>(),alertCollections=new WeakMap<object,WorkspaceJSONMetrics>();
 const cached=(cache:WeakMap<object,WorkspaceJSONMetrics>,key:object,value:unknown)=>{const prior=cache.get(key);if(prior)return prior;const measured=measureWorkspaceJSON(value);cache.set(key,measured);return measured;};
 return (workspace:object,alerts:LocalAlert[],paper:PaperAccount,replay=false):void=>{
  const account=measureWorkspaceJSON(paper);
  // These are the persisted account reader's limits, including its own root.
  if(account.bytes>20*1024*1024||account.nodes>500000||account.depth>40)throw new Error('Virtual account exceeds its 20 MiB, 500000-node or depth-40 recovery limit. Existing account retained.');
  if(replay)return;
  if(Object.hasOwn(workspace,'paper')||Object.hasOwn(workspace,'alerts'))throw new Error('Workspace financial ownership is ambiguous. Existing account retained.');
  /* Measure the workspace as it is written (derived intervals are saved as recipes, not bars). */const base=cached(workspaces,workspace,writtenWorkspaceShape(workspace)),notifications=cached(alertCollections,alerts,{alerts});
  // Join three disjoint object members: base, {paper:account}, {alerts:alerts}.
  // The account needs its property name, colon and one extra root level.
  const paperBytes=account.bytes+10,paperNodes=account.nodes+1;
  const baseMembers=Object.keys(workspace).some(key=>Object.getOwnPropertyDescriptor(workspace,key)?.value!==undefined);
  const bytes=base.bytes+paperBytes+notifications.bytes-6+2+(baseMembers?2:1);
  const nodes=base.nodes+paperNodes+notifications.nodes-2;
  const depth=Math.max(base.depth,account.depth+1,notifications.depth);
  if(bytes>WORKSPACE_JSON_LIMITS.bytes||nodes>WORKSPACE_JSON_LIMITS.nodes||depth>WORKSPACE_JSON_LIMITS.depth)throw new Error('Workspace storage is full. The account is unchanged. Export or remove other local data first.');
 };
}
