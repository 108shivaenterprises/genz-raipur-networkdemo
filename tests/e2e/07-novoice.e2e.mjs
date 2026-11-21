// Journey 7: voice/call buttons and mic must be absent (FEATURE_VOICE off) across roles and screens, and the APIs closed.
import { launch, login, step, shot, done, BASE, BROKER } from './lib.mjs';
const SCAN = () => {
  const hits = [];
  const q = (sel, why) => document.querySelectorAll(sel).forEach(e => { if (e.closest('a[href^="tel:"]')) return; /* plain dialer links are reported as INFO below */ if (e.offsetParent !== null || e.tagName === 'AUDIO') hits.push(why + ' <' + e.tagName.toLowerCase() + '> ' + (e.getAttribute('aria-label') || e.innerText || '').trim().slice(0, 40)); });
  q('[data-testid="call-button"],[data-testid="call-menu"],[data-testid^="call-"],[data-testid*="voice" i],[data-testid*="mic" i]', 'testid');
  q('[aria-label*="call" i],[aria-label*="कॉल"],[aria-label*="mic" i],[aria-label*="voice" i],[aria-label*="record" i],[title*="voice" i]', 'aria');
  q('svg.lucide-phone,svg.lucide-phone-call,svg.lucide-mic,svg.lucide-mic-off,svg.lucide-audio-lines,svg.lucide-voicemail,svg.lucide-phone-outgoing,svg.lucide-phone-incoming', 'icon');
  q('audio', 'audio');
  const t = document.body.innerText;
  for (const re of [/\bMy calls\b/, /\bVoice (note|call|message)\b/i, /आवाज़ से बोलें|वॉइस/, /\bTap to speak\b/i, /\bSpeak\b/]) if (re.test(t)) hits.push('text ' + re);
  return hits;
};
const tel = () => [...document.querySelectorAll('a[href^="tel:"]')].map(a => (a.getAttribute('data-testid') || 'a') + ' "' + a.innerText.trim() + '" ' + a.getAttribute('href'));
const ACCTS = [[BROKER, 'broker'], ['9000030001@phone.genz.local', 'team member'], ['admin@genzbuildcon.com', 'superadmin'], ['9000040004@phone.genz.local', 'owner'], ['ramesh@chhattisgarhconstructions.com', 'contractor']];
const telSeen = new Set();
async function scan(page, where) { const h = await page.evaluate(SCAN); (await page.evaluate(tel)).forEach(x => telSeen.add(where + ' ' + x)); return h; }

await step({ screenshot: async () => {} }, '7.0', '/api/calls closed and auth config says voice off', async () => {
  const j = await (await fetch(BASE + '/api/auth/config')).json();
  if (j.voice) throw new Error('config.voice=' + j.voice);
  const r = await fetch(BASE + '/api/calls/people?context=TEAM');
  if (![401, 404].includes(r.status)) throw new Error('/api/calls/people status ' + r.status);
  return `voice=${j.voice} calls=${r.status}`;
});
for (const [email, who] of ACCTS) {
  const { browser, page } = await launch({ permissions: [] });
  await page.addInitScript(() => { window.__media = []; try { const md = navigator.mediaDevices; const o = md.getUserMedia.bind(md); md.getUserMedia = (c) => { window.__media.push(JSON.stringify(c)); return o(c); }; } catch {} window.SpeechRecognition = window.webkitSpeechRecognition = function () { window.__media.push('SpeechRecognition'); }; });
  await step(page, `7.${who}`, `${who}: no call/mic UI on home and main screens; no mic requested`, async () => {
    await login(page, email);
    await page.getByTestId('header-profile').waitFor();
    const found = [];
    found.push(...(await scan(page, who + ' home')));
    for (const tid of ['bottom-chats', 'bottom-properties', 'bottom-requirements', 'bottom-deals', 'bottom-more']) {
      if (await page.getByTestId(tid).count()) { await page.getByTestId(tid).click(); await page.waitForTimeout(900); found.push(...(await scan(page, who + ' ' + tid)).map(x => tid + ': ' + x)); }
    }
    // open first chat row of any kind, then composer
    if (await page.getByTestId('bottom-chats').count()) {
      await page.getByTestId('bottom-chats').click(); await page.waitForTimeout(700);
      await page.locator('[data-testid^="chat-row-"]').first().waitFor({ timeout: 4000 }).catch(() => {});
      const ids = (await page.locator('[data-testid^="chat-row-"]').evaluateAll(e => e.map(x => x.getAttribute('data-testid')))).filter(i => /sahayak|c:|d:/.test(i)).slice(0, 9);
      console.log('  chat rows scanned for', who, ids.length);
      for (const id of ids) {
        await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await page.getByTestId('bottom-chats').click(); await page.locator(`[data-testid="${id}"]`).waitFor().catch(() => {});
        await page.locator(`[data-testid="${id}"]`).click().catch(() => {}); await page.waitForTimeout(1500);
        found.push(...(await scan(page, who + ' ' + id)).map(x => 'chat: ' + x)); if (process.env.DEBUG) console.log('   ', id, await page.evaluate(() => document.querySelectorAll('a[href^="tel:"]').length));
        await shot(page, `7-${who.replace(/ /g, '_')}-chat`);
      }
    }
    const media = await page.evaluate(() => window.__media);
    if (media.length) found.push('getUserMedia/SpeechRecognition called: ' + media.join(','));
    if (found.length) throw new Error([...new Set(found)].slice(0, 6).join(' || '));
  });
  await browser.close();
}
console.log('INFO tel: links present (plain dialer, not in-app voice):', [...telSeen].slice(0, 6));
done();
