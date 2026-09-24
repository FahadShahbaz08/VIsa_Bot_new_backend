const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../app');
const serverEntry = require('../server');
const originalConnect = mongoose.connect;
let mongo, server, base, attempts = 0;

before(async () => {
  // Import the deployed handler without calling start() or connecting manually.
  delete process.env.MONGO_URI;
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  mongoose.connect = originalConnect;
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

test('both deployment entrypoints export the same callable Express handler', () => {
  assert.equal(typeof serverEntry, 'function');
  assert.equal(serverEntry, app);
  assert.equal(serverEntry.app, app);
});
test('public liveness and CORS preflight do not require MongoDB', async () => {
  assert.equal(mongoose.connection.readyState, 0);
  assert.equal((await fetch(base)).status, 200);
  assert.equal((await fetch(base + '/admin/users', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'GET' } })).status, 204);
});
test('missing configuration returns an actionable 503 instead of a query timeout', async () => {
  for (const [path, method] of [['/admin/users', 'GET'], ['/auth/login', 'POST']]) {
    const response = await fetch(base + path, { method });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal((await response.json()).code, 'DATABASE_NOT_CONFIGURED');
  }
});
test('failed connection produces a sanitized response and allows retry', async () => {
  process.env.MONGO_URI = 'mongodb://private-user:private-password@invalid/test';
  mongoose.connect = async () => { throw new Error(process.env.MONGO_URI); };
  try {
    const response = await fetch(base + '/admin/users');
    assert.equal(response.status, 503);
    const body = await response.text();
    assert.ok(body.includes('DATABASE_UNAVAILABLE'));
    assert.ok(!body.includes('private-user') && !body.includes('private-password'));
  } finally { mongoose.connect = originalConnect; }
});
test('concurrent cold requests connect once and fetch users without local startup', async () => {
  mongo = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongo.getUri();
  mongoose.connect = async (...args) => { attempts++; return originalConnect.apply(mongoose, args); };
  const responses = await Promise.all(Array.from({ length: 5 }, () => fetch(base + '/admin/users')));
  for (const response of responses) {
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { users: [] });
  }
  assert.equal(attempts, 1);
  assert.equal(mongoose.connection.readyState, 1);
  assert.equal((await fetch(base + '/admin/users')).status, 200);
  assert.equal(attempts, 1);
});
test('a disconnected warm instance reconnects on the next API request', async () => {
  await mongoose.disconnect();
  assert.equal((await fetch(base + '/admin/users')).status, 200);
  assert.equal(attempts, 2);
});
