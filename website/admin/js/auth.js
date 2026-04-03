/* ─── AUTH MODULE ─── */

const OWNER_EMAIL = 'kendellproduction@gmail.com';
let currentUser  = null;
let currentRole  = null;

function initAuth() {
  const authScreen = document.getElementById('auth-screen');
  const adminApp   = document.getElementById('admin-app');

  /* Show loading indicator while Firebase resolves auth state —
     prevents the "signed out" flash when navigating back from sub-pages */
  const signinBtn = document.getElementById('google-signin-btn');
  const loadingEl = document.createElement('p');
  loadingEl.id = 'auth-loading-msg';
  loadingEl.style.cssText = 'color:#9A8A7F;font-size:13px;padding:16px 0;letter-spacing:0.03em';
  loadingEl.textContent = 'Loading…';
  if (signinBtn) {
    signinBtn.style.display = 'none';
    signinBtn.parentNode.insertBefore(loadingEl, signinBtn);
  }

  auth.onAuthStateChanged(async (user) => {
    /* Remove loading indicator, reveal sign-in button if needed */
    const loadMsg = document.getElementById('auth-loading-msg');
    if (loadMsg) loadMsg.remove();
    if (signinBtn) signinBtn.style.display = '';

    if (user) {
      // Check admins collection first
      const adminDoc = await db.collection('admins').doc(user.uid).get();

      if (adminDoc.exists) {
        currentUser = user;
        currentRole = adminDoc.data().role || 'manager';
        onAuthed(user, currentRole);
      } else if (user.email === OWNER_EMAIL) {
        // Auto-provision owner on first login
        await db.collection('admins').doc(user.uid).set({
          uid:       user.uid,
          email:     user.email,
          name:      user.displayName || '',
          role:      'owner',
          createdAt: TS()
        });
        currentUser = user;
        currentRole = 'owner';
        onAuthed(user, 'owner');
      } else {
        // Unauthorized
        await auth.signOut();
        showAuthError('Access denied. Contact the account owner to be added.');
        authScreen.style.display = 'flex';
        adminApp.style.display   = 'none';
      }
    } else {
      currentUser = null;
      currentRole = null;
      authScreen.style.display = 'flex';
      adminApp.style.display   = 'none';
    }
  });

  // Sign in button
  document.getElementById('google-signin-btn').addEventListener('click', () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(err => {
      showAuthError('Sign-in failed: ' + err.message);
    });
  });

  // Sign out button
  document.getElementById('signout-btn').addEventListener('click', () => {
    auth.signOut();
  });
}

function onAuthed(user, role) {
  const authScreen = document.getElementById('auth-screen');
  const adminApp   = document.getElementById('admin-app');

  authScreen.style.display = 'none';
  adminApp.style.display   = 'flex';

  // Set user info in sidebar
  const name  = user.displayName || user.email.split('@')[0];
  const photo = user.photoURL || '';

  document.getElementById('user-name').textContent    = name;
  document.getElementById('user-role').textContent    = role;
  document.getElementById('user-avatar').src          = photo;
  document.getElementById('user-avatar-mobile').src   = photo;

  // Hide user management for managers
  if (role === 'manager') {
    document.querySelectorAll('[data-owner-only]').forEach(el => el.style.display = 'none');
  }

  // Load initial module from hash
  const hash = window.location.hash.replace('#', '') || 'dashboard';
  loadModule(hash);
}

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

function requireAuth() {
  return !!currentUser;
}
