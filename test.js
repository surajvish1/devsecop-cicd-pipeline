const assert = require('assert');
const http = require('http');

process.env.PORT = 3999;
require('./server.js');

const req = http.get('http://localhost:3999/health', (res) => {
  let body = '';
  res.on('data', (chunk) => (body += chunk));
  res.on('end', () => {
    assert.strictEqual(res.statusCode, 200, `Expected 200, got ${res.statusCode}`);
    const parsed = JSON.parse(body);
    assert.strictEqual(parsed.status, 'OK', `Expected status 'OK', got '${parsed.status}'`);
    console.log('PASS: /health returns 200 with status OK');
    process.exit(0);
  });
});

req.on('error', (err) => {
  console.error('FAIL:', err.message);
  process.exit(1);
});
