// LV-VELA-INPUT-FEEL-1. Original LV source.
// A build/test-time Vite transform composed AFTER the future-calendar transform on the pinned COMPAT-11 Vela 0.8.4 runtime
// inputs. The installed SDK is not written. Every step anchor must occur exactly once (or its replacement exactly once when
// the input was already composed), so the transform is idempotent and fails loudly on an unexpected input.
//  1. Wheel zoom: WHEEL_ZOOM_K 4e-3 -> 1.1e-3, so one 100-delta notch changes bar spacing by about 11% (was 34%). Still
//     exponential in deltaY, so small touchpad deltas stay proportional. The plain-wheel right-edge anchor and the
//     Ctrl+wheel cursor anchor are untouched.
//  2. Time-axis drag: dragging right spreads the bars (zoom in), dragging left compresses them, by the ratio of the distances
//     from the plot's right edge (smoothed by 20% of the width), as lightweight-charts' time-scale scaling. The right edge
//     stays fixed. Smoothing constant.
//  3. Keyboard: plain Left/Right scroll the chart by one bar, Shift+Left/Right by 10 bars (unchanged), Alt+Left/Right step the
//     crosshair one bar (moved from the plain arrows). A selected drawing still takes the arrows first (DrawingKeys nudge).
//  8. Cursor: a closed hand (grabbing) while a mouse pans the plot; the normal cursor returns when the gesture ends.
// Resize guard. The renderer's own ResizeObserver delivery (always one right after
//     mount, when syncSize has just run) skips its resize when every input syncSize measures is unchanged since the last
//     syncSize: wrapper size, devicePixelRatio, toolbar gutter, left and right scale widths, the plot's device-pixel size
//     and its client rect. It never skips while an animation runs or while the first fit is still due. Host calls to
//     resize() and every other syncSize caller are unchanged.
// History room. While the host's `lvHistoryRoom` is above 0 (a live feed that
//     can still page older bars), the zoom-out and left-pan bounds allow that many more bars than are loaded.
import {resolve,sep} from 'node:path';
import {realpathSync} from 'node:fs';

export const inputFeelNotice='/*! LarryVision LV-VELA-INPUT-FEEL-1 modification, 2026-10-28. @luxalgo/vela 0.8.4: gentler wheel zoom step, time-axis drag direction and right-edge ratio, plain arrows scroll one bar (Alt+arrows step the crosshair), grabbing cursor while panning; the renderer ResizeObserver skips a resize at an unchanged size. A live chart with older history still to load zooms and pans past its oldest loaded bar (FEEL-ZOOM-1028). See docs/lanes/FEEL-FIX-A-1028.md and docs/lanes/PERF2-1028.md. */';
export const INPUT_FEEL_WHEEL_K=1.1e-3;
export const INPUT_FEEL_RUNTIMES=Object.freeze(['dist/chunk-UNUVPQFW.js','dist/index.cjs','dist/vela.global.js','dist/widget.cjs','dist/workspace.cjs']);

