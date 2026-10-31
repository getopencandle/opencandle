import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {it,expect} from 'vitest';
import {DrawingDialog} from '../../src/ui/DrawingDialog';
import type {ChartController} from '../../src/chart/adapter';
it('an opaque or concurrently removed drawing shows an unavailable dialog instead of throwing through the workspace',()=>{
 const chart={getDrawingEditor:()=>{throw new Error('Unsupported retained drawing');}} as unknown as ChartController;
 const markup=renderToStaticMarkup(React.createElement(DrawingDialog,{chart,id:'opaque',onClose:()=>{},onChange:()=>{throw new Error('No mutation permitted');}}));expect(markup).toContain('Drawing settings unavailable');expect(markup).toContain('saved drawing is retained');expect(markup).not.toContain('>Apply<');
});

// The recorded facts (2 rows, price + bar)
// and #answer.LineToolText.coordinates (Text Coordinates page hidden, so no Text coordinate fields).
it('BF-G6: Rectangle exposes price and bar on its two anchors; Text exposes no coordinate fields',async()=>{
 const {coordinateAxes,validateCoordinatePatch}=await import('../../src/chart/drawing-coordinates');
 expect(coordinateAxes('box',0)).toEqual({time:true,price:true});expect(coordinateAxes('box',1)).toEqual({time:true,price:true});
 expect(coordinateAxes('box',2)).toBeNull();expect(coordinateAxes('box',-1)).toBeNull();
 expect(()=>validateCoordinatePatch('box',1,{price:101,barNumber:2})).not.toThrow();
 expect(coordinateAxes('text',0)).toBeNull();expect(()=>validateCoordinatePatch('text',0,{price:1})).toThrow('Unsupported coordinate axis');
});
