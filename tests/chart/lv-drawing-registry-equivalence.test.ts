import {describe,expect,it} from 'vitest';
import {drawingRegistrySnapshot,snapshotSha256} from '../helpers/drawing-registry-snapshot';
import {LV_DRAWING_TOOL_MODULES} from '../../src/chart/lv-types';
import {FACTORY_DEFAULTS_UNAPPLIED} from '../../src/chart/drawing-factory-defaults';
import {DRAWING_TOOL_CATALOG,armCatalog} from '../../src/ui/drawing-tool-catalog';
import {DIALOG_SPECS,applyDialogContributions} from '../../src/ui/drawing-dialog-spec';

// behaviour-preserving refactor proof. The hashes below were taken from the complete snapshot
// (tests/helpers/drawing-registry-snapshot.ts) on the tree BEFORE the per-tool registry refactor (82 registered
// types, 96 catalog rows; recorded in The refactored tree must reproduce
// every section byte for byte: catalog rows, factory definitions/unapplied rows/statuses, dialog specs and
// unavailable controls, LV registration statuses, the drawing-port catalog, and every registered type's meta,
// fresh serialized sample, anchor schema, settings schema and dialog binding.
const BEFORE={
 all:'3db59fa6013736dcb28bf3ed312537bd5cec3cd9d7d5898df1f2fc3b49656bd7',
 catalog:'e3f877d9e8cbc0ac68551b0c52dc1b20107c1657d58db179f7b25913e098a077',
 factoryDefinitions:'085473cd2e0c260f36bd2d0fea242e2e2e34a48c91f46a4160d950f879453459',
 factoryUnapplied:'ea390d0a2b388829bba6d5cdb6dd12e3b82f70fb42914891e8366a9ebacb9655',
 factoryStatus:'111b78eeebceb771d49fe3cc0d4def94daac8045c97ab08c9021f275330e1e5e',
 dialogSpecs:'4e86fbad279e0b37f53ea7163e1a3738cbdd5f8c58fc2a9dcb47116013043159',
 dialogUnavailable:'40d2eb49ded4952cd2b70f1a311a920b69e26a83fb0baa7b08cacc659008073c',
 lvStatus:'9e451074841afcf3e7ca34206a98e8af0187b5b34bd5a94fcb9fcfee4440f773',
 portCatalog:'3053ff3b43f508c6ae7944172a75232d7ebd38f93ddb85a7e763bf277c4c5dfb',
 registered:'751e861712c3b8c86d9ce5f3cd69ebfd9c90bb9c6a6c43a19cb8b6c548fdd02e',
} as const;
// Re-pins (deltas proven section by section against the previous pin
// (Elliott waves + anchored volume profile) vs BEFORE: registered/portCatalog 82 -> 86, lvStatus
//   3 -> 7 (appended), 4 catalog rows armed, 13 unapplied rows appended; definitions/status/dialogs identical.
// (BARSPAT bars pattern + double curve, emoji) vs: registered/portCatalog 86 -> 89, lvStatus
//   7 -> 10 (appended), 3 catalog rows armed (.FORECAST.BARS_PATTERN, .SHAPE.DOUBLE_CURVE, .ANNOTATION.EMOJI)
//   factory definitions/status +1 (LineToolBarsPattern), unapplied: Bars pattern 'no-type' row retired, +1 Bars pattern
//   contextActions, +1 LineToolBezierCubic pointsCount; dialog LineToolBarsPattern bound to lvbarspattern (tabs Style,
//   Visibility; 4 property paths) and its 4 dialogUnavailable rows removed. Every other row is identical.
// 2b: LineToolImage spec tabs Style, Coordinates, Visibility -> Style, Visibility (static-drawing-defaults-2#
//   answer.LineToolText.coordinates sameRuleAlsoFor); the only change, dialogSpecs and the whole hash re-pinned.
// R1b (anchored text + image modules, Dot/Arrow cursor-kind catalog targets) vs -2b: registered/portCatalog
//   89 -> 91, lvStatus +2 (appended). Proof (2026-10-19, with the two modules
//   filtered out of LV_DRAWING_TOOL_MODULES (vi.mock), every section reproduced the -2b pin except catalog, which also
//   carries the drawing-tool-catalog.ts cursor-kind targets for Dot and Arrow. The previous pin, for the record:
//   all 0ec81561, catalog 47d2f4bf, factoryDefinitions 9b104af2, factoryUnapplied 81454bd3, factoryStatus d8428529,
//   dialogSpecs 0e068969, dialogUnavailable a03f534c, lvStatus 33a6444d, portCatalog 654715bc, registered 6108ba3a.
// R2 vs R1b (batch-1019b review): the static DIALOG_SPECS now map the Trendline Style rows Middle point (style.2)
//   Price labels (style.3), Distance and Angle (style.5) to props.lvTrendlineMarkers.*, so those four rows leave
//   DIALOG_UNAVAILABLE (64 -> 60). Proof: nulling those four mappings reproduces the previous pin exactly. Only dialogSpecs,
//   dialogUnavailable and the whole hash move; the consumer flags do not affect this static snapshot. Previous pin, for the record:
//   all 990c8717, dialogSpecs 21b213e0, dialogUnavailable db3f16a7.
// Drawing-factory-defaults.ts wraps the hline and hray factories with the LV parity
//   defaults (solid, width 1; parityDefaultDefinitions, kept apart from the fact-backed statuses). Only registered and all move.
//   Proof: skipping the PARITY_DEFINITIONS install reproduces the previous pin exactly. Previous pin: all aaae9724, registered 0656f424.
// The Bars pattern setting label 'Source resolution' -> 'Interval'. Only portCatalog,
//   registered and all move. Proof: restoring the old label reproduces the previous pin exactly. Previous pin: all 4cc37fdd,
//   portCatalog 747e9b3e, registered 85a3d9f2.
// Clean-room wording sweep (note text only) against the Bars pattern change: three FACTORY_DEFAULTS_UNAPPLIED note phrases
//   ('is a OpenCandle/renderer default, not a the reference app fact.', 'are OpenCandle/renderer defaults, not the reference app facts.'
//   'are renderer defaults, not the reference app facts.') became 'is an LV renderer default.' / 'are LV renderer defaults.' in
//   drawing-factory-defaults.ts (Long risk), short-position.ts, elliott-waves.ts and double-curve.ts. Only factoryUnapplied and
//   all move; no id, property, value or reason changed and no row contains the reference app. Proof: putting the three old
//   phrases back reproduces the previous pin exactly. Previous pin: all 5e6d46ef, factoryUnapplied 8dc19392.
// Fib time trend line against the wording sweep: the fib-time-trend-line module replaces the native
//   trendfibtime registration in place (registered count stays 91, catalog unchanged). Expected movers: lvStatus +1 appended
//   (trendfibtime/trendfibtime/registered); factoryDefinitions and factoryStatus (the trendfibtime row moves from the native list
//   to the module list, same values); factoryUnapplied (trendline row removed, two notes reworded); dialogSpecs and
//   dialogUnavailable (dialog.LineToolTrendBasedFibTime.style.1 bound, 4 rows leave); portCatalog and registered (4 schema
//   fields, fresh sample props.lvFibTimeTrendLine). Proof: removing the module from LV_DRAWING_TOOL_MODULES and restoring the
//   two drawing-factory-defaults.ts rows reproduces the previous pin. Re-pinned at integration: exactly these 8
//   sections plus all moved (catalog unchanged); the proof above was rerun and passed. Previous pin: all d8cb794e.
// (re-pinned at integration): Alt + H/J/V/C become bound hotkeys (drawing-tool-catalog.ts
//   bound:false -> true; App already performs them through placeAtCrosshair). Only catalog and all move.
//   Previous pin: all 36fa3fbb, catalog 4b48d280.
// Against the fib time trend line change: drawing-dialog-spec.ts binds the Rectangle Extend row (dialog.LineToolRectangle.style.1) to
//   props.lvBoxExtend.left/right with the fact option titles as labels, and gives the five line-tool Stats rows (style.5) the fact option
//   titles as labels. Only dialogSpecs, dialogUnavailable (the two Rectangle Extend rows leave) and all move. Proof (scratch probe on the
//   snapshot): deleting those labels, nulling the two Rectangle mappings and putting the two unavailable rows back reproduces the previous
//   pin exactly. Previous pin: all 36fa3fbb, dialogSpecs 91e101c6, dialogUnavailable bda88323.
// Integration of both changes: catalog comes from the axis change, dialogSpecs and dialogUnavailable from the dialog change, and all is
//   recomputed from the combined tree. Values of all for each change alone: axis 8465a130, dialog d2a2861a.
// vs integration: 12 modules (13 types) appended, registered/portCatalog
//   91 -> 104, lvStatus +13 (appended), factoryUnapplied +14 rows (appended), catalog: 13 rows armed plus the Demonstration row now a
//   cursor-kind row (96 leaves, same structure). Proof (scratch snapshot diff on both trees): registered, portCatalog and lvStatus
//   with the 13 new types removed, and factoryUnapplied without its last 14 rows, equal the previous pin exactly; the only changed
//   catalog leaves are those 14 rows; factoryDefinitions, factoryStatus, dialogSpecs and dialogUnavailable are unchanged.
//   Previous pin: all 959b3159, catalog 85f49aa6, factoryUnapplied 167d16bc, lvStatus 0a3e1b6a, portCatalog 01a90523, registered 9fc9581d.
// The Stickers module (one type, lvsticker on box) is appended and arms .ANNOTATION.STICKERS.
//   registered/portCatalog 104 -> 105. Proof (scratch snapshot on the lane tree): registered, portCatalog and lvStatus with the lvsticker
//   rows removed equal the previous pin exactly; catalog changes only that row; the factory and dialog sections are unchanged.
//   Previous pin: all f24bc22c, catalog 9006354b, lvStatus 7ca8e1ce, portCatalog 04dff98a, registered 29aba538.
// The long-position module replaces the native `position` registration in place
//   (one lvStatus row), its factory definition moves there and Short gains a copy (factoryDefinitions, factoryStatus), two
//   Long unapplied rows are applied (factoryUnapplied), and both position types carry the reference Inputs/Style fields (registered,
//   portCatalog). catalog, dialogSpecs and dialogUnavailable are unchanged.
//   Previous pin: all d5a18db6, factoryDefinitions e925a8a8, factoryStatus c8ef889b, factoryUnapplied 8874c098, lvStatus fde1cca8,
//   portCatalog 2738d330, registered 32f082c4.
// The text tools with no recorded dialog (callout, note, pricenote, comment, pricelabel, flagmark, lvpin, lvtable) now
//   report the Style, Text, Coordinates, Visibility tabs (dialogTabsFor). Only registered and all move. Proof: putting dialogTabs back to
//   null for those 8 types reproduces the previous pin exactly. Previous pin: all c62527fe, registered d98900df.
// The Ray, Extended line, Info line and Arrow specs map Middle point (style.2), Price labels (style.3), Distance and Angle
//   (style.5) to props.lvTrendlineMarkers.*, painted by the shape layer; those 16 rows leave DIALOG_UNAVAILABLE (54 -> 38). Only
//   dialogSpecs, dialogUnavailable and all move. Proof: binding the marker rows for trendline only again (lineSpec markers flag
//   type==='trendline') reproduces the previous pin exactly. Previous pin: all 2db11e1b, dialogSpecs 8656dd42, dialogUnavailable f615ede0.
// Image rotation (lv-types/image.ts) + plain-language catalog copy: Image gains the fact `angle` setting (Rotation, 0..360,
//   group line), so its factoryUnapplied angle row (reason renderer, "no rotation") is applied and leaves (97 rows), and portCatalog
//   and registered gain that one schema field. drawing-tool-catalog.ts rewords the HOSTED disabled reason (2 catalog leaves, same
//   rows and structure). Proof (scratch snapshot diff against the pre-wave tree, whose hashes equal the previous pin): those are the
//   only differences; factoryDefinitions, factoryStatus, dialogSpecs, dialogUnavailable and lvStatus are unchanged.
//   Previous pin: all 29b52eb0, catalog 68274e2f, factoryUnapplied ed7279c8, portCatalog c176d85e, registered 03377473.
// The fib-channel module replaces the native ibchannel registration in place
//   (one lvStatus row appended) and its schema gains the five lvFibChannel.* fields (registered, portCatalog). catalog,
//   dialogSpecs, dialogUnavailable and all factory sections are unchanged. Proof: the pre-lane tree passed this test with the
//   previous pin, and the only diff is the appended module. Previous pin: all edd78d8c, lvStatus 3496f111, portCatalog b80e0587,
//   registered 8aeb6252.
// The axis-lines module replaces the native hline, vline and crossline
//   registrations in place (lvStatus +3 appended; hline/vline schemas gain the lvLineText.* text fields, crossline drops its text.*
//   fields: portCatalog, registered) and the hline/crossline parity rows become 2 px (registered). catalog, dialog and factory
//   sections are unchanged. Proof: removing AXIS_LINES_MODULE from LV_DRAWING_TOOL_MODULES and restoring the parity rows (hline
//   1 px, no crossline row) reproduces the previous pin exactly. Previous pin: all ca54f27b, lvStatus 21683405,
//   portCatalog 7ea673a0, registered 8eb27e11.
// DRAWDEF2 Trendline Stats position vs the axis-lines pin: the editor field offers Left/Center/Right/Auto (portCatalog) and the
//   Trendline statsPosition unapplied row is applied and leaves, the other line tools' note reworded (factoryUnapplied). Proof:
//   restoring the Above/Below options and the old lineTool statsPosition row reproduces the previous pin exactly.
//   Previous pin: all 446d92fc, factoryUnapplied 6c93469d, portCatalog bdb8ee86.
// DRAWDEF2 axis line settings: vline gains lvAxisLine.extend/timeLabel and crossline lvAxisLine.priceLabel/timeLabel schema fields
//   (portCatalog, registered); fresh samples serialize unchanged (absent member = all on). Proof: returning no lvAxisLine fields
//   reproduces the previous pin exactly. Previous pin: all 7b869a64, portCatalog 09e10676, registered 9fbec859.
// DRAWDEF3 hline Price label: hline gains the lvAxisLine.priceLabel schema field (portCatalog, registered); fresh samples
//   serialize unchanged (absent member = on). Proof: an empty hline key list in axis-line-settings.ts (no field) reproduces the
//   previous pin exactly. Previous pin: all c5e1b682, portCatalog 9b20ea62, registered 01590b60.
// (Trendline Stats "Change in pips") maps
//   dialog.LineToolTrendLine.style.5 showPipsPriceRange to props.lvTrendlineMarkers.pips in drawing-dialog-spec.ts, so that one
//   row leaves DIALOG_UNAVAILABLE (38 -> 37). Only dialogSpecs, dialogUnavailable and all move. Proof (scratch snapshot diff
//   against the wave9b-done archive tree, whose hashes equal the previous pin): dialogSpecs differs in exactly that one lv
//   mapping, and dialogUnavailable equals the previous list minus that one row. Previous pin: all 7b30e000,
//   dialogSpecs 0c0ef5bc, dialogUnavailable 7a7da05f.
// The LV Magic cursor row .CURSOR.MAGIC (target cursor magic, request) joins the Cursors section after
//   Demonstration (96 -> 97 leaves). Only catalog and all move; every other section hash is unchanged. Previous pin: all a02dbfa5,
//   catalog 744b4afe.
// The Text tool no longer seeds the fact blue text color (theme ink at placement), and that color joins
//   FACTORY_DEFAULTS_UNAPPLIED with the new reason. factoryDefinitions, factoryUnapplied, registered (the Text
//   defaultStyle) and all move; nothing else. Previous pin: all d533733a, factoryDefinitions ddb2f97b, factoryUnapplied f5ebef97,
//   registered 852b8881.
// Catalog, factoryUnapplied and all re-pinned; only note and label prose changed (the old short product name became OpenCandle). Previous: all dc85bce2, catalog a04a39fd, factoryUnapplied 37465471.
// 0.8.1 drawing fixes: the Elliott tools gain an origin point (anchor counts +1, notes reworded), the triangle pattern note names its
//   boundary lines, and the replaced native types (pitchforks, fans, time zones, Gann grids, channel, extensions, range, arcs, waves)
//   are re-registered. catalog, factoryUnapplied, portCatalog, registered and all move. Previous: all a9a40513, catalog 4eb1fa66,
//   factoryUnapplied b1f504ec, portCatalog fc9c59e3, registered c2159399.
// 0.8.1 round 2/3: the pale cyan default drawing colour becomes the drawing blue (contrast on light charts), the regression
//   trend gains deviation inputs, Bars pattern starts above the series. portCatalog, registered and all move. Previous:
//   portCatalog bf45eb26, registered b3f5ed6e, all 4acfb579.
// 0.8.1 drawing spec fixes: new Gann fan drawings store the classic time x price angle labels (the ratio 2
//   line reads 1/2). Only registered (the gannfan sample levels) and all move. Proof: dropping the Gann fan defaultLevels
//   override reproduces the previous registered pin exactly. Previous: all e2678e5a, registered 54b17759.
// 0.8.2 drawing fixes: new Gann fan drawings store the 1x2 form of the angle labels (as the Gann square writes them), so the
//   gannfan sample levels move registered. The Fixed range volume profile, Anchored VWAP and Cypher replacements keep their
//   meta, schema and sample records, so they move nothing. This pin also records the 0.8.2 harmonic series cover and position
//   tool changes (portCatalog 170b99eb, registered 101d9e98), which were not re-pinned when they landed. Proof: with the Gann
//   fan label change and the three replacements removed, the snapshot gives exactly portCatalog 170b99eb and registered
//   101d9e98; adding back the replacements alone leaves both unchanged. Previous: all eb1efd05, portCatalog ca36cfb7,
//   registered 4555c86a.
// 0.8.2 drawing follow-ups: the Arrow, Ray, Extended line and Info line rows gain the Shift 45 degree hint and the Pin and
//   Stickers notes are reworded (catalog); Stickers become one centre anchor with a pixel Size setting (anchor schema 1..1,
//   schema gains lvStickerSize, sample props carry the size: portCatalog, registered). Nothing else moves. Previous: all
//   726e3ab7, catalog 9ae61aaf, portCatalog 170b99eb, registered e5b2dc98.
const PINNED={
 all:'e3409c5e6619a7d606fea05dae63d27526a9e9380fe6271b068eb968db5b30d7',
 catalog:'923af16b9270703a6f14585187ab33e897dabbd619c04d2690a80c429230fcb1',
 factoryDefinitions:'815d67cb786de19aeab78dba31d5ce4a963e3939dd6ef25e7ace9e0daac31646',
 factoryUnapplied:'4b2595e051490540ce2fc1861a4543f70b709b4a94a52a6533169ed612eca403',
 factoryStatus:'7812034d4bf4c9eaf7376bcd684620431398bd1ba9fd894934bc7abc2ff3d3b2',
 dialogSpecs:'332ce420d6513ddb60469c9cb2ceac29859b723532f1f5a027aa98133e1cb56c',
 dialogUnavailable:'a816dd28be2ae041ca2b1069c6fe9df848d19e02d110b4662f26e94477b5ff51',
 lvStatus:'fadb0efa2df48518660b5a5da223dacf433e0d13e5c6158fcab58ff0966f12d1',
 portCatalog:'d86b41e0a94208273ef0cf920adcd8f6cd7e5766a509cf367dfd1d1d85c842de',
 registered:'fbdd91f88bc161faeb9e658b34548117bc176d540977fe3a2372cebc51b8f821',
} as const;

