'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const admin = require('firebase-admin');
const { firstTouchGuardId, queueFirstTouchAtomically } = require('../agent-task-utils');

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('FIRESTORE_EMULATOR_HOST is required; run npm run test:emulator:ci.');
{
  const appName = 'agent-task-utils-integration';
  const app = admin.apps.find(candidate => candidate.name === appName)
    || admin.initializeApp({ projectId: 'lake-salt-booking-test' }, appName);
  const db = app.firestore();
  const payload = leadId => ({
    agent: 'comms', kind: 'first_touch', leadId, status: 'queued',
    source: 'sanitized_concurrency_fixture',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  async function clear() {
    await Promise.all([
      db.recursiveDelete(db.collection('agent_tasks')),
      db.recursiveDelete(db.collection('agent_task_guards')),
    ]);
  }

  test.beforeEach(clear);
  test.after(async () => { await clear(); await app.delete(); });

  test('twenty concurrent producers create exactly one first-touch task', async () => {
    const leadId = 'sanitized_emulator_lead';
    const results = await Promise.all(Array.from({ length: 20 }, () =>
      queueFirstTouchAtomically(db, leadId, payload(leadId))));

    const tasks = await db.collection('agent_tasks').where('leadId', '==', leadId).get();
    const guard = await db.collection('agent_task_guards').doc(firstTouchGuardId(leadId)).get();
    assert.equal(results.filter(result => result.queued).length, 1);
    assert.equal(tasks.size, 1);
    assert.equal(guard.data().currentTaskId, tasks.docs[0].id);
  });
}
