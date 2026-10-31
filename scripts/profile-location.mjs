// Where the development launcher keeps the owner's profile (workspace, encrypted Alpaca key,
// caches): %APPDATA%\OpenCandle-dev, next to the standard %APPDATA%\OpenCandle profile. Before the rename it was
// %APPDATA%\LarryVision-dev, and before that <checkout>/local-data/owner-preview.
//
// The copy logic lives in electron/profile-migration.cjs (the packaged app runs the same code for
// %APPDATA%\LarryVision -> %APPDATA%\OpenCandle); this module re-exports it for the launcher and its test.
import path from 'node:path';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const migration = require('../electron/profile-migration.cjs');

export const DEV_PROFILE_FOLDER = 'OpenCandle-dev';
/** The development profile folder before the OpenCandle rename. */
export const LEGACY_DEV_PROFILE_FOLDER = 'LarryVision-dev';
export const SKIPPED_CACHE_FOLDERS = migration.SKIPPED_CACHE_FOLDERS;
export const MIGRATION_NOTE = migration.MIGRATION_NOTE;
export const migrateProfile = migration.migrateProfile;
export const isRealProfile = migration.isRealProfile;
export const profileInUse = migration.profileInUse;

const appData = env => typeof env.APPDATA === 'string' && path.isAbsolute(env.APPDATA) ? env.APPDATA : null;
/** The development profile folder under %APPDATA%, or null when Windows does not name one. */
export function devProfileLocation(env = process.env) {
  const base = appData(env);
  return base ? path.join(base, DEV_PROFILE_FOLDER) : null;
}
/** The pre-rename development profile folder under %APPDATA%, or null. */
export function legacyDevProfileLocation(env = process.env) {
  const base = appData(env);
  return base ? path.join(base, LEGACY_DEV_PROFILE_FOLDER) : null;
}
/** Where the first development start copies from: LarryVision-dev when it holds a profile, else the older in-project folder. */
export function devMigrationSource({env = process.env, project}) {
  const legacyDev = legacyDevProfileLocation(env);
  if (legacyDev && isRealProfile(legacyDev)) return legacyDev;
  return path.join(project, 'local-data', 'owner-preview');
}
export function isInside(child, parent) {
  const relative = path.relative(path.resolve(parent).toLowerCase(), path.resolve(child).toLowerCase());
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
