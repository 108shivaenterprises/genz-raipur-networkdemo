import { useEffect, useState } from 'react';
import { api } from './api.js';

/**
 * v50 — the number on the Chats icon: unread client-room messages (+ a client waiting for his code) and unread deal-room messages;
 * v61 — and unread builder ↔ partner chat messages.
 * One poll for the whole app; screens that change a chat fire `genz:rooms-changed` / `genz:chats-changed` to refresh it at once.
 */
export function useChatBadge(permissions: string[], activeTab: string): number {
  const [n, setN] = useState(0);
  const clients = permissions.includes('clientroom:use');
  const deals = permissions.includes('deal:chat');
  const partners = permissions.includes('pchat:use');
  useEffect(() => {
    if (!clients && !deals && !partners) { setN(0); return; }
    let live = true;
    const pull = () => {
      Promise.all([
        clients ? api.crList().then(r => (r.rooms || []).filter((x: any) => x.status === 'ACTIVE').reduce((s: number, x: any) => s + (x.unread || 0) + (x.codeAsk ? 1 : 0), 0)).catch(() => 0) : Promise.resolve(0),
        deals ? api.chatSummary().then(r => Number(r.unread) || 0).catch(() => 0) : Promise.resolve(0),
        partners ? api.pchatList().then(r => Number(r.unread) || 0).catch(() => 0) : Promise.resolve(0),
      ]).then(([a, b, c]) => { if (live) setN(a + b + c); });
    };
    pull();
    const t = window.setInterval(() => { if (!document.hidden) pull(); }, 60_000);
    window.addEventListener('genz:rooms-changed', pull); window.addEventListener('genz:chats-changed', pull);
    return () => { live = false; window.clearInterval(t); window.removeEventListener('genz:rooms-changed', pull); window.removeEventListener('genz:chats-changed', pull); };
  }, [clients, deals, partners, activeTab]);
  return n;
}
