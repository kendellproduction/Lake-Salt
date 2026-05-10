/**
 * Lake Salt shared analytics
 * ──────────────────────────
 * Drop this on any page and it auto-reports:
 *   • page_view            (once on load)
 *   • element_click        (every click, debounced & sampled to keep volume sane)
 *   • scroll_depth         (one record per 25 / 50 / 75 / 100 % milestone)
 *   • session_summary      (on tab hide — total time, max scroll depth, click count)
 *
 * Writes go to the Firestore `page_events` collection. Rules already allow
 * anonymous create on that collection.
 *
 * Usage on any page:
 *   <script src="firebase-config.js"></script>
 *   <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
 *   <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>
 *   <script src="/analytics.js"></script>
 *
 * Manual events:
 *   window.lsTrack('whatever_event', { props });
 */
(function () {
  'use strict';

  /* ── Firebase init guard ─────────────────────────────────────────────── */
  if (typeof firebase === 'undefined' || !firebase.firestore) return;
  if (window.FIREBASE_CONFIG && !firebase.apps.length) {
    firebase.initializeApp(window.FIREBASE_CONFIG);
  }
  const db = firebase.firestore();

  /* ── Session ID (sticky for ~30 min via sessionStorage) ──────────────── */
  function makeId() {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }
  let sessionId;
  try {
    sessionId = sessionStorage.getItem('lsSessionId');
    if (!sessionId) {
      sessionId = makeId();
      sessionStorage.setItem('lsSessionId', sessionId);
    }
  } catch (e) { sessionId = makeId(); }

  const sessionStart = Date.now();
  let clicksThisSession = 0;
  let maxScrollDepth = 0;
  const scrollMilestonesFired = {};

  /* ── Url + UTM extraction ────────────────────────────────────────────── */
  const url = new URL(window.location.href);
  const utm = {};
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(k => {
    const v = url.searchParams.get(k);
    if (v) utm[k] = v;
  });

  /* ── Core write ──────────────────────────────────────────────────────── */
  function track(event, props) {
    if (!event) return;
    try {
      db.collection('page_events').add({
        sessionId,
        page: window.location.pathname,
        event,
        props: props || {},
        ua: (navigator.userAgent || '').slice(0, 200),
        viewport: window.innerWidth + 'x' + window.innerHeight,
        referrer: document.referrer || '',
        utm,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch (e) { /* analytics never breaks UX */ }
  }
  window.lsTrack = track;

  /* ── 1. page_view ────────────────────────────────────────────────────── */
  track('page_view', {
    title: document.title,
    pageHeight: document.documentElement.scrollHeight,
  });

  /* ── 2. Click tracking ──────────────────────────────────────────────────
   * Captures every meaningful click. To avoid Firestore flood, we
   * debounce: rapid-fire clicks (< 250ms apart) collapse into one. */
  let lastClickAt = 0;
  document.addEventListener('click', (ev) => {
    const now = Date.now();
    if (now - lastClickAt < 250) return; /* debounce */
    lastClickAt = now;
    clicksThisSession++;

    /* Best-effort selector: prefer id, then nearest [data-track], then tag+class */
    const t = ev.target;
    if (!t || !t.tagName) return;
    let selector;
    const closestTracked = t.closest && t.closest('[data-track]');
    if (closestTracked) {
      selector = '[data-track="' + closestTracked.getAttribute('data-track') + '"]';
    } else if (t.id) {
      selector = '#' + t.id;
    } else if (t.tagName === 'A' || t.tagName === 'BUTTON') {
      selector = t.tagName.toLowerCase() + (t.className ? '.' + (t.className + '').trim().split(/\s+/).slice(0, 2).join('.') : '');
    } else {
      return; /* skip noise: clicks on plain spans, divs, etc. unless tagged */
    }

    const text = (t.innerText || t.textContent || '').trim().slice(0, 80);
    const href = t.tagName === 'A' ? (t.getAttribute('href') || '').slice(0, 200) : undefined;

    track('element_click', {
      selector,
      text,
      href,
      tag: t.tagName.toLowerCase(),
    });
  }, true);

  /* ── 3. Scroll-depth milestones (25/50/75/100%) ──────────────────────── */
  function reportScrollDepth() {
    const doc = document.documentElement;
    const scrolled = window.scrollY + window.innerHeight;
    const total = Math.max(doc.scrollHeight, 1);
    const pct = Math.min(100, Math.round((scrolled / total) * 100));
    if (pct > maxScrollDepth) maxScrollDepth = pct;
    [25, 50, 75, 100].forEach(milestone => {
      if (pct >= milestone && !scrollMilestonesFired[milestone]) {
        scrollMilestonesFired[milestone] = true;
        track('scroll_depth', { depth: milestone });
      }
    });
  }
  let scrollRaf = 0;
  window.addEventListener('scroll', () => {
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = 0;
      reportScrollDepth();
    });
  }, { passive: true });
  /* Also report once after initial render in case page is shorter than viewport */
  setTimeout(reportScrollDepth, 800);

  /* ── 4. Session summary on hide ──────────────────────────────────────── */
  let summarySent = false;
  function sendSessionSummary() {
    if (summarySent) return;
    summarySent = true;
    track('session_summary', {
      durationSec: Math.round((Date.now() - sessionStart) / 1000),
      clicks: clicksThisSession,
      maxScrollDepth,
    });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') sendSessionSummary();
    else summarySent = false; /* if they come back, allow another summary on next hide */
  });
  /* Belt + suspenders: also fire on pagehide for older browsers + iOS */
  window.addEventListener('pagehide', sendSessionSummary);
})();
