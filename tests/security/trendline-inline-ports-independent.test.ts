import {expect,it} from 'vitest';
import {inlineDOMPortsFixture} from './inline-dom-ports-controlled-harness';

it('eligibility cannot reuse an idle interaction object captured before popup callback replacement',async()=>{
 const f=await inlineDOMPortsFixture(renderer=>{renderer.userDrawings.popup.isOpen=()=>{renderer.userDrawings.interaction.state={kind:'dragging',pointerId:7};return false;};});
 try{expect(f.ports.canEnter()).toBe(false);}finally{f.cleanup();}
});

it('a viewport cannot survive a changed client dimension during its final style callbacks',async()=>{
 let drifted=false;const f=await inlineDOMPortsFixture((_renderer,plot,_surface,doc)=>{let calls=0;const prior=doc.defaultView.getComputedStyle;doc.defaultView.getComputedStyle=()=>{calls++;if(calls===3){plot.clientWidth=450;drifted=true;}return prior();};});
 try{expect(()=>f.ports.readViewport()).toThrow();expect(drifted).toBe(true);}finally{f.cleanup();}
});
