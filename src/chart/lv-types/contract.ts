// The per-tool module contract. A OpenCandle drawing tool lands as ONE new module file in this folder that
// exports an LvDrawingToolModule, plus ONE registration line in ./index.ts. Every shared surface reads the
// module list instead of being edited per tool:
//   types            -> registered by src/chart/lv-drawing-types.ts (pinned, fail closed)
//   factoryDefaults  -> installed by lv-drawing-types.ts through drawing-factory-defaults.ts installFactoryDefaults()
//   unappliedDefaults / retiresUnapplied -> merged into FACTORY_DEFAULTS_UNAPPLIED (drawing-factory-defaults.ts)
//   catalog          -> arms an unavailable row of src/ui/drawing-tool-catalog.ts (reference facts stay in the catalog)
//   dialog           -> binds types to a recorded dialog spec, or adds a spec (src/ui/drawing-dialog-spec.ts)
// Module files must not import drawing-factory-defaults.ts, lv-drawing-types.ts, the catalog or the dialog spec at
// runtime (type-only imports are fine): those modules read this folder, so a runtime import would be a cycle.
// Shared constants come from ../drawing-default-constants.ts and pin helpers from ../lv-drawing-pin.ts.
import type {DrawingTypeMeta} from '@luxalgo/vela';
import type {FactoryDefaultDefinition,UnappliedDefault} from '../drawing-factory-defaults';
import type {DialogTab,DialogToolSpec} from '../../ui/drawing-dialog-spec';
import type {DrawingHotkey} from '../../ui/drawing-tool-catalog';

export interface LvTypeDefinition{
 /** New type id (lowercase, `lv` prefix), or the native base id itself when `replacesNative` is set. */
 readonly type:string;
 /** The pinned native base type id, reported in the status row. */
 readonly base:string;
 /** Builds the registry entry. Throws PinError (lv-drawing-pin.ts) when the installed base changed. */
 readonly define:()=>DrawingTypeMeta;
 /** The model paints itself through LV-VELA-DRAWING-PAINT-HOOK-1 (lvPaint); the type is registered only when the hook is installed. */
 readonly requiresPaintHook?:boolean;
 /** The LV class replaces the native registration of `base` in place (`type` must equal `base`), so saved records keep their
  *  type id. The native type must be registered; on any pin failure the native registration stays untouched (fail closed). */
 readonly replacesNative?:boolean;
}
/** Arms one catalog row that is unavailable in the reference catalog. Id, label, reference tool id and icon stay the catalog's. */
export interface LvCatalogArm{
 /** Catalog row id (DW.* requirement record or LV.ROW.*). */
 readonly rowId:string;
 readonly type:string;
 readonly note?:string;
 readonly aliases?:readonly string[];
 readonly hotkey?:DrawingHotkey;
 readonly hint?:string;
}
/** Binds this module's types to a recorded reference dialog (dialog.<toolId>), optionally with the renderer paths it now has. */
export interface LvDialogBinding{
 readonly toolId:string;
 readonly types:readonly string[];
 /** Replaces the tab list (only when a fact correction says so). */
 readonly tabs?:readonly DialogTab[];
 /** Row fact id -> reference property -> renderer path. Only properties the row already lists; titles and control types never change. */
 readonly paths?:Readonly<Record<string,Readonly<Record<string,string|null>>>>;
 /** Text tab reference field -> renderer path. Only fields the spec already lists. */
 readonly text?:Readonly<Record<string,string|null>>;
}
export interface LvDialogAddition{readonly spec:DialogToolSpec}
export type LvDialogContribution=LvDialogBinding|LvDialogAddition;

export interface LvDrawingToolModule{
 /** Stable module id (diagnostics). */
 readonly id:string;
 readonly types?:readonly LvTypeDefinition[];
 readonly factoryDefaults?:readonly FactoryDefaultDefinition[];
 readonly unappliedDefaults?:readonly UnappliedDefault[];
 /** Removes the catalog-era `no-type` rows of a reference tool once this module registers its type. */
 readonly retiresUnapplied?:readonly {readonly toolId:string;readonly reason:'no-type'}[];
 readonly catalog?:readonly LvCatalogArm[];
 readonly dialog?:readonly LvDialogContribution[];
}

export const defineLvDrawingToolModule=(module:LvDrawingToolModule):LvDrawingToolModule=>Object.freeze(module);
