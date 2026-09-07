export async function loadAnalyticsCounter() {
  const counter = document.querySelector('[data-analytics-total]');
  if (!counter) return;

  try {
    const response = await fetch(counter.dataset.analyticsUrl, {
      cache: 'no-store',
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) return;
    const { totalUsers } = await response.json();
    if (Number.isSafeInteger(totalUsers) && totalUsers >= 0) {
      counter.textContent = new Intl.NumberFormat().format(totalUsers);
    }
  } catch {
    // Keep the existing display on network errors or invalid JSON.
  }
}
