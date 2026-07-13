/* ═════════════════════════════════════════════════════════════════════════
   QUICK SCAN WIDGET — Dashboard quick-action receipt scanning + live badge
   Renders into #quick-actions on dashboard, shows badge count + recent 3 scans
═════════════════════════════════════════════════════════════════════════ */

let quickScanBadgeUnsub = null;
let quickScanStripUnsub = null;

function initQuickScanWidget() {
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

  // Ensure hidden file input exists once
  if (!document.getElementById('quick-scan-input')) {
    const input = document.createElement('input');
    input.type = 'file';
    input.id = 'quick-scan-input';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.multiple = true;
    input.style.display = 'none';
    input.onchange = function() { quickScanFiles(this.files); };
    document.body.appendChild(input);
  }

  // Badge listener: count docs with status 'needs-review'
  if (quickScanBadgeUnsub) quickScanBadgeUnsub();
  quickScanBadgeUnsub = db.collection('expenses')
    .where('aiParsed', '==', true)
    .where('status', '==', 'needs-review')
    .onSnapshot(
      snap => {
        const badge = document.getElementById('quick-scan-badge');
        if (badge) {
          const count = snap.size;
          badge.textContent = count;
          badge.style.display = count > 0 ? 'flex' : 'none';
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
          if (d.status === 'processing') {
            statusText = `<span class="scan-shimmer">⏳ Parsing…</span>`;
          } else if (d.status === 'ok') {
            statusText = `✓ ${amount}`;
          } else if (d.status === 'needs-review') {
            statusText = `⚠ needs answer`;
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
}

function quickScanTap() {
  if (navigator.vibrate) navigator.vibrate(10);
  document.getElementById('quick-scan-input').click();
}

function quickScanFiles(files) {
  if (navigator.vibrate) navigator.vibrate(10);
  handleReceiptScan(files);
  document.getElementById('quick-scan-input').value = '';
}

/* Auto-open on ?action=scan param */
document.addEventListener('DOMContentLoaded', () => {
  if (new URLSearchParams(location.search).get('action') === 'scan') {
    window._pendingQuickScan = true;
  }
});
