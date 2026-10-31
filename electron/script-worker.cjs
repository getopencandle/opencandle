'use strict';
const { parentPort, workerData }=require('node:worker_threads');
const { executeSnapshot }=require('./script-runtime.cjs');
executeSnapshot(workerData).then(value=>parentPort.postMessage({ok:true,value}),error=>parentPort.postMessage({ok:false,error:{code:error.code||'SCRIPT_FAILED',message:error.code?error.message:'Restricted script operation failed.'}}));
