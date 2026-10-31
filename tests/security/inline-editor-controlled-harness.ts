import {expect} from 'vitest';
import {installTrendlineInlineEditor,type TrendlineInlineEditorHost} from '../../src/chart/trendline-inline-editor';
import type {TrendlineInlineGeometry,TrendlineInlineGeometryController} from '../../src/chart/trendline-inline-geometry';

/** Controlled DOM services with real EventTarget listeners; no browser/GUI evidence. */
class NodePort extends EventTarget{
 children:NodePort[]=[];parentNode:NodePort|null=null;style:Record<string,string>={};attributes=new Map<string,string>();value='';textContent='';selectionStart=0;selectionEnd=0;tabIndex=-1;disabled=false;scrollLeft=0;scrollTop=0;wrap='';spellcheck=true;
 constructor(readonly ownerDocument:DocumentPort,readonly tagName:string){super();if(['TEXTAREA','BUTTON'].includes(tagName))this.tabIndex=0;}
 get isConnected():boolean{return this===this.ownerDocument.body||!!this.parentNode?.isConnected;}
 get parentElement(){return this.parentNode;}
 appendChild(node:NodePort){node.remove();node.parentNode=this;this.children.push(node);return node;}
 append(...nodes:NodePort[]){for(const node of nodes)this.appendChild(node);}
 remove(){if(this.parentNode){this.parentNode.children=this.parentNode.children.filter(child=>child!==this);this.parentNode=null;}}
 contains(node:NodePort):boolean{return node===this||this.children.some(child=>child.contains(node));}
 setAttribute(key:string,value:string){this.attributes.set(key,value);}
 focus(){this.ownerDocument.activeElement=this;}
 setSelectionRange(start:number,end:number){this.selectionStart=start;this.selectionEnd=end;}
 setRangeText(value:string,start:number,end:number){this.value=this.value.slice(0,start)+value+this.value.slice(end);this.setSelectionRange(start+value.length,start+value.length);}
 getBoundingClientRect(){return{left:0,top:this.style.verticalAlign==='baseline'?10:0,width:14,height:20};}
}
class DocumentPort extends EventTarget{
 body=new NodePort(this,'BODY');activeElement:NodePort|null=null;defaultView=new EventTarget();created:NodePort[]=[];
 createElement(tag:string){const node=new NodePort(this,tag.toUpperCase());this.created.push(node);return node;}
 querySelectorAll(){const all:NodePort[]=[];const visit=(node:NodePort)=>{if(node.tabIndex>=0)all.push(node);node.children.forEach(visit);};visit(this.body);return all;}
}
export function event(target:EventTarget,type:string,fields:Record<string,unknown>={}){const value=new Event(type,{cancelable:true,bubbles:true});for(const[key,field]of Object.entries({target,...fields}))Object.defineProperty(value,key,{value:field,configurable:true});target.dispatchEvent(value);return value;}
class AcceptedFailure extends Error{}
export function inlineEditorFixture(raw='SYNTHETIC initial',configure?:(host:TrendlineInlineEditorHost)=>void){
 const doc=new DocumentPort(),plot=doc.createElement('div'),surface=doc.createElement('canvas');doc.body.append(plot);plot.append(surface);let sourceEpoch=0,canonicalEpoch=0,viewEpoch=0,value=raw,muted=false,repaints=0,mode:'success'|'reject'|'accepted'='success',eligible=true;
 const target=Object.freeze({id:'SYNTHETIC exact target'}),errors:Array<{error:unknown;accepted:boolean}>=[],commits:string[]=[],layoutCalls:string[]=[];
 const geometry=(draft:string,typography=false):TrendlineInlineGeometry=>{layoutCalls.push(draft);const rows=draft.split('\n'),matrix=[1,0,0,1,100,100] as const;return{id:target.id,width:400,height:300,dpr:1,clip:{left:0,top:0,right:400,bottom:300},textState:{direction:'ltr'},glyphCommands:rows.length*2,operations:20,lines:rows.filter(Boolean).map((text,index)=>({text,x:0,y:index*20,font:'14px sans-serif',advanceWidth:text.length*7,lineIndex:index,matrix,box:{left:-20,right:20,top:-2,bottom:12},fill:'#abcdef',halo:'#101010'})),frame:draft?{font:'14px sans-serif',matrix,x:0,firstY:0,lineCount:rows.length,lineHeight:rows.length>1?20:undefined,alphabeticOffset:typography?8:undefined,advanceWidths:rows.map(row=>row.length*7),globalAlpha:1}:undefined};};
 const geometryPort={hit(x:number,y:number){return x>=80&&x<=200&&y>=80&&y<=140?target:null;},open(token:unknown){if(token!==target)throw Error('private target');muted=true;let active=true;return{assertCurrent(){if(!active)throw Error('geometry retired');},layout(draft:string,options?:{typography?:boolean}){if(!active)throw Error('geometry retired');return geometry(draft,options?.typography);},dispose(){active=false;muted=false;}};}} as unknown as TrendlineInlineGeometryController;
 const host:TrendlineInlineEditorHost={geometry:geometryPort,surface:surface as unknown as HTMLCanvasElement,overlayHost:plot as unknown as HTMLElement,captureSourceOwner(){const epoch=sourceEpoch;return()=>{if(epoch!==sourceEpoch)throw Error('source retired');};},captureLayoutOwner(){const epoch=viewEpoch;return()=>{if(epoch!==viewEpoch)throw Error('view retired');};},readViewport:()=>({left:20,top:40,width:800,height:600,logicalWidth:400,logicalHeight:300,axisAligned:true}),canEnter:()=>eligible,captureOpening(id){expect(id).toBe(target.id);const epoch=canonicalEpoch;return{paneId:'price',initialValue:value,assertCurrent(){if(epoch!==canonicalEpoch)throw Error('opening retired');},commit(next){if(epoch!==canonicalEpoch)throw Error('opening retired');if(mode==='reject')throw Error('SYNTHETIC rejection');commits.push(next);value=next;canonicalEpoch++;if(mode==='accepted')throw new AcceptedFailure('SYNTHETIC accepted publication failure');return{accepted:true,changed:true};}};},repaint(){repaints++;},isAcceptedFailure:error=>error instanceof AcceptedFailure,reportError(error,outcome){errors.push({error,...outcome});}};
 configure?.(host);const editor=installTrendlineInlineEditor(host),textarea=()=>[...doc.created].reverse().find(node=>node.tagName==='TEXTAREA')!,overlay=()=>plot.children.find(node=>node.attributes.has('data-lv-inline-editor'));
 const pointer=(node:EventTarget=surface,fields:Record<string,unknown>={})=>{const press=new Event('pointerdown',{bubbles:true,cancelable:true});for(const[key,field]of Object.entries({target:node,button:0,isPrimary:true,clientX:220,clientY:240,shiftKey:false,ctrlKey:false,metaKey:false,altKey:false,...fields}))Object.defineProperty(press,key,{value:field});doc.dispatchEvent(press);return press;};
 return{doc,plot,surface,target,host,editor,textarea,overlay,pointer,errors,commits,layoutCalls,get value(){return value;},get muted(){return muted;},get repaints(){return repaints;},setMode(next:typeof mode){mode=next;},setEligible(next:boolean){eligible=next;},retire(){sourceEpoch++;},replaceCanonical(){canonicalEpoch++;},advanceView(){viewEpoch++;},cleanup(){editor.dispose();}};
}
export function input(f:ReturnType<typeof inlineEditorFixture>,value:string){const text=f.textarea();event(text,'beforeinput');text.value=value;text.setSelectionRange(value.length,value.length);event(text,'input');}

