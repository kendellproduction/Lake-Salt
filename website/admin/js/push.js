/* Lake Salt Admin — Push Notifications (FCM Web Push)
   ────────────────────────────────────────────────────
   Registers this device for push notifications so agents/Cloud Functions can
   reach Kendell's phone via the installed PWA. Flow:
     1. After sign-in, if permission not yet granted, show an "Enable
        notifications" banner (iOS requires the request to come from a tap).
     2. On grant, get an FCM token bound to our existing /admin service worker
        and store it in Firestore `push_tokens/{token}`.
     3. Foreground messages render as in-app toasts; background pushes are
        handled by service-worker.js.
   Sending a push = creating a doc in the `notifications` collection:
     { title, body, url? } — see functions/index.js (sendPushNotification). */
(function () {
  'use strict';

  var VAPID_KEY = (window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.vapidKey) || '';

  function supported() {
    return 'Notification' in window &&
           'serviceWorker' in navigator &&
           'PushManager' in window &&
           firebase && firebase.messaging && firebase.messaging.isSupported && firebase.messaging.isSupported();
  }

  function registerToken(user) {
    if (!VAPID_KEY) { console.warn('[push] vapidKey missing in firebase-config.js — skipping registration'); return; }
    navigator.serviceWorker.ready.then(function (reg) {
      return firebase.messaging().getToken({ vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
    }).then(function (token) {
      if (!token) return;
      return firebase.firestore().collection('push_tokens').doc(token).set({
        uid: user.uid,
        email: user.email || '',
        ua: navigator.userAgent,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }).then(function () {
      console.log('[push] device registered for notifications');
    }).catch(function (err) {
      console.warn('[push] token registration failed:', err && err.message);
    });
  }

  function showBanner(user) {
    if (document.getElementById('push-banner')) return;
    var el = document.createElement('div');
    el.id = 'push-banner';
    el.style.cssText = 'position:fixed;bottom:16px;left:16px;right:16px;z-index:9999;' +
      'background:#162033;border:1px solid rgba(201,169,110,0.4);border-radius:12px;' +
      'padding:14px 16px;display:flex;align-items:center;gap:12px;max-width:520px;margin:0 auto;' +
      'box-shadow:0 8px 24px rgba(0,0,0,0.35);font-family:inherit;';
    el.innerHTML =
      '<div style="flex:1;min-width:0;">' +
        '<div style="font-weight:600;color:#faf8f4;font-size:14px;">Enable notifications</div>' +
        '<div style="color:rgba(250,248,244,0.6);font-size:12px;margin-top:2px;">Get a popup when a lead needs your attention.</div>' +
      '</div>' +
      '<button id="push-enable-btn" style="background:#c9a96e;color:#1a1412;border:0;border-radius:8px;padding:9px 16px;font-weight:600;font-size:13px;cursor:pointer;">Enable</button>' +
      '<button id="push-dismiss-btn" style="background:transparent;color:rgba(250,248,244,0.5);border:0;font-size:16px;cursor:pointer;padding:4px;">✕</button>';
    document.body.appendChild(el);

    document.getElementById('push-enable-btn').addEventListener('click', function () {
      /* Must be called from a user gesture (hard requirement on iOS PWA). */
      Notification.requestPermission().then(function (perm) {
        el.remove();
        if (perm === 'granted') registerToken(user);
      });
    });
    document.getElementById('push-dismiss-btn').addEventListener('click', function () {
      el.remove();
      try { sessionStorage.setItem('push-banner-dismissed', '1'); } catch (e) {}
    });
  }

  function init(user) {
    if (!supported()) return;
    if (Notification.permission === 'granted') {
      registerToken(user); /* refresh token silently on every launch */
    } else if (Notification.permission === 'default') {
      try { if (sessionStorage.getItem('push-banner-dismissed')) return; } catch (e) {}
      showBanner(user);
    }
    /* Foreground messages → in-app toast (no system notification needed). */
    try {
      firebase.messaging().onMessage(function (payload) {
        var d = (payload && payload.data) || {};
        if (typeof window.showToast === 'function') {
          window.showToast((d.title ? d.title + ' — ' : '') + (d.body || ''));
        } else {
          console.log('[push] message:', d.title, d.body);
        }
      });
    } catch (e) { /* messaging unsupported in this context */ }
  }

  firebase.auth().onAuthStateChanged(function (user) {
    if (user) setTimeout(function () { init(user); }, 1500);
  });
})();
