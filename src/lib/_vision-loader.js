/**
 * Whacka client SDK — _vision-loader (stub)
 *
 * The implementation runs on the Whacka platform and is provided to your app at
 * runtime; it is intentionally NOT part of this export. This stub only keeps
 * your imports resolving and documents which Whacka APIs your code uses. Your
 * own code (components, pages, hooks) is the real, complete export. See README.
 */

const __wk = (path) =>
  new Proxy(function () {}, {
    get: (_t, prop) =>
      typeof prop === 'symbol' || prop === 'then' ? undefined : __wk(path + '.' + prop),
    apply: () => {
      throw new Error(
        '`' + path + '` runs on the Whacka platform and is not available in exported code.'
      );
    },
  });

export const VISION_CDN = __wk('VISION_CDN');
export const WASM_CDN = __wk('WASM_CDN');
export const withTimeout = __wk('withTimeout');
export const isSupported = __wk('isSupported');
export const openCamera = __wk('openCamera');
export const loadVisionModule = __wk('loadVisionModule');
export const createDetectionLoop = __wk('createDetectionLoop');
