/* ═════════════════════════════════════════════════════════════════════════
   QUICK SCAN WIDGET — Dashboard quick-action receipt scanning + live badge
   Renders into #quick-actions on dashboard, shows badge count + recent 3 scans
═════════════════════════════════════════════════════════════════════════ */

let quickScanBadgeUnsub = null;
let quickScanStripUnsub = null;
let scanNeedsCount = 0;
let scanSheetQueue = [];

/* ─── Offline queue (IndexedDB) — blobs are removed ONLY after a confirmed upload ─── */
function scanQueueDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('lakesalt-scans', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('receipt-queue', { keyPath: 'id', autoIncrement: true });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function scanQueueAdd(blob) {
  return scanQueueDB().then(dbi => new Promise((resolve, reject) => {
    const tx = dbi.transaction('receipt-queue', 'readwrite');
    tx.objectStore('receipt-queue').add({ blob, queuedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}
function scanQueueAll() {
  return scanQueueDB().then(dbi => new Promise((resolve, reject) => {
    const req = dbi.transaction('receipt-queue').objectStore('receipt-queue').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  }));
}
function scanQueueRemove(id) {
  return scanQueueDB().then(dbi => new Promise((resolve, reject) => {
    const tx = dbi.transaction('receipt-queue', 'readwrite');
    tx.objectStore('receipt-queue').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}

async function uploadScanBlob(blob) {
  // Keep dashboard and Expenses scans on one reliable upload path.
  if (typeof createReceiptScan === 'function') return createReceiptScan(blob, 'quick-scan.jpg');
  throw new Error('Receipt scanner is still loading. Please try again.');
}

function scanQuestionsFor(d) {
  const questions = [];

  // Q1: amount (only if needs-review and no amount)
  if (d.status === 'needs-review' && d.amount == null) {
    questions.push({ type: 'amount' });
  }

  // Q2: date
  if (!d.date) {
    questions.push({ type: 'date' });
  }

  // Q3: event (if candidates exist)
  if (!d.eventId && Array.isArray(d.matchCandidates) && d.matchCandidates.length > 0) {
    questions.push({ type: 'event', candidates: d.matchCandidates });
  }

  // Q4: category (if guess exists)
  if (d.categoryGuess) {
    questions.push({ type: 'category' });
  }

  return questions;
}

async function openScanSheet() {
  try {
    const snap = await db.collection('expenses')
      .where('aiParsed', '==', true)
      .where('status', 'in', ['needs-review', 'ok'])
      .orderBy('createdAt', 'desc')
      .limit(25)
      .get();

    scanSheetQueue = [];
    snap.forEach(doc => {
      const data = doc.data();
      const questions = scanQuestionsFor(data);
      if (questions.length > 0) {
        scanSheetQueue.push({
          id: doc.id,
          data: data,
          questions: questions
        });
      }
    });

    if (scanSheetQueue.length === 0) {
      showToast('All caught up ✓');
      return;
    }

    renderScanQuestion();
  } catch (err) {
    console.error('openScanSheet error:', err);
    showToast('Error loading questions', 'error');
  }
}

function renderScanQuestion() {
  let sheet = document.getElementById('scan-sheet');
  if (!sheet) {
    sheet = document.createElement('div');
    sheet.id = 'scan-sheet';
    sheet.innerHTML = `
      <div class="scan-sheet-backdrop" onclick="(()=>{const s=document.getElementById('scan-sheet'); if(s) s.classList.remove('open');})()"></div>
      <div class="scan-sheet-card" id="scan-sheet-card"></div>
    `;
    document.body.appendChild(sheet);
  }

  if (scanSheetQueue.length === 0) {
    sheet.classList.remove('open');
    return;
  }

  const item = scanSheetQueue[0];
  const question = item.questions[0];
  const card = document.getElementById('scan-sheet-card');
  const merchant = item.data.merchant || item.data.description || 'this receipt';

  let questionHTML = '';
  let inputId = 'scan-q-input';

  if (question.type === 'amount') {
    questionHTML = `
      <div class="scan-sheet-title">Total for ${escapeHtml(merchant)}?</div>
      <input type="number" step="0.01" inputmode="decimal" id="${inputId}" placeholder="0.00" value="${item.data.amount || ''}" style="font-size:18px;padding:14px"/>
      <div class="scan-chips">
        <button class="scan-chip" onclick="answerScanQuestion(document.getElementById('${inputId}').value)">Save</button>
        <button class="scan-chip scan-chip-muted" onclick="skipScanQuestion()">Skip</button>
      </div>
    `;
  } else if (question.type === 'date') {
    questionHTML = `
      <div class="scan-sheet-title">Receipt date?</div>
      <div class="scan-chips" style="margin-bottom:12px">
        <button class="scan-chip" onclick="answerScanQuestion('${new Date().toISOString().split('T')[0]}')">Today</button>
        <button class="scan-chip" onclick="(()=>{const d=new Date();d.setDate(d.getDate()-1);answerScanQuestion(d.toISOString().split('T')[0]);})()">Yesterday</button>
      </div>
      <input type="date" id="${inputId}" value="${item.data.date || new Date().toISOString().split('T')[0]}" style="font-size:16px;padding:12px"/>
      <div class="scan-chips">
        <button class="scan-chip" onclick="answerScanQuestion(document.getElementById('${inputId}').value)">Save</button>
        <button class="scan-chip scan-chip-muted" onclick="skipScanQuestion()">Skip</button>
      </div>
    `;
  } else if (question.type === 'event') {
    const candidateChips = (question.candidates || [])
      .map(c => `<button class="scan-chip" onclick="answerScanQuestion('${c.id}')">${escapeHtml(c.name)}</button>`)
      .join('');
    questionHTML = `
      <div class="scan-sheet-title">Which event is "${escapeHtml(merchant)}" for?</div>
      <div class="scan-chips" style="margin-bottom:12px">
        ${candidateChips}
      </div>
      <div class="scan-chips">
        <button class="scan-chip" onclick="answerScanQuestion(null)">General deduction</button>
        <button class="scan-chip scan-chip-muted" onclick="skipScanQuestion()">Skip</button>
      </div>
    `;
  } else if (question.type === 'category') {
    const categoryChips = (EXPENSE_CATEGORIES || [])
      .map(c => `<button class="scan-chip" onclick="answerScanQuestion('${c}')">${c}</button>`)
      .join('');
    questionHTML = `
      <div class="scan-sheet-title">Category? (read "${escapeHtml(item.data.categoryGuess)}")</div>
      <div class="scan-chips" style="margin-bottom:12px">
        ${categoryChips}
      </div>
      <div class="scan-chips">
        <button class="scan-chip scan-chip-muted" onclick="skipScanQuestion()">Skip</button>
      </div>
    `;
  }

  const queueLeft = scanSheetQueue.length;
  questionHTML = `
    <button class="scan-sheet-close" onclick="document.getElementById('scan-sheet').classList.remove('open')">✕</button>
    <div class="scan-sheet-progress">${queueLeft} left</div>
    ${questionHTML}
  `;

  card.innerHTML = questionHTML;
  sheet.classList.add('open');
}

function skipScanQuestion() {
  if (scanSheetQueue.length > 0) {
    scanSheetQueue.shift();
  }
  renderScanQuestion();
}

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text || '').replace(/[&<>"']/g, m => map[m]);
}

async function answerScanQuestion(answer) {
  if (scanSheetQueue.length === 0) return;

  const item = scanSheetQueue[0];
  const question = item.questions[0];

  let updateObj = {};

  try {
    if (question.type === 'amount') {
      const amt = Number(answer);
      if (isNaN(amt)) {
        showToast('Please enter a valid amount', 'error');
        return;
      }
      updateObj.amount = amt;
    } else if (question.type === 'date') {
      updateObj.date = answer;
      updateObj.taxYear = parseInt(answer.slice(0, 4), 10);
    } else if (question.type === 'event') {
      updateObj.eventId = answer;
      updateObj.deductionType = answer ? 'event' : 'general';
      updateObj.matchCandidates = [];
    } else if (question.type === 'category') {
      updateObj.category = answer;
      updateObj.categoryGuess = null;
    }

    // Merge with local data and recompute status
    const merged = { ...item.data, ...updateObj };
    if (merged.amount != null && merged.date) {
      updateObj.status = 'ok';
    }

    // Update Firestore
    await db.collection('expenses').doc(item.id).update(updateObj);

    if (navigator.vibrate) navigator.vibrate(10);

    // Move to next question or next item
    item.questions.shift();
    if (item.questions.length === 0) {
      scanSheetQueue.shift();
    }

    // Re-render with transition
    renderScanQuestion();
  } catch (err) {
    console.error('answerScanQuestion error:', err);
    showToast('Save failed', 'error');
  }
}

async function initQuickScanWidget() {
  const container = document.getElementById('quick-actions');
  if (!container) return;

  // Render widget markup
  container.innerHTML = `
    <div class="quick-actions-row">
      <button class="quick-scan-btn" onclick="quickScanTap()">
        <span class="quick-scan-icon">📷</span>
        <span class="quick-scan-label">Scan</span>
        <span class="quick-scan-badge" id="quick-scan-badge" style="display:none"></span>
      </button>
      <div id="quick-scan-strip"></div>
    </div>`;

  // Ensure hidden file inputs exist once. Two inputs on purpose:
  //  • quick-scan-input  — NO `capture`, so iOS shows the native sheet with
  //    "Photo Library" (multi-select works) + "Take Photo". This is the bulk
  //    path: pick as many receipt photos as you want in one shot.
  //  • quick-scan-camera — `capture=environment` for a one-tap live camera scan.
  if (!document.getElementById('quick-scan-input')) {
    const input = document.createElement('input');
    input.type = 'file';
    input.id = 'quick-scan-input';
    input.accept = 'image/*';
    input.multiple = true;
    input.style.display = 'none';
    input.onchange = function() { quickScanFiles(this.files); };
    document.body.appendChild(input);
  }
  if (!document.getElementById('quick-scan-camera')) {
    const cam = document.createElement('input');
    cam.type = 'file';
    cam.id = 'quick-scan-camera';
    cam.accept = 'image/*';
    cam.capture = 'environment';
    cam.style.display = 'none';
    cam.onchange = function() { quickScanFiles(this.files); };
    document.body.appendChild(cam);
  }

  // Badge listener: count docs with status 'needs-review'
  if (quickScanBadgeUnsub) quickScanBadgeUnsub();
  quickScanBadgeUnsub = db.collection('expenses')
    .where('aiParsed', '==', true)
    .where('status', '==', 'needs-review')
    .onSnapshot(
      snap => {
        const badge = document.getElementById('quick-scan-badge');
        scanNeedsCount = snap.size;
        if (badge) {
          badge.textContent = scanNeedsCount;
          badge.style.display = scanNeedsCount > 0 ? 'flex' : 'none';
        }
      },
      err => console.warn('badge listener error:', err)
    );

  // Strip listener: render latest 3 aiParsed docs
  if (quickScanStripUnsub) quickScanStripUnsub();
  quickScanStripUnsub = db.collection('expenses')
    .where('aiParsed', '==', true)
    .orderBy('createdAt', 'desc')
    .limit(3)
    .onSnapshot(
      snap => {
        const strip = document.getElementById('quick-scan-strip');
        if (!strip) {
          if (quickScanStripUnsub) quickScanStripUnsub();
          if (quickScanBadgeUnsub) quickScanBadgeUnsub();
          return;
        }

        if (snap.empty) {
          strip.innerHTML = '';
          return;
        }

        const rows = snap.docs.map(doc => {
          const d = doc.data();
          const merchant = d.merchant || d.description || '—';
          const amount = d.amount != null ? `$${d.amount.toFixed(2)}` : '—';

          let statusText = '';
          if (d.status === 'uploading' || d.status === 'processing') {
            statusText = `<span class="scan-shimmer">⏳ Parsing…</span>`;
          } else if (d.status === 'ok') {
            statusText = `✓ ${amount}`;
          } else if (d.status === 'needs-review') {
            statusText = /receipt image missing|upload failed/i.test(String(d.description || ''))
              ? `⚠ re-upload needed`
              : `⚠ needs answer`;
          } else if (d.status === 'failed') {
            statusText = `⚠ re-upload needed`;
          } else {
            statusText = amount;
          }

          return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;font-size:12px;border-bottom:1px solid rgba(255,255,255,0.04)">
            <div style="flex:1;min-width:0">
              <div style="font-weight:500;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${merchant}</div>
            </div>
            <div style="color:var(--text-muted);margin-left:8px">${statusText}</div>
          </div>`;
        }).join('');

        strip.innerHTML = rows;
      },
      err => console.warn('strip listener error:', err)
    );

  // Auto-open hook
  if (window._pendingQuickScan) {
    window._pendingQuickScan = false;
    quickScanTap();
  }

  // Handle shared receipt from web share target
  if (window._pendingSharedDrain) {
    window._pendingSharedDrain = false;
    drainScanQueue().then(() => showToast('📤 Shared receipt queued for parsing'));
  }

  // Wire up offline queue
  await updateQueuePill();
  await drainScanQueue();
}

function quickScanTap() {
  if (navigator.vibrate) navigator.vibrate(10);

  let sheet = document.getElementById('scan-sheet');
  if (!sheet) {
    sheet = document.createElement('div');
    sheet.id = 'scan-sheet';
    sheet.innerHTML = `
      <div class="scan-sheet-backdrop" onclick="(()=>{const s=document.getElementById('scan-sheet'); if(s) s.classList.remove('open');})()"></div>
      <div class="scan-sheet-card" id="scan-sheet-card"></div>
    `;
    document.body.appendChild(sheet);
  }

  const answerBtn = scanNeedsCount > 0
    ? `<button class="scan-chip scan-chip-muted" style="display:block;width:100%;min-height:48px;font-size:16px" onclick="(()=>{document.getElementById('scan-sheet').classList.remove('open');openScanSheet();})()">❓ Answer ${scanNeedsCount} question${scanNeedsCount!==1?'s':''}</button>`
    : '';

  const card = document.getElementById('scan-sheet-card');
  card.innerHTML = `
    <button class="scan-sheet-close" onclick="document.getElementById('scan-sheet').classList.remove('open')">✕</button>
    <div style="text-align:center;padding:20px">
      <div style="font-size:18px;font-weight:700;margin-bottom:6px">Add receipts</div>
      <div style="font-size:13px;color:var(--text-muted);margin-bottom:22px">Upload lets you pick several photos at once.</div>
      <button class="scan-chip" style="display:block;width:100%;margin-bottom:12px;min-height:48px;font-size:16px" onclick="(()=>{document.getElementById('scan-sheet').classList.remove('open');document.getElementById('quick-scan-input').click();})()">🖼️ Upload receipts (bulk)</button>
      <button class="scan-chip" style="display:block;width:100%;margin-bottom:12px;min-height:48px;font-size:16px" onclick="(()=>{document.getElementById('scan-sheet').classList.remove('open');document.getElementById('quick-scan-camera').click();})()">📷 Take a photo</button>
      ${answerBtn}
    </div>
  `;
  sheet.classList.add('open');
}

async function quickScanFiles(files) {
  if (navigator.vibrate) navigator.vibrate(10);

  let queuedCount = 0;
  for (const file of files) {
    const blob = await compressReceiptImage(file);
    if (navigator.onLine === false) {
      await scanQueueAdd(blob);
      queuedCount++;
    } else {
      try {
        await uploadScanBlob(blob);
      } catch (err) {
        console.error('uploadScanBlob error:', err);
        await scanQueueAdd(blob);
        queuedCount++;
      }
    }
  }

  if (queuedCount > 0) {
    showToast(`📥 ${queuedCount} saved — will upload when back online`);
  } else {
    showToast(`${files.length} receipt(s) uploaded — parsing…`);
  }

  await updateQueuePill();
  ['quick-scan-input', 'quick-scan-camera'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}

async function drainScanQueue() {
  if (navigator.onLine === false) return;

  const items = await scanQueueAll();
  let uploadedCount = 0;

  for (const item of items) {
    try {
      await uploadScanBlob(item.blob);
      await scanQueueRemove(item.id);
      uploadedCount++;
    } catch (err) {
      console.error('drainScanQueue upload error:', err);
      break;
    }
  }

  await updateQueuePill();
  if (uploadedCount > 0) {
    showToast(`📤 ${uploadedCount} queued receipt(s) uploaded`);
  }
}

async function updateQueuePill() {
  const count = (await scanQueueAll().catch(() => [])).length;
  const row = document.querySelector('.quick-actions-row');
  if (!row) return;

  let pill = document.getElementById('quick-scan-queue-pill');
  if (!pill) {
    pill = document.createElement('span');
    pill.id = 'quick-scan-queue-pill';
    pill.style.cssText = 'font-size:11px;color:var(--text-muted);border:1px solid var(--navy-bd);border-radius:10px;padding:2px 8px';
    row.appendChild(pill);
  }

  pill.textContent = `${count} queued`;
  pill.style.display = count > 0 ? 'inline' : 'none';
}

/* Wire up online event to drain queue */
window.addEventListener('online', () => {
  drainScanQueue();
});

/* Auto-open on ?action=scan or ?action=shared param */
document.addEventListener('DOMContentLoaded', () => {
  const action = new URLSearchParams(location.search).get('action');
  if (action === 'scan') window._pendingQuickScan = true;
  if (action === 'shared') window._pendingSharedDrain = true;
});
