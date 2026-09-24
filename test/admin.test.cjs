const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const { MongoMemoryServer } = require('mongodb-memory-server');
delete process.env.ADMIN_API_KEY;
process.env.JWT_SECRET = 'isolated-test-jwt-secret';
const app = require('../app');
const User = require('../model/user.schema');
const Devices = require('../model/userDevices.schema');
const Payment = require('../model/payment.schema');
let mongo, server, base, id;
const body = { username: 'Ada', email: ' ADA@example.com ', password: 'test-password-123', allowedDevicesCount: 2 };
async function api(path, method = 'GET', data) {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) });
  return { status: response.status, headers: response.headers, data: await response.json() };
}
before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([User.init(), Devices.init(), Payment.init()]);
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { if (server) await new Promise((r) => server.close(r)); await mongoose.disconnect(); if (mongo) await mongo.stop(); });
test('public health route is available', async () => { const r = await api('/'); assert.equal(r.status, 200); assert.equal(r.data.status, 'ok'); });
test('admin routes and legacy aliases work without a key', async () => {
  for (const [path, method, expected] of [['/users', 'GET', 200], ['/users', 'POST', 400], ['/users/123/reset-devices', 'POST', 400], ['/users/123', 'DELETE', 400], ['/create-user', 'POST', 400], ['/add-device', 'POST', 400], ['/update-payment', 'POST', 400]]) {
    assert.equal((await api('/admin' + path, method)).status, expected);
  }
});
test('CORS preflight allows browser JSON requests', async () => {
  const r = await fetch(base + '/admin/users', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } });
  assert.equal(r.status, 204); assert.match(r.headers.get('access-control-allow-headers'), /content-type/);
});
test('empty list and no-store header', async () => { const r = await api('/admin/users'); assert.deepEqual(r.data, { users: [] }); assert.equal(r.headers.get('cache-control'), 'no-store'); });
test('validates input types, bounds, and bcrypt byte limit', async () => {
  for (const patch of [{ username: ' ' }, { email: 'bad' }, { password: 'short' }, { password: '🙂'.repeat(20) }, { allowedDevicesCount: true }, { allowedDevicesCount: '2' }, { allowedDevicesCount: 0 }, { allowedDevicesCount: 101 }, { allowedDevicesCount: 1.5 }, { status: 'unknown' }]) assert.equal((await api('/admin/users', 'POST', { ...body, ...patch })).status, 400);
  assert.equal((await api('/admin/users', 'POST')).status, 400);
});
test('creates normalized user with hashed password and safe response', async () => {
  const r = await api('/admin/users', 'POST', body); assert.equal(r.status, 201); id = r.data.userId;
  const user = await User.findById(id); assert.equal(user.email, 'ada@example.com'); assert.ok(await bcrypt.compare(body.password, user.passwordHash));
  assert.equal(await Devices.countDocuments({ userId: id }), 0);
  const list = await api('/admin/users'); assert.equal(list.data.users[0].id, id); assert.deepEqual(list.data.users[0].devices, []); assert.equal(list.data.users[0].lastLoginAt, null);
  assert.ok(!JSON.stringify(list.data).includes('password')); assert.ok(!JSON.stringify(r.data).includes('password'));
});
test('duplicate and concurrent duplicate creation return conflict', async () => {
  assert.equal((await api('/admin/users', 'POST', body)).status, 409);
  const race = { ...body, username: 'race', email: 'race@example.com' };
  const responses = await Promise.all([api('/admin/users', 'POST', race), api('/admin/users', 'POST', race)]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
});
test('legacy create-user endpoint still works', async () => { assert.equal((await api('/admin/create-user', 'POST', { ...body, username: 'legacy', email: 'legacy@example.com', status: 'inactive' })).status, 201); });
test('strict IDs and missing users return 400 and 404', async () => {
  for (const [suffix, method] of [['', 'DELETE'], ['/reset-devices', 'POST']]) {
    assert.equal((await api('/admin/users/abcdefghijkl' + suffix, method)).status, 400);
    assert.equal((await api('/admin/users/000000000000000000000000' + suffix, method)).status, 404);
  }
});
test('login registers devices; reset reports actual count and permits a new device', async () => {
  for (const macAddress of ['device-a', 'device-b']) assert.equal((await api('/auth/login', 'POST', { usernameOrEmail: 'Ada', password: body.password, macAddress })).status, 200);
  assert.equal((await api('/auth/login', 'POST', { usernameOrEmail: 'Ada', password: body.password, macAddress: 'device-c' })).status, 403);
  assert.equal((await api('/admin/users')).data.users.find((u) => u.id === id).devices.length, 2);
  const reset = await api(`/admin/users/${id}/reset-devices`, 'POST'); assert.equal(reset.status, 200); assert.equal(reset.data.cleared, 2);
  assert.equal((await api(`/admin/users/${id}/reset-devices`, 'POST')).data.cleared, 0);
  assert.equal((await api('/auth/login', 'POST', { usernameOrEmail: 'Ada', password: body.password, macAddress: 'device-c' })).status, 200);
});
test('reset without a device record is a harmless no-op', async () => { const user = await User.findOne({ username: 'legacy' }); assert.equal((await api(`/admin/users/${user.id}/reset-devices`, 'POST')).data.cleared, 0); });
test('deletion cleanup failure keeps user available for retry', async () => {
  const original = Payment.deleteMany;
  Payment.deleteMany = async () => { throw new Error('simulated failure'); };
  try { assert.equal((await api(`/admin/users/${id}`, 'DELETE')).status, 500); assert.ok(await User.findById(id)); } finally { Payment.deleteMany = original; }
});
test('delete removes account, devices, and payments', async () => {
  await Devices.updateOne({ userId: id }, { devices: [{ macAddress: 'delete-me' }] }, { upsert: true });
  await Payment.create({ userId: id, paymentType: 'cash', paymentDate: new Date() });
  assert.equal((await api(`/admin/users/${id}`, 'DELETE')).status, 200);
  assert.equal(await User.findById(id), null); assert.equal(await Devices.countDocuments({ userId: id }), 0); assert.equal(await Payment.countDocuments({ userId: id }), 0);
});
test('malformed JSON gets a JSON error', async () => {
  const r = await fetch(base + '/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' });
  assert.equal(r.status, 400); assert.equal((await r.json()).message, 'Invalid JSON body');
});
