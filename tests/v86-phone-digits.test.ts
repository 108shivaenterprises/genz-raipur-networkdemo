import { describe, it, expect } from 'vitest';
import { containsPhone } from '../src/shared/clientRoomRules';
describe('containsPhone catches digit tricks', () => {
  it('plain, spaced, +91', () => { expect(containsPhone('call 9876543210')).toBe(true); expect(containsPhone('+91 98765 43210')).toBe(true); });
  it('Devanagari digits', () => { expect(containsPhone('९८७६५४३२१०')).toBe(true); });
  it('Arabic-Indic digits', () => { expect(containsPhone('٩٨٧٦٥٤٣٢١٠')).toBe(true); });
  it('dots, commas, slashes between digits', () => { expect(containsPhone('98765/43210')).toBe(true); expect(containsPhone('98,76,54,32,10')).toBe(true); });
  it('normal text and prices are fine', () => { expect(containsPhone('budget 50 lakh, 2 BHK near Shankar Nagar')).toBe(false); expect(containsPhone('rate 4500 per sqft')).toBe(false); });
});
