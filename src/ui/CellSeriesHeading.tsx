import React,{useEffect,useLayoutEffect,useRef,useState,type RefObject} from 'react';
import {shortIntervalText} from './interval-display';
import type {ChartController} from '../chart/adapter';
import type {BarDataset} from '../domain/types';
import type {ChartSettingsDocument} from '../chart/chart-settings-document';
import type {SeriesReadoutPosition,SeriesReadoutValue} from '../chart/series-readout-position';
import {statusLineParts,statusLinePriceFormat} from '../chart/status-line-model';
import {legendButtons} from '../chart/legend-model';
import {statusLineLead,statusLineValues,statusLineBackground,legendButtonView} from './indicator-legend-view';
import {seriesLegendEye} from './series-visibility';
import {chartHeadingLabels} from './chart-heading-label';
import {displayExchange} from '../domain/fixtures';
import {chartHeaderChange} from './data-window-model';
import {isSymbolMathDatasetId} from '../domain/symbol-math-live';
import {readPaneLegendFrame} from './PaneIndicatorLayer';
import {paneLegendLayout} from './pane-legend-layout';
import type {CellStudyInspectionStream,CellStudyResolvedPosition} from './cell-study-intents';
import './cell-series-heading.css';

type OwnedStyle={value:string;priority:string};
type PlacementOwner={token:object;baseline:Map<string,OwnedStyle>;last:Map<string,OwnedStyle>};
const headingOwners=new WeakMap<HTMLElement,PlacementOwner>();
/** The last good placement per heading element. While the same series (holdKey) is
 * briefly not current (a template apply or frame rebuild), the heading keeps that placement instead of blinking out, for at
 * most HEADING_HOLD_MS; after that the normal hide applies. Without a holdKey nothing is held. */
type HeadingCarry={key:string;element:[string,string][];menu:[string,string][]|null;since:number};
const headingCarry=new WeakMap<HTMLElement,HeadingCarry>();
const HEADING_HOLD_MS=2500;
/** Bounded re-read of a cell heading whose values were not ready. */
export const READOUT_RETRY_LIMIT=50;
export const readoutRetryDelay=(attempt:number)=>attempt<20?100:500;
/** The heading stops short of the plot's right edge by the 6px inset plus the pane control strip (Maximize pane,
 * 20px plus its margin) so the OHLC line never runs under it. */
const HEADING_RIGHT_RESERVE=40;
/** Plot widths at or below which the heading values give way to the symbol title (O, H, L hidden; then the change too).
 * About a 2- or 4-chart cell at 1440 px (data width near 450 px) and a 3-column or smaller cell. */
