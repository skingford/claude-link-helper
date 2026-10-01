import { readFile, access, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const root = new URL('../extension/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
assert.equal(manifest.manifest_version, 3);
assert.deepEqual(manifest.permissions, ['activeTab', 'scripting', 'clipboardWrite']);
assert.equal(manifest.background, undefined);
assert.equal(manifest.host_permissions, undefined);
assert.equal(manifest.content_scripts[0].matches.includes('<all_urls>'), false);
assert.equal(manifest.content_scripts[0].match_origin_as_fallback, true);
const assets = [manifest.action.default_popup, ...Object.values(manifest.icons), ...manifest.content_scripts.flatMap((item) => item.js), 'popup.css', 'popup.js'];
await Promise.all(assets.map((file) => access(new URL(file, root))));
for (const file of await readdir(root)) {
  if (!file.endsWith('.js')) continue;
  const url = new URL(file, root);
  execFileSync(process.execPath, ['--check', url.pathname]);
  const source = await readFile(url, 'utf8');
  assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|indexedDB)\b|chrome\.(?:storage|cookies)|console\./, `${file}: no network, persistence or logging in extension runtime`);
}
console.log('Manifest, runtime syntax, packaged assets and local-only constraints passed.');
