/* ─── FIREBASE INIT ─── */
const firebaseConfig = {
  apiKey:            "AIzaSyDM0fwljJyweIFdVXTmZqtHoJdJkuWaDrc",
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
