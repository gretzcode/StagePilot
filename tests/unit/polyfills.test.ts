import { describe, it, expect } from 'vitest';
import { installPolyfills } from '@/lib/polyfills';

describe('Global Polyfills & Compatibility', () => {
  it('installs Promise.withResolvers polyfill if not present', async () => {
    installPolyfills();
    expect(typeof Promise.withResolvers).toBe('function');

    const { promise, resolve, reject } = Promise.withResolvers<string>();
    expect(promise).toBeInstanceOf(Promise);
    expect(typeof resolve).toBe('function');
    expect(typeof reject).toBe('function');

    resolve('resolved-successfully');
    const result = await promise;
    expect(result).toBe('resolved-successfully');
  });

  it('handles promise rejection via Promise.withResolvers', async () => {
    installPolyfills();
    const { promise, reject } = Promise.withResolvers<string>();
    reject(new Error('test-rejection'));

    await expect(promise).rejects.toThrow('test-rejection');
  });
});
