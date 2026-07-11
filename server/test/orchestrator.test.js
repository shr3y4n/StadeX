import test from 'node:test';
import assert from 'node:assert';
import { processMessage } from '../orchestrator.js';

test('Orchestrator Routing and Mock Agent tests', async (t) => {
  
  await t.test('routes navigation-related queries correctly', async () => {
    const result = await processMessage({ message: 'Where is the nearest restroom?' });
    assert.strictEqual(result.agent_used, 'navigation_agent');
    assert.ok(result.reply.includes('Gate'));
    assert.ok(result.data.recommended_gate);
  });

  await t.test('routes crowd and queue queries correctly', async () => {
    const result = await processMessage({ message: 'Which gate has the shortest queue right now?' });
    assert.strictEqual(result.agent_used, 'crowd_agent');
    assert.ok(result.reply.includes('Gate'));
    assert.ok(result.data.gateStatus);
  });

  await t.test('detects Spanish language queries and routes to language agent', async () => {
    const result = await processMessage({ message: '¿Dónde está la Puerta C?', language: 'Spanish' });
    assert.strictEqual(result.agent_used, 'language_agent');
    assert.ok(result.reply.includes('Puerta C') || result.reply.includes('puerta'));
  });

  await t.test('handles default fallback correctly', async () => {
    const result = await processMessage({ message: 'Hello' });
    assert.strictEqual(result.agent_used, 'navigation_agent');
    assert.ok(result.reply.includes('Welcome'));
  });
});
