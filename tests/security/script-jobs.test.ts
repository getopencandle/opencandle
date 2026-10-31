import {describe,it,expect} from 'vitest';
import {createRequire} from 'node:module';
import {EventEmitter} from 'node:events';
const require=createRequire(import.meta.url),{ScriptJobs}=require('../../electron/script-jobs.cjs');
const input=(requestId:string)=>({requestId,source:'({onBar(){}})',bars:[]});
describe('restricted worker teardown capacity',()=>{
  it('holds both slots during delayed cancellation, ignores late results and frees slots only after exit',async()=>{
    const workers:DelayedWorker[]=[];
    class DelayedWorker extends EventEmitter {
      finishTermination!:()=>void;
      constructor(){super();workers.push(this);}
      terminate(){return new Promise<number>(resolve=>{this.finishTermination=()=>{this.emit('exit',0);resolve(0);};});}
    }
    const jobs=new ScriptJobs({WorkerClass:DelayedWorker});
    const first=jobs.run(input('first')),second=jobs.run(input('second'));
    expect(jobs.cancel('first')).toBe(true);expect(jobs.cancel('first')).toBe(false);expect(jobs.cancel('second')).toBe(true);
    await Promise.resolve();
    const refused=await jobs.run(input('third'));expect(refused.error.code).toBe('BUSY');expect(workers).toHaveLength(2);expect(jobs.active.size).toBe(2);
    workers[0].emit('message',{ok:true,value:{state:'Synthetic late effect'}});
    workers[0].finishTermination();expect((await first).error.code).toBe('CANCELLED');expect(jobs.active.size).toBe(1);
    const third=jobs.run(input('third'));expect(workers).toHaveLength(3);expect(jobs.active.size).toBe(2);
    jobs.cancel('third');await Promise.resolve();workers[1].finishTermination();workers[2].finishTermination();
    expect((await second).error.code).toBe('CANCELLED');expect((await third).error.code).toBe('CANCELLED');expect(jobs.active.size).toBe(0);
  });
  it('retains capacity if termination fails until an actual exit event',async()=>{
    const workers:FailedWorker[]=[];
    class FailedWorker extends EventEmitter {constructor(){super();workers.push(this);}terminate(){return Promise.reject(new Error('Synthetic failure'));}}
    const jobs=new ScriptJobs({WorkerClass:FailedWorker}),first=jobs.run(input('one')),second=jobs.run(input('two'));
    jobs.cancel('one');jobs.cancel('two');expect((await first).error.code).toBe('WORKER_FAILED');expect((await second).error.code).toBe('WORKER_FAILED');
    expect((await jobs.run(input('three'))).error.code).toBe('BUSY');expect(workers).toHaveLength(2);
    workers[0].emit('exit',1);workers[1].emit('exit',1);expect(jobs.active.size).toBe(0);
  });
});
