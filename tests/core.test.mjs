import test from 'node:test';
import assert from 'node:assert/strict';
import '../extension/core.js';
const { isSignInLabel, inspectUrl, analyzeCandidates } = globalThis.ClaudeLinkCore;
const first = 'https://claude.ai/magic-link?token=TEST_ONLY_A&returnTo=%2Fnew#keep';
const second = 'https://claude.ai/magic-link?token=TEST_ONLY_B';
const candidate = (href, label = 'Sign in') => ({ href, labels: [label] });
const safeLink = (url) => `https://nam12.safelinks.protection.outlook.com/?url=${encodeURIComponent(url)}&data=TEST`;

for (const label of ['Sign in', ' SIGN  IN ', 'Sign\u00a0in', 'Sign\u200bin', 'Sign in with Claude.ai', 'Log in to your Claude account', '登录 Claude', 'Sign in →']) {
  test(`recognizes ${JSON.stringify(label)}`, () => assert.equal(isSignInLabel(label), true));
}
for (const label of ['Design inspiration', 'Sign up', 'Sign in with Google', 'Do not sign in', 'Sign in to another service', 'Click here', '']) {
  test(`rejects label ${JSON.stringify(label)}`, () => assert.equal(isSignInLabel(label), false));
}
test('preserves every byte of a direct token, query and fragment', () => {
  assert.deepEqual(inspectUrl(first), { ok: true, url: first, unwrapped: false });
  assert.equal(inspectUrl('https://claude.ai/magic-link#TEST+ONLY%2B%2f').ok, true);
  assert.equal(inspectUrl('https://claude.ai/login?token=TEST').ok, true);
});
for (const url of [
  'https://claude.ai.evil.example/magic-link?token=TEST',
  'https://evil.example/?url=https://claude.ai/magic-link?token=TEST',
  'https://claude.ai@evil.example/magic-link?token=TEST',
  'https://user:pass@claude.ai/magic-link?token=TEST',
  'https://support.claude.ai/magic-link?token=TEST',
  'https://claude.ai:8443/magic-link?token=TEST',
  'https://claude.ai./magic-link?token=TEST',
  'http://claude.ai/magic-link?token=TEST', 'javascript:alert(1)',
  '/magic-link?token=TEST', '//claude.ai/magic-link?token=TEST',
  'https://claude.ai/magic-link', 'https://claude.ai/magic-link?returnTo=%2Fnew',
  'https://claude.ai/magic-link#returnTo=/new', 'https://claude.ai/login?returnTo=%2Fnew',
  'https://claude.ai/', 'https://claude.ai/help?token=TEST',
  'https://claude.ai/\\evil.example/magic-link?token=TEST',
  'https://claude.ai/magic-link?token=TE\nST',
]) {
  test(`refuses unsafe/non-login destination ${JSON.stringify(url)}`, () => assert.equal(inspectUrl(url).ok, false));
}
test('locally unwraps Safe Links and nested Google wrappers without altering tokens', () => {
  const google = `https://www.google.com/url?q=${encodeURIComponent(first)}`;
  assert.deepEqual(inspectUrl(safeLink(google)), { ok: true, url: first, unwrapped: true });
  assert.equal(inspectUrl(safeLink('https://evil.example')).ok, false);
});
test('rejects ambiguous, spoofed, malformed and deeply nested wrappers', () => {
  assert.equal(inspectUrl(`${safeLink(first)}&url=${encodeURIComponent(second)}`).reason, 'ambiguous-redirect');
  assert.equal(inspectUrl(`https://www.google.com/url?q=${encodeURIComponent(first)}&url=${encodeURIComponent(second)}`).ok, false);
  assert.equal(inspectUrl(`https://safelinks.protection.outlook.com.evil.example/?url=${encodeURIComponent(first)}`).ok, false);
  assert.equal(inspectUrl('https://nam12.safelinks.protection.outlook.com/?url=%ZZ').ok, false);
  let nested = first;
  for (let i = 0; i < 5; i++) nested = safeLink(nested);
  assert.equal(inspectUrl(nested).ok, false);
});
test('does not decode the token twice or turn literal plus into spaces', () => {
  const url = 'https://claude.ai/magic-link?token=TEST+a%2Bb%252B&x=1#A%2BB';
  assert.equal(inspectUrl(safeLink(url)).url, url);
});
test('same link repeated as desktop/mobile buttons is one result', () => {
  const result = analyzeCandidates([candidate(first), candidate(safeLink(first))]);
  assert.equal(result.status, 'ready');
  assert.equal(result.links.length, 1);
});
test('distinct tokens, no link, unsupported link and quoted-only have explicit states', () => {
  assert.equal(analyzeCandidates([candidate(first), candidate(second)]).status, 'multiple');
  assert.equal(analyzeCandidates([]).status, 'missing');
  assert.equal(analyzeCandidates([candidate('https://tracking.example/opaque')]).status, 'unverified');
  assert.equal(analyzeCandidates([], { quotedCount: 1 }).status, 'quoted');
});
test('valid plus unknown Sign in is blocked; never silently picks the valid-looking one', () => {
  assert.equal(analyzeCandidates([candidate(first), candidate('https://unknown.example')]).status, 'unverified');
});
test('incomplete scans fail closed', () => {
  assert.equal(analyzeCandidates([candidate(first)], { overflow: true }).status, 'overflow');
});

