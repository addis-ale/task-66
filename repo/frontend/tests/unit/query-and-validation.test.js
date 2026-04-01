import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCatalogSearchQuery, combineCatalogKeywordText } from '../../src/lib/search-query.js';
import {
  clampPageSize,
  parsePositiveInt,
  tryParseJsonObject,
  validateEdgeForm,
  validateNodeForm,
  validateRouteSegmentInput
} from '../../src/validators/forms.js';

test('combined query joins title/catalog/artist/series/period fields', () => {
  const q = combineCatalogKeywordText({
    title: 'Blue Airmail',
    catalogNumber: 'CAT-120',
    artist: 'I. Kline',
    series: 'Sky Series',
    period: '1930'
  });
  assert.equal(q, 'Blue Airmail CAT-120 I. Kline Sky Series 1930');
});

test('search query enforces pageSize <= 50 and page >= 1', () => {
  const query = buildCatalogSearchQuery({
    title: 'a',
    catalogNumber: '',
    artist: '',
    series: '',
    period: '',
    page: '-10',
    pageSize: '100'
  });

  assert.equal(query.page, 1);
  assert.equal(query.pageSize, 50);
});

test('validator helpers reject invalid graph and route forms', () => {
  assert.equal(validateNodeForm({ type: '', label: 'x' }), 'Node type is required');
  assert.equal(validateEdgeForm({ fromNodeId: 'a', toNodeId: 'a', relationType: 'REL', weight: 20 }), 'Source and target nodes must be different');
  assert.equal(validateRouteSegmentInput({ fromCaseId: 'a', toCaseId: 'b', dwellMinutes: '-1', distanceMeters: '5' }), 'Dwell minutes must be a non-negative number');
});

test('JSON object parsing returns errors for invalid values', () => {
  const invalid = tryParseJsonObject('[]', 'Edge constraints');
  assert.equal(invalid.error, 'Edge constraints must be a JSON object');

  const valid = tryParseJsonObject('{"required":true}', 'Edge constraints');
  assert.equal(valid.error, null);
  assert.deepEqual(valid.value, { required: true });
});

test('numeric helper boundaries for pagination are stable', () => {
  assert.equal(clampPageSize('0', 50), 1);
  assert.equal(clampPageSize('55', 50), 50);
  assert.equal(parsePositiveInt('3.8', 1), 3);
  assert.equal(parsePositiveInt('oops', 7), 7);
});
