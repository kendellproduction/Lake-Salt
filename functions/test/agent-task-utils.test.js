const { test } = require('node:test');
const assert = require('node:assert');
const {
  blocksAutomaticFirstTouchRequeue,
  classifyTaskCompletion,
  hasBlockingFirstTouchForLead,
  isHumanDecisionBlock,
} = require('../agent-task-utils');

test('human-decision blocked first-touch tasks prevent automatic requeue', () => {
  for (const requiresHumanDecision of [true, undefined]) {
    assert.strictEqual(
      blocksAutomaticFirstTouchRequeue([{ kind: 'first_touch', status: 'blocked', requiresHumanDecision }]),
      true,
      String(requiresHumanDecision),
    );
  }
});

test('operational blocked first-touch tasks remain eligible for requeue', () => {
  assert.strictEqual(
    blocksAutomaticFirstTouchRequeue([{ kind: 'first_touch', status: 'blocked', requiresHumanDecision: false }]),
    false,
  );
});

test('blocked unrelated task kinds do not prevent first-touch requeue', () => {
  const tasks = [{ kind: 'triage_stale_lead', status: 'blocked', requiresHumanDecision: true }];

  assert.strictEqual(blocksAutomaticFirstTouchRequeue(tasks), false);
});

test('queued, running, and done first-touch tasks still prevent requeue', () => {
  for (const status of ['queued', 'running', 'done']) {
    assert.strictEqual(
      blocksAutomaticFirstTouchRequeue([{ kind: 'first_touch', status }]),
      true,
      status,
    );
  }
});

test('error first-touch tasks remain eligible for automatic requeue', () => {
  const tasks = [{ kind: 'first_touch', status: 'error' }];

  assert.strictEqual(blocksAutomaticFirstTouchRequeue(tasks), false);
});

test('a blocked result requires an explicit non-empty human question', () => {
  assert.strictEqual(isHumanDecisionBlock({ outcome: 'blocked', blockType: 'human_decision', question: 'Choose a service area?' }), true);
  assert.strictEqual(isHumanDecisionBlock({ outcome: 'blocked', blockType: 'operational', question: 'Check Gmail?' }), false);
  assert.strictEqual(isHumanDecisionBlock({ outcome: 'blocked', blockType: 'human_decision', question: '   ' }), false);
  assert.strictEqual(isHumanDecisionBlock({ outcome: 'blocked', blockType: 'human_decision' }), false);
  assert.strictEqual(isHumanDecisionBlock({ outcome: 'done', blockType: 'human_decision', question: 'Anything else?' }), false);
});

test('task completion separates human decisions from retryable operational failures', () => {
  assert.deepStrictEqual(
    classifyTaskCompletion({ outcome: 'blocked', blockType: 'human_decision', question: 'Approve travel?' }),
    { status: 'blocked', requiresHumanDecision: true },
  );
  assert.deepStrictEqual(
    classifyTaskCompletion({ outcome: 'blocked', blockType: 'operational', summary: 'Gmail temporarily unavailable.' }),
    { status: 'error', requiresHumanDecision: false },
  );
  assert.deepStrictEqual(
    classifyTaskCompletion(null),
    { status: 'error', requiresHumanDecision: false },
  );
  assert.deepStrictEqual(
    classifyTaskCompletion({ outcome: 'done' }),
    { status: 'done', requiresHumanDecision: false },
  );
});

test('lead query finds a blocked first-touch beyond five unrelated tasks', async () => {
  const tasks = [
    ...Array.from({ length: 6 }, () => ({ kind: 'triage_stale_lead', status: 'done' })),
    { kind: 'first_touch', status: 'blocked', requiresHumanDecision: true },
  ];
  const agentTasks = {
    where(field, operator, value) {
      assert.deepStrictEqual([field, operator, value], ['leadId', '==', 'lead_fixture']);
      return {
        limit() {
          assert.fail('first-touch dedupe query must not truncate matching tasks');
        },
        async get() {
          return { docs: tasks.map(task => ({ data: () => task })) };
        },
      };
    },
  };

  assert.strictEqual(
    await hasBlockingFirstTouchForLead(agentTasks, 'lead_fixture'),
    true,
  );
});
