const fs = require('fs');
const path = require('path');

const polyfill = "if (typeof Promise.withResolvers === 'undefined') {\n  Promise.withResolvers = function () {\n    let resolve, reject;\n    const promise = new Promise((res, rej) => {\n      resolve = res;\n      reject = rej;\n    });\n    return { promise, resolve, reject };\n  };\n}\n";

const sourcePath = path.resolve(__dirname, '../node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs');
const targetPath = path.resolve(__dirname, '../public/pdf.worker.min.mjs');

if (fs.existsSync(sourcePath)) {
  const content = fs.readFileSync(sourcePath, 'utf8');
  fs.writeFileSync(targetPath, polyfill + content, 'utf8');
  console.log('Successfully wrote public/pdf.worker.min.mjs');
} else {
  console.error('Source legacy worker not found at', sourcePath);
}
