import {useEffect,useState} from 'react';

/**
 * Re-renders the caller at each whole minute while `enabled`, for labels that read the clock while they
 * render ("Market closed", timezone offsets). US session boundaries and timezone offset changes fall on whole minutes.
 * One timeout per tick, re-armed by the render it causes; never a repeating timer, so `runAllTimers` in the gesture tests
 * terminates. Returns the tick count (callers read the clock themselves).
 */
export function useMinuteTick(enabled:boolean):number{
 const [tick,setTick]=useState(0);
 useEffect(()=>{if(!enabled)return;const at=Date.now(),timer=setTimeout(()=>setTick(value=>value+1),60000-at%60000+1);return()=>clearTimeout(timer);},[tick,enabled]);
 return tick;
}
