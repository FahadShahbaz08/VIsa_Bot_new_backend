const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const connect = require('../config/db');
test('database config logs presence only and sanitizes connection errors', async () => {
  const original = mongoose.connect, oldUri = process.env.MONGO_URI;
  const logs = [], originalLog = console.log;
  console.log = (...args) => logs.push(args.join(' '));
  try {
    delete process.env.MONGO_URI;
    await assert.rejects(connect(), /MONGO_URI is not configured/);
    process.env.MONGO_URI = 'mongodb://fake-user:fake-password@invalid/test';
    mongoose.connect = async () => { throw new Error(process.env.MONGO_URI); };
    await assert.rejects(connect(), (error) => !error.message.includes('fake-password') && /Database connection failed/.test(error.message));
    mongoose.connect = async () => {};
    await connect();
    assert.ok(logs.includes('MONGO_URI configured: false'));
    assert.ok(logs.includes('MONGO_URI configured: true'));
    assert.ok(!logs.join('\n').includes('fake-password'));
  } finally { mongoose.connect = original; console.log = originalLog; if (oldUri === undefined) delete process.env.MONGO_URI; else process.env.MONGO_URI = oldUri; }
});
