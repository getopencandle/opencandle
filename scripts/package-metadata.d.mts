// Types for scripts/package-metadata.mjs (used by its test).
export declare const APP_COPYRIGHT: string;
export declare const WIN32_METADATA: Readonly<{CompanyName: string; FileDescription: string; ProductName: string; InternalName: string; OriginalFilename: string}>;
export declare const EXE_VERSION_STRINGS: Readonly<{CompanyName: string; FileDescription: string; ProductName: string; InternalName: string; OriginalFilename: string; LegalCopyright: string}>;
export declare function packagerMetadataOptions(): {appCopyright: string; win32metadata: {CompanyName: string; FileDescription: string; ProductName: string; InternalName: string; OriginalFilename: string}};
export declare function exeVersionStringProblems(strings: Readonly<Record<string, string | undefined>> | null | undefined): string[];
