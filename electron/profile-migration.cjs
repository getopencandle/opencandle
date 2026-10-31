'use strict';
// One-time profile copy for the LarryVision -> OpenCandle rename, plus the development launcher's
// LarryVision-dev -> OpenCandle-dev move (scripts/profile-location.mjs re-exports this module).
//
// The rename moves the profile folder (%APPDATA%\LarryVision -> %APPDATA%\OpenCandle) because Electron names it after the
// productName. migrateProfile copies the old profile once, as a whole folder: Electron's safeStorage key lives in the
// profile's "Local State" file, so a key file copied without it could not be unlocked. Rules:
// - copy, never move: the old folder is never changed or deleted (the user deletes it once everything works);
// - the destination counts as existing only when it holds a real profile ("Local State" or local-workspace), because
//   Chromium can create lockfile/Crashpad in a new folder before the copy runs; a real profile is never overwritten;
// - the copy goes into <to>.migrating-<pid> first and is renamed into place, so a crash or a second start never sees a
//   half-copied profile;
// - a profile still open in the old app (its Chromium lockfile is held) is refused with PROFILE_IN_USE.
const fs = require('node:fs');
const path = require('node:path');

/** Chromium's own caches: rebuilt on demand, so they are not worth copying. The app's own caches are copied. */
const SKIPPED_CACHE_FOLDERS = Object.freeze(['Cache', 'Code Cache', 'GPUCache', 'DawnCache', 'DawnGraphiteCache', 'DawnWebGPUCache', 'GrShaderCache', 'ShaderCache', 'Crashpad']);
const MIGRATION_NOTE = 'migrated-from.txt';
/** Files or folders that only a used profile has. */
const PROFILE_MARKERS = Object.freeze(['Local State', 'local-workspace']);
const TEMP_INFIX = '.migrating-';

const same = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
function isRealProfile(folder) {
  if (!folder) return false;
  return PROFILE_MARKERS.some(name => { try { fs.statSync(path.join(folder, name)); return true; } catch { return false; } });
}
/** True when Chromium holds the profile's lock file open (the app is running on it). */
function profileInUse(folder) {
  const lock = path.join(folder, 'lockfile');
  if (!fs.existsSync(lock)) return false;
  try { const handle = fs.openSync(lock, 'r+'); fs.closeSync(handle); return false; } catch (error) { return error?.code === 'EBUSY' || error?.code === 'EPERM' || error?.code === 'EACCES'; }
}
class ProfileInUseError extends Error {
  constructor(from) { super('The old profile folder is still open in LarryVision (' + from + '). Close it and start again.'); this.code = 'PROFILE_IN_USE'; this.folder = from; }
}
function processAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { return error?.code === 'EPERM'; }
}
/** Removes <to>.migrating-<pid> folders left by a copy whose process is gone (or by this process). Never anything else. */
function removeStaleTemps(to, pid) {
  const parent = path.dirname(to), prefix = path.basename(to).toLowerCase() + TEMP_INFIX;
  let names = [];
  try { names = fs.readdirSync(parent); } catch { return; }
  for (const name of names) {
    if (!name.toLowerCase().startsWith(prefix)) continue;
    const owner = Number(name.slice(prefix.length));
    if (!Number.isInteger(owner) || owner <= 0 || (owner !== pid && processAlive(owner))) continue;
    try { fs.rmSync(path.join(parent, name), { recursive: true, force: true }); } catch { /* retried on the next start */ }
  }
}
const isEmptyFolder = folder => { try { return fs.readdirSync(folder).length === 0; } catch { return false; } };

/**
 * Copies `from` to `to` once. Returns 'none' (no old profile, or the same folder), 'kept' (the destination already holds
 * a profile, left as is) or 'copied'. Throws a ProfileInUseError (code PROFILE_IN_USE) when the old profile is open, and
 * any file-system error when the copy fails (the destination is then left as it was).
 * `inUse` and `pid` exist for tests.
 */
function migrateProfile({ from, to, inUse = profileInUse, pid = process.pid }) {
  if (!from || !to || same(from, to)) return 'none';
  if (!isRealProfile(from)) return 'none';
  if (isRealProfile(to)) return 'kept';
  if (inUse(from)) throw new ProfileInUseError(from);
  removeStaleTemps(to, pid);
  const temp = to + TEMP_INFIX + pid;
  const skipped = new Set(SKIPPED_CACHE_FOLDERS.map(name => path.join(from, name).toLowerCase()));
  try {
    fs.cpSync(from, temp, { recursive: true, errorOnExist: true, force: false, filter: source => !skipped.has(path.resolve(source).toLowerCase()) && path.basename(source).toLowerCase() !== 'lockfile' });
    fs.writeFileSync(path.join(temp, MIGRATION_NOTE), 'Copied from ' + from + ' on ' + new Date().toISOString() + '. The old folder was left unchanged; delete it yourself once everything works.\r\n');
    if (isEmptyFolder(to)) fs.rmdirSync(to);
    if (!fs.existsSync(to)) {
      try { fs.renameSync(temp, to); return 'copied'; }
      catch (error) { if (isRealProfile(to)) return 'kept'; throw error; } // another start won the race
    }
    // The destination holds only leftovers (for example a Crashpad folder): add the copy without replacing anything.
    if (isRealProfile(to)) return 'kept';
    fs.cpSync(temp, to, { recursive: true, errorOnExist: false, force: false });
    return 'copied';
  } finally {
    try { fs.rmSync(temp, { recursive: true, force: true }); } catch { /* removed on the next start */ }
  }
}

module.exports = { migrateProfile, profileInUse, isRealProfile, ProfileInUseError, SKIPPED_CACHE_FOLDERS, MIGRATION_NOTE, PROFILE_MARKERS };
