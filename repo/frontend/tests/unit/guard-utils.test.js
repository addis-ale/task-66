import test from 'node:test';
import assert from 'node:assert/strict';

import { getTabRequirement, hasTabAccess } from '../../src/lib/tabs.js';

test('tab access guard allows authorized role and blocks unauthorized role', () => {
  assert.equal(hasTabAccess(['Curator'], 'curator'), true);
  assert.equal(hasTabAccess(['Employer'], 'curator'), false);
});

test('tab requirement fallback returns generic restricted message', () => {
  const known = getTabRequirement('routes');
  assert.equal(typeof known.title, 'string');
  assert.equal(typeof known.description, 'string');

  const fallback = getTabRequirement('unknown-tab');
  assert.equal(fallback.title, 'Restricted Feature');
});
