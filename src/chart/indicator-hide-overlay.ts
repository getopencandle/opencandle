// Hide indicators is a toolbar overlay. Effective visibility = stored visibility AND NOT overlay.
// The legend and object tree keep each indicator's own stored state; only the render seam reads this.
import type {DrawingUtility} from './drawing-utility-state';
export const effectiveIndicatorVisible=(stored:boolean,overlayHidden:boolean):boolean=>stored&&!overlayHidden;
/** The indicator half of the hide state; an absent block (older workspace, tests) hides nothing. */
export const indicatorHideOverlay=(utility:Partial<DrawingUtility>|undefined):boolean=>utility?.indicatorsHidden===true;
/** The context the adapter hands to indicator rendering: hideOverlay appears only while the overlay is on, so the no-overlay context is exactly what it was. */
export const indicatorContextWithOverlay=(resolution:string|null,utility:Partial<DrawingUtility>|undefined):{resolution:string|null;hideOverlay?:true}=>indicatorHideOverlay(utility)?{resolution,hideOverlay:true}:{resolution};
