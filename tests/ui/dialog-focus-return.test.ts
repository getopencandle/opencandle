import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import React from 'react';

// The shared Modal (Indicators, Compare, Templates and the other Modal dialogs)
// returns focus to its opener. Controlled hook model of React's ordering: the first render runs,
// then commit applies a child's autoFocus, then passive effects run; unmount removes the nodes
// (focus falls to body) before the passive cleanup. No browser DOM, GUI or package claim.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as (()=>void|(()=>void))[],cleanups:[] as (()=>void)[]}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return {...actual,
 useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return [hooks.cells[i],(value:any)=>{hooks.cells[i]=typeof value==='function'?value(hooks.cells[i]):value;}];},
 useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},
 useEffect:(effect:()=>void|(()=>void))=>{const i=hooks.cursor++;if(!(i in hooks.cells)){hooks.cells[i]=true;hooks.effects.push(effect);}}};});
import {Modal} from '../../src/ui/Modal';

class FakeNode{
 children:FakeNode[]=[];isConnected=true;
 constructor(public tag:string,public props:Record<string,any>={}){}
 get offsetParent(){return this.isConnected?{}:null;}
 contains(node:unknown):boolean{return node===this||this.children.some(child=>child.contains(node));}
 matches(selector:string){return selector.split(',').some(part=>part.trim().split(':')[0]===this.tag);}
 querySelectorAll(selector:string):FakeNode[]{return this.children.flatMap(child=>[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)]);}
 querySelector(selector:string){return this.querySelectorAll(selector)[0]??null;}
 focus(){if(this.isConnected)doc.activeElement=this;}
 all():FakeNode[]{return [this,...this.children.flatMap(child=>child.all())];}
}
let doc:{activeElement:FakeNode|null;body:FakeNode};
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];hooks.cleanups=[];const body=new FakeNode('body');doc={activeElement:body,body};vi.stubGlobal('document',doc);});
afterEach(()=>{vi.unstubAllGlobals();});

/** Mounts Modal like React: render, build host nodes and refs, apply autoFocus at commit, then run effects. */
function open(children:React.ReactNode){
 const onClose=vi.fn();hooks.cursor=0;
 const tree=Modal({title:'Indicators',onClose,children}) as any;
 const build=(element:any):FakeNode[]=>{if(Array.isArray(element))return element.flatMap(build);if(!element||typeof element!=='object'||!element.props)return [];if(typeof element.type!=='string')return build(element.props.children);const node=new FakeNode(element.type,element.props);node.children=build(element.props.children);if(element.props.ref&&typeof element.props.ref==='object')element.props.ref.current=node;return [node];};
 const [shade]=build(tree),dialog=shade.all().find(node=>node.props.role==='dialog')!;
 shade.all().find(node=>node.props.autoFocus)?.focus();
 for(const effect of hooks.effects.splice(0)){const cleanup=effect();if(typeof cleanup==='function')hooks.cleanups.push(cleanup);}
 const unmount=()=>{const inside=dialog.contains(doc.activeElement);for(const node of shade.all())node.isConnected=false;if(inside)doc.activeElement=doc.body;for(const cleanup of hooks.cleanups.splice(0))cleanup();};
 return {onClose,dialog,shade,unmount,node:(label:string)=>shade.all().find(node=>node.props['aria-label']===label)!};
}
const searchBox=()=>React.createElement('div',null,React.createElement('input',{autoFocus:true,'aria-label':'Search indicators'}),React.createElement('button',{type:'button','aria-label':'Cancel'},'Cancel'),React.createElement('button',{type:'button','aria-label':'Ok'},'Ok'));

for(const path of ['Escape','Close button','Cancel','Ok'] as const){
 it(`F1: closing an autoFocus dialog by ${path} returns focus to the header opener`,()=>{
  const opener=new FakeNode('button',{'aria-label':'Indicators'});doc.body.children.push(opener);opener.focus();
  const ui=open(searchBox());
  expect(ui.dialog.contains(doc.activeElement)).toBe(true);
  if(path==='Escape')ui.dialog.props.onKeyDown({key:'Escape',nativeEvent:{isComposing:false},stopPropagation:vi.fn(),preventDefault:vi.fn()});
  else if(path==='Close button')ui.node('Close Indicators').props.onClick();
  else ui.onClose();// Cancel and Ok are the dialog's own buttons; each ends in the parent's close (unmount)
  if(path==='Escape'||path==='Close button')expect(ui.onClose).toHaveBeenCalledOnce();
  ui.unmount();
  expect(doc.activeElement).toBe(opener);
 });
}
it('F1: the autoFocus field keeps initial focus and a dialog without autoFocus still focuses its first control',()=>{
 const opener=new FakeNode('button');doc.body.children.push(opener);opener.focus();
 const ui=open(searchBox());expect(doc.activeElement).toBe(ui.node('Search indicators'));ui.unmount();expect(doc.activeElement).toBe(opener);
 hooks.cells=[];opener.focus();
 const plain=open(React.createElement('p',null,'About'));expect(doc.activeElement).toBe(plain.node('Close Indicators'));plain.unmount();expect(doc.activeElement).toBe(opener);
});
it('F1: focus is not pulled back when the user already moved it outside the closed dialog, or the opener is gone',()=>{
 const opener=new FakeNode('button'),other=new FakeNode('button');doc.body.children.push(opener,other);opener.focus();
 const ui=open(searchBox());other.focus();ui.unmount();expect(doc.activeElement).toBe(other);
 hooks.cells=[];opener.focus();const again=open(searchBox());opener.isConnected=false;again.unmount();expect(doc.activeElement).toBe(doc.body);
});
