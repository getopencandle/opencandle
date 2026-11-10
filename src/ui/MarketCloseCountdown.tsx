import React,{useEffect,useState} from 'react';
import {marketCloseCountdown} from '../domain/market-close-countdown';

/** A small pill at the top of the chart during the last ten minutes of the US regular session. It never takes the pointer. */
export function MarketCloseCountdown({active,now=Date.now}:{active:boolean;now?:()=>number}){
 const [text,setText]=useState<{text:string;final:boolean}|null>(null);
 useEffect(()=>{
  if(!active){setText(null);return;}
  const tick=()=>{const next=marketCloseCountdown(now());setText(current=>next?current?.text===next.text?current:{text:next.text,final:next.final}:null);};
  tick();const timer=setInterval(tick,250);return()=>clearInterval(timer);
 },[active,now]);
 if(!text)return null;
 return <output className={'lv-close-countdown'+(text.final?' final':'')} aria-live="off" title="Time left in the regular US session">{text.text}</output>;
}