/** [id, before, after]. Anchors start mid-line; later lines are re-indented for the IIFE global build. */
export const inputFeelSteps=Object.freeze([
 ['wheel-zoom-k',
  'var TIME_SCALE_K = 4e-3;\nvar WHEEL_ZOOM_K = 4e-3;\n',
  'var TIME_SCALE_K = 4e-3;\n/*! LarryVision LV-VELA-INPUT-FEEL-1 */\nvar WHEEL_ZOOM_K = '+INPUT_FEEL_WHEEL_K+';\nfunction lvTimeAxisDragSpacing(start, startX, x, width) {\n  const w = Math.max(1, width), soft = 0.2 * w;\n  return start * (Math.max(0, w - startX) + soft) / (Math.max(0, w - x) + soft);\n}\n'],
 ['time-axis-drag',
  'const barSpacing = clampBarSpacing(this.startBarSpacing * Math.exp((this.startX - x) * TIME_SCALE_K));',
  'const barSpacing = clampBarSpacing(lvTimeAxisDragSpacing(this.startBarSpacing, this.startX, x, this.deps.getCoords().width));'],
 ['arrow-keys',
  'case "ArrowLeft":\n      return e.shiftKey ? { kind: "pan", bars: -PAN_BARS } : { kind: "step", delta: -1 };\n    case "ArrowRight":\n      if (e.altKey && e.shiftKey) return { kind: "realtime" };\n      return e.shiftKey ? { kind: "pan", bars: PAN_BARS } : { kind: "step", delta: 1 };',
  'case "ArrowLeft":\n      if (e.altKey && !e.shiftKey) return { kind: "step", delta: -1 };\n      return { kind: "pan", bars: e.shiftKey ? -PAN_BARS : -1 };\n    case "ArrowRight":\n      if (e.altKey && e.shiftKey) return { kind: "realtime" };\n      if (e.altKey) return { kind: "step", delta: 1 };\n      return { kind: "pan", bars: e.shiftKey ? PAN_BARS : 1 };'],
 ['pan-grabbing',
  'const dx = x - this.startX;\n',
  'const dx = x - this.startX;\n          if (this.el && e.pointerType !== "touch" && (Math.abs(dx) > slop || Math.abs(y - this.startY) > slop)) this.el.style.cursor = "grabbing";\n'],
 ['resize-guard-method',
  '  syncSize() {\n    const w = this.wrapper.clientWidth;',
  '  /*! LarryVision LV-VELA-INPUT-FEEL-1 resize guard (PERF2-1028) */\n  lvSyncSizeUnchanged() {\n    const s = this.lvSynced;\n    if (!s || !this.plot || this.animator.active || !this.didInitialFit && this.coords.barCount > 0) return false;\n    if (this.wrapper.clientWidth !== s.w || this.wrapper.clientHeight !== s.h || (window.devicePixelRatio || 1) !== s.dpr) return false;\n    if (this.toolbarGutter !== s.gutter || (this.lvLeftAxisW || 0) !== s.leftW || !!this.lvLeftAxisCanvas !== s.leftCanvas || this.rightAxisW !== s.rightW) return false;\n    const dev = this.plotDeviceSize;\n    if ((dev ? dev.width : -1) !== s.dw || (dev ? dev.height : -1) !== s.dh) return false;\n    const rect = this.plot.getBoundingClientRect();\n    return rect.width === s.rw && rect.height === s.rh;\n  }\n  syncSize() {\n    this.lvSynced = null;\n    const w = this.wrapper.clientWidth;'],
 ['resize-guard-record',
  '    this.coords.setSize(Math.max(1, pw - this.rightAxisW), Math.max(1, ph - TIME_AXIS_H), dpr);\n    this.scene.crosshair = null;',
  '    this.coords.setSize(Math.max(1, pw - this.rightAxisW), Math.max(1, ph - TIME_AXIS_H), dpr);\n    this.lvSynced = { w, h, dpr, gutter: this.toolbarGutter, leftW: this.lvLeftAxisW || 0, leftCanvas: !!this.lvLeftAxisCanvas, rightW: this.rightAxisW, dw: dev ? dev.width : -1, dh: dev ? dev.height : -1, rw: rect.width, rh: rect.height };\n    this.scene.crosshair = null;'],
 ['resize-guard-observer',
  '      this.resize();\n    });\n    this.resizeObserver.observe(this.wrapper);',
  '      if (!this.lvSyncSizeUnchanged()) this.resize();\n    });\n    this.resizeObserver.observe(this.wrapper);'],
 // Shift+wheel pans as desktop charting apps do (wheel up = later bars, wheel down = earlier). Vela panned
 // the other way. Chromium on Windows delivers Shift+wheel as deltaY with shiftKey (measured), so only that case flips; a
 // horizontal tilt or touchpad swipe (deltaX dominant) keeps its native direction, which already matches common desktop charting behaviour.
 ['shift-wheel-direction',
  'const pan = wheelPanDelta(e.deltaX, e.deltaY, e.shiftKey);',
  'const pan = e.shiftKey && !isHorizontalWheel(e.deltaX, e.deltaY) ? -e.deltaY : wheelPanDelta(e.deltaX, e.deltaY, e.shiftKey);'],
 // A live chart that can still load older history zooms and pans past its oldest loaded bar, as desktop charting apps
 // does: the empty area waits there while the pages fill in. The host sets `lvHistoryRoom` (bars that may still arrive; 0 or
 // unset keeps the LV-VELA-NAV-1 bounds exactly). The newest-bar bound (maxRo) and the 0.5 px spacing floor are unchanged.
 ['history-room-zoom',
  'const minBs = Math.max(MIN_BAR_SPACING, Math.min(maxBs, W / ((n + ZOOM_OUT_MARGIN_BARS) * scale)));',
  'const lvRoom = this.lvHistoryRoom > 0 ? this.lvHistoryRoom : 0;\n    const minBs = Math.max(MIN_BAR_SPACING, Math.min(maxBs, W / ((n + ZOOM_OUT_MARGIN_BARS + lvRoom) * scale)));'],
 ['history-room-pan',
  'const minRo = Math.min(maxRo, Math.max(minVisible - n, visBars - (n - 1) - Math.min(ZOOM_OUT_MARGIN_BARS, visBars * 0.1)));',
  'const minRo = Math.min(maxRo, Math.max(minVisible - n, visBars - (n - 1) - Math.min(ZOOM_OUT_MARGIN_BARS, visBars * 0.1) - lvRoom));'],
 ['pan-grabbing-end',
  'endGesture(e) {\n    this.dragging = false;\n',
  'endGesture(e) {\n    this.dragging = false;\n    if (this.el && this.el.style.cursor === "grabbing") this.el.style.cursor = this.deps.lvCursorCss?.() ?? "";\n'],
]);

