import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
const src = (f: string) => readFileSync(path.resolve(import.meta.dirname, '..', f), 'utf8');

describe('v163 shop customer chat opens as a chat', () => {
  it('uses the shared chat screen (name on top, thread, message box) and keeps lead details behind a button', () => {
    const c = src('src/components/ShopLeadChat.tsx');
    for (const k of ['<ChatShell', '<ChatThread', 'shop-chat-details', '<LeadCard l={l} onChange={onChange} noChat />', 'sp-masked', 'sp-ask-need', 'sp-offer-']) expect(c, k).toContain(k);
    const v = src('src/components/ChatsView.tsx');
    expect(v).toContain('<ShopLeadChat'); expect(v).toContain('shop-commission-card');
    expect(src('src/components/ShopPartners.tsx')).toContain('{!noChat && <LeadChat');
  });
});
