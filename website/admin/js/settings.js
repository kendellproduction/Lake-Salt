/* ══════════════════════════════════════════════════════════════════════════
   MODULE 9 — SETTINGS

   Currently surfaces:
     • Theme picker — six preset color schemes for the admin backend.
       Selected theme is saved to localStorage and applied on every
       page load by initTheme() in app.js (runs before first render).

   Add other settings here over time (per-user prefs, notification
   toggles, etc).
   ════════════════════════════════════════════════════════════════════════ */

const THEMES = {
  default: {
    name: 'Lake Salt',
    swatch: ['#1A1412', '#C9A84C'],
    vars: {}, // empty = use admin.css defaults
  },
  cream: {
    name: 'Cream & Champagne (light)',
    swatch: ['#FAF8F4', '#A88B3E'],
    vars: {
      '--navy':      '#FAF8F4',
      '--navy-lt':   '#F2EDE0',
      '--navy-card': '#FFFFFF',
      '--navy-bd':   '#E5DCC9',
      '--gold':      '#A88B3E',
      '--gold-lt':   '#C9A96E',
      '--teal':      '#5B7B6A',
      '--teal-lt':   '#7A9B89',
      '--text':      '#1A1412',
      '--text-muted':'#6F6055',
      '--border':    'rgba(26,20,18,0.12)',
    },
  },
  midnight: {
    name: 'Midnight Black',
    swatch: ['#000000', '#FFD700'],
    vars: {
      '--navy':      '#000000',
      '--navy-lt':   '#0a0a0a',
      '--navy-card': '#0d0d0d',
      '--navy-bd':   '#1a1a1a',
      '--gold':      '#FFD700',
      '--gold-lt':   '#FFE56B',
      '--text':      '#FAFAFA',
      '--text-muted':'#888',
      '--border':    'rgba(255,255,255,0.1)',
    },
  },
  forest: {
    name: 'Forest & Copper',
    swatch: ['#0E1A14', '#B87333'],
    vars: {
      '--navy':      '#0E1A14',
      '--navy-lt':   '#13241C',
      '--navy-card': '#162420',
      '--navy-bd':   '#23362E',
      '--gold':      '#B87333',
      '--gold-lt':   '#D08C4C',
      '--teal':      '#6B8E6E',
      '--teal-lt':   '#86A78A',
      '--text':      '#E8DCC8',
      '--text-muted':'#8B9A8E',
      '--border':    'rgba(184,115,51,0.18)',
    },
  },
  burgundy: {
    name: 'Burgundy & Rose',
    swatch: ['#1B0F12', '#D4A574'],
    vars: {
      '--navy':      '#1B0F12',
      '--navy-lt':   '#221318',
      '--navy-card': '#251519',
      '--navy-bd':   '#3A2329',
      '--gold':      '#D4A574',
      '--gold-lt':   '#E8C295',
      '--teal':      '#9B7E8A',
      '--teal-lt':   '#B398A2',
      '--text':      '#F2E2DC',
      '--text-muted':'#A89694',
      '--border':    'rgba(212,165,116,0.15)',
    },
  },
  slate: {
    name: 'Slate Neutral',
    swatch: ['#181B1F', '#94A3B8'],
    vars: {
      '--navy':      '#181B1F',
      '--navy-lt':   '#1c2026',
      '--navy-card': '#1f242a',
      '--navy-bd':   '#2a3038',
      '--gold':      '#94A3B8',
      '--gold-lt':   '#CBD5E1',
      '--teal':      '#7B8B95',
      '--teal-lt':   '#9CAFB8',
      '--text':      '#E5E7EB',
      '--text-muted':'#9CA3AF',
      '--border':    'rgba(255,255,255,0.08)',
    },
  },
};

