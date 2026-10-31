import { freePort } from './helpers/port';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { TASK_DEFINITIONS, COMMON_DD_CHECKS, CONDITIONAL_DD_CHECKS } from '../server/dealTemplates.js';
import { TEMPLATE_HI } from '../src/lib/templateHi.js';
import { PERMISSION_HI } from '../src/lib/permHi.js';
import { PERMISSION_CATALOG } from '../server/permissions.js';
import { localizeActivity } from '../src/lib/activityHi.js';

/**
 * v16.5 — regression tests from the second all-roles audit:
 * invented data (phones, stock photos, fake file sizes, demo prefills, fake stats), over-claims
 * (escrow, "RERA Section …", "legally binding"), consent (DPDP) and a few real defects.
 */
const PORT = await freePort();
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess;
let dir: string;
let cfg: any;
const jar: Record<string, string> = {};
const root = path.resolve(import.meta.dirname, '..');
const DEAL = 'DEAL-2026-001';
const PROP = 'PROP-RAI-101';

async function login(email: string) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: cfg.demoPassword }) });
  expect(r.status).toBe(200);
  return r.headers.get('set-cookie')!.split(';')[0];
}
const call = (cookie: string | undefined, method: string, url: string, body?: unknown) =>
  fetch(B + url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
const acct = (role: string, i = 0) => cfg.demoAccounts.filter((a: any) => a.role === role && a.verificationStatus === 'VERIFIED')[i];
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf-8');
const uiFiles = () => readdirSync(path.join(root, 'src/components')).filter(f => f.endsWith('.tsx')).map(f => [f, read('src/components/' + f)] as const);

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v165-'));
  mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(root, 'node_modules/.bin/tsx'), [path.join(root, 'server.ts')], {
    cwd: dir,
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 250));
  }
  expect(cfg).toBeTruthy();
  jar.ADMIN = await login(acct('ADMIN').email);
  jar.B1 = await login('vikram.realty@gmail.com');
  jar.B2 = await login('amit.verma@shrikriparealty.in');
}, 40_000);

afterAll(async () => { proc?.kill(); await new Promise(r => setTimeout(r, 500)); if (dir) rmSync(dir, { recursive: true, force: true }); });

describe('the UI never invents data or over-claims', () => {
  it('no demo prefills, invented phone numbers, stock photos or fake stats are left in any screen', () => {
    const banned: Array<[RegExp, string]> = [
      [/Dr\. Alok Pandey/, 'demo client name'],
      [/98271 44520/, 'demo client phone'],
      [/98261 44002/, 'invented fallback phone number'],
      [/Rakesh Sharma|Amit Patel/, 'demo party names'],
      [/USR-BRK-00\d/, 'seed user id used as a fallback'],
      [/unsplash\.com\/photo/, 'stock photo used as a stand-in'],
      [/\|\| 18\b|\|\| 9\b/, 'fake "18 visits / 9 deals" stats'],
      [/RERA Section (10|11|34)/, 'invented RERA-section badge'],
      [/RERA Verified/, 'RERA Verified claim'],
      [/legally covenant|legally payable|legally bound|binding digital agreement/i, 'legal over-claim'],
    ];
    for (const [file, full] of uiFiles()) {
      // an example inside a placeholder ("e.g. Dr. Alok Pandey") is a hint, not a prefilled value
      const src = full.split('\n').filter(l => !/placeholder=/.test(l)).join('\n');
      for (const [re, why] of banned) expect(re.test(src), `${file}: ${why}`).toBe(false);
    }
  });

  it('GENZ never calls itself an escrow / vault of money or an arbitration tribunal in the UI', () => {
    for (const [file, src] of uiFiles()) {
      if (file !== 'LegalPages.tsx') expect(/escrow/i.test(src), `${file}: escrow wording`).toBe(false); // the legal page only says GENZ is NOT an escrow service
      expect(/Arbitration & Compliance Tribunal|Tribunal Ruling|Encrypted Deal Room Chat/i.test(src), `${file}: tribunal / encryption claim`).toBe(false);
    }
  });

  it('the deal-room screen is fully bilingual and the call simulator is gone', () => {
    const src = read('src/components/DealRoomsView.tsx');
    expect(src).toContain('useTx()');
    expect(src).toContain('useTemplateHi()');
    expect(src).not.toContain('activeCallModal'); // it dialled an invented number and promised an "encrypted HD video call"
    expect(src).not.toContain('Encrypted HD Video');
    // vault grants send a real recipient id, never a seed account
    expect(src).toContain("'VERIFIED_ALL'");
    expect(src).toContain('otherBrokerId');
  });

  it('every line of the task / due-diligence templates has a Hindi reading', () => {
    const lines = new Set<string>();
    for (const t of TASK_DEFINITIONS) { lines.add(t.title); lines.add(t.description); }
    for (const d of [...COMMON_DD_CHECKS, ...CONDITIONAL_DD_CHECKS]) { lines.add(d.title); lines.add(d.description); lines.add(d.requiredDocument); lines.add(d.acceptableEvidenceDescription); }
    const missing = [...lines].filter(l => !TEMPLATE_HI[l]);
    expect(missing).toEqual([]);
  });

  it('every permission in the Control Center matrix has a Hindi description', () => {
    const missing = Object.keys(PERMISSION_CATALOG).filter(k => !PERMISSION_HI[k]);
    expect(missing).toEqual([]);
    expect(Object.keys(PERMISSION_HI).filter(k => !(k in PERMISSION_CATALOG))).toEqual([]);
  });

  it('the server-written activity feed lines are readable in Hindi and unknown lines pass through untouched', () => {
    const lbl = ((kind: string, v: string) => (kind === 'dealStage' && v === 'Negotiation' ? 'बातचीत' : kind === 'propertyType' && v === 'Flat' ? 'फ़्लैट' : v)) as any;
    const one = (title: string, description: string) => localizeActivity({ title, description }, 'hi', lbl);
    expect(one('New Property Listing Published', '"3BHK Flat" (Flat) listed in Shankar Nagar, Raipur with confidential price protection.').description)
      .toBe('"3BHK Flat" (फ़्लैट) Shankar Nagar, Raipur में लिस्ट हुई — कीमत गोपनीय सुरक्षा के साथ।');
    expect(one('Deal Room Active: Stage "Negotiation"', 'Deal D-1 for Villa between A B & C D. Expected Brokerage: ₹5,70,000.').title).toBe('डील रूम चालू: स्टेज "बातचीत"');
    expect(one('x', 'Deal D-1 for Villa between A B & C D. Expected Brokerage: ₹5,70,000.').description).toContain('अपेक्षित ब्रोकरेज: ₹5,70,000');
    expect(one('Partnership paused', "Your partnership on Skyline is paused: monsoon.").description).toBe('आपकी Skyline पर पार्टनरशिप रोकी गई है: monsoon।');
    expect(one('Partnership ended', "Ravi's partnership on Skyline was ended.").description).toBe('Ravi की Skyline पर पार्टनरशिप समाप्त कर दी गई।');
    expect(one('Sales Associate Broker Appointed', 'Ravi appointed as authorized sales associate for Skyline (2% commission).').description).toContain('2% कमीशन');
    expect(one('Something new', 'Brand new sentence').description).toBe('Brand new sentence');
    expect(localizeActivity({ title: 'Partner shortlisted', description: 'Whatever' }, 'en', lbl)).toEqual({ title: 'Partner shortlisted', description: 'Whatever' });
  });
});

describe('deal room: contact details and signatures', () => {
  it('only the two co-brokers (and admins) get a broker phone number; owner and legal counsel do not', async () => {
    const mine = await (await call(jar.B1, 'GET', `/api/deals/${DEAL}`)).json();
    expect(typeof mine.participants.introducingBroker.phone).toBe('string');
    const legal = await login(acct('LEGAL_COUNSEL').email);
    const l = await (await call(legal, 'GET', `/api/deals/${DEAL}`)).json();
    expect(l.participants.introducingBroker.phone).toBeUndefined();
    expect(l.participants.closingBroker.phone).toBeUndefined();
    for (let i = 0; i < 3; i++) {
      const a = acct('PROPERTY_OWNER', i); if (!a) break;
      const owner = await login(a.email);
      const r = await call(owner, 'GET', `/api/deals/${DEAL}`);
      if (r.status === 200) {
        const o = await r.json();
        expect(o.participants.introducingBroker.phone).toBeUndefined();
        expect(o.participants.closingBroker.phone).toBeUndefined();
      }
    }
  });

  it('a TDS rate of 0% is kept (it used to become 5%), a missing rate gets the platform default, and the signer\'s e-mail / IP stay private', async () => {
    const body = (tds0: number | undefined) => ({
      totalAgreedBrokerage: 600000, payer: 'SPLIT_EQUAL', contractualBasis: 'Test basis', calculationBasis: 'PERCENTAGE_OF_TOTAL_DEAL_VALUE',
      proposalReason: 'test',
      allocations: [
        { participantId: 'USR-BRK-002', allocationPct: 40, taxDeductionTdsPct: tds0, invoiceRequired: true },
        { participantId: 'USR-BRK-001', allocationPct: 60, invoiceRequired: true },
      ],
    });
    const r = await call(jar.B1, 'POST', `/api/deals/${DEAL}/commission-agreements/propose`, body(0));
    expect(r.status).toBe(200);
    const a = (await r.json()).agreement;
    expect(a.allocations.find((x: any) => x.participantId === 'USR-BRK-002').taxDeductionTdsPct).toBe(0);
    expect(a.allocations.find((x: any) => x.participantId === 'USR-BRK-001').taxDeductionTdsPct).toBeGreaterThan(0);
    // the counterparty sees who signed, never the signer's e-mail or IP
    const theirs = await (await call(jar.B2, 'GET', `/api/deals/${DEAL}/commission-agreements`)).json();
    const v = theirs.agreements.find((x: any) => x.id === a.id);
    const proposerTrail = v.requiredApprovals.find((ap: any) => ap.userId === 'USR-BRK-001').signatureAuditTrail;
    expect(proposerTrail.signerName).toBeTruthy();
    expect(proposerTrail.signerEmail).toBeUndefined();
    expect(proposerTrail.ipAddress).toBeUndefined();
    // a claimed Aadhaar e-Sign / DSC is never recorded as such
    const signed = await (await call(jar.B2, 'POST', `/api/deals/${DEAL}/commission-agreements/${a.id}/approve`, { authMethod: 'DSC' })).json();
    expect(signed.success).toBe(true);
    const mine = signed.agreement.requiredApprovals.find((ap: any) => ap.userId === 'USR-BRK-002').signatureAuditTrail;
    expect(mine.authMethod).toBe('COMPLIANT_E_SIGN_PKEY');
  });

  it('a task completed with no link keeps a plain reference note — never an invented PDF', async () => {
    const tasks = (await (await call(jar.B1, 'GET', `/api/deals/${DEAL}/tasks`)).json()).tasks;
    const t = tasks.find((x: any) => x.taskStatus !== 'COMPLETED' && x.isApplicable);
    expect(t).toBeTruthy();
    const r = await (await call(jar.B1, 'POST', `/api/deals/${DEAL}/tasks/${t.id}/complete`, { completionNote: 'done', evidenceAttachments: [{ name: 'Seller call note' }] })).json();
    expect(r.success).toBe(true);
    const ev = r.task.evidenceAttachments.at(-1);
    expect(ev.name).toBe('Seller call note');
    expect(ev.url).toBe('');
  });

  it('vault grants: "all verified members" works, a specific broker gets exactly that broker, "preview only" is kept', async () => {
    const assets = (await (await call(jar.B1, 'GET', `/api/properties/${PROP}/vault/assets`)).json()).assets;
    expect(assets.length).toBeGreaterThan(0);
    const ids = [assets[0].id];
    const all = await call(jar.B1, 'POST', `/api/properties/${PROP}/vault/grants`, { recipientType: 'VERIFIED_GROUP', recipientId: 'VERIFIED_ALL', assetIds: ids, permissionLevel: 'PREVIEW', locationPrecisionPermitted: 'GENERAL_AREA', expiresInDays: 7 });
    expect(all.status).toBe(200);
    expect((await all.json()).grant.permissionLevel).toBe('PREVIEW');
    const one = await (await call(jar.B1, 'POST', `/api/properties/${PROP}/vault/grants`, { recipientType: 'BROKER', recipientId: 'USR-BRK-002', assetIds: ids, permissionLevel: 'VIEW' })).json();
    expect(one.grant.recipientName).toMatch(/Amit/);
    // a made-up recipient is refused
    expect((await call(jar.B1, 'POST', `/api/properties/${PROP}/vault/grants`, { recipientType: 'BROKER', recipientId: 'USR-NOBODY', assetIds: ids })).status).toBe(400);
  });

  it('the vault does not invent a file size, and a listing without photos gets no stock photo', async () => {
    const up = await (await call(jar.B1, 'POST', `/api/properties/${PROP}/vault/assets`, { originalFileName: 'note.pdf', category: 'OTHER_ATTACHMENT', fileUrl: 'https://example.com/note.pdf' })).json();
    expect(up.asset.fileSizeBytes).toBe(0);
    const res = await call(jar.B1, 'POST', '/api/properties', {
      title: 'Photo-less test flat in Pune', description: 'A flat that is listed without any photograph.',
      propertyType: 'Residential Flat', transactionType: 'Sale', state: 'Maharashtra', city: 'Pune', locality: 'Baner',
      pincode: '411045', addressHidden: 'Flat 12, Test Society, Baner, Pune', askingPrice: 9500000, ownerApprovedNetPrice: 9000000,
      ownerName: 'Someone Else', ownerPhone: '9876500011', tags: ['Gated Society'],
    });
    expect([200, 201]).toContain(res.status);
    expect((await res.json()).property.images).toEqual([]);
  });
});

