const { sanitizeText } = require('../src/sanitize');

function assert(name, cond) {
  if (!cond) {
    console.error(`FAIL: ${name}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${name}`);
  }
}

assert('removes script tags', sanitizeText('<script>alert(1)</script>hello') === 'hello');
assert('strips angle brackets', sanitizeText('<b>bold</b>') === 'bbold/b');
assert('removes javascript: URIs', !sanitizeText('javascript:alert(1)').includes('javascript'));
assert('trims length', sanitizeText('a'.repeat(600), { maxLen: 100 }).length === 100);
assert('keeps normal text', sanitizeText(' Hello World ') === 'Hello World');

if (process.exitCode) {
  console.error('Some tests failed.');
} else {
  console.log('All sanitize tests passed.');
}