describe('per-tool registry snapshot (baseline, re-pinned at each integration)',()=>{
 it('reproduces every pinned section of the full catalog/defaults/dialog/registration snapshot',()=>{
  const snapshot=drawingRegistrySnapshot();
  expect(snapshot.registered).toHaveLength(105);// 91 -> 104, 105
  // re-pin: 96 -> 97 catalog leaves (the LV Magic cursor row .CURSOR.MAGIC, request).
  expect(snapshot.catalog.flatMap((group:any)=>group.sections.flatMap((part:any)=>part.leaves))).toHaveLength(97);
  const sections=Object.fromEntries(Object.keys(PINNED).filter(key=>key!=='all').map(key=>[key,snapshotSha256(snapshot[key])]));
  expect(sections).toEqual(Object.fromEntries(Object.entries(PINNED).filter(([key])=>key!=='all')));
  expect(snapshotSha256(snapshot)).toBe(PINNED.all);
  expect(BEFORE.all).not.toBe(PINNED.all);// BEFORE stays as the record
 });
 it('the OpenCandle tools come from their modules, in registry order',()=>{
  expect(LV_DRAWING_TOOL_MODULES.map(module=>module.id)).toEqual(['long-position','short-position','price-range','date-range','elliott-waves','anchored-volume-profile','bars-pattern','double-curve','emoji-stamp','anchored-text','image','fib-time-trend-line','arrow-marker','chart-patterns','time-cycles','cyclic-lines','sine-line','pitchfan','gann-square-fixed','position-forecast','sector','ghost-feed','pin','table','sticker','fib-channel','axis-lines']);
  expect(LV_DRAWING_TOOL_MODULES.flatMap(module=>(module.catalog??[]).map(arm=>arm.rowId))).toEqual(['DW.FORECAST.SHORT_POSITION','DW.MEASURE.PRICE_RANGE','DW.MEASURE.DATE_RANGE','DW.ELLIOTT.ELLIOTT_TRIANGLE_WAVE','DW.ELLIOTT.ELLIOTT_DOUBLE_COMBO_WAVE','DW.ELLIOTT.ELLIOTT_TRIPLE_COMBO_WAVE','DW.VOLUME.ANCHORED_VOLUME_PROFILE','DW.FORECAST.BARS_PATTERN','DW.SHAPE.DOUBLE_CURVE','DW.ANNOTATION.EMOJI','DW.ANNOTATION.ANCHORED_TEXT','DW.ANNOTATION.IMAGE','DW.SHAPE.ARROW_MARKER','DW.PATTERN.TRIANGLE_PATTERN','DW.PATTERN.THREE_DRIVES_PATTERN','DW.CYCLE.TIME_CYCLES','DW.CYCLE.CYCLIC_LINES','DW.CYCLE.SINE_LINE','DW.FIB.PITCHFAN','DW.GANN.GANN_SQUARE_FIXED','DW.FORECAST.POSITION_FORECAST','DW.FORECAST.SECTOR','DW.FORECAST.GHOST_FEED','DW.ANNOTATION.PIN','DW.ANNOTATION.TABLE','DW.ANNOTATION.STICKERS']);
  // appends 14 rows (one anchor-count row per tool, Sector color2, Ghost feed finish), so the older slices move back by 14.
  expect(FACTORY_DEFAULTS_UNAPPLIED.slice(-14).map(row=>[row.toolId,row.property,row.reason])).toEqual([['LineToolArrowMarker','pointsCount','unverified'],['LineToolTrianglePattern','pointsCount','unverified'],['LineToolThreeDrivers','pointsCount','unverified'],['LineToolTimeCycles','pointsCount','unverified'],['LineToolCircleLines','pointsCount','unverified'],['LineToolSineLine','pointsCount','unverified'],['LineToolPitchfan','pointsCount','unverified'],['LineToolGannFixed','pointsCount','unverified'],['LineToolPrediction','pointsCount','unverified'],['LineToolProjection','pointsCount','unverified'],['LineToolProjection','color2','renderer'],['LineToolGhostFeed','finish','unverified'],['LineToolNote','pointsCount','unverified'],['LineToolTable','pointsCount','unverified']]);
  expect(FACTORY_DEFAULTS_UNAPPLIED.slice(-34,-33)).toEqual([expect.objectContaining({toolId:'LineToolRiskRewardShort',reason:'unverified'})]);
  expect(FACTORY_DEFAULTS_UNAPPLIED.slice(-33,-14).map(row=>row.toolId)).toEqual(['LineToolElliottTriangle','LineToolElliottDoubleCombo','LineToolElliottTripleCombo',...Array(10).fill('LineToolAnchoredVolumeProfile'),'LineToolBarsPattern','LineToolBezierCubic',...Array(2).fill('LineToolTextAbsolute'),...Array(2).fill('LineToolImage')]);
  // The fact angle is applied (the Rotation setting), so it is no longer an unapplied row.
  expect(FACTORY_DEFAULTS_UNAPPLIED.some(row=>row.toolId==='LineToolImage'&&row.property==='angle')).toBe(false);
  expect(FACTORY_DEFAULTS_UNAPPLIED.some(row=>(row.toolId==='LineToolImage'||row.toolId==='LineToolTextAbsolute')&&row.reason==='no-type')).toBe(false);
  expect(FACTORY_DEFAULTS_UNAPPLIED.some(row=>row.toolId==='LineToolBarsPattern'&&row.reason==='no-type')).toBe(false);
  expect(DIALOG_SPECS.find(spec=>spec.toolId==='LineToolBarsPattern')!.types).toEqual(['lvbarspattern']);
  expect(DIALOG_SPECS.find(spec=>spec.toolId==='LineToolRiskReward')!.types).toEqual(['position','lvshortposition']);
 });
});

