import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseTotalUsers, saveCount, sync, seoulDate, sendWithRetry } from './index.mjs';
import { loadAnalyticsCounter } from '../../_javascript/modules/components/analytics-counter.js';

const report = (value) => ({
  metadata: { timeZone: 'Asia/Seoul' },
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

test('Korean midnight boundaries and valid/invalid reports', () => {
  assert.equal(seoulDate(new Date('2026-09-07T14:59:59Z')), '2026-09-07');
  assert.equal(seoulDate(new Date('2026-09-07T15:00:00Z')), '2026-09-08');
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
    const now = new Date('2026-09-07T15:00:00Z');
    const ranges = [];
    assert.equal(await sync({ env, path, now, query: async (request) => {
      assert.deepEqual(request.data.metrics, [{ name: 'totalUsers' }]);
      assert.equal(request.data.dimensions, undefined);
      ranges.push(request.data.dateRanges[0]);
      assert.equal(request.data.dateRanges[0].endDate, '2026-09-08');
      return { data: report(request.data.dateRanges[0].startDate === '2015-08-14' ? '1234' : '12') };
    } }), true);
    const saved = await readFile(path, 'utf8');
    assert.deepEqual(ranges, [
      { startDate: '2015-08-14', endDate: '2026-09-08' },
      { startDate: '2026-09-08', endDate: '2026-09-08' }
    ]);
    assert.deepEqual(Object.keys(JSON.parse(saved)), ['totalUsers', 'todayUsers', 'updatedAt']);
    assert.equal(JSON.parse(saved).todayUsers, 12);
    assert.equal(JSON.parse(saved).totalUsers, 1234);
    assert.equal(await saveCount(1234, 12, path, new Date('2030-01-01')), false);
    assert.equal(await readFile(path, 'utf8'), saved);
    for (const query of [
      async () => { throw new Error('TEST-ONLY secret must never be logged'); },
      async () => ({ data: report('-1') }),
      async () => ({ data: { ...report('100'), metadata: { timeZone: 'America/New_York' } } }),
      async (request) => {
        if (request.data.dateRanges[0].startDate !== '2015-08-14') throw new Error('Daily query failed');
        return { data: report('2000') };
      }
    ]) {
      assert.equal(await sync({ env, path, query }), false);
      assert.equal(await readFile(path, 'utf8'), saved);
    }
    assert.equal(await sync({ env: { ...env, GITHUB_ACTIONS: 'false' }, path,
      query: async () => { assert.fail('Must not authenticate outside Actions'); } }), false);
    assert.equal(await readFile(path, 'utf8'), saved);
    assert.equal(await saveCount(1234, 0, path), true);
    assert.equal(JSON.parse(await readFile(path, 'utf8')).todayUsers, 0);
    assert.equal(await saveCount(0, 0, path), true);
    assert.equal(JSON.parse(await readFile(path, 'utf8')).totalUsers, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('retry uses safe diagnostics, three attempts and exponential backoff', async (t) => {
  const logs = [];
  t.mock.method(console, 'log', (line) => logs.push(line));
  for (const failure of [
    { response: { status: 429 } },
    { response: { status: 500 } },
    { response: { status: 503 } },
    { code: 'ECONNRESET' },
    { cause: { code: 'ETIMEDOUT' } }
  ]) {
    Object.assign(failure, { message: 'SECRET', config: { headers: { Authorization: 'SECRET' } } });
    let calls = 0;
    const delays = [];
    const result = sendWithRetry(async (request) => {
      assert.equal(request.retry, false);
      calls++;
      throw failure;
    }, {}, async (delay) => { delays.push(delay); });
    const rejected = assert.rejects(result, (error) => error === failure);
    await rejected;
    assert.equal(calls, 3);
    assert.deepEqual(delays, [1000, 2000]);
  }
  for (const failure of [
    { response: { status: 400 }, code: 'ECONNRESET' },
    { response: { status: 401 } }, { response: { status: 403 } },
    { code: 'SECRET', message: 'SECRET' },
    { response: { status: '503 SECRET', data: 'SECRET' } }
  ]) {
    let calls = 0;
    await assert.rejects(sendWithRetry(async () => { calls++; throw failure; }, {}));
    assert.equal(calls, 1);
  }
  assert.equal(logs.length, 20);
  for (const line of logs) {
    assert.match(line, /^GA4 request failed \([123]\/3\)( HTTP (429|500|503|400|401|403)| ECONNRESET| ETIMEDOUT)?$/);
  }
});

test('each query retries independently, recovery publishes and exhaustion preserves bytes', async (t) => {
  const logs = [];
  t.mock.method(console, 'log', (line) => logs.push(line));
  const dir = await mkdtemp(join(tmpdir(), 'ga4-retry-test-'));
  const path = join(dir, 'analytics.json');
  try {
    await writeFile(path, '{"totalUsers":1,"todayUsers":1,"updatedAt":"original"}\n');
    for (const recover of [true, false]) {
      const before = await readFile(path, 'utf8');
      const calls = { total: 0, daily: 0 };
      assert.equal(await sync({ env, path, query: async (request) => {
        const key = request.data.dateRanges[0].startDate === '2015-08-14' ? 'total' : 'daily';
        calls[key]++;
        if (key === 'daily' && (!recover || calls[key] < 3)) {
          throw { response: { status: 503, data: 'SECRET response body' },
            message: 'SECRET credential', config: { headers: { Authorization: 'SECRET token' } } };
        }
        return { data: report(key === 'total' ? '2000' : '20') };
      } }), recover);
      assert.deepEqual(calls, { total: 1, daily: 3 });
      const after = await readFile(path, 'utf8');
      if (recover) {
        assert.equal(JSON.parse(after).totalUsers, 2000);
        assert.equal(JSON.parse(after).todayUsers, 20);
      } else {
        assert.equal(after, before);
      }
    }
    assert.deepEqual(logs, [
      'GA4 request failed (1/3) HTTP 503', 'GA4 request failed (2/3) HTTP 503',
      'GA4 public count updated.',
      'GA4 request failed (1/3) HTTP 503', 'GA4 request failed (2/3) HTTP 503',
      'GA4 request failed (3/3) HTTP 503',
      '::warning::GA4 sync failed after retries; existing analytics.json was preserved.'
    ]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('UI handles valid counts, zero, initial null, malformed JSON and network failures', async () => {
  const originalDocument = globalThis.document;
  const originalFetch = globalThis.fetch;
  const counter = { dataset: { analyticsUrl: '/blog/assets/data/analytics.json' }, textContent: '—' };
  const todayCounter = { textContent: '—' };
  globalThis.document = { querySelector: (selector) => selector === '[data-analytics-today]' ? todayCounter : counter };
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, counter.dataset.analyticsUrl);
      assert.equal(options.cache, 'no-store');
      return { ok: true, json: async () => ({ totalUsers: 1234, todayUsers: 12 }) };
    };
    await loadAnalyticsCounter();
    assert.equal(todayCounter.textContent, '12');
    assert.equal(counter.textContent, new Intl.NumberFormat().format(1234));
    for (const totalUsers of [null, -1, '1234', 1.5]) {
      globalThis.fetch = async () => ({ ok: true, json: async () => ({ totalUsers, todayUsers: totalUsers }) });
      await loadAnalyticsCounter();
      assert.equal(counter.textContent, new Intl.NumberFormat().format(1234));
      assert.equal(todayCounter.textContent, '12');
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
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ totalUsers: 0, todayUsers: 0 }) });
    await loadAnalyticsCounter();
    assert.equal(counter.textContent, '0');
    assert.equal(todayCounter.textContent, '0');
  } finally {
    globalThis.document = originalDocument;
    globalThis.fetch = originalFetch;
  }
});
