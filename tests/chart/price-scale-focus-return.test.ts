import {expect,it,vi} from 'vitest';
import {event,priceScaleHarness} from './price-scale-harness';

// (price-scale-extended 'saw div' on the r19 exe): the price scale menu returns focus on Escape/Tab/activation to the
// element focused when it opened. When that element is gone (the right press closed the Symbol search dialog whose input
// had focus), focus goes to the renderer's keyboard target, its data canvas (tabIndex 0), not the panel div.
// SYNTHETIC stand-ins for the host elements; no DOM, GUI or packaged-build claim.
const AXIS={clientX:840,clientY:120};

function withCanvas(){
 const h=priceScaleHarness(),canvas:any={tag:'canvas',isConnected:true,focus:vi.fn()};
 h.container.querySelector=(selector:string)=>selector==='canvas[tabindex="0"]'?canvas:null;
 return{h,canvas};
}

it('Escape returns focus to the chart canvas when the element focused at open is gone',()=>{
 const {h,canvas}=withCanvas(),input:any={tag:'input',isConnected:true,focus:vi.fn()};
 h.doc.activeElement=input;h.container.dispatch('contextmenu',event(AXIS));expect(h.port.isMenuOpen()).toBe(true);
 input.isConnected=false;// the Symbol search dialog closed under the right press
 h.props()!.onKeyDown(event({key:'Escape'}));
 expect(h.port.isMenuOpen()).toBe(false);expect(canvas.focus).toHaveBeenCalledTimes(1);expect(h.panel.focus).not.toHaveBeenCalled();expect(input.focus).not.toHaveBeenCalled();
});

it('a still-connected opener keeps focus; with no chart canvas the focusable panel stays the fallback',()=>{
 const {h,canvas}=withCanvas(),button:any={tag:'button',isConnected:true,focus:vi.fn()};
 h.doc.activeElement=button;h.container.dispatch('contextmenu',event(AXIS));h.props()!.onKeyDown(event({key:'Escape'}));
 expect(button.focus).toHaveBeenCalledTimes(1);expect(canvas.focus).not.toHaveBeenCalled();
 const bare=priceScaleHarness();bare.doc.activeElement=bare.doc.body;bare.container.dispatch('contextmenu',event(AXIS));bare.props()!.onKeyDown(event({key:'Escape'}));
 expect(bare.panel.focus).toHaveBeenCalledTimes(1);
});
