import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { assertSafeConfig, makeSafeConfig, resolveLocalRoot } from './local-isa.mjs';

test('local ISA can keep WSL runtime state off a Windows-mounted checkout', () => {
  const checkout = path.join(os.tmpdir(), 'isa-checkout');
  const state = path.join(os.tmpdir(), 'isa-local-state');
  assert.equal(resolveLocalRoot(undefined, checkout), path.join(checkout, '.isa-local'));
  assert.equal(resolveLocalRoot(state, checkout), state);
  assert.equal(resolveLocalRoot(path.join(checkout, '.isa-local'), checkout), path.join(checkout, '.isa-local'));
  assert.throws(() => resolveLocalRoot('relative-state', checkout), /absolute path/);
  assert.throws(() => resolveLocalRoot(checkout, checkout), /outside the repository/);
  assert.throws(() => resolveLocalRoot(path.join(checkout, 'workspace'), checkout), /outside the repository/);
});

test('local ISA config keeps agent and integrations isolated', () => {
  const config = makeSafeConfig('test-token');
  assert.doesNotThrow(() => assertSafeConfig(config));
  assert.equal(config.gateway.bind, 'loopback');
  assert.equal(config.cron.enabled, false);
  assert.ok(config.logging.file.endsWith('gateway.log'));
  assert.equal(config.agents.defaults.heartbeat.every, '0m');
  assert.equal(config.tools.profile, 'minimal');
  assert.deepEqual(config.channels, {});
  assert.equal(config.agents.defaults.models['openai/gpt-5.4-mini'].agentRuntime.id, 'openclaw');
});

test('unsafe local ISA settings are rejected', () => {
  for (const change of [
    config => { config.gateway.bind = 'lan'; },
    config => { config.cron.enabled = true; },
    config => { config.logging.file = '/tmp/openclaw.log'; },
    config => { config.agents.defaults.heartbeat.every = '30m'; },
    config => { config.tools.profile = 'coding'; },
    config => { config.channels.telegram = {}; },
    config => { config.auth.order.openai = ['openai:other']; },
    config => { config.agents.defaults.models['openai/gpt-5.4-mini'].agentRuntime.id = 'codex'; },
  ]) {
    const config = makeSafeConfig('test-token');
    change(config);
    assert.throws(() => assertSafeConfig(config));
  }
});