export const HEADING_NARROW_WIDTH=700,HEADING_TINY_WIDTH=380;
/** Own-element placement. No chart/workspace variables, canvas sizes or sibling ownership are written. */
export function useSeriesHeadingPlacement(props:{chart:ChartController|null;heading:RefObject<HTMLElement|null>;menu?:RefObject<HTMLElement|null>;owner:object;isCurrent:()=>boolean;holdKey?:string}){
 const latest=useRef(props),scheduleRef=useRef<(()=>void)|null>(null);latest.current=props;
 useLayoutEffect(()=>{
  const {chart,heading,owner}=props,element=heading.current;if(!element)return;
  let alive=true,frame=0,holdTimer:ReturnType<typeof setTimeout>|undefined,subscribed=false,observer:ResizeObserver|null=null,currentMenu:HTMLElement|null=null;const targets=new Map<HTMLElement,PlacementOwner>(),off:(()=>void)[]=[];
  const elementCurrent=()=>alive&&headingOwners.get(element)===targets.get(element)&&latest.current.chart===chart&&latest.current.owner===owner&&latest.current.heading.current===element;
  const current=()=>!!chart&&elementCurrent()&&latest.current.isCurrent();
  const claim=(node:HTMLElement)=>{let state=targets.get(node);if(state&&headingOwners.get(node)===state)return state;const old=headingOwners.get(node);state={token:{},baseline:new Map(old?.baseline??[]),last:new Map(old?.last??[])};targets.set(node,state);headingOwners.set(node,state);return state;};
  const write=(node:HTMLElement,name:string,value:string,ownerOnly=false)=>{const state=targets.get(node);if(!state||headingOwners.get(node)!==state||!(ownerOnly?elementCurrent():current())||node!==element&&latest.current.menu?.current!==node)return;
   if(!state.baseline.has(name))state.baseline.set(name,{value:node.style.getPropertyValue(name),priority:node.style.getPropertyPriority(name)});state.last.set(name,{value,priority:'important'});node.style.setProperty(name,value,'important');
  };
  claim(element);write(element,'visibility','hidden',true);
  const restoreTarget=(node:HTMLElement)=>{const state=targets.get(node);if(!state)return;targets.delete(node);if(headingOwners.get(node)!==state)return;headingOwners.delete(node);for(const [name,last]of state.last){if(node.style.getPropertyValue(name)!==last.value||node.style.getPropertyPriority(name)!==last.priority)continue;const before=state.baseline.get(name);if(before?.value)node.style.setProperty(name,before.value,before.priority);else node.style.removeProperty(name);}};
  const menuTarget=()=>{const node=latest.current.menu?.current??null;if(currentMenu&&currentMenu!==node)restoreTarget(currentMenu);currentMenu=node;if(node&&elementCurrent()&&!targets.has(node)){claim(node);write(node,'visibility','hidden',true);}return node;};
  const holding=()=>{const key=latest.current.holdKey,carry=key?headingCarry.get(element):undefined;if(!carry||carry.key!==key||!elementCurrent())return false;
   const now=Date.now();if(!carry.since)carry.since=now;if(now-carry.since>=HEADING_HOLD_MS){headingCarry.delete(element);return false;}
   if(holdTimer===undefined)holdTimer=setTimeout(()=>{holdTimer=undefined;schedule();},HEADING_HOLD_MS-(now-carry.since)+20);
   for(const [name,value]of carry.element)write(element,name,value,true);const menu=menuTarget();if(menu&&carry.menu)for(const [name,value]of carry.menu)write(menu,name,value,true);return true;
  };
  const hide=()=>{if(holding())return;headingCarry.delete(element);write(element,'visibility','hidden',true);const menu=menuTarget();if(menu)write(menu,'visibility','hidden',true);};
  const release=()=>{for(const fn of off.splice(0))try{fn();}catch{/* Release all acquired resources. */}observer?.disconnect();observer=null;};
  const acquire=()=>{if(subscribed||!chart||!current())return;subscribed=true;const take=(subscribe:()=>()=>void)=>{if(!current())return;const unsubscribe=subscribe();if(current())off.push(unsubscribe);else try{unsubscribe();}catch{}};
   try{take(()=>chart.onViewportChanged(schedule));take(()=>chart.indicators.subscribe(schedule));if(current()&&typeof chart.onMarketApplied==='function')take(()=>chart.onMarketApplied(schedule));
    if(!current()){release();subscribed=false;return;}const renderer=chart.nativeRenderer() as unknown as {plot?:HTMLElement}|null;if(!current()){release();subscribed=false;return;}
    observer=typeof ResizeObserver==='function'?new ResizeObserver(schedule):null;for(const node of [element,element.parentElement,renderer?.plot])if(node&&current())observer?.observe(node);
    if(typeof window!=='undefined'&&current()){window.addEventListener('resize',schedule);off.push(()=>window.removeEventListener('resize',schedule));window.addEventListener('scroll',schedule,true);off.push(()=>window.removeEventListener('scroll',schedule,true));}
   }catch{release();subscribed=false;hide();}
  };
  const paint=()=>{frame=0;try{menuTarget();if(!chart||!current()){hide();return;}acquire();if(!current()){hide();return;}const renderer=chart.nativeRenderer();if(!renderer||!current()){hide();return;}
   const facts=readPaneLegendFrame(chart,renderer,element,current),layout=facts?paneLegendLayout(facts):null,parent=element.parentElement;
   if(!layout?.heading||!facts||!parent||!current()){hide();return;}
   const origin=parent.getBoundingClientRect();if(!current()){hide();return;}
   const placed:[string,string][]=[['top',layout.heading.top-origin.top+'px'],['left',layout.heading.left-origin.left+'px'],['max-width',Math.max(0,facts.dataWidth-HEADING_RIGHT_RESERVE)+'px'],['visibility','visible']];for(const [name,value]of placed)write(element,name,value);
   /* How much room the values row has (cell-series-heading.css drops O, H and L, then the change, so the symbol title keeps priority in a narrow chart cell). */const room=facts.dataWidth<=HEADING_TINY_WIDTH?'tiny':facts.dataWidth<=HEADING_NARROW_WIDTH?'narrow':'wide';if(typeof element.setAttribute==='function'&&element.getAttribute?.('data-lv-heading-room')!==room)element.setAttribute('data-lv-heading-room',room);
   const key=latest.current.holdKey,carry:HeadingCarry|null=key?{key,element:placed,menu:null,since:0}:null;if(carry)headingCarry.set(element,carry);
   const menu=menuTarget();if(!menu||!current())return;const actualHeading=element.getBoundingClientRect();if(!current())return;const menuParent=menu.parentElement;if(!menuParent){write(menu,'visibility','hidden',true);return;}const menuOrigin=menuParent.getBoundingClientRect();if(!current())return;
   if(!(actualHeading.width>0&&actualHeading.height>0)){write(menu,'visibility','hidden',true);return;}const menuPlaced:[string,string][]=[['left',actualHeading.left-menuOrigin.left+'px'],['top',actualHeading.bottom-menuOrigin.top+2+'px'],['visibility','visible']];for(const [name,value]of menuPlaced)write(menu,name,value);if(carry)carry.menu=menuPlaced;
   }catch{hide();}
  };
  const schedule=()=>{if(elementCurrent()&&!frame)frame=requestAnimationFrame(paint);};scheduleRef.current=schedule;menuTarget();holding();schedule();
  return()=>{alive=false;cancelAnimationFrame(frame);if(holdTimer!==undefined)clearTimeout(holdTimer);release();if(scheduleRef.current===schedule)scheduleRef.current=null;
   for(const node of [...targets.keys()])restoreTarget(node);currentMenu=null;
  };
 },[props.chart,props.owner,props.heading,props.menu]);
 useLayoutEffect(()=>{scheduleRef.current?.();});
}

