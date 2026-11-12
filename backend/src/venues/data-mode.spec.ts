import { dataModeFor } from './venue';

describe('dataModeFor', () => {
  it('keeps unverified catalog data in DEMO', () => {
    expect(dataModeFor('DEMO_UNVERIFIED')).toBe('DEMO');
  });

  it('does not treat missing or unknown labels as verified', () => {
    expect(dataModeFor('')).toBe('DEMO');
    expect(dataModeFor('demo')).toBe('DEMO');
    expect(dataModeFor('UNVERIFIED')).toBe('DEMO');
  });

  it('accepts VERIFIED only when the catalog says so explicitly', () => {
    expect(dataModeFor('VERIFIED')).toBe('VERIFIED');
  });
});
