import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseTotalUsers, saveCount, sync } from './index.mjs';
import { loadAnalyticsCounter } from '../../_javascript/modules/components/analytics-counter.js';

const report = (value) => ({
  metricHeaders: [{ name: 'totalUsers' }],
  rows: [{ metricValues: [{ value }] }]
});
const env = {
  GITHUB_ACTIONS: 'true',
  GA4_PROPERTY_ID: '123456',
  GA4_SERVICE_ACCOUNT_JSON: JSON.stringify({
    type: 'service_account', client_email: 'test@example.invalid', private_key: 'TEST-ONLY'
  })
};

test('valid totals, empty reports and invalid responses', () => {
  assert.equal(parseTotalUsers(report('1234')), 1234);
  assert.equal(parseTotalUsers(report('0')), 0);
  assert.equal(parseTotalUsers({ metricHeaders: [{ name: 'totalUsers' }] }), 0);
  for (const value of ['-1', '1.5', '', 'NaN', '9007199254740992']) {
    assert.throws(() => parseTotalUsers(report(value)));
  }
  assert.throws(() => parseTotalUsers({}));
});

test('sync publishes only public fields and preserves bytes when unchanged or failing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ga4-test-'));
  const path = join(dir, 'analytics.json');
  try {
    await writeFile(path, '{"totalUsers":null,"updatedAt":null}\n');
    assert.equal(await sync({ env, path, query: async (request) => {
      assert.deepEqual(request.data.metrics, [{ name: 'totalUsers' }]);
      assert.equal(request.data.dimensions, undefined);
      assert.equal(request.data.dateRanges[0].endDate, 'today');
      return { data: report('1234') };
    } }), true);
    const saved = await readFile(path, 'utf8');
    assert.deepEqual(Object.keys(JSON.parse(saved)), ['totalUsers', 'updatedAt']);
    assert.equal(JSON.parse(saved).totalUsers, 1234);
    assert.equal(await saveCount(1234, path, new Date('2030-01-01')), false);
    assert.equal(await readFile(path, 'utf8'), saved);
    for (const query of [
      async () => { throw new Error('TEST-ONLY secret must never be logged'); },
      async () => ({ data: report('-1') })
    ]) {
      assert.equal(await sync({ env, path, query }), false);
      assert.equal(await readFile(path, 'utf8'), saved);
    }
    assert.equal(await sync({ env: { ...env, GITHUB_ACTIONS: 'false' }, path,
      query: async () => { assert.fail('Must not authenticate outside Actions'); } }), false);
    assert.equal(await readFile(path, 'utf8'), saved);
    assert.equal(await saveCount(0, path), true);
    assert.equal(JSON.parse(await readFile(path, 'utf8')).totalUsers, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('UI handles valid counts, zero, initial null, malformed JSON and network failures', async () => {
  const originalDocument = globalThis.document;
  const originalFetch = globalThis.fetch;
  const counter = { dataset: { analyticsUrl: '/blog/assets/data/analytics.json' }, textContent: '—' };
  globalThis.document = { querySelector: () => counter };
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, counter.dataset.analyticsUrl);
      assert.equal(options.cache, 'no-store');
      return { ok: true, json: async () => ({ totalUsers: 1234 }) };
    };
    await loadAnalyticsCounter();
    assert.equal(counter.textContent, new Intl.NumberFormat().format(1234));
    for (const totalUsers of [null, -1, '1234', 1.5]) {
      globalThis.fetch = async () => ({ ok: true, json: async () => ({ totalUsers }) });
      await loadAnalyticsCounter();
      assert.equal(counter.textContent, new Intl.NumberFormat().format(1234));
    }
    for (const fetcher of [
      async () => { throw new Error('offline'); },
      async () => ({ ok: false }),
      async () => ({ ok: true, json: async () => { throw new Error('invalid JSON'); } })
    ]) {
      globalThis.fetch = fetcher;
      await loadAnalyticsCounter();
      assert.equal(counter.textContent, new Intl.NumberFormat().format(1234));
    }
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ totalUsers: 0 }) });
    await loadAnalyticsCounter();
    assert.equal(counter.textContent, '0');
  } finally {
    globalThis.document = originalDocument;
    globalThis.fetch = originalFetch;
  }
});
