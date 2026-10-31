import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {ZoomRegionOverlay,zoomOverlayKey} from '../../src/ui/ZoomRegionOverlay';

describe(' zoom region overlay',()=>{
 const props=()=>({active:true,timeAt:(x:number)=>x,barInterval:()=>60,onRange:vi.fn(),onCancel:vi.fn()});
 it('renders only while armed, with the zoom-in cursor',()=>{
  const html=renderToStaticMarkup(React.createElement(ZoomRegionOverlay,props()));expect(html).toContain('cursor:zoom-in');expect(html).toContain('data-lv-cursor="zoom-in"');expect(html).toContain('lv-zoom-region-overlay');
  expect(renderToStaticMarkup(React.createElement(ZoomRegionOverlay,{...props(),active:false}))).toBe('');
 });
 it('Escape cancels, other keys do not',()=>{expect(zoomOverlayKey({key:'Escape'})).toBe('cancel');expect(zoomOverlayKey({key:'Enter'})).toBeNull();expect(zoomOverlayKey({key:'z'})).toBeNull();});
});