describe('module contribution guards',()=>{
 const leaves=(groups:readonly any[])=>groups.flatMap(group=>group.sections.flatMap((part:any)=>part.leaves));
 it('a catalog arm flips only an unavailable reference row, keeps its reference fields and hotkey, and arms each row once',()=>{
  // Guard probes use rows no module has armed (Bars pattern is now armed, so Sector stood in; arms Sector and
  // Ghost feed, so Stickers and Post stand in; arms Stickers, so Post stands in alone). R1b binds the
  // Image dialog to lvimage, so the dialog probe below appends a second type to an already bound spec.
  const armed=armCatalog(DRAWING_TOOL_CATALOG,[{rowId:'LV.ROW.POST',type:'lvsyntheticprobe',note:'SYNTHETIC note.'}]);
  const row=leaves(armed).find(leaf=>leaf.id==='LV.ROW.POST');
  expect(row).toEqual({id:'LV.ROW.POST',label:'Post',tvToolId:'LineToolTweet',iconId:'post',target:{kind:'tool',type:'lvsyntheticprobe'},note:'SYNTHETIC note.'});
  expect(Object.isFrozen(row)).toBe(true);
  // Every other row is the identical frozen object.
  const before=leaves(DRAWING_TOOL_CATALOG),after=leaves(armed);
  expect(after.filter((leaf,index)=>leaf!==before[index]).map(leaf=>leaf.id)).toEqual(['LV.ROW.POST']);
  expect(()=>armCatalog(DRAWING_TOOL_CATALOG,[{rowId:'DW.ANNOTATION.STICKERS',type:'lvsyntheticprobe'}])).toThrow('only an unavailable reference row');
  expect(()=>armCatalog(DRAWING_TOOL_CATALOG,[{rowId:'DW.FORECAST.SECTOR',type:'lvsyntheticprobe'}])).toThrow('only an unavailable reference row');
  expect(()=>armCatalog(DRAWING_TOOL_CATALOG,[{rowId:'DW.FORECAST.BARS_PATTERN',type:'lvsyntheticprobe'}])).toThrow('only an unavailable reference row');
  expect(()=>armCatalog(DRAWING_TOOL_CATALOG,[{rowId:'DW.TREND.TRENDLINE',type:'lvsyntheticprobe'}])).toThrow('only an unavailable reference row');
  expect(()=>armCatalog(DRAWING_TOOL_CATALOG,[{rowId:'DW.NOT.A.ROW',type:'lvsyntheticprobe'}])).toThrow('unknown row');
  expect(()=>armCatalog(DRAWING_TOOL_CATALOG,[{rowId:'LV.ROW.POST',type:'a'},{rowId:'LV.ROW.POST',type:'b'}])).toThrow('armed twice');
 });
 it('a dialog binding appends types and remaps only listed properties; titles, control types and tabs stay unless corrected',()=>{
  const specs=applyDialogContributions(DIALOG_SPECS,[{toolId:'LineToolImage',types:['lvsyntheticprobe'],tabs:['Style','Visibility'],paths:{'dialog.LineToolImage.style.1':{transparency:'style.lineColor'}}}]);
  const spec=specs.find(item=>item.toolId==='LineToolImage')!,old=DIALOG_SPECS.find(item=>item.toolId==='LineToolImage')!;
  expect(old.types).toEqual(['lvimage']);expect(old.tabs).toEqual(['Style','Visibility']);
  expect(spec.types).toEqual(['lvimage','lvsyntheticprobe']);expect(spec.tabs).toEqual(['Style','Visibility']);
  expect(spec.style.map(row=>[row.factId,row.title,row.type])).toEqual(old.style.map(row=>[row.factId,row.title,row.type]));
  expect(spec.style[0].lv).toEqual({'absolute user image url':'lvImageAsset',transparency:'style.lineColor'});expect(spec.style[1]).toBe(old.style[1]);
  expect(()=>applyDialogContributions(DIALOG_SPECS,[{toolId:'LineToolImage',types:['x'],paths:{'dialog.LineToolImage.style.1':{invented:'style.x'}}}])).toThrow('does not list');
  expect(()=>applyDialogContributions(DIALOG_SPECS,[{toolId:'LineToolNotRecorded',types:['x']}])).toThrow('unrecorded');
  expect(()=>applyDialogContributions(DIALOG_SPECS,[{toolId:'LineToolImage',types:['lvshortposition']}])).toThrow('two dialog specs');
  expect(()=>applyDialogContributions(DIALOG_SPECS,[{spec:{...old,types:[]}}])).toThrow('already recorded');
 });
});
