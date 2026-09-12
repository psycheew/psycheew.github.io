export async function loadAnalyticsCounter() {
  const counter = document.querySelector('[data-analytics-total]');
  if (!counter) return;

  try {
    const response = await fetch(counter.dataset.analyticsUrl, {
      cache: 'no-store',
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) return;
    const { totalSessions, todaySessions } = await response.json();
    const todayCounter = document.querySelector('[data-analytics-today]');
    for (const [element, value] of [[counter, totalSessions], [todayCounter, todaySessions]]) {
      if (element && Number.isSafeInteger(value) && value >= 0) {
        element.textContent = new Intl.NumberFormat().format(value);
      }
    }
  } catch {
    // Keep the existing display on network errors or invalid JSON.
  }
}
