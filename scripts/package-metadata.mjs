/** Windows version resource strings of the packaged OpenCandle.exe. scripts/package.mjs sets them (win32metadata, and
 * appCopyright for LegalCopyright) and scripts/security-package.mjs reads them back from the built executable. The copyright
 * line matches the Required Notice in LICENSE and NOTICE. */
export const APP_COPYRIGHT='Copyright 2026 the OpenCandle contributors';
export const WIN32_METADATA=Object.freeze({CompanyName:'OpenCandle',FileDescription:'OpenCandle',ProductName:'OpenCandle',InternalName:'OpenCandle',OriginalFilename:'OpenCandle.exe'});
export const EXE_VERSION_STRINGS=Object.freeze({...WIN32_METADATA,LegalCopyright:APP_COPYRIGHT});
/** The packager options that write those strings. */
export const packagerMetadataOptions=()=>({appCopyright:APP_COPYRIGHT,win32metadata:{...WIN32_METADATA}});
/** Problems with a built executable's version strings (empty when every string matches). */
export function exeVersionStringProblems(strings){
 return Object.entries(EXE_VERSION_STRINGS).filter(([key,value])=>strings?.[key]!==value).map(([key,value])=>key+' is '+JSON.stringify(strings?.[key]??null)+', expected '+JSON.stringify(value));
}
