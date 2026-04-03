/* ══════════════════════════════════════
   MODULE — MARKETING / CONTENT
   Lean: tool launchers + assets + Firebase graphics
══════════════════════════════════════ */

async function renderMarketing() {
  const c = document.getElementById('module-container');

  /* ── Fetch quick stats ── */
  let leadCount = 0, topSource = '—';
  try {
    const leadsSnap = await db.collection('leads').get();
    leadCount = leadsSnap.size;
    const sc = {};
    leadsSnap.forEach(d => { const s = d.data().source || 'Unknown'; sc[s] = (sc[s] || 0) + 1; });
    topSource = Object.entries(sc).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
  } catch(e) { console.warn('Marketing stats:', e); }

  c.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Marketing</div>
        <div class="page-subtitle">Content tools, brand assets, and team graphics</div>
      </div>
    </div>

    <!-- ── Quick Stats ── -->
    <div class="stat-grid" style="grid-template-columns:repeat(3,1fr);max-width:480px;">
      <div class="stat-card">
        <div class="stat-label">Total Leads</div>
        <div class="stat-value teal">${leadCount}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Top Source</div>
        <div class="stat-value" style="font-size:1rem;padding-top:4px">${topSource}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Rating</div>
        <div class="stat-value gold">5.0</div>
      </div>
    </div>

    <!-- ── Content Tools ── -->
    <div class="card">
      <div class="card-header">
        <span class="card-title">Content Tools</span>
        <span style="font-size:11px;color:var(--text-muted)">Opens inline — no new tabs</span>
      </div>
      <div class="content-tools-grid">
        <button class="content-tool-btn" onclick="openTool('brand-guide.html','Brand Guide')">
          <span class="ct-icon">🎨</span>
          <span class="ct-name">Brand Guide</span>
          <span class="ct-desc">Colors, fonts, logo usage, voice guidelines</span>
          <span class="ct-arrow">Open →</span>
        </button>
        <button class="content-tool-btn" onclick="openTool('content-creator.html','Content Creator')">
          <span class="ct-icon">✦</span>
          <span class="ct-name">Content Creator</span>
          <span class="ct-desc">Build Instagram & TikTok graphics in-browser</span>
          <span class="ct-arrow">Open →</span>
        </button>
        <button class="content-tool-btn" onclick="openTool('content-calendar.html','Content Calendar')">
          <span class="ct-icon">◫</span>
          <span class="ct-name">Content Calendar</span>
          <span class="ct-desc">Monthly schedule, captions, and hashtag banks</span>
          <span class="ct-arrow">Open →</span>
        </button>
      </div>
    </div>

    <!-- ── My Graphics (Firebase) ── -->
    <div class="card" style="margin-top:14px">
      <div class="card-header">
        <span class="card-title">My Graphics</span>
        <span style="font-size:11px;color:var(--text-muted)">Shared across all team members</span>
      </div>
      <label class="graphic-upload-zone" for="mg-upload-input" id="mg-upload-label">
        <span>↑</span> Upload images (PNG, JPG, GIF) — multiple OK
      </label>
      <input type="file" id="mg-upload-input" multiple accept="image/*" style="display:none" onchange="handleGraphicsUpload(event)">
      <div id="mg-progress-wrap" style="display:none">
        <div class="upload-progress-bar"><div class="upload-progress-fill" id="mg-progress-fill" style="width:0%"></div></div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px" id="mg-progress-label">Uploading…</div>
      </div>
      <div class="graphics-grid" id="mg-grid"></div>
    </div>

    <!-- ── Brand Assets (collapsible) ── -->
    <div class="card" style="margin-top:14px">
      <div class="collapsible-header" onclick="toggleCollapsible('logo-kit-body','logo-kit-chevron')">
        <span class="card-title">Logo Kit</span>
        <span class="collapsible-chevron" id="logo-kit-chevron">▼</span>
      </div>
      <div class="collapsible-body" id="logo-kit-body" style="max-height:0;overflow:hidden">
        <div class="asset-grid-sm" style="margin-top:14px">
          ${renderLogoKitItem('Gold Circle · White', 'logos/Gold Circle With White Text.svg', 'LakeSalt-GoldCircle-White.svg', '#0D1B2A', 'white')}
          ${renderLogoKitItem('Gold Circle · Black', 'logos/Gold Outer Circle Black Text.svg', 'LakeSalt-GoldCircle-Black.svg', '#F2E8D5', '#0C1526')}
          ${renderLogoKitItem('Thin Circle · White', 'logos/Thin White Circle with White Text.svg', 'LakeSalt-ThinCircle-White.svg', '#0D1B2A', 'white')}
          ${renderLogoKitItem('Thin Circle · Black', 'logos/Thin Black Circle with Black Text.svg', 'LakeSalt-ThinCircle-Black.svg', '#F2E8D5', '#0C1526')}
          ${renderLogoKitItem('Utah · White', 'logos/White Utah Outline with White Text.svg', 'LakeSalt-Utah-White.svg', '#0D1B2A', 'white')}
          ${renderLogoKitItem('Utah · Black', 'logos/Utah Outline with black text.svg', 'LakeSalt-Utah-Black.svg', '#F2E8D5', '#0C1526')}
        </div>
      </div>
    </div>

    <div class="card" style="margin-top:14px">
      <div class="collapsible-header" onclick="toggleCollapsible('photos-body','photos-chevron')">
        <span class="card-title">Brand Photography</span>
        <span class="collapsible-chevron" id="photos-chevron">▼</span>
      </div>
      <div class="collapsible-body" id="photos-body" style="max-height:0;overflow:hidden">
        <div class="asset-grid-sm" style="margin-top:14px">
          ${renderPhotoAsset('Wedding Floral Hero', '../images/wedding-floral-hero.jpg', 'LakeSalt-WeddingFloral.jpg', 'Palette inspiration')}
          ${renderPhotoAsset('Blush Drink', '../images/IMG_6896.jpeg', 'LakeSalt-BlushDrink.jpg', 'Signature cocktail')}
          ${renderPhotoAsset('Guest Moment', '../images/IMG_6950.jpeg', 'LakeSalt-GuestMoment.jpg', 'Lifestyle content')}
          ${renderPhotoAsset('Event Hero', '../images/IMG_6919_hero.jpeg', 'LakeSalt-EventHero.jpg', 'Wide event hero')}
          ${renderPhotoAsset('Corporate', '../images/IMG_6936_hero.jpeg', 'LakeSalt-CorporateHero.jpg', 'Corporate overhead')}
          ${renderPhotoAsset('Bar Setup', '../images/IMG_8331.jpeg', 'LakeSalt-BarSetup.jpg', 'Bar setup')}
        </div>
      </div>
    </div>

    <!-- ── Social Accounts (compact) ── -->
    <div class="card" style="margin-top:14px">
      <div class="card-header"><span class="card-title">Social Accounts</span></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px">
        ${socialLink('Instagram', '@lakesaltbar', 'https://www.instagram.com/lakesaltbar', '📸')}
        ${socialLink('TikTok', '@lakesaltbar', 'https://www.tiktok.com/@lakesaltbar', '🎵')}
        ${socialLink('Facebook', '/lakesaltbar', 'https://www.facebook.com/lakesaltbar', '👤')}
        ${socialLink('Website', 'lakesalt.us', 'https://lakesalt.us', '🌐')}
      </div>
    </div>
  `;

  // Load Firebase graphics
  loadFirebaseGraphics();
}

/* ── Social link helper ── */
function socialLink(name, handle, url, icon) {
  return `<a href="${url}" target="_blank" rel="noopener"
    style="display:flex;align-items:center;gap:10px;padding:9px 12px;background:var(--navy-lt);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);text-decoration:none;transition:border-color .15s"
    onmouseover="this.style.borderColor='var(--gold)'" onmouseout="this.style.borderColor='var(--border)'">
    <span style="font-size:16px">${icon}</span>
    <div>
      <div style="font-size:12px;font-weight:600">${name}</div>
      <div style="font-size:11px;color:var(--text-muted)">${handle}</div>
    </div>
  </a>`;
}

/* ── Logo kit item ── */
function renderLogoKitItem(label, src, filename, bgColor, textColor) {
  return `
    <div style="border-radius:var(--radius);overflow:hidden;border:1px solid var(--border);">
      <div style="background:${bgColor};padding:16px;display:flex;align-items:center;justify-content:center;height:72px;">
        <img src="${src}" alt="${label}" style="max-height:48px;max-width:100%;object-fit:contain;" onerror="this.parentElement.innerHTML='<div style=\\'font-family:serif;font-size:11px;color:${textColor};text-align:center;font-weight:600\\'>LAKE SALT</div>'">
      </div>
      <div style="padding:8px 10px;background:var(--navy-lt);">
        <div style="font-size:10px;font-weight:600;color:var(--text);margin-bottom:6px;line-height:1.3">${label}</div>
        <button onclick="downloadSVG('${src}','${filename}')" style="width:100%;padding:6px;background:var(--gold);color:#1A1412;border:none;border-radius:5px;font-size:10.5px;font-weight:700;cursor:pointer;">↓ SVG</button>
      </div>
    </div>`;
}

/* ── Photo asset ── */
function renderPhotoAsset(label, src, filename, caption) {
  return `
    <div style="border-radius:var(--radius);overflow:hidden;border:1px solid var(--border);">
      <div style="height:80px;overflow:hidden;background:var(--navy-lt);">
        <img src="${src}" alt="${label}" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none'">
      </div>
      <div style="padding:8px 10px;background:var(--navy-lt);">
        <div style="font-size:10.5px;font-weight:600;margin-bottom:2px">${label}</div>
        <div style="font-size:10px;color:var(--text-muted);margin-bottom:6px">${caption}</div>
        <button onclick="downloadPhoto('${src}','${filename}')" style="width:100%;padding:6px;background:var(--gold);color:#1A1412;border:none;border-radius:5px;font-size:10.5px;font-weight:700;cursor:pointer;">↓ Download</button>
      </div>
    </div>`;
}

/* ── Collapsible toggle ── */
function toggleCollapsible(bodyId, chevronId) {
  const body = document.getElementById(bodyId);
  const chevron = document.getElementById(chevronId);
  if (!body) return;
  const isOpen = body.style.maxHeight !== '0px' && body.style.maxHeight !== '';
  body.style.maxHeight = isOpen ? '0px' : body.scrollHeight + 200 + 'px';
  if (chevron) chevron.classList.toggle('open', !isOpen);
}

/* ── Download helpers ── */
function downloadSVG(path, filename) {
  const xhr = new XMLHttpRequest();
  xhr.open('GET', path, true); xhr.responseType = 'arraybuffer';
  xhr.onload = function() {
    const blob = new Blob([xhr.response], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };
  xhr.onerror = () => window.open(path, '_blank');
  xhr.send();
}
function downloadPhoto(src, filename) {
  const xhr = new XMLHttpRequest();
  xhr.open('GET', src, true); xhr.responseType = 'arraybuffer';
  xhr.onload = function() {
    const ext = filename.split('.').pop().toLowerCase();
    const mime = (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' : 'image/png';
    const blob = new Blob([xhr.response], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };
  xhr.onerror = () => window.open(src, '_blank');
  xhr.send();
}

/* ══════════════════════════════════════
   MY GRAPHICS — Firebase Storage + Firestore
   Collection: graphics
   Storage path: graphics/{uid}/{timestamp}_{filename}
══════════════════════════════════════ */

async function loadFirebaseGraphics() {
  const grid = document.getElementById('mg-grid');
  if (!grid) return;
  grid.innerHTML = `<div style="grid-column:1/-1;padding:20px;text-align:center;color:var(--text-muted);font-size:12px">Loading…</div>`;
  try {
    const snap = await db.collection('graphics').orderBy('uploadedAt', 'desc').get();
    if (snap.empty) {
      grid.innerHTML = `<div style="grid-column:1/-1;padding:24px;text-align:center;color:var(--text-muted);font-size:12px">No graphics yet — upload your first image above.</div>`;
      return;
    }
    grid.innerHTML = snap.docs.map((doc) => {
      const d = doc.data();
      const date = d.uploadedAt?.toDate ? d.uploadedAt.toDate().toLocaleDateString('en-US', { month:'short', day:'numeric' }) : '—';
      const shortName = (d.name || '').length > 18 ? d.name.slice(0, 16) + '…' : (d.name || 'Graphic');
      return `
        <div class="graphic-card">
          <div class="graphic-card-thumb">
            <img src="${d.url}" alt="${d.name}" loading="lazy">
          </div>
          <div class="graphic-card-info">
            <div class="graphic-card-name" title="${d.name}">${shortName}</div>
            <div class="graphic-card-date">${date} · ${d.uploadedBy || 'Team'}</div>
            <div class="graphic-card-actions">
              <button onclick="downloadGraphic('${d.url}','${d.name}')" style="flex:1;padding:5px;background:var(--gold);color:#1A1412;border:none;border-radius:5px;font-size:10.5px;font-weight:700;cursor:pointer">↓</button>
              <button onclick="deleteGraphic('${doc.id}','${d.storagePath || ''}')" style="padding:5px 8px;background:transparent;border:1px solid var(--border);color:var(--text-muted);border-radius:5px;font-size:10.5px;cursor:pointer" onmouseover="this.style.borderColor='var(--red)';this.style.color='var(--red)'" onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--text-muted)'">✕</button>
            </div>
          </div>
        </div>`;
    }).join('');
  } catch(e) {
    console.warn('loadFirebaseGraphics:', e);
    grid.innerHTML = `<div style="grid-column:1/-1;padding:20px;text-align:center;color:var(--red);font-size:12px">Failed to load graphics — check Firestore rules.</div>`;
  }
}

async function handleGraphicsUpload(event) {
  const files = Array.from(event.target.files);
  if (!files.length) return;

  const progressWrap = document.getElementById('mg-progress-wrap');
  const progressFill = document.getElementById('mg-progress-fill');
  const progressLabel = document.getElementById('mg-progress-label');
  if (progressWrap) progressWrap.style.display = 'block';

  let completed = 0;
  const total = files.length;

  for (const file of files) {
    const timestamp = Date.now();
    const uid = currentUser?.uid || 'shared';
    const storagePath = `graphics/${uid}/${timestamp}_${file.name}`;
    try {
      const ref = storage.ref(storagePath);
      const uploadTask = ref.put(file);

      await new Promise((resolve, reject) => {
        uploadTask.on('state_changed',
          (snap) => {
            const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
            if (progressFill) progressFill.style.width = pct + '%';
            if (progressLabel) progressLabel.textContent = `Uploading ${file.name}… ${pct}%`;
          },
          reject,
          async () => {
            const url = await uploadTask.snapshot.ref.getDownloadURL();
            await db.collection('graphics').add({
              name: file.name,
              url,
              storagePath,
              uploadedBy: currentUser?.displayName?.split(' ')[0] || 'Team',
              uploadedAt: TS(),
              size: file.size
            });
            completed++;
            if (progressFill) progressFill.style.width = Math.round((completed / total) * 100) + '%';
            resolve();
          }
        );
      });
    } catch(e) {
      console.error('Upload failed:', e);
      showToast(`Failed to upload ${file.name}`, 'error');
    }
  }

  if (progressWrap) setTimeout(() => { progressWrap.style.display = 'none'; }, 1200);
  document.getElementById('mg-upload-input').value = '';
  showToast(`${completed} graphic${completed !== 1 ? 's' : ''} uploaded`, 'success');
  loadFirebaseGraphics();
}

function downloadGraphic(url, name) {
  const a = document.createElement('a');
  a.href = url; a.download = name; a.target = '_blank';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

async function deleteGraphic(docId, storagePath) {
  if (!confirmAction('Remove this graphic from the team library?')) return;
  try {
    await db.collection('graphics').doc(docId).delete();
    if (storagePath) {
      try { await storage.ref(storagePath).delete(); } catch(e) { /* ignore if already gone */ }
    }
    showToast('Graphic removed', 'success');
    loadFirebaseGraphics();
  } catch(e) {
    showToast('Failed to delete graphic', 'error');
  }
}
