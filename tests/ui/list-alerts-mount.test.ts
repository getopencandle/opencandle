import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {expect,it,vi} from 'vitest';
import {AlertsDock} from '../../src/ui/AlertsDock';
import {setListAlertPaused} from '../../src/domain/watchlist-alerts';

// The WLCORE list alert manager (ListAlertsGroup) is mounted in the docked Alerts panel under the price alerts.
// App handler checked by source extraction of the actual App body; the dock by its real render tree. No DOM, no packaged claim.
vi.mock('react',async()=>({...await vi.importActual<any>('react'),startTransition:(fn:()=>void)=>fn() /* App commits range picks as transitions */,useDeferredValue:(value:any)=>value /* App defers the range-button inputs; the hook-cell mock has no React dispatcher */,useState:(initial:any)=>[typeof initial==='function'?initial():initial,()=>{}]}));
function text(node:any):string{return typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
function find(node:any,predicate:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const found=find(child,predicate);if(found)return found;}}else if(node?.props){if(predicate(node))return node;return find(node.props.children,predicate);}return null;}

const app=readFileSync('src/ui/App.tsx','utf8').replace(/\r\n/g,'\n');
const line=(needle:string)=>{const start=app.indexOf(needle);if(start<0)throw Error('Review App boundary: '+needle);return app.slice(start,app.indexOf('\n',start));};

it('the App mounts the list alert group in the docked Alerts panel with pause, resume and remove',()=>{
 expect(app).toContain("import {ListAlertsGroup} from './ListAlertsGroup';");
 expect(app).toContain('listAlerts={reuse(\'rail:alerts-list\',<ListAlertsGroup alerts={workspace.listAlerts??[]} book={workspace.watchBook} onPause={(id,paused)=>listAlertAction(id,paused?\'pause\':\'resume\')} onRemove={id=>listAlertAction(id,\'remove\')} onRestart={id=>listAlertAction(id,\'restart\')} onEdit={id=>{openListAlertEdit(id);}}/>,[],[\'alerts\'])}');
 // Edit opens the same dialog on the saved alert, which saves it in place.
 expect(app).toContain('editing={listAlertEditing?(workspace.listAlerts??[]).find(row=>row.id===listAlertEditing):undefined}');
});

it('the App list alert action pauses, resumes and removes through one checked commit, and reports a refusal',()=>{
 const body=line(' function listAlertAction(id:string,action:');
 const run=(saved:any[],commitOk=true,editable=true)=>{
  const commit=vi.fn(()=>commitOk),reportFailure=vi.fn(),setMessage=vi.fn();
  const fn=new Function('setListAlertPaused','commit','reportFailure','setMessage','assertStartupEditable','startup','current',
   'return '+stripTypeScriptTypes('(function(){'+body+' return listAlertAction;})',{mode:'strip'})+'();')(setListAlertPaused,commit,reportFailure,setMessage,()=>{if(!editable)throw Error('SYNTHETIC startup hold');},{current:{}},{current:{listAlerts:saved}});
  return{fn,commit,reportFailure,setMessage};
 };
 const alert={id:'L1',status:'active',statusReason:null,members:[]} as any,other={id:'L2',status:'active',statusReason:null,members:[]} as any;
 const pause=run([alert,other]);expect(pause.fn('L1','pause')).toBe(true);
 expect(pause.commit).toHaveBeenCalledWith({listAlerts:[setListAlertPaused(alert,true),other]});
 const remove=run([alert,other]);expect(remove.fn('L1','remove')).toBe(true);expect(remove.commit).toHaveBeenCalledWith({listAlerts:[other]});
 const gone=run([other]);expect(gone.fn('L1','pause')).toBe(false);expect(gone.commit).not.toHaveBeenCalled();expect(gone.reportFailure).toHaveBeenCalled();
 const refused=run([alert],false);expect(refused.fn('L1','remove')).toBe(false);expect(refused.reportFailure).toHaveBeenCalled();
 const held=run([alert],true,false);expect(held.fn('L1','remove')).toBe(false);expect(held.commit).not.toHaveBeenCalled();
});

it('the docked Alerts panel shows the list alert group on its Alerts tab, also when there are no price alerts',()=>{
 const group={type:'section',props:{'aria-label':'List alerts',children:'SYNTHETIC list alert group'}};
 const props={alerts:[],activeInstrumentId:'X',unwatched:new Map(),formatTime:String,now:()=>0,onAlertsChange:()=>true,onCreate:()=>{},onEdit:()=>{}};
 const tree=AlertsDock({...props,listAlerts:group} as any);
 expect(find(tree,(node:any)=>node.props?.['aria-label']==='List alerts')).toBeTruthy();
 expect(text(tree)).toContain('No alerts yet');
 expect(find(AlertsDock(props as any),(node:any)=>node.props?.['aria-label']==='List alerts')).toBeNull();
});