/* ─── Apply a theme: writes vars to :root + saves to localStorage ─────── */
function applyTheme(id) {
  const theme = THEMES[id] || THEMES.default;
  /* First clear any previously-set inline vars (so switching from cream
   * back to default actually unsets the overrides). */
  Object.keys(THEMES).forEach(k => {
    Object.keys(THEMES[k].vars || {}).forEach(varName => {
      document.documentElement.style.removeProperty(varName);
    });
  });
  /* Then apply the new ones */
  Object.entries(theme.vars || {}).forEach(([k, v]) => {
    document.documentElement.style.setProperty(k, v);
  });
  try { localStorage.setItem('ls-admin-theme', id); } catch (e) {}
}

/* ─── Run at startup BEFORE first module render (called from app.js) ─── */
function initTheme() {
  try {
    const saved = localStorage.getItem('ls-admin-theme');
    if (saved && THEMES[saved]) applyTheme(saved);
  } catch (e) { /* localStorage may be blocked; ignore */ }
}

/* ─── Settings module renderer ────────────────────────────────────────── */
async function renderSettings() {
  const c = document.getElementById('module-container');
  let current = 'default';
  try { current = localStorage.getItem('ls-admin-theme') || 'default'; } catch (e) {}

  c.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Settings</div>
        <div class="page-subtitle">Personalize your admin experience</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><span class="card-title">🎨 Theme</span></div>
      <p class="text-muted" style="font-size:13px;margin-bottom:14px;line-height:1.5">
        Click any swatch to apply instantly. Your choice is saved in this browser only.
      </p>
      <div id="theme-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px">
        ${Object.entries(THEMES).map(([id, theme]) => `
          <button
            type="button"
            class="theme-tile"
            data-theme="${id}"
            style="
              display:flex;flex-direction:column;align-items:stretch;gap:8px;
              padding:0;background:transparent;border:2px solid ${id === current ? 'var(--gold)' : 'var(--border)'};
              border-radius:12px;cursor:pointer;overflow:hidden;
              transition:transform 0.15s,border-color 0.15s;
              font-family:inherit;text-align:left;
            "
            onmouseover="this.style.transform='translateY(-2px)'"
            onmouseout="this.style.transform='translateY(0)'"
          >
            <div style="display:flex;height:64px">
              <div style="flex:1;background:${theme.swatch[0]}"></div>
              <div style="flex:1;background:${theme.swatch[1]}"></div>
            </div>
            <div style="padding:10px 12px 12px;background:var(--navy-card)">
              <div style="font-size:14px;font-weight:600;color:var(--text)">${theme.name}</div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:2px">
                ${id === current ? '✓ Active' : 'Click to apply'}
              </div>
            </div>
          </button>
        `).join('')}
      </div>
    </div>

    <div class="card" style="margin-top:18px">
      <div class="card-header"><span class="card-title">📱 Mobile experience</span></div>
      <p class="text-muted" style="font-size:13px;line-height:1.6">
        On mobile, the sidebar collapses behind a menu button (top-left). Tap it to navigate.
        Most modules are responsive — if anything looks broken on your phone, screenshot it and we'll fix.
      </p>
      <p class="text-muted" style="font-size:13px;line-height:1.6;margin-top:8px">
        Coming in Phase 2: a mobile home-screen-installable PWA, an iOS Shortcut for one-tap expense entry,
        and a fast-add lead widget. Track progress in <a href="#dashboard" style="color:var(--gold)">PHASE-2.md</a>.
      </p>
    </div>

    <div class="card" style="margin-top:18px">
      <div class="card-header"><span class="card-title">👤 Signed in as</span></div>
      <div style="font-size:14px;color:var(--text)">${currentUser?.displayName || currentUser?.email || 'Unknown'}</div>
      <div class="text-muted" style="font-size:12px;margin-top:2px">${currentUser?.email || ''}</div>
      <button class="btn btn-secondary" onclick="auth.signOut()" style="margin-top:14px;font-size:13px">Sign out</button>
    </div>
  `;

  /* Wire up theme clicks */
  document.querySelectorAll('.theme-tile').forEach(tile => {
    tile.addEventListener('click', () => {
      applyTheme(tile.dataset.theme);
      renderSettings(); /* re-render to update active indicator */
      showToast('Theme applied');
    });
  });
}
