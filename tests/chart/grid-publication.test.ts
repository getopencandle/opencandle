import {expect,it} from 'vitest';
import {publishGridState} from '../../src/chart/grid-publication';
it('a rejected or throwing workspace callback cannot replace the accepted model or report success',()=>{
 for(const fail of [()=>false,()=>{throw Error('capacity');},()=>undefined]){const previous={drawings:1},next={drawings:2};let saved=previous;const messages:string[]=[],success:string[]=[];expect(publishGridState({previous,next,notify:fail,accepted:value=>{saved=value;success.push('accepted');},rejected:message=>messages.push(message)})).toBe(false);expect(saved).toBe(previous);expect(success).toEqual([]);expect(messages).toHaveLength(1);}
});
it('accepted publication updates ownership once; unavailable diagnostics cannot mask a rejected change',()=>{const previous={id:1},next={id:2};let accepted=0;expect(publishGridState({previous,next,notify:()=>true,accepted:()=>accepted++,rejected:()=>{throw Error('sink');}})).toBe(true);expect(accepted).toBe(1);expect(publishGridState({previous,next,notify:()=>false,accepted:()=>accepted++,rejected:()=>{throw Error('sink');}})).toBe(false);expect(accepted).toBe(1);});
