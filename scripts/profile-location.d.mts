// Types for scripts/profile-location.mjs (used by its test).
export declare const DEV_PROFILE_FOLDER: string;
export declare const LEGACY_DEV_PROFILE_FOLDER: string;
export declare const SKIPPED_CACHE_FOLDERS: readonly string[];
export declare const MIGRATION_NOTE: string;
export declare function devProfileLocation(env?: Record<string, string | undefined>): string | null;
export declare function legacyDevProfileLocation(env?: Record<string, string | undefined>): string | null;
export declare function devMigrationSource(input: { env?: Record<string, string | undefined>; project: string }): string;
export declare function isInside(child: string, parent: string): boolean;
export declare function isRealProfile(folder: string): boolean;
export declare function profileInUse(folder: string): boolean;
export declare function migrateProfile(input: { from: string; to: string; inUse?: (folder: string) => boolean; pid?: number }): 'none' | 'kept' | 'copied';
