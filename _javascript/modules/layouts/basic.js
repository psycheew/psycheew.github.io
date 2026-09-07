import { back2top, loadTooptip, modeWatcher } from '../components';
import { loadAnalyticsCounter } from '../components/analytics-counter';

export function basic() {
  loadAnalyticsCounter();
  modeWatcher();
  back2top();
  loadTooptip();
}
