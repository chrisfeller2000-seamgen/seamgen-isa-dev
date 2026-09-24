import assert from 'node:assert/strict';
import test from 'node:test';
import { assertSafeConfig, makeSafeConfig } from './local-isa.mjs';

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
