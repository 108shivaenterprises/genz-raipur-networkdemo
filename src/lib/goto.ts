import type { TabType } from '../components/NavigationTabs.js';
/** open a tab, optionally with ?sub= / other query params so the screen lands on the right sub-tab */
export const goto = (tab: TabType, params: Record<string, string> = {}, onNavigate?: (t: TabType) => void) => {
  try { const u = new URL(window.location.href); for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v); window.history.replaceState(null, '', u.toString()); } catch { /* old browser */ }
  onNavigate?.(tab);
};

/** v150 — chat home: a broker lands on Chats (like a chat app) and the first bottom tab is Chats; "0" = the old home */
export const chatHome = {
  on: () => { try { return localStorage.getItem('genz-chat-home') !== '0'; } catch { return true; } },
  set: (v: boolean) => { try { localStorage.setItem('genz-chat-home', v ? '1' : '0'); } catch { /* storage blocked */ } },
};
