/**
 * Global Browser & Runtime Polyfills
 * Ensures cross-browser compatibility across modern & legacy runtimes
 * (including WebViews, older Safari, Chrome, Firefox, Node.js, and Cloudflare Workers).
 */

export function installPolyfills(): void {
  // Polyfill for ES2024 Promise.withResolvers (required by pdfjs-dist v4+)
  if (typeof Promise !== 'undefined' && typeof (Promise as unknown as { withResolvers?: unknown }).withResolvers !== 'function') {
    // @ts-expect-error - ES2024 Promise.withResolvers polyfill
    Promise.withResolvers = function <T>() {
      let resolve!: (value: T | PromiseLike<T>) => void;
      let reject!: (reason?: unknown) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    };
  }
}

// Auto-install polyfills immediately on module import
installPolyfills();
