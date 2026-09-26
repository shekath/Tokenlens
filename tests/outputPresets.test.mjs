/**
 * Answer-length presets: every preset lands on a slider position, and the
 * active-chip lookup only matches exact lengths.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OUTPUT_PRESETS, activePreset } from '../src/lib/outputPresets.ts';

test('every preset sits on the slider (0-16,000 in steps of 10)', () => {
  for (const p of OUTPUT_PRESETS) {
    assert.ok(p.tokens > 0 && p.tokens <= 16_000, p.id);
    assert.equal(p.tokens % 10, 0, p.id);
  }
});

test('presets are unique and ordered short to long', () => {
  const ids = new Set(OUTPUT_PRESETS.map((p) => p.id));
  assert.equal(ids.size, OUTPUT_PRESETS.length);
  for (let i = 1; i < OUTPUT_PRESETS.length; i++) {
    assert.ok(OUTPUT_PRESETS[i].tokens > OUTPUT_PRESETS[i - 1].tokens);
  }
});

test('activePreset matches exact lengths only', () => {
  assert.equal(activePreset(300)?.id, 'chat');
  assert.equal(activePreset(310), undefined);
  assert.equal(activePreset(500), undefined);
});
