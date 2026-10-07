// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidPin } from '../src/lib/api/pin.js';
import { createDemoApi, DEMO_PINS } from '../src/lib/api/demo.js';

test('PIN must be exactly six digits', () => {
  assert.equal(isValidPin('123456'), true);
  assert.equal(isValidPin('12345'), false);
  assert.equal(isValidPin('1234567'), false);
  assert.equal(isValidPin('12a456'), false);
  assert.equal(isValidPin(' 123456'), false);
  assert.equal(isValidPin(undefined), false);
});

test('demo: guest PIN signs in without admin rights', async () => {
  const api = createDemoApi();
  await api.signInWithPin(DEMO_PINS.guest);
  assert.ok(await api.getSession());
  assert.equal(await api.checkAdmin(), false);
  await assert.rejects(api.addPlayer('Zé'), /Sem permissão/);
});

test('demo: admin PIN signs in with admin rights', async () => {
  const api = createDemoApi();
  await api.signInWithPin(DEMO_PINS.admin);
  assert.equal(await api.checkAdmin(), true);
});

test('demo: wrong or malformed PIN is refused', async () => {
  const api = createDemoApi();
  await assert.rejects(api.signInWithPin('999999'), /PIN incorreto/);
  await assert.rejects(api.signInWithPin('12'), /6 algarismos/);
  assert.equal(await api.getSession(), null);
});
