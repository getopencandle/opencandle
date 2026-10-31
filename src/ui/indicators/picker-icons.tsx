import React from 'react';
// Indicators picker glyphs, drawn for OpenCandle (18x18 grid, currentColor). Plain functions, not components, so the
// handler-level tests that walk the dialog element tree see the surrounding buttons unchanged.
const svg=(className:string,children:React.ReactNode)=><svg className={'lv-picker-icon '+className} viewBox="0 0 18 18" width="18" height="18" aria-hidden="true" focusable="false">{children}</svg>;
/** Five-point star; filled when the indicator is a favorite. */
export const starIcon=(filled:boolean)=>svg(filled?'lv-star-filled':'lv-star-outline',<path d="M9 2.4l1.95 4.1 4.45.55-3.28 3.08.84 4.42L9 12.37l-3.96 2.18.84-4.42L2.6 7.05l4.45-.55z" fill={filled?'currentColor':'none'} stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>);
export const searchIcon=()=>svg('lv-search-glyph',<><circle cx="7.8" cy="7.8" r="4.8" fill="none" stroke="currentColor" strokeWidth="1.4"/><path d="M11.4 11.4l4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></>);
export const closeIcon=()=>svg('lv-close-glyph',<path d="M4.5 4.5l9 9m0-9l-9 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>);
/** Open eye when the instance is shown (the button hides it), struck eye when hidden. */
export const eyeIcon=(visible:boolean)=>svg(visible?'lv-eye-open':'lv-eye-closed',<><path d="M1.8 9s2.7-4.6 7.2-4.6S16.2 9 16.2 9s-2.7 4.6-7.2 4.6S1.8 9 1.8 9z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/><circle cx="9" cy="9" r="2.1" fill="none" stroke="currentColor" strokeWidth="1.2"/>{!visible&&<path d="M3 15L15 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>}</>);
export const gearIcon=()=>svg('lv-gear-glyph',<><circle cx="9" cy="9" r="2.3" fill="none" stroke="currentColor" strokeWidth="1.2"/><path d="M9 2v2M9 14v2M2 9h2M14 9h2M4.05 4.05l1.4 1.4M12.55 12.55l1.4 1.4M4.05 13.95l1.4-1.4M12.55 5.45l1.4-1.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></>);
