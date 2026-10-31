// Opens the current development build (dist/) with the owner's preview profile (in %APPDATA%\OpenCandle-dev).
// Plain launcher: checks that a build exists, strips automation/debug env, and starts Electron detached.
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {devMigrationSource,devProfileLocation,isInside,migrateProfile} from './profile-location.mjs';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const executable = path.join(project, 'node_modules', 'electron', 'dist', 'electron.exe');
// The profile (workspace, encrypted key, caches) lives in %APPDATA%\OpenCandle-dev, not in the
// project folder. The first start copies the pre-rename %APPDATA%\LarryVision-dev profile there once (or, when that folder holds
// no profile, the older <project>/local-data/owner-preview one) and leaves the old folder as is.
const legacyProfile = path.join(project, 'local-data', 'owner-preview');
const profile = devProfileLocation(process.env) ?? legacyProfile;
const migrationSource = devMigrationSource({env: process.env, project});

function fail(message) { console.error(message); process.exit(1); }

if (!fs.existsSync(path.join(project, 'dist', 'index.html'))) fail('No development build found. Run "npm.cmd run build" first.');
if (!fs.existsSync(executable)) fail('Electron runtime is missing. Run "npm.cmd ci --cache .cache/npm" first.');
if (process.argv.includes('--check')) { console.log('Current OpenCandle development build is ready. Profile: ' + profile); process.exit(0); }
if (profile !== legacyProfile) {
  if (isInside(profile, project)) fail('The profile folder must be outside the project folder: ' + profile);
  try { if (migrateProfile({from: migrationSource, to: profile}) === 'copied') console.log('Copied your saved profile to ' + profile + '. The old folder ' + migrationSource + ' was left unchanged.'); }
  catch (error) { fail(error.message); }
}

const env = {...process.env};
for (const key of Object.keys(env)) {
  if (/^(?:LV_|PLAYWRIGHT_|PW_|PUPPETEER_|CDP_|VSCODE_|ELECTRON_|CHROME_)/i.test(key) || ['NODE_OPTIONS', 'NODE_INSPECT_RESUME_ON_START', 'NODE_DEBUG', 'NODE_DEBUG_NATIVE', 'NODE_COMPILE_CACHE'].includes(key.toUpperCase())) delete env[key];
}
const child = spawn(executable, [project, '--lv-profile=' + profile, '--user-data-dir=' + profile], {cwd: project, env, shell: false, detached: true, windowsHide: false, stdio: 'ignore'});
child.on('error', error => fail('OpenCandle could not start: ' + error.message));
child.unref();