const count=(text,part)=>text.split(part).length-1;
const indentFor=path=>path==='dist/vela.global.js'?value=>value.replace(/\n(?=.)/g,'\n  '):value=>value;

/** Applies the steps to one runtime input. Already-composed steps are kept as they are (idempotent). */
export function composeInputFeel(code,path){
 if(!INPUT_FEEL_RUNTIMES.includes(path))throw Error('Input feel transform: not a Vela runtime input: '+path);
 const shift=indentFor(path);
 for(const [id,rawBefore,rawAfter]of inputFeelSteps){
  const before=shift(rawBefore),after=shift(rawAfter);
  // Some replacements contain their anchor, so an already-composed step is recognised first.
  if(count(code,after)===1)continue;
  const seen=count(code,before);
  if(seen===1){code=code.replace(before,()=>after);continue;}
  throw Error('Input feel source anchor mismatch: '+path+' '+id+' ('+seen+')');
 }
 return code;
}

const canonical=file=>process.platform==='win32'?file.toLowerCase():file;
/** Runs after velaFutureCalendarPlugin (that plugin requires the exact pinned base bytes). */
export function velaInputFeelPlugin(){
 let dependency=null;const transformed=new Set();
 return{name:'larryvision-vela-input-feel',enforce:'pre',
  configResolved(config){dependency=resolve(realpathSync(resolve(config.root)),'node_modules/@luxalgo/vela');},
  transform(code,id){
   if(!dependency)throw Error('Input feel transform was not configured');
   const clean=canonical(resolve(id.split('?')[0]));
   const path=INPUT_FEEL_RUNTIMES.find(item=>canonical(resolve(dependency,item))===clean);
   if(!path||!clean.startsWith(canonical(dependency+sep)))return null;
   transformed.add(path);return{code:composeInputFeel(code,path),map:null};
  },
  generateBundle(){if(!transformed.has('dist/chunk-UNUVPQFW.js'))throw Error('Delivered renderer did not consume the input feel transform');}
 };
}
