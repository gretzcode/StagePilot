/**
 * Global Browser & Runtime Polyfills
 * Ensures cross-browser compatibility across modern & legacy runtimes
 * (including WebViews, older Safari, Chrome, Firefox, Node.js, and Cloudflare Workers).
 */

export function installPolyfills(): void {
  const g =
    typeof globalThis !== "undefined"
      ? globalThis
      : typeof window !== "undefined"
      ? window
      : typeof self !== "undefined"
      ? self
      : global;

  const P = (g as unknown as { Promise?: typeof Promise }).Promise || Promise;

  if (P && typeof (P as unknown as { withResolvers?: unknown }).withResolvers !== "function") {
    // @ts-expect-error - ES2024 Promise.withResolvers polyfill
    P.withResolvers = function <T>() {
      let resolve!: (value: T | PromiseLike<T>) => void;
      let reject!: (reason?: unknown) => void;
      const promise = new P<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    };
  }

  if (typeof Promise !== "undefined" && typeof (Promise as unknown as { withResolvers?: unknown }).withResolvers !== "function") {
    // @ts-expect-error - ES2024 Promise.withResolvers polyfill
    Promise.withResolvers = P.withResolvers;
  }
}

// Auto-install polyfills immediately on module import
installPolyfills();
