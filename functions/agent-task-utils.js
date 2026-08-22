const { createHash } = require('node:crypto');

const AUTOMATIC_FIRST_TOUCH_BLOCKING_STATUSES = new Set([
  'queued',
  'running',
  'done',
]);

function isHumanDecisionBlock(result) {
  return result
    && result.outcome === 'blocked'
    && result.blockType === 'human_decision'
    && typeof result.question === 'string'
    && result.question.trim().length > 0;
}

function validateTaskCompletion(result) {
  if (!result || !['done', 'blocked'].includes(result.outcome)) {
    return 'outcome must be done or blocked';
  }
  if (result.outcome === 'done') return null;
  if (!['human_decision', 'operational'].includes(result.blockType)) {
    return 'blocked tasks require blockType human_decision or operational';
  }
  if (result.blockType === 'human_decision'
      && (typeof result.question !== 'string' || !result.question.trim())) {
    return 'human-decision blocks require a non-empty question';
  }
  return null;
}

function classifyTaskCompletion(result) {
  if (result && result.outcome === 'done') {
    return { status: 'done', requiresHumanDecision: false };
  }
  if (isHumanDecisionBlock(result)) {
    return { status: 'blocked', requiresHumanDecision: true };
  }
  return { status: 'error', requiresHumanDecision: false };
}

/* Legacy blocked first-touches predate requiresHumanDecision and represented
 * human decisions, so missing markers block requeue. New operational/transient
 * failures are explicitly marked false and remain eligible for retry. */
function blocksAutomaticFirstTouchRequeue(tasks) {
  return tasks.some(task => task
    && task.kind === 'first_touch'
    && (AUTOMATIC_FIRST_TOUCH_BLOCKING_STATUSES.has(task.status)
      || (task.status === 'blocked' && task.requiresHumanDecision !== false)));
}

async function hasBlockingFirstTouchForLead(agentTasks, leadId) {
  return Boolean(await findBlockingFirstTouchForLead(agentTasks, leadId));
}

async function findBlockingFirstTouchForLead(agentTasks, leadId) {
  const query = await agentTasks.where('leadId', '==', leadId).get();
  return query.docs.find(doc => blocksAutomaticFirstTouchRequeue([doc.data()])) || null;
}

function firstTouchGuardId(leadId) {
  return `first_touch_${createHash('sha256').update(String(leadId)).digest('hex')}`;
}

function validFirstTouchTask(snapshot, leadId) {
  if (!snapshot || !snapshot.exists) return false;
  const task = snapshot.data();
  return task && task.kind === 'first_touch' && task.leadId === leadId;
}

async function queueFirstTouchAtomically(db, leadId, taskData) {
  const tasks = db.collection('agent_tasks');
  const guards = db.collection('agent_task_guards');
  const guardRef = guards.doc(firstTouchGuardId(leadId));
  const newTaskRef = tasks.doc();

  /* The guard is the single contention point for trigger/sweep producers. The
   * task remains a fresh random-ID document so failed attempts keep their
   * audit history; status is always read live from the referenced task. */
  return db.runTransaction(async transaction => {
    const guardSnapshot = await transaction.get(guardRef);
    /* Keep legacy random-ID discovery in the transaction too. That closes the
     * migration window with an older deployed producer that does not yet write
     * the guard document. */
    const taskQuery = await transaction.get(tasks.where('leadId', '==', leadId));
    const guard = guardSnapshot.exists ? guardSnapshot.data() : null;
    const guardedTaskId = guard && typeof guard.currentTaskId === 'string'
      && guard.currentTaskId.length > 0 && !guard.currentTaskId.includes('/')
      ? guard.currentTaskId
      : null;
    const blockingTasks = taskQuery.docs.filter(snapshot =>
      validFirstTouchTask(snapshot, leadId)
      && blocksAutomaticFirstTouchRequeue([snapshot.data()]));
    const blockingTask = blockingTasks.find(snapshot => snapshot.id === guardedTaskId)
      || blockingTasks[0];

    if (blockingTask) {
      transaction.set(guardRef, {
        leadId,
        currentTaskId: blockingTask.id,
        updatedAt: taskData.createdAt,
      });
      return { queued: false, taskId: blockingTask.id };
    }

    transaction.create(newTaskRef, taskData);
    transaction.set(guardRef, {
      leadId,
      currentTaskId: newTaskRef.id,
      updatedAt: taskData.createdAt,
    });
    return { queued: true, taskId: newTaskRef.id };
  });
}

module.exports = {
  blocksAutomaticFirstTouchRequeue,
  classifyTaskCompletion,
  findBlockingFirstTouchForLead,
  firstTouchGuardId,
  hasBlockingFirstTouchForLead,
  isHumanDecisionBlock,
  queueFirstTouchAtomically,
  validateTaskCompletion,
};
