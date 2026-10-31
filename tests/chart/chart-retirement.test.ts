import {expect,it} from 'vitest';
import {retireChart,attemptEveryCleanup} from '../../src/chart/chart-retirement';
it('throwing old ready and disposal callbacks cannot retain ownership or roll back committed workspace',()=>{
 let owner:object|null={},committed='new';const calls:string[]=[];
 const errors=retireChart({retire(){owner=null;calls.push('retire');},ready(){expect(owner).toBeNull();calls.push('ready');throw Error('subscriber');},dispose(){calls.push('dispose');throw Error('old release');},report(message){calls.push('report');expect(message).toContain('current workspace remains committed');throw Error('sink');}});
 expect(owner).toBeNull();expect(committed).toBe('new');expect(errors).toHaveLength(2);expect(calls).toEqual(['retire','ready','dispose','report']);
});
it('all owned cleanup steps run and every failure is retained, including final background restoration',()=>{const calls:string[]=[];let failure:unknown;try{attemptEveryCleanup([()=>{calls.push('unsubscribe');throw Error('unsubscribe');},()=>{calls.push('indicator');throw Error('indicator');},()=>{calls.push('destroy');},()=>{calls.push('background');}], 'cleanup failed');}catch(error){failure=error;}expect(calls).toEqual(['unsubscribe','indicator','destroy','background']);expect(failure).toBeInstanceOf(AggregateError);expect((failure as AggregateError).errors.map(String)).toEqual(['Error: unsubscribe','Error: indicator']);});
