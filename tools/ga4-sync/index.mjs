import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { JWT } from 'google-auth-library';
import { setTimeout as sleep } from 'node:timers/promises';

const outputPath = 'assets/data/analytics.json';
const networkErrorCodes = new Set([
  'ECONNRESET', 'ECONNREFUSED', 'ECONNABORTED', 'ETIMEDOUT', 'EAI_AGAIN',
  'ENOTFOUND', 'ENETUNREACH', 'EHOSTUNREACH', 'EPIPE',
  'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_SOCKET'
]);

export async function sendWithRetry(send, request, wait = sleep) {
  // Three attempts total; prevent the HTTP library from adding its own retries.
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await send({ ...request, retry: false });
    } catch (error) {
      const status = error?.response?.status;
      const hasStatus = Number.isInteger(status) && status >= 100 && status <= 599;
      // Only emit known codes, never arbitrary strings supplied by a library.
      const code = [error?.code, error?.cause?.code].find((value) => networkErrorCodes.has(value));
      const detail = hasStatus ? ` HTTP ${status}` : code ? ` ${code}` : '';
      console.log(`GA4 request failed (${attempt}/3)${detail}`);
      const retryable = hasStatus ? status === 429 || status >= 500 : Boolean(code);
      if (!retryable || attempt === 3) throw error;
      await wait(1000 * 2 ** (attempt - 1));
    }
  }
}

export function seoulDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(now);
}

export function parseSessions(report) {
  // GA4 can omit both rows and metricHeaders when the date range has no data.
  // Require a recognizable report rather than treating arbitrary objects as zero.
  const emptyRows = report?.rows === undefined ||
    (Array.isArray(report.rows) && report.rows.length === 0);
  const emptyCount = report?.rowCount === undefined || report.rowCount === 0;
  const emptyHeaders = report?.metricHeaders === undefined ||
    (Array.isArray(report.metricHeaders) && report.metricHeaders.length === 0);
  if (report?.kind === 'analyticsData#runReport' && emptyRows && emptyCount && emptyHeaders) {
    return 0;
  }
  if (report.metricHeaders?.[0]?.name !== 'sessions') {
    throw new Error('Unexpected metric');
  }
  if (emptyRows && emptyCount) {
    return 0;
  }
  if (report.rows?.length !== 1) throw new Error('Unexpected rows');
  const value = report.rows[0].metricValues?.[0]?.value;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new Error('Invalid count');
  }
  const count = Number(value);
  if (!Number.isSafeInteger(count)) throw new Error('Invalid count');
  return count;
}

export async function saveCount(totalSessions, todaySessions, path = outputPath, now = new Date()) {
  if (![totalSessions, todaySessions].every((value) => Number.isSafeInteger(value) && value >= 0)) {
    throw new Error('Invalid count');
  }
  let previous;
  try {
    previous = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  // Preserve updatedAt too when the metric is unchanged, avoiding hourly commits.
  if (previous?.totalSessions === totalSessions && previous?.todaySessions === todaySessions) return false;
  const data = { totalSessions, todaySessions, updatedAt: now.toISOString() };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(`${path}.tmp`, `${JSON.stringify(data, null, 2)}\n`);
  await rename(`${path}.tmp`, path);
  return true;
}

export async function sync({ env = process.env, query, path = outputPath, now = new Date() } = {}) {
  let stage = 'Actions environment validation';
  try {
    if (env.GITHUB_ACTIONS !== 'true') throw new Error('Actions only');
    stage = 'GA4_PROPERTY_ID validation';
    const propertyId = env.GA4_PROPERTY_ID;
    if (!/^\d+$/.test(propertyId ?? '')) throw new Error('Invalid property');
    stage = 'GA4_SERVICE_ACCOUNT_JSON validation';
    const credentials = JSON.parse(env.GA4_SERVICE_ACCOUNT_JSON);
    if (credentials?.type !== 'service_account' ||
        !credentials.client_email || !credentials.private_key) {
      throw new Error('Invalid credentials');
    }
    const today = seoulDate(now);
    const request = {
      method: 'POST',
      url: `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
      data: {
        // Covers the property's entire GA4 session history.
        dateRanges: [{ startDate: '2015-08-14', endDate: today }],
        metrics: [{ name: 'sessions' }]
      },
      timeout: 30000
    };
    stage = 'authentication client setup';
    const client = query ? null : new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/analytics.readonly']
    });
    const send = query ?? ((options) => client.request(options));
    stage = 'GA4 requests (including authentication)';
    const [total, daily] = await Promise.all([
      sendWithRetry(send, request),
      sendWithRetry(send, { ...request, data: { ...request.data,
        dateRanges: [{ startDate: today, endDate: today }] } })
    ]);
    // GA4 date ranges use the property's reporting time zone, not the runner's.
    // Fail closed rather than publish another time zone's daily sessions as KST.
    stage = 'reporting time zone validation';
    if ([total, daily].some(({ data }) => data?.metadata?.timeZone !== 'Asia/Seoul')) {
      console.log('::warning::Set the GA4 property reporting time zone to Asia/Seoul.');
      throw new Error('Unexpected reporting time zone');
    }
    stage = 'session report validation';
    const totalSessions = parseSessions(total.data);
    const todaySessions = parseSessions(daily.data);
    stage = 'analytics.json save';
    const changed = await saveCount(totalSessions, todaySessions, path, now);
    console.log(changed ? 'GA4 public count updated.' : 'GA4 public count unchanged.');
    return true;
  } catch {
    // Never print errors from authentication/HTTP libraries: they may contain keys,
    // bearer tokens, request headers, or service-account details.
    console.log(`::warning::GA4 sync failed during ${stage}; existing analytics.json was preserved.`);
    return false;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!(await sync())) process.exitCode = 1;
}
