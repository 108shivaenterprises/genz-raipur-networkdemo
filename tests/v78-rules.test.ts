import { describe, it, expect } from 'vitest';
import { embedFor, stampName, watermarkTile, stampInitials } from '../src/shared/docViewRules.js';
import {
  groupOfRole, GROUPS, TAGS, tagsFor, remarkProblem, reviewProblem, cleanTags, summarize, mayOpenProfile, canLookupPrivate, searchKind, shortName, norm,
  profileProblem, editableUntil, REVIEW_EDIT_DAYS, EARLY_BELOW, MAX_TAGS, REPORT_REASONS, isReportReason, type TargetGroup,
} from '../src/shared/reviewRules.js';

/** v78 — pure rules: the name stamped on a client's paper, and who may be found / reviewed / believed. */

describe('showing a paper on the client page', () => {
  it('a plain link is framed; a picture is shown as a picture; anything that is not http(s) is refused', () => {
    expect(embedFor('https://example.com/brochure.pdf')).toEqual({ mode: 'frame', src: 'https://example.com/brochure.pdf' });
    expect(embedFor('https://cdn.example.com/a/plan.JPG?x=1')).toEqual({ mode: 'image', src: 'https://cdn.example.com/a/plan.JPG?x=1' });
    for (const bad of ['javascript:alert(1)', 'data:text/html,<b>x</b>', 'ftp://a.b/c.pdf', 'file:///etc/passwd', '', null, undefined, 'not a url', 'https://user:pw@example.com/x']) expect(embedFor(bad), String(bad)).toBeNull();
  });
  it('Google Drive and Docs links become the preview that can sit in a frame', () => {
    expect(embedFor('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view?usp=sharing')).toEqual({ mode: 'frame', src: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/preview' });
    expect(embedFor('https://drive.google.com/open?id=1AbCdEfGhIjKlMnOp')?.src).toBe('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/preview');
    expect(embedFor('https://docs.google.com/document/d/1AbCdEfGhIjKlMnOp/edit')?.src).toBe('https://docs.google.com/document/d/1AbCdEfGhIjKlMnOp/preview');
    expect(embedFor('https://docs.google.com/presentation/d/1AbCdEfGhIjKlMnOp/edit#slide=id.p')?.src).toBe('https://docs.google.com/presentation/d/1AbCdEfGhIjKlMnOp/preview');
    expect(embedFor('https://drive.google.com/drive/folders/xyz')?.src).toBe('https://drive.google.com/drive/folders/xyz');   // not a file: framed as it is
  });
  it('the stamp names the person who sent the link; an employee\'s link also names the firm', () => {
    expect(stampName({ name: 'Vikramaditya Sharma', role: 'BROKER' }, 'Capital Propex Raipur')).toBe('Vikramaditya Sharma');
    expect(stampName({ name: 'Rakesh Dewangan', role: 'TEAM_MEMBER' }, 'Capital Propex Raipur')).toBe('Rakesh Dewangan · Capital Propex Raipur');
    expect(stampName({ name: '', role: 'BROKER' }, '')).toBe('GENZ');
    expect(stampName({ name: 'A'.repeat(80) }).length).toBeLessThanOrEqual(40);
  });
  it('the tile is a safe data URI: the name is escaped and no quote / bracket can leave the CSS url("…")', () => {
    const t = watermarkTile(`</text><script>alert("x")</script> O'Brien (Raipur) & Co`);
    expect(t.startsWith('data:image/svg+xml;utf8,')).toBe(true);
    const body = decodeURIComponent(t.slice('data:image/svg+xml;utf8,'.length));
    expect(body).not.toContain('<script'); expect(body).toContain('&lt;script&gt;');
    expect(t).not.toMatch(/["'()<>\s]/);
    expect(body).toContain('rotate(-24');
  });
  it('a Devanagari name is stamped whole and its initials are taken per word', () => {
    expect(decodeURIComponent(watermarkTile('राहुल साहू'))).toContain('राहुल साहू');
    expect(stampInitials('Rakesh Kumar Dewangan · Capital')).toBe('R.K.D.');
    expect(stampInitials('राहुल साहू')).toBe('र.स.');
    expect(stampInitials('')).toBe('');
  });
});

describe('who is who', () => {
  it('every role that can be reviewed has a group and a set of tags with both kinds', () => {
    expect(groupOfRole('BROKER')).toBe('BROKER'); expect(groupOfRole('BUYER_TENANT')).toBe('CUSTOMER'); expect(groupOfRole('DEVELOPER_BUILDER')).toBe('BUILDER');
    for (const r of ['ADMIN', 'SUPERADMIN', 'GENZ_CONNECTOR', 'NOPE', undefined]) expect(groupOfRole(r as string), String(r)).toBeNull();
    for (const g of Object.keys(GROUPS) as TargetGroup[]) {
      const t = tagsFor(g); expect(t.length, g).toBeGreaterThanOrEqual(6);
      expect(t.some(x => x.tone === 'POS') && t.some(x => x.tone === 'NEG'), g).toBe(true);
      expect(new Set(t.map(x => x.id)).size, g).toBe(t.length);
      for (const x of t) expect(/[ऀ-ॿ]/.test(x.hi), `${g}/${x.id}`).toBe(true);
    }
  });
  it('only a customer and an owner are private persons', () => {
    expect(Object.entries(GROUPS).filter(([, v]) => v.private).map(([k]) => k).sort()).toEqual(['CUSTOMER', 'OWNER']);
  });
});

describe('what a reviewer may write', () => {
  it('stars 1 to 5, whole numbers only', () => {
    for (const r of [0, 6, 2.5, -1, 'x', null, undefined, NaN]) expect(reviewProblem('BROKER', { rating: r }), String(r)).toMatch(/1 to 5/);
    for (const r of [1, 3, 5, '4']) expect(reviewProblem('BROKER', { rating: r, tags: ['HONEST'] }), String(r)).toBeNull();
  });
  it('a low rating needs a reason (a tag or a line); a good one needs none', () => {
    expect(reviewProblem('BROKER', { rating: 1 })).toMatch(/low rating/);
    expect(reviewProblem('BROKER', { rating: 2, remark: 'bad' })).toMatch(/low rating/);
    expect(reviewProblem('BROKER', { rating: 2, tags: ['MISLEADING'] })).toBeNull();
    expect(reviewProblem('BROKER', { rating: 1, remark: 'He showed a different flat than the one listed.' })).toBeNull();
    expect(reviewProblem('BROKER', { rating: 5 })).toBeNull();
  });
  it('tags must belong to this kind of person, be unique and at most four', () => {
    expect(reviewProblem('BROKER', { rating: 5, tags: ['PAYS_ON_TIME'] })).toMatch(/does not fit/);       // a builder's tag
    expect(reviewProblem('BUILDER', { rating: 5, tags: ['PAYS_ON_TIME'] })).toBeNull();
    expect(reviewProblem('BROKER', { rating: 5, tags: ['HONEST', 'HONEST'] })).toMatch(/does not fit/);
    expect(reviewProblem('BROKER', { rating: 5, tags: ['HONEST', 'RESPONSIVE', 'ACCURATE', 'FAIR_SPLIT', 'MISLEADING'] })).toMatch(new RegExp(`up to ${MAX_TAGS}`));
    expect(reviewProblem('BROKER', { rating: 5, tags: 'HONEST' as any })).toMatch(/list/);
    expect(cleanTags(['HONEST', 'HONEST', 3, 'X'])).toEqual(['HONEST', 'X']);
  });
  it('no links, e-mails or phone numbers in a remark — they are how a review becomes an advert or a threat', () => {
    for (const bad of ['call me on 9826112233', 'ph +91 98261 12233', 'whatsapp 98261-12233 now', 'see https://x.in/a', 'visit www.mybroker.com', 'mail me a@b.co', 'my site best.in is cheaper', 'x'.repeat(281)]) expect(remarkProblem(bad), bad.slice(0, 30)).toBeTruthy();
    for (const ok of ['Paid the full ₹2,50,00,000 on time.', 'Visited on 12/03/2026 at 4 pm, 3 BHK in Tower 2.', 'अच्छा अनुभव रहा', '', undefined, null]) expect(remarkProblem(ok), String(ok)).toBeNull();
  });
});

describe('the numbers', () => {
  const mk = (reviewerId: string, rating: number, at: string, tags: string[] = [], extra: any = {}) => ({ reviewerId, rating, at, tags, ...extra });
  it('nothing → zero and "early"', () => { expect(summarize([])).toMatchObject({ avg: 0, count: 0, early: true }); });
  it('one person counts once: his latest review', () => {
    const s = summarize([mk('a', 1, '2026-01-01', ['MISLEADING']), mk('a', 5, '2026-03-01', ['HONEST']), mk('b', 3, '2026-02-01')]);
    expect(s.count).toBe(2); expect(s.avg).toBe(4); expect(s.stars[5]).toBe(1); expect(s.stars[1]).toBe(0);
    expect(s.tags).toEqual([{ id: 'HONEST', n: 1 }]);                                             // his old tag is gone with his old review
  });
  it('an edit moves a review to "latest" even when it was written earlier', () => {
    const s = summarize([mk('a', 2, '2026-03-01', [], { editedAt: '2026-04-01' }), mk('a', 5, '2026-02-01')]);
    expect(s.avg).toBe(2);
  });
  it('a review GENZ hid counts for nothing', () => {
    const s = summarize([mk('a', 5, '2026-01-01', [], { status: 'HIDDEN' }), mk('b', 3, '2026-01-02')]);
    expect(s).toMatchObject({ count: 1, avg: 3 });
  });
  it('the average is rounded to one place and "early" ends at the third reviewer', () => {
    const three = summarize([mk('a', 5, 'x'), mk('b', 4, 'y'), mk('c', 4, 'z')]);
    expect(three.avg).toBe(4.3); expect(three.early).toBe(false); expect(EARLY_BELOW).toBe(3);
    expect(summarize([mk('a', 5, 'x'), mk('b', 4, 'y')]).early).toBe(true);
  });
  it('tags are ranked by how many different people gave them', () => {
    const s = summarize([mk('a', 5, '1', ['HONEST', 'RESPONSIVE']), mk('b', 5, '2', ['HONEST']), mk('c', 4, '3', ['RESPONSIVE', 'HONEST'])]);
    expect(s.tags[0]).toEqual({ id: 'HONEST', n: 3 }); expect(s.tags[1]).toEqual({ id: 'RESPONSIVE', n: 2 });
  });
});

describe('who may be found and opened', () => {
  const v = (role: string) => ({ id: 'V', role });
  const t = (role: string, extra: any = {}) => ({ id: 'T', role, ...extra });
  it('a professional shows to every member, unless he switched his name search off', () => {
    for (const viewer of ['BROKER', 'BUYER_TENANT', 'PROPERTY_OWNER', 'CONTRACTOR']) expect(mayOpenProfile(v(viewer), t('BROKER')), viewer).toBe(true);
    expect(mayOpenProfile(v('BROKER'), t('BROKER', { visible: false }))).toBe(false);
    expect(mayOpenProfile(v('BROKER'), t('BROKER', { visible: false }), true)).toBe(true);        // …but not a way to dodge a review: exact mobile / code, or having worked together, still opens him
    expect(mayOpenProfile(v('BROKER'), t('DEVELOPER_BUILDER', { visible: undefined }))).toBe(true);
  });
  it('a customer or an owner opens only for a professional (or someone who really worked with him)', () => {
    for (const viewer of ['BROKER', 'DEVELOPER_BUILDER', 'LEGAL_COUNSEL', 'TEAM_MEMBER']) { expect(mayOpenProfile(v(viewer), t('BUYER_TENANT')), viewer).toBe(true); expect(canLookupPrivate(viewer)).toBe(true); }
    for (const viewer of ['BUYER_TENANT', 'PROPERTY_OWNER', 'CONTRACTOR']) { expect(mayOpenProfile(v(viewer), t('BUYER_TENANT')), viewer).toBe(false); expect(canLookupPrivate(viewer)).toBe(false); }
    expect(mayOpenProfile(v('PROPERTY_OWNER'), t('BUYER_TENANT'), true)).toBe(true);
  });
  it('yourself and GENZ staff always; a shop partner has no profile at all', () => {
    expect(mayOpenProfile({ id: 'X', role: 'BUYER_TENANT' }, { id: 'X', role: 'BUYER_TENANT' })).toBe(true);
    expect(mayOpenProfile(v('ADMIN'), t('BUYER_TENANT'))).toBe(true); expect(mayOpenProfile(v('SUPERADMIN'), t('PROPERTY_OWNER', { visible: false }))).toBe(true);
    expect(mayOpenProfile(v('BROKER'), t('GENZ_CONNECTOR'))).toBe(false);
  });
});

describe('what was typed in the search box', () => {
  it('a mobile number (with +91, spaces, dashes) → the last ten digits', () => {
    for (const q of ['9826112233', '+91 98261 12233', '098261-12233', '+91-9826112233']) expect(searchKind(q), q).toEqual({ kind: 'PHONE', q: '9826112233' });
  });
  it('a GZ code → exact code, upper-cased', () => { expect(searchKind('gz-brk-492001')).toEqual({ kind: 'CODE', q: 'GZ-BRK-492001' }); });
  it('words → text; under three letters or a half number → too short (so there is no browsing by "a")', () => {
    expect(searchKind('  Capital   Propex ')).toEqual({ kind: 'TEXT', q: 'Capital Propex' });
    expect(searchKind('ab').kind).toBe('TOO_SHORT'); expect(searchKind('').kind).toBe('TOO_SHORT'); expect(searchKind(undefined).kind).toBe('TOO_SHORT');
    expect(searchKind('98261').kind).toBe('TEXT');            // a half number is just a word: it can only match names, never a private person
    expect(searchKind('अब').kind).toBe('TOO_SHORT'); expect(searchKind('राहुल').kind).toBe('TEXT');
    expect(searchKind('x'.repeat(200)).q.length).toBe(40);
  });
  it('matching ignores case and extra spaces', () => { expect(norm('  Capital   PROPEX ')).toBe('capital propex'); });
  it('a private person is shown by first name and the first letter of the last: "Sunita Y."', () => {
    expect(shortName('Sunita Yadav')).toBe('Sunita Y.'); expect(shortName('Alok Kumar Pandey')).toBe('Alok P.'); expect(shortName('Dr. Alok Pandey')).toBe('Alok P.'); expect(shortName('Adv. Shri Ram Verma')).toBe('Ram V.'); expect(shortName('Dr. Rao')).toBe('Dr. R.'); expect(shortName('Madonna')).toBe('Madonna'); expect(shortName('')).toBe('—');
  });
});

describe('profile text and the edit window', () => {
  it('about / areas / languages / years are checked', () => {
    expect(profileProblem({ about: 'I help families buy their first home in Raipur.', areas: ['Shankar Nagar', 'Telibandha'], languages: ['Hindi', 'English'], years: 8 })).toBeNull();
    expect(profileProblem({ about: 'call 9826112233' })).toMatch(/profile/); expect(profileProblem({ about: 'x'.repeat(241) })).toMatch(/240/);
    expect(profileProblem({ areas: ['a'] })).toMatch(/areas/); expect(profileProblem({ areas: Array(7).fill('Telibandha') })).toMatch(/areas/); expect(profileProblem({ languages: 'Hindi' as any })).toMatch(/languages/);
    expect(profileProblem({ years: 61 })).toMatch(/0 to 60/); expect(profileProblem({ years: 1.5 })).toMatch(/0 to 60/); expect(profileProblem({ visible: 'yes' })).toMatch(/on or off/);
  });
  it('a review can be changed for 14 days after it was written', () => {
    expect(REVIEW_EDIT_DAYS).toBe(14);
    expect(editableUntil('2026-10-01T00:00:00.000Z')).toBe('2026-10-15T00:00:00.000Z');
  });
  it('report reasons are fixed', () => {
    expect(REPORT_REASONS.map(r => r.id)).toEqual(['FAKE', 'FALSE', 'ABUSIVE', 'PERSONAL', 'OTHER']); expect(isReportReason('FAKE')).toBe(true); expect(isReportReason('SPAM')).toBe(false);
    for (const r of REPORT_REASONS) expect(/[ऀ-ॿ]/.test(r.hi)).toBe(true);
    expect(TAGS.BROKER.length).toBeGreaterThan(0);
  });
});
