/* Business Documents — protected PDFs stored in Firebase Storage. */

function renderDocuments() {
  const el = document.getElementById('module-container');
  el.innerHTML = `
    <div class="page-header">
      <div><h1 class="page-title">Business Documents</h1>
      <p class="page-subtitle">Insurance, licenses, and other venue-ready records.</p></div>
      <button class="btn btn-primary" id="doc-upload-btn">Upload PDF</button>
    </div>
    <input id="doc-file-input" type="file" accept="application/pdf,.pdf" hidden multiple>
    <div class="card" style="margin-bottom:16px">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px">
        <label class="form-group"><span class="form-label">Category</span>
          <select id="doc-category" class="form-input"><option>Insurance</option><option>Licenses</option><option>Tax</option><option>Contracts</option><option>Other</option></select>
        </label>
        <label class="form-group"><span class="form-label">Expiration date (optional)</span>
          <input id="doc-expires" class="form-input" type="date">
        </label>
      </div>
      <p class="text-muted" style="font-size:12px;margin-top:8px">PDF only · maximum 20 MB · visible only to CRM admins.</p>
    </div>
    <div id="business-documents-list"><div class="empty-state">Loading documents…</div></div>`;

  const input = document.getElementById('doc-file-input');
  document.getElementById('doc-upload-btn').addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const files = Array.from(input.files || []);
    if (!files.length) return;
    for (const file of files) await uploadBusinessDocument(file);
    input.value = '';
  });

  loadBusinessDocuments();
}

async function loadBusinessDocuments() {
  try {
    const snap = await db.collection('settings').doc('business_documents').get();
    const items = snap.exists && Array.isArray(snap.data().documents) ? snap.data().documents : [];
    items.sort((a, b) => String(b.uploadedAt).localeCompare(String(a.uploadedAt)));
    renderBusinessDocumentList(items);
  } catch (err) {
    console.error('Document list failed:', err);
    document.getElementById('business-documents-list').innerHTML = '<div class="empty-state">Could not load documents.</div>';
  }
}

async function uploadBusinessDocument(file) {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    showToast(`${file.name} is not a PDF`, 'error'); return;
  }
  if (file.size > 20 * 1024 * 1024) { showToast(`${file.name} is over 20 MB`, 'error'); return; }
  const category = document.getElementById('doc-category').value || 'Other';
  const expiresOn = document.getElementById('doc-expires').value || null;
  const safeName = file.name.replace(/[^a-zA-Z0-9._ -]/g, '_');
  const storagePath = `business-documents/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
  try {
    showToast(`Uploading ${file.name}…`, 'info', 8000);
    const task = await storage.ref(storagePath).put(file, {
      contentType: 'application/pdf',
      customMetadata: {
        displayName: file.name, category,
        expiresOn: expiresOn || '',
        uploadedBy: currentUser?.displayName || currentUser?.email || 'Admin'
      }
    });
    const downloadUrl = await task.ref.getDownloadURL();
    await db.collection('settings').doc('business_documents').set({
      documents: firebase.firestore.FieldValue.arrayUnion({
        name: file.name, category, expiresOn: expiresOn || null,
        size: file.size, storagePath, downloadUrl,
        uploadedAt: new Date().toISOString()
      })
    }, { merge: true });
    await logActivity('uploaded', 'business_documents', storagePath, `Business document uploaded: ${file.name}`);
    showToast(`${file.name} saved`, 'success');
    await loadBusinessDocuments();
  } catch (err) {
    console.error('Document upload failed:', err);
    showToast(`Could not upload ${file.name}`, 'error');
  }
}

function renderBusinessDocumentList(items) {
  const el = document.getElementById('business-documents-list');
  if (!el) return;
  if (!items.length) { el.innerHTML = '<div class="card empty-state">No business documents yet.</div>'; return; }
  el.innerHTML = `<div style="display:grid;gap:12px">${items.map(d => `
    <div class="card" style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
      <div style="font-size:24px">▤</div>
      <div style="flex:1;min-width:220px">
        <div style="font-weight:700;color:var(--text)">${escapeHtmlSafe(d.name || 'Document')}</div>
        <div class="text-muted" style="font-size:12px;margin-top:4px">${escapeHtmlSafe(d.category || 'Other')}${d.expiresOn ? ` · Expires ${escapeHtmlSafe(d.expiresOn)}` : ''}${d.size ? ` · ${(d.size / 1024).toFixed(0)} KB` : ''}</div>
      </div>
      <a class="btn btn-secondary" href="${escapeHtmlSafe(d.downloadUrl || '#')}" target="_blank" rel="noopener">Open PDF</a>
    </div>`).join('')}</div>`;
}
