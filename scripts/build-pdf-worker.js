const fs = require('fs');
const path = require('path');

const polyfill = `(function() {
  var g = typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : this;
  var P = g && g.Promise ? g.Promise : Promise;
  if (P && typeof P.withResolvers !== 'function') {
    P.withResolvers = function() {
      var resolve, reject;
      var promise = new P(function(res, rej) {
        resolve = res;
        reject = rej;
      });
      return { promise: promise, resolve: resolve, reject: reject };
    };
  }
  if (typeof Promise !== 'undefined' && typeof Promise.withResolvers !== 'function') {
    Promise.withResolvers = P.withResolvers;
  }
})();
`;

const sourcePath = path.resolve(__dirname, '../node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs');
const targetPath = path.resolve(__dirname, '../public/pdf.worker.min.mjs');

if (fs.existsSync(sourcePath)) {
  const content = fs.readFileSync(sourcePath, 'utf8');
  fs.writeFileSync(targetPath, polyfill + content, 'utf8');
  console.log('Successfully wrote public/pdf.worker.min.mjs');
} else {
  console.error('Source legacy worker not found at', sourcePath);
}
