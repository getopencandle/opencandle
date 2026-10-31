import type {Buffer} from 'node:buffer';
export interface PatchIO {
 readFileSync:(path:string,encoding?:string)=>Buffer|string;
 writeFileSync:(path:string,data:Buffer)=>unknown;
 realpathSync:(path:string)=>string;
 lstatSync:(path:string)=>{size:number;isSymbolicLink:()=>boolean;isDirectory:()=>boolean;isFile:()=>boolean};
}
export interface PatchInput {path:string;beforeSha256:string;afterSha256:string;targetPath:string;original:Buffer;state:'patched'|'original'}
export const patchPlan:Record<string,unknown>;
export function validatePatchPlan(plan:unknown):unknown;
export function inspectPatch(io?:PatchIO,plan?:unknown):PatchInput[];
export function runPatch(mode?:string,io?:PatchIO):{patchId:string;version:string;mode:string;files:Omit<PatchInput,'targetPath'|'original'>[]};