/** A real React layout child keeps DOM effects out of the App's established hook prefix. */
export function ActiveSeriesHeadingPlacement(props:Parameters<typeof useSeriesHeadingPlacement>[0]){useSeriesHeadingPlacement(props);return null;}

export type CellSeriesCommand='title'|'interval'|'flag'|'show'|'menu';
export function CellSeriesHeading(props:{chart:ChartController;cellId:string;owner:object;inspectionOwner:object;isCurrent:()=>boolean;dataset:BarDataset;barCount:number;settings:ChartSettingsDocument;hidden:boolean;replay:boolean;stream:CellStudyInspectionStream;onCommand:(command:CellSeriesCommand)=>boolean;holdKey?:string}){
 const latest=useRef(props),host=useRef<HTMLDivElement|null>(null);latest.current=props;
 const [readout,setReadout]=useState<{owner:object;value:SeriesReadoutValue|null}>({owner:props.owner,value:null});
 const [problem,setProblem]=useState('');
 const current=()=>latest.current.chart===props.chart&&latest.current.owner===props.owner&&latest.current.isCurrent();
 useSeriesHeadingPlacement({chart:props.chart,heading:host,owner:props.owner,isCurrent:current,holdKey:props.holdKey});
 useEffect(()=>{
  const {chart,owner,inspectionOwner,cellId,stream}=props;let alive=true;
  const owns=()=>alive&&latest.current.chart===chart&&latest.current.owner===owner&&latest.current.isCurrent();
  // After a synced switch the first reads can land while the chart's values are still settling (state not ready),
  // and nothing else asks again until the cursor moves, so the heading kept showing empty values. A missed read asks again
  // (the cell may not even be current yet). A missed read asks again: every 100 ms for 2 s, then every 500 ms up to about 17 s
  // in all. Any good read resets the count; a retired owner stops it.
  let retry:ReturnType<typeof setTimeout>|undefined,attempts=0,reads=0;
  const mine=()=>alive&&latest.current.chart===chart&&latest.current.owner===owner;
  const later=()=>{if(retry!==undefined||attempts>=READOUT_RETRY_LIMIT||!mine())return;const delay=readoutRetryDelay(attempts++);retry=setTimeout(()=>{retry=undefined;if(!mine())return;const before=reads;if(owns())try{stream.refresh(cellId,inspectionOwner);}catch{/* A retired stream never reads again. */}if(reads===before)later();},delay);};
  const read=(address:SeriesReadoutPosition)=>{if(!owns())return;let value:SeriesReadoutValue|null=null;try{const view=chart.captureSeriesReadout();if(view.state!=='ready')throw Error(view.message);view.assertCurrent();value=view.readPosition(address);view.assertCurrent();}catch{/* Invalid/unavailable never substitutes another chart's latest value. */}if(owns()){reads++;setReadout({owner,value});if(value)attempts=0;else later();}};
  const cursor=(position:CellStudyResolvedPosition)=>{if(position.chart===chart&&position.owner===inspectionOwner&&owns())read(position.address);};
  const off:(()=>void)[]=[];try{off.push(stream.subscribeResolvedPosition(cellId,cursor));if(typeof chart.onMarketApplied==='function')off.push(chart.onMarketApplied(()=>{if(owns())stream.refresh(cellId,inspectionOwner);}));}catch{for(const fn of off)try{fn();}catch{}return;}
  if(!reads)later();
  return()=>{alive=false;if(retry!==undefined)clearTimeout(retry);for(const fn of off)try{fn();}catch{/* Release all, even if one native unsubscribe throws. */}};
 },[props.chart,props.owner,props.inspectionOwner,props.cellId,props.stream]);
 const value=readout.owner===props.owner&&current()?readout.value:null,bar=value?.bar??null,previous=value?.previousBar??null;
 const settings=props.settings,dataset=props.dataset,status=statusLineParts(settings.statusLine,{symbol:dataset.instrument.symbol,name:dataset.instrument.name,exchange:displayExchange(dataset.instrument.exchange),interval:shortIntervalText(dataset.resolution)},bar,previous,[],{legendVisible:true,format:statusLinePriceFormat(settings.symbol.precision,dataset.instrument.tickSize,isSymbolMathDatasetId(dataset.provenance.datasetId)?bar?.close??null:null),previousSessionClose:value?.previousSessionClose??null});
 const issue=(command:CellSeriesCommand)=>{if(!current())return;try{if(!props.onCommand(command))throw Error('This chart is updating. Try its controls again.');setProblem('');}catch(error){if(current())setProblem(error instanceof Error?error.message:String(error));}};
 const labels=chartHeadingLabels(dataset.provenance,props.barCount),background=statusLineBackground(status),buttons=legendButtons('series',{hidden:props.hidden,intervalRestricted:false});
 return <div ref={host} className="chart-heading lv-cell-series-heading" data-lv-study-chrome="true" data-series-cell={props.cellId} data-status-background={background?'on':'off'} title={labels.title} style={{visibility:'hidden',...(background?{background}:{})}}>
  <div>{statusLineLead(status,<><b className="synthetic-badge">{labels.badge}</b>{props.replay&&<b className="synthetic-badge">REPLAY</b>}{seriesLegendEye(props.hidden,()=>issue('show'))}</>,{onTitle:()=>issue('title'),onInterval:()=>issue('interval')})}<span className="lv-series-buttons">{buttons.map(button=>legendButtonView(button,dataset.instrument.symbol,()=>issue(button.id==='flag'?'flag':'menu')))}</span></div>
  <div className="ohlc">{statusLineValues(status,bar?chartHeaderChange(bar,previous):null)}</div>{problem&&<span role="status" className="lv-series-control-message">{problem}</span>}
 </div>;
}
