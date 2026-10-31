'use strict';
const { Worker }=require('node:worker_threads');
const path=require('node:path');
const { inputForScript }=require('./script-runtime.cjs');
class ScriptJobs {
  constructor({WorkerClass=Worker}={}){if(typeof WorkerClass!=='function')throw new TypeError('Expected host worker constructor.');this.WorkerClass=WorkerClass;this.active=new Map();}
  run(raw){
    let input; try{input=inputForScript(raw);}catch(error){return Promise.resolve({ok:false,error:{code:error.code||'INVALID_ARGUMENT',message:error.message}});}
    if(this.active.has(input.requestId)||this.active.size>=2)return Promise.resolve({ok:false,error:{code:'BUSY',message:'Script request is active or worker capacity is full.'}});
    return new Promise(resolve=>{
      const worker=new this.WorkerClass(path.join(__dirname,'script-worker.cjs'),{workerData:raw,resourceLimits:{maxOldGenerationSizeMb:64,maxYoungGenerationSizeMb:16,stackSizeMb:2}});
      let finished=false;
      let job;
      const release=()=>{if(this.active.get(input.requestId)===job)this.active.delete(input.requestId);};
      const finish=result=>{
        if(finished)return false;finished=true;clearTimeout(timer);
        // Capacity includes workers shutting down, so cancel/run floods cannot
        // exceed the two-worker bound before termination actually completes.
        Promise.resolve().then(()=>worker.terminate()).then(()=>{release();resolve(result);},()=>{
          // A failed termination does not certify exit or release capacity.
          resolve({ok:false,error:{code:'WORKER_FAILED',message:'Restricted worker teardown failed.'}});
        });
        return true;
      };
      const timer=setTimeout(()=>finish({ok:false,error:{code:'TIMEOUT',message:'Script worker exceeded its 5-second lifetime.'}}),5000);
      job={cancel:()=>finish({ok:false,error:{code:'CANCELLED',message:'Script request cancelled before commit.'}})};
      this.active.set(input.requestId,job);
      worker.on('message',finish);worker.on('error',()=>finish({ok:false,error:{code:'WORKER_FAILED',message:'Restricted script worker failed.'}}));
      worker.on('exit',code=>{release();if(!finished)finish({ok:false,error:{code:'WORKER_EXITED',message:'Script worker exited without a result.'}});});
    });
  }
  cancel(requestId){const job=this.active.get(requestId);return job?job.cancel():false;}
  close(){for(const job of Array.from(this.active.values()))job.cancel();}
}
module.exports={ScriptJobs};
