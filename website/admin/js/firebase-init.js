/* ─── FIREBASE INIT ───────────────────────────────────────────────────────────
   Config is loaded from /firebase-config.js (gitignored).
   That file sets window.FIREBASE_CONFIG before this script runs.
   Never hardcode API keys here — use the config file instead.
─────────────────────────────────────────────────────────────────────────────── */
if (!window.FIREBASE_CONFIG) {
  document.body.innerHTML = `<div style="font-family:sans-serif;padding:40px;color:#c00">
    <h2>Missing firebase-config.js</h2>
    <p>Copy <code>firebase-config.example.js</code> → <code>firebase-config.js</code> and fill in your project values.</p>
  </div>`;
  throw new Error('FIREBASE_CONFIG not loaded. See firebase-config.example.js.');
}

firebase.initializeApp(window.FIREBASE_CONFIG);

const db      = firebase.firestore();
const auth    = firebase.auth();
const storage = firebase.storage();

// Convenience timestamp helpers
const TS     = () => firebase.firestore.FieldValue.serverTimestamp();
const TS_NOW = firebase.firestore.Timestamp.now;

/* ── FIRESTORE RULES NEEDED ────────────────────────────────────────────────────
   Add these collections to your Firebase Console → Firestore → Rules:

   match /notes/{docId} {
     allow read, write: if request.auth != null;
   }
   match /graphics/{docId} {
     allow read, write: if request.auth != null;
   }

   STORAGE RULES (Firebase Console → Storage → Rules):
   match /graphics/{allPaths=**} {
     allow read, write: if request.auth != null;
   }
─────────────────────────────────────────────────────────────────────────────── */
