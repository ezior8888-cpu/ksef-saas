import assert from 'node:assert/strict';
import test from 'node:test';
import { findBundleMatchLocation, formatBundleReportCode } from './bundle-report-metadata.mjs';

test('a match reports only file and offset, never adjacent or repeated secrets', () => {
  const searched = 'synthetic-primary-secret-value';
  const neighbor = 'synthetic-neighbor-secret-value';
  const prefix = 'const neighbor="' + neighbor + '"; /* <script>injected()</script> | ` */ ';
  const source = prefix + searched + '; next=' + searched + '; other=' + neighbor;
  const result = findBundleMatchLocation(source, searched, '.next/static/chunks/example.js');
  assert.deepEqual(result, { file: '.next/static/chunks/example.js', offset: prefix.length });
  const serialized = JSON.stringify(result);
  for (const privateText of [searched, neighbor, '<script>', 'injected']) {
    assert.equal(serialized.includes(privateText), false);
  }
});

test('missing and empty needles do not fabricate a match', () => {
  assert.equal(findBundleMatchLocation('public-only', 'absent-secret', 'public/fixture.js'), null);
  assert.equal(findBundleMatchLocation('public-only', '', 'public/fixture.js'), null);
  assert.deepEqual(findBundleMatchLocation('needle at start', 'needle', 'public/fixture.js'), {
    file: 'public/fixture.js', offset: 0,
  });
});

test('report metadata cannot break its Markdown table or introduce HTML', () => {
  const result = formatBundleReportCode('x`|<img src=x onerror=alert(1)>[link](https://example.test)\n\r\u001b');
  assert.equal(result, '<code>x&#96;&#124;&#60;img src&#61;x onerror&#61;alert&#40;1&#41;&#62;&#91;link&#93;&#40;https://example.test&#41;&#10;&#13;&#27;</code>');
  assert.doesNotMatch(result, /<img|<script|\||`|\n|\r|\u001b/);
});

test('ordinary variable and bundle names remain readable after HTML decoding', () => {
  assert.equal(formatBundleReportCode('SUPABASE_SERVICE_ROLE_KEY'), '<code>SUPABASE&#95;SERVICE&#95;ROLE&#95;KEY</code>');
  assert.equal(formatBundleReportCode('.next/static/chunks/example-1.js'), '<code>.next/static/chunks/example-1.js</code>');
});
