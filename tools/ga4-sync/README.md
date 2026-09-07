# GA4 public visitor count

- `.github/workflows/ga4-sync.yml` runs on `master` every hour at minute 17
  (UTC cron; GitHub may delay scheduled runs). It also supports manual execution.
- The fetch step reads `GA4_PROPERTY_ID` and `GA4_SERVICE_ACCOUNT_JSON` from
  repository secrets. Google Auth Library handles service-account OAuth in memory;
  credentials are never written to disk or sent to the browser.
- `runReport` requests `totalUsers` from `2015-08-14` through the current Seoul date, without
  dimensions. This covers the property's available GA4 history and avoids summing
  duplicate users across days. A second request queries that single date for TODAY.
  The date is calculated once using `Asia/Seoul`. The GA4 property's reporting
  time zone must also be `Asia/Seoul`; response metadata is checked, and a mismatch
  preserves the existing JSON with a warning. Both requests must succeed before writing.
- Only `totalUsers`, `todayUsers`, and `updatedAt` are published in `assets/data/analytics.json`.
  `updatedAt` is UTC ISO 8601 and records the last count change, not the last poll.
  GA4 processing delays apply; this is not a realtime counter.
- When both counts are unchanged, the file is not updated. API/authentication/validation failures
  fail the fetch step with a generic warning and preserve the existing file.
  Commit and deploy steps are skipped on failure.
- Changed counts are committed alone, rebased on `master`, and pushed without
  force. The workflow explicitly dispatches the existing `pages-deploy.yml`, as
  pushes using `GITHUB_TOKEN` do not trigger push workflows.
- The existing TOTAL and TODAY elements share one JSON fetch using Jekyll's `relative_url`.
  Styling is unchanged. Invalid/unavailable data leaves the existing
  display intact; the initial null value displays as an em dash. PWA caching is
  bypassed for this JSON.

After merging/pushing these files to `master`, run **Actions → GA4 Visitor Sync →
Run workflow** once, then check that the sync and Pages deployment succeed.
No additional secrets are needed. Repository rules must allow Actions to push.

Local checks (mocked data only, no real credentials):

```sh
node --test tools/ga4-sync/index.test.mjs
```

References:
- https://developers.google.com/analytics/devguides/reporting/data/v1/basics
- https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow
