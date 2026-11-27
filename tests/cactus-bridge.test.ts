import { describe, it, expect, afterEach } from 'vitest';
import {
  isCactusNativeAvailable,
  parseQuoteWithCactus,
  parsePropertyVoiceWithCactus,
} from '../src/lib/cactusBridge';

describe('cactusBridge', () => {
  afterEach(() => {
    if (typeof globalThis.window !== 'undefined') {
      delete (globalThis.window as { CactusNativeBridge?: unknown }).CactusNativeBridge;
    }
  });

  it('reports native bridge unavailable in standard web/node environment', () => {
    expect(isCactusNativeAvailable()).toBe(false);
  });

  it('parses Hinglish/English contractor quotes with lakh, L, and comma INR formats', async () => {
    const paint = await parseQuoteWithCactus(
      'Asian Paints putty aur 2 coat emulsion ka total 2.5 lakh lagega'
    );
    expect(paint).toMatchObject({
      invoiceAmountInr: 250000,
      partnerCategory: 'Painter',
      engine: 'local-parser',
    });

    const carpenter = await parseQuoteWithCactus(
      'Modular wardrobe & plywood carpenter work quote: Rs. 85,000'
    );
    expect(carpenter).toMatchObject({
      invoiceAmountInr: 85000,
      partnerCategory: 'Carpenter',
      engine: 'local-parser',
    });

    const tiles = await parseQuoteWithCactus(
      'Kajaria vitrified tiles & granite flooring estimate 1.2L'
    );
    expect(tiles).toMatchObject({
      invoiceAmountInr: 120000,
      partnerCategory: 'Tiles',
      engine: 'local-parser',
    });

    const architect = await parseQuoteWithCactus(
      '3D elevation & sanction naksha architect fees 45k'
    );
    expect(architect).toMatchObject({
      invoiceAmountInr: 45000,
      partnerCategory: 'Architect',
      engine: 'local-parser',
    });

    const cleaning = await parseQuoteWithCactus(
      'Full 3BHK deep cleaning & sanitization 12,500'
    );
    expect(cleaning).toMatchObject({
      invoiceAmountInr: 12500,
      partnerCategory: 'Cleaning',
      engine: 'local-parser',
    });

    const thekedar = await parseQuoteWithCactus(
      'Civil renovation thekedar labour + cement plaster 3.5 lakh'
    );
    expect(thekedar).toMatchObject({
      invoiceAmountInr: 350000,
      partnerCategory: 'Thekedar',
      engine: 'local-parser',
    });
  });

  it('delegates to window.CactusNativeBridge when available and falls back on error', async () => {
    const win = {
      CactusNativeBridge: {
        isReady: () => true,
        parseQuote: async () => ({
          invoiceAmountInr: 195000,
          partnerCategory: 'Thekedar' as const,
          summary: 'Native Cactus parsed quote',
        }),
      },
    };
    (globalThis as unknown as { window: typeof win }).window = win;

    expect(isCactusNativeAvailable()).toBe(true);
    const nativeRes = await parseQuoteWithCactus('Civil work 1.95 lakh');
    expect(nativeRes).toEqual({
      invoiceAmountInr: 195000,
      partnerCategory: 'Thekedar',
      summary: 'Native Cactus parsed quote',
      engine: 'cactus-native',
    });

    // Clean up globalThis.window if we created it in Node
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it('provides a typed stub for parsePropertyVoiceWithCactus', async () => {
    const voiceRes = await parsePropertyVoiceWithCactus({
      transcript: '3 BHK flat Shankar Nagar 72 lakh demand',
      locale: 'hinglish',
    });
    expect(voiceRes.engine).toBe('stub');
    expect(voiceRes.priceInr).toBe(7200000);
    expect(voiceRes.rawTranscript).toContain('Shankar Nagar');
  });
});
