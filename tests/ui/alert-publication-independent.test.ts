import {expect,it} from 'vitest';
import {TechnicalAlertObserver,type TechnicalAlertInput} from '../../src/ui/technical-alert-observer';
import {fixtureDataset} from '../../src/domain/fixtures';

const input=():TechnicalAlertInput=>{const dataset=fixtureDataset('GME',5);return{dataset,bars:dataset.bars,chartId:'independent-publication',replay:null,assumeReplayCompletion:false,selectedSource:{kind:'price',field:'close',transformId:'standard'},alerts:[]};};
it('an older cached publication lease cannot roll back a later committed observation',async()=>{
 let ids=0;const observer=new TechnicalAlertObserver(()=>String(++ids),()=>Promise.resolve()),source=input();await observer.observe(source,1800000000);
 const earlier=observer.observeForPublication(source,1800000001,'explicit-evaluation'),later=observer.observeForPublication(source,1800000002,'explicit-evaluation');
 const [oldLease,newLease]=await Promise.all([earlier,later]);newLease.commit();expect(oldLease.rollback()).toBe(false);
 const next=await observer.observe(source,1800000003,'explicit-evaluation');expect(next.selectedEvent?.sequence).toBe(4);
});
it('direct later observation also retires a previous publication rollback capability',async()=>{
 let ids=0;const observer=new TechnicalAlertObserver(()=>String(++ids),()=>Promise.resolve()),source=input();await observer.observe(source,1800000000);
 const earlier=observer.observeForPublication(source,1800000001,'explicit-evaluation'),later=observer.observe(source,1800000002,'explicit-evaluation');await later;
 expect((await earlier).rollback()).toBe(false);const next=await observer.observe(source,1800000003,'explicit-evaluation');expect(next.selectedEvent?.sequence).toBe(4);
});