test('accepts colon-separated magic-link credentials and preserves the exact URL', () => {
  // Synthetic credentials only; this test must never contain a real mail link.
  const composite = 'https://claude.ai/magic-link#0123456789abcdef0123456789abcdef:dGVzdEBleGFtcGxlLmludmFsaWQ=';
  assert.deepEqual(inspectUrl(composite), { ok: true, url: composite, unwrapped: false });
  assert.deepEqual(inspectUrl(safeLink(composite)), { ok: true, url: composite, unwrapped: true });
  const result = analyzeCandidates([candidate(composite)]);
  assert.equal(result.status, 'ready');
  assert.equal(result.links[0].url, composite);
});
test('composite credentials retain base64 punctuation and still detect multiple logins', () => {
  const prefix = 'https://claude.ai/magic-link#0123456789abcdef0123456789abcdef:';
  for (const suffix of ['TEST+ONLY/PAYLOAD==', 'TEST_ONLY-PAYLOAD=', 'TEST%2BONLY%2FPAYLOAD%3D']) {
    assert.equal(inspectUrl(prefix + suffix).url, prefix + suffix);
  }
  assert.equal(analyzeCandidates([candidate(prefix + 'TEST_A'), candidate(prefix + 'TEST_B')]).status, 'multiple');
});
test('empty or malformed composite credentials and spoofed domains remain rejected', () => {
  for (const suffix of [':', ':TEST', 'TEST:', 'TEST:OTHER:PART', 'TEST:OTHER&next=1', 'https://evil.example']) {
    assert.equal(inspectUrl(`https://claude.ai/magic-link#${suffix}`).ok, false);
  }
  assert.equal(inspectUrl('https://claude.ai.evil.example/magic-link#TEST:PAYLOAD=').ok, false);
});
test('rejection diagnostics contain fixed reason codes and counts, never credentials', () => {
  const result = analyzeCandidates([
    candidate('https://unknown.example/PRIVATE_PATH?token=PRIVATE_TOKEN#PRIVATE_FRAGMENT'),
    candidate('https://claude.ai/unsupported#PRIVATE_PAYLOAD'),
  ]);
  assert.deepEqual(result.rejections, [
    { reason: 'unrecognized-host', count: 1 },
    { reason: 'not-login-link', count: 1 },
  ]);
  assert.equal(JSON.stringify(result).includes('PRIVATE_'), false);
});
