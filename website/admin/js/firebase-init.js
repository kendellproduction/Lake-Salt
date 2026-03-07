/* ─── FIREBASE INIT ───────────────────────────────────────────────────────────
   SECURITY NOTE: Firebase web API keys are PUBLIC by design.
   They identify the Firebase project to the SDK — they are NOT passwords.
   Real security is enforced by:
     1. Firestore Security Rules  (firestore.rules — deployed via firebase deploy)
     2. Firebase Auth             (only allowlisted Google accounts can sign in)
     3. API key HTTP referrer restrictions in Google Cloud Console
        → Restrict this key to: https://lakesalt.us/* and https://www.lakesalt.us/*
   See: https://firebase.google.com/docs/projects/api-keys
   nosemgrep: generic.secrets.security.detected-generic-api-key
*/
const firebaseConfig = {
  apiKey:            "AIzaSyDM0fwljJyweIFdVXTmZqtHoJdJkuWaDrc", // gitleaks:allow
  authDomain:        "lake-salt.firebaseapp.com",
  projectId:         "lake-salt",
  storageBucket:     "lake-salt.firebasestorage.app",
  messagingSenderId: "763405613762",
  appId:             "1:763405613762:web:d53537608a6b39bd3d195b",
  measurementId:     "G-LSQL7V93XB"
};

firebase.initializeApp(firebaseConfig);

const db      = firebase.firestore();
const auth    = firebase.auth();
const storage = firebase.storage();

// Convenience timestamp
const TS = () => firebase.firestore.FieldValue.serverTimestamp();
const TS_NOW = firebase.firestore.Timestamp.now;