describe('due diligence: honest paperwork records', () => {
  let itemId = '';
  it('a recorded paperwork entry carries no invented number, issuer, size or fingerprint', async () => {
    const items = (await (await call(jar.B1, 'GET', `/api/due-diligence/property/${PROP}`)).json()).items;
    itemId = items.find((i: any) => i.isApplicable)?.id;
    expect(itemId).toBeTruthy();
    const r = await call(jar.B1, 'POST', `/api/due-diligence/items/${itemId}/evidence`, { fileName: 'khasra.pdf', documentType: 'TITLE_DOCUMENT', contentSha256: 'not-a-hash' });
    expect(r.status).toBe(200);
    const ev = (await r.json()).evidence;
    expect(ev.documentNumber).toBeUndefined();
    expect(ev.issuer).toBeUndefined();
    expect(ev.fileSizeBytes).toBeUndefined();
    expect(ev.checksumSha256).toBeUndefined(); // an invalid hash is dropped, never replaced by a made-up one
    expect(ev.fileUrl).toBe('');
    const good = 'A'.repeat(64);
    const r2 = await (await call(jar.B1, 'POST', `/api/due-diligence/items/${itemId}/evidence`, { fileName: 'khasra2.pdf', contentSha256: good })).json();
    expect(r2.evidence.checksumSha256).toBe('a'.repeat(64));
  });

  it('an INFORMATIONAL issue (offered by the form) is accepted', async () => {
    const r = await call(jar.ADMIN, 'POST', '/api/due-diligence/issues', { propertyId: PROP, severity: 'INFORMATIONAL', title: 'Minor note on boundary', description: 'Informational remark for the file.' });
    expect(r.status).toBe(200);
  });
});

describe('DPDP: a construction enquiry needs the customer\'s consent', () => {
  const lead = (extra: object) => ({
    title: 'Villa interior fitout', projectType: 'Commercial Interior Fitout', approximateLocation: 'Shankar Nagar, Raipur', exactAddressHidden: 'Plot 12, Shankar Nagar, Raipur',
    estimatedBudget: 2500000, scopeDescription: 'Full interior fitout for a 3 BHK villa.', timeline: '3 months', customerNameMasked: 'R. Dewangan', customerPhoneHidden: '9876543210', referralCommissionPct: 1, ...extra,
  });
  it('is refused without consent and stored with a consent timestamp when confirmed', async () => {
    expect((await call(jar.B1, 'POST', '/api/construction-leads', lead({}))).status).toBe(400);
    expect((await call(jar.B1, 'POST', '/api/construction-leads', lead({ customerConsent: false }))).status).toBe(400);
    const ok = await call(jar.B1, 'POST', '/api/construction-leads', lead({ customerConsent: true }));
    expect(ok.status).toBe(200);
    expect((await ok.json()).lead.customerConsentAt).toBeTruthy();
  });
});
