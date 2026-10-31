/** Charts that mount together (a layout switch) are built one per task instead of all inside one commit.
 * A lone mount (startup, a symbol switch, one new pane) still builds synchronously, exactly as before.
 * Layout effects count the panels of a commit; the first passive effect of that commit decides for all of them. */
const batch={mounted:0,staggered:null as boolean|null,remaining:0};
/** Set once by main.tsx. The startup chart (the first commit that mounts charts) builds in its own task too, so the
 * commit of the restored workspace and the chart build are two tasks instead of one. Later lone mounts are unchanged. */
let staggerFirst=false;
export function staggerNextChartBuild(){staggerFirst=true;}
const jobs:Array<{run:()=>void;live:boolean}>=[];
let pumping=false;
/** Layout effect of a ChartPanel: it is about to build. */
export function noteChartMounting(){batch.mounted++;}
/** Passive effect of a ChartPanel, before it builds: true when its build must wait for its turn in the queue. */
export function chartBuildStaggered(){
 if(batch.staggered===null){batch.staggered=batch.mounted>1||staggerFirst;staggerFirst=false;batch.remaining=batch.mounted;}
 const answer=batch.staggered;
 if(--batch.remaining<=0){batch.mounted=0;batch.staggered=null;batch.remaining=0;}
 return answer;
}
// A MessageChannel task, not a timer: back to back (no 4 ms timer clamp, no frame wait), and the browser can still paint or take input between two builds.
let channel:MessageChannel|null=null;const waiting:Array<()=>void>=[];
const later=(fn:()=>void)=>{
 if(typeof MessageChannel!=='function'){setTimeout(fn,0);return;}
 if(!channel){channel=new MessageChannel();channel.port1.onmessage=()=>{waiting.shift()?.();};}
 waiting.push(fn);channel.port2.postMessage(0);
};
const pump=()=>{
 if(pumping)return;pumping=true;
 later(()=>{pumping=false;let job=jobs.shift();while(job&&!job.live)job=jobs.shift();if(job)job.run();if(jobs.length)pump();});
};
/** Runs `run` in its own task (after a paint opportunity), after the builds queued before it. Returns a cancel. */
export function queueChartBuild(run:()=>void):()=>void{
 const job={run,live:true};jobs.push(job);pump();
 return()=>{job.live=false;};
}
