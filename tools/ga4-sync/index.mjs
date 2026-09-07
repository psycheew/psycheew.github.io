import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { JWT } from 'google-auth-library';

const outputPath = 'assets/data/analytics.json';

export function parseTotalUsers(report) {
  if (report.metricHeaders?.[0]?.name !== 'totalUsers') {
    throw new Error('Unexpected metric');
  }
  if ((!report.rows || report.rows.length === 0) && !report.rowCount) {
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

export async function saveCount(totalUsers, path = outputPath, now = new Date()) {
  if (!Number.isSafeInteger(totalUsers) || totalUsers < 0) {
    throw new Error('Invalid count');
  }
  let previous;
  try {
    previous = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  // Preserve updatedAt too when the metric is unchanged, avoiding hourly commits.
  if (previous?.totalUsers === totalUsers) return false;
  const data = { totalUsers, updatedAt: now.toISOString() };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(`${path}.tmp`, `${JSON.stringify(data, null, 2)}\n`);
  await rename(`${path}.tmp`, path);
  return true;
}

export async function sync({ env = process.env, query, path = outputPath } = {}) {
  try {
    if (env.GITHUB_ACTIONS !== 'true') throw new Error('Actions only');
    const propertyId = env.GA4_PROPERTY_ID;
    if (!/^\d+$/.test(propertyId ?? '')) throw new Error('Invalid property');
    const credentials = JSON.parse(env.GA4_SERVICE_ACCOUNT_JSON);
    if (credentials.type !== 'service_account' ||
        !credentials.client_email || !credentials.private_key) {
      throw new Error('Invalid credentials');
    }
    const request = {
      method: 'POST',
      url: `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
      data: {
        // Covers the property's entire GA4 history; do not sum daily users.
        dateRanges: [{ startDate: '2015-08-14', endDate: 'today' }],
        metrics: [{ name: 'totalUsers' }]
      },
      timeout: 30000
    };
    const client = query ? null : new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/analytics.readonly']
    });
    const response = query ? await query(request) : await client.request(request);
    const changed = await saveCount(parseTotalUsers(response.data), path);
    console.log(changed ? 'GA4 public count updated.' : 'GA4 public count unchanged.');
    return true;
  } catch {
    // Never print errors from authentication/HTTP libraries: they may contain keys,
    // bearer tokens, request headers, or service-account details.
    console.log('::warning::GA4 sync failed; existing analytics.json was preserved.');
    return false;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!(await sync())) process.exitCode = 1;
}
