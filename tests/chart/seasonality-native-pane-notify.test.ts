import {afterEach,expect,it,vi} from 'vitest';
import {monthlyLocal,ownedAnalysisUndoPipelineFixture} from '../fixtures/seasonality-analysis-undo-pipeline';
type Fixture=Awaited<ReturnType<typeof ownedAnalysisUndoPipelineFixture>>;
const held:Fixture[]=[];
const inputs={startYear:2016,endYear:2017,calendar:'utc-continuous',session:'continuous',dateLabels:'utc-date',closedThrough:'2024-01-01T00:00:00Z',projectionGeometry:false};
afterEach(()=>{vi.restoreAllMocks();const failures:unknown[]=[];for(const f of held.splice(0).reverse())try{f.dispose();}catch(error){failures.push(error);}if(failures.length)throw new AggregateError(failures,'SYNTHETIC C pane notification cleanup failed.');});
async function own(deferInitial=false){const f=await ownedAnalysisUndoPipelineFixture({dataset:monthlyLocal(),deferInitial});held.push(f);return f;}
function record(f:Fixture,id:string){return[...f.records.values()].find(value=>value.native?.instance?.settings?.id===id);}
async function ready(f:Fixture,id:string){await vi.waitFor(()=>expect(f.port.captureReadout!(id).state).toBe('ready'),{timeout:5000,interval:10});}
function matched(f:Fixture,id:string){const saved=f.port.serialize().find(row=>row.id===id)!,pane=f.inventory().panes.find(pane=>pane.owners.some(owner=>owner.kind==='built'&&owner.id===id));expect(pane).toBeDefined();expect(pane!.logicalPaneId).toBe(saved.paneId);return pane!;}

it('a genuine empty C mount binds its actual logical pane while constructor source readiness is still pending',async()=>{
 const f=await own(true),id=f.port.add('seasonality',inputs);await vi.waitFor(()=>expect(record(f,id)?.model).toBeDefined(),{timeout:5000,interval:10});
 expect(f.port.captureReadout!(id).state).toBe('unavailable');expect(matched(f,id).paneId).not.toBe('price');
 f.initialDone();await ready(f,id);matched(f,id);
});
it('a removed native model cannot consume a same-ID replacement pending pane',async()=>{
 const f=await own(),id=f.port.add('seasonality',inputs);await ready(f,id);const saved=f.port.serialize().find(row=>row.id===id)!,old=record(f,id)!.native.instance;f.port.remove(id);const replacement=f.port.add('seasonality',{},saved);
 expect(replacement).toBe(id);expect(()=>old.notifySeasonalityChange()).toThrow(/owner|retired/i);await ready(f,id);expect(record(f,id)!.native.instance).not.toBe(old);matched(f,id);
});
it('a source replacement inside the actual first pane read cannot bind the stale C intent',async()=>{
 const f=await own(),next=monthlyLocal(),read=f.chart.panes.list.bind(f.chart.panes);let id='',switched=false;
 const spy=vi.spyOn(f.chart.panes,'list').mockImplementation(()=>{if(!switched&&id&&record(f,id)?.model){switched=true;f.stage(next);}return read();});
 id=f.port.add('seasonality',inputs);await vi.waitFor(()=>expect(switched).toBe(true),{timeout:5000,interval:10});spy.mockRestore();expect(f.port.captureReadout!(id).state).toBe('unavailable');
 const saved=f.port.serialize().find(row=>row.id===id)!,pane=f.inventory().panes.find(pane=>pane.owners.some(owner=>owner.kind==='built'&&owner.id===id));expect(pane?.logicalPaneId).not.toBe(saved.paneId);
 f.port.remove(id);await f.applyStaged();const current=f.port.add('seasonality',inputs);await ready(f,current);matched(f,current);
});
it('an explicit current move during the guarded internal pane read supersedes the old pending study intent',async()=>{
 const f=await own();f.native.wrapper={clientWidth:0,clientHeight:0};const read=f.chart.panes.list.bind(f.chart.panes);let id='',reads=0,moved=false;
 const spy=vi.spyOn(f.chart.panes,'list').mockImplementation(()=>{if(!moved&&id&&record(f,id)?.model&&++reads===2){moved=true;f.port.move(id,'price');}return read();});
 id=f.port.add('seasonality',inputs);await vi.waitFor(()=>expect(moved).toBe(true),{timeout:5000,interval:10});spy.mockRestore();expect(f.port.serialize().find(row=>row.id===id)!.paneId).toBe('price');expect(matched(f,id).paneId).toBe('price');
 f.port.recompute();await ready(f,id);expect(matched(f,id).paneId).toBe('price');
});
