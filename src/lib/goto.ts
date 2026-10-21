import type { TabType } from '../components/NavigationTabs.js';
/** open a tab, optionally with ?sub= / other query params so the screen lands on the right sub-tab */
export const goto = (tab: TabType, params: Record<string, string> = {}, onNavigate?: (t: TabType) => void) => {
  try { const u = new URL(window.location.href); for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v); window.history.replaceState(null, '', u.toString()); } catch { /* old browser */ }
  onNavigate?.(tab);
};
