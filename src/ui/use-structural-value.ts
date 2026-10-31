import {useRef} from 'react';

/** An exact structural key. Unlike plain JSON it tells undefined, NaN, Infinity and -0 apart. */
export function structuralKey(value:unknown):string{
 return JSON.stringify(value,(_key,item)=>item===undefined?'\u0000undefined':typeof item==='number'&&(!Number.isFinite(item)||Object.is(item,-0))?'\u0000'+(Object.is(item,-0)?'-0':String(item)):item)??'\u0000undefined';
}
/** The previous object while the value is structurally the same, so an effect keyed on it runs only when the value
 *  changes, not on every cloned copy of it (cloned cell or panel state on a symbol or interval switch). */
export function useStructuralValue<T>(value:T):T{
 const held=useRef<{value:T;key:string;seen:T}|null>(null),prior=held.current;
 if(prior&&prior.seen===value)return prior.value;
 const key=structuralKey(value);
 held.current=prior&&prior.key===key?{value:prior.value,key,seen:value}:{value,key,seen:value};
 return held.current.value;
}
