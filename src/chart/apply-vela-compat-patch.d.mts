import type {Buffer} from 'node:buffer';
export interface PatchIO {
 readFileSync:(path:string,encoding?:string)=>Buffer|string;
 writeFileSync:(path:string,data:Buffer)=>unknown;
 realpathSync:(path:string)=>string;
 lstatSync:(path:string)=>{size:number;isSymbolicLink:()=>boolean;isDirectory:()=>boolean;isFile:()=>boolean};
}
export interface PatchInput {path:string;beforeSha256:string;afterSha256:string;targetPath:string;original:Buffer;state:'patched'|'original'|'magnet'|'compat2'|'compat3'|'compat4'|'compat5'|'compat6'|'compat7'|'compat8'|'compat9'|'compat10';magnetSha256?:string;compat2Sha256:string;compat3Sha256:string;compat4Sha256:string;compat5Sha256:string;compat6Sha256:string;compat7Sha256:string;compat8Sha256:string;compat9Sha256:string;compat10Sha256:string;transformations:{id:string;before:string;after:string}[]}
export const patchPlan:Record<string,unknown>;
export const compat5StepIds:readonly string[];
export const compat6StepIds:readonly string[];
export const compat7StepIds:readonly string[];
export const compat8StepIds:readonly string[];
export const compat9StepIds:readonly string[];
export const compat10StepIds:readonly string[];
export const compat11StepIds:readonly string[];
export function validatePatchPlan(plan:unknown):unknown;
export function inspectPatch(io?:PatchIO,plan?:unknown):PatchInput[];
export function runPatch(mode?:string,io?:PatchIO):{patchId:string;version:string;mode:string;files:Omit<PatchInput,'targetPath'|'original'>[]};

export function prepareCandidate(original:Buffer,row:Omit<PatchInput,'targetPath'|'original'|'state'>):Buffer;
export function restoreMagnetCandidate(original:Buffer,row:Omit<PatchInput,'targetPath'|'original'|'state'>):Buffer;
