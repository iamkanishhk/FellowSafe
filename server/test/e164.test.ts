import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { toE164 } from '../src/lib/e164.js';

describe('toE164', () => {
  const accepted: [string, string, string, string][] = [
    ['already E.164', '+919876543210', '91', '+919876543210'],
    ['spaces and punctuation', '+91 98765 43210', '91', '+919876543210'],
    ['surrounding whitespace', '  +91 98765 43210  ', '91', '+919876543210'],
    ['00 international prefix', '0091 98765 43210', '91', '+919876543210'],
    ['national trunk prefix', '098765 11111', '91', '+9109876511111'],
    ['explicit plus with foreign code', '+1 (415) 555-0132', '91', '+14155550132'],
    ['default code already leading', '1234567890', '1', '+1234567890'],
    ['default code prepended', '987654321', '1', '+1987654321'],
  ];

  for (const [label, input, cc, expected] of accepted) {
    it(`normalises ${label}`, () => {
      assert.equal(toE164(input, cc), expected);
    });
  }

  const rejected: [string, string][] = [
    ['empty string', ''],
    ['no digits', 'abc'],
    ['too short to carry a calling code', '12'],
    ['longer than E.164 allows', '+912345678901234567'],
  ];

  for (const [label, input] of rejected) {
    it(`rejects ${label}`, () => {
      assert.throws(() => toE164(input, '91'), /not a valid E\.164 number/);
    });
  }

  it('defaults to India as the calling code', () => {
    assert.equal(toE164('098765 11111'), '+9109876511111');
  });
});
