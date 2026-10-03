const { test } = require('node:test');
const assert = require('node:assert');
const {
  blocksAutomaticFirstTouchRequeue,
  classifyTaskCompletion,
  firstTouchGuardId,
  hasBlockingFirstTouchForLead,
  isHumanDecisionBlock,
  queueFirstTouchAtomically,
  validateTaskCompletion,
} = require('../agent-task-utils');
const { FakeFirestore } = require('./helpers/fake-firestore');

const taskPayload = (leadId, source = 'fixture') => ({
  agent: 'comms', kind: 'first_touch', leadId, status: 'queued', source,
  createdAt: 'sanitized-fixture-time',
});

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

test('task completion validation rejects malformed blocked results', () => {
  assert.match(
    validateTaskCompletion({ outcome: 'blocked', summary: 'Need a decision.' }),
    /require blockType/,
  );
  assert.match(
    validateTaskCompletion({ outcome: 'blocked', blockType: 'human_decision', question: '   ' }),
    /non-empty question/,
  );
  assert.strictEqual(
    validateTaskCompletion({ outcome: 'blocked', blockType: 'operational', summary: 'Tool unavailable.' }),
    null,
  );
  assert.strictEqual(
    validateTaskCompletion({ outcome: 'blocked', blockType: 'human_decision', question: 'Approve travel?' }),
    null,
  );
  assert.strictEqual(validateTaskCompletion({ outcome: 'done', summary: 'Finished.' }), null);
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

test('concurrent first-touch producers create one task and one winner', async () => {
  const db = new FakeFirestore();
  const leadId = 'lead_fixture_concurrent';
  const results = await Promise.all(Array.from({ length: 20 }, (_, index) =>
    queueFirstTouchAtomically(db, leadId, taskPayload(leadId, `producer_${index}`))));

  const tasks = await db.collection('agent_tasks').where('leadId', '==', leadId).get();
  const guard = await db.collection('agent_task_guards').doc(firstTouchGuardId(leadId)).get();
  assert.equal(tasks.size, 1);
  assert.equal(results.filter(result => result.queued).length, 1);
  assert.equal(guard.data().currentTaskId, tasks.docs[0].id);
});

test('blocking legacy tasks seed the guard without creating a duplicate', async () => {
  for (const task of [
    { status: 'queued' },
    { status: 'running' },
    { status: 'done' },
    { status: 'blocked', requiresHumanDecision: true },
    { status: 'blocked' },
  ]) {
    const db = new FakeFirestore();
    const leadId = `lead_fixture_${task.status}_${String(task.requiresHumanDecision)}`;
    const legacy = db.collection('agent_tasks').doc('legacy_task');
    await legacy.set({ ...taskPayload(leadId), ...task });

    const result = await queueFirstTouchAtomically(db, leadId, taskPayload(leadId));
    const tasks = await db.collection('agent_tasks').where('leadId', '==', leadId).get();
    const guard = await db.collection('agent_task_guards').doc(firstTouchGuardId(leadId)).get();
    assert.equal(result.queued, false, JSON.stringify(task));
    assert.equal(tasks.size, 1, JSON.stringify(task));
    assert.equal(guard.data().currentTaskId, legacy.id, JSON.stringify(task));
  }
});

test('retryable tasks remain unchanged while one fresh task is queued', async () => {
  for (const task of [
    { status: 'error' },
    { status: 'blocked', requiresHumanDecision: false },
  ]) {
    const db = new FakeFirestore();
    const leadId = `lead_fixture_retry_${task.status}`;
    const prior = db.collection('agent_tasks').doc('prior_task');
    await prior.set({ ...taskPayload(leadId), ...task, result: 'sanitized failure' });
    await db.collection('agent_task_guards').doc(firstTouchGuardId(leadId)).set({
      leadId, currentTaskId: prior.id,
    });

    const results = await Promise.all(Array.from({ length: 10 }, () =>
      queueFirstTouchAtomically(db, leadId, taskPayload(leadId, 'retry'))));
    const tasks = await db.collection('agent_tasks').where('leadId', '==', leadId).get();
    assert.equal(results.filter(result => result.queued).length, 1, JSON.stringify(task));
    assert.equal(tasks.size, 2, JSON.stringify(task));
    assert.deepStrictEqual((await prior.get()).data(), { ...taskPayload(leadId), ...task, result: 'sanitized failure' });
  }
});

test('missing, corrupt, and wrong-lead guard targets self-heal', async () => {
  for (const currentTaskId of ['missing_task', 'bad/id', 'wrong_lead_task']) {
    const db = new FakeFirestore();
    const leadId = `lead_fixture_guard_${currentTaskId.replace('/', '_')}`;
    if (currentTaskId === 'wrong_lead_task') {
      await db.collection('agent_tasks').doc(currentTaskId).set(taskPayload('different_lead'));
    }
    const guardRef = db.collection('agent_task_guards').doc(firstTouchGuardId(leadId));
    await guardRef.set({ leadId, currentTaskId });

    const result = await queueFirstTouchAtomically(db, leadId, taskPayload(leadId));
    const guard = (await guardRef.get()).data();
    assert.equal(result.queued, true, currentTaskId);
    assert.equal(guard.currentTaskId, result.taskId, currentTaskId);
  }
});

test('a human blocker wins over an older retryable task', async () => {
  const db = new FakeFirestore();
  const leadId = 'lead_fixture_mixed_history';
  const retryable = db.collection('agent_tasks').doc('retryable_task');
  const blocker = db.collection('agent_tasks').doc('human_blocker');
  await retryable.set({ ...taskPayload(leadId), status: 'error' });
  await blocker.set({ ...taskPayload(leadId), status: 'blocked', requiresHumanDecision: true });
  await db.collection('agent_task_guards').doc(firstTouchGuardId(leadId)).set({
    leadId, currentTaskId: retryable.id,
  });

  const result = await queueFirstTouchAtomically(db, leadId, taskPayload(leadId));
  const tasks = await db.collection('agent_tasks').where('leadId', '==', leadId).get();
  assert.deepStrictEqual(result, { queued: false, taskId: blocker.id });
  assert.equal(tasks.size, 2);
});

test('first-touch guards isolate distinct leads', async () => {
  const db = new FakeFirestore();
  const leadIds = ['lead_fixture_alpha', 'lead_fixture_beta'];
  const results = await Promise.all(leadIds.map(leadId =>
    queueFirstTouchAtomically(db, leadId, taskPayload(leadId))));

  assert.equal(results.every(result => result.queued), true);
  assert.equal((await db.collection('agent_tasks').get()).size, 2);
  assert.notEqual(firstTouchGuardId(leadIds[0]), firstTouchGuardId(leadIds[1]));
});

test('transaction failures propagate without a fail-open task write', async () => {
  const db = new FakeFirestore();
  const leadId = 'lead_fixture_transaction_failure';
  db.runTransaction = async () => { throw new Error('sanitized transaction failure'); };

  await assert.rejects(
    queueFirstTouchAtomically(db, leadId, taskPayload(leadId)),
    /sanitized transaction failure/,
  );
  assert.equal((await db.collection('agent_tasks').get()).size, 0);
});
