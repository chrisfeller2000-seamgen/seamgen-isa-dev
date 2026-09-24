import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { localEnv } from './isa-local.mjs';

test('local runs use repository state and disable script notifications', () => {
  const env = localEnv({ OPENCLAW_STATE_DIR: '/home/azureuser/.openclaw', NO_TELEGRAM: '0' });
  assert.notEqual(env.OPENCLAW_STATE_DIR, '/home/azureuser/.openclaw');
  assert.equal(path.basename(env.OPENCLAW_STATE_DIR), 'state');
  assert.equal(env.OPENCLAW_CONFIG_PATH, path.join(env.OPENCLAW_STATE_DIR, 'openclaw.json'));
  assert.equal(env.NO_TELEGRAM, '1');
  assert.equal(env.REENGAGEMENT_DRY_RUN, '1');
});
