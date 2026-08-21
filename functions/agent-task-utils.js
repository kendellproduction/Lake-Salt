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
  const query = await agentTasks.where('leadId', '==', leadId).get();
  return blocksAutomaticFirstTouchRequeue(query.docs.map(doc => doc.data()));
}

module.exports = {
  blocksAutomaticFirstTouchRequeue,
  classifyTaskCompletion,
  hasBlockingFirstTouchForLead,
  isHumanDecisionBlock,
  validateTaskCompletion,
};
