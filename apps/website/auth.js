(function () {
  function getSupabaseUrl() {
    var env = window.ENV || {};
    return env.VITE_SUPABASE_URL || env.SUPABASE_URL || '';
  }

  function getSupabaseAnonKey() {
    var env = window.ENV || {};
    return env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || '';
  }

  var supabaseUrl = getSupabaseUrl();
  var supabaseAnonKey = getSupabaseAnonKey();

  if (!supabaseUrl || !supabaseAnonKey) {
    var errEl = document.getElementById('auth-error');
    var errText = document.getElementById('auth-error-text');
    if (errEl && errText) {
      errText.textContent = 'Authentication is not configured. Please contact support.';
      errEl.classList.remove('hidden');
    }
    return;
  }

  var supabase = window.supabase.createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'hellodarzi-auth',
    },
  });

  // ── DOM refs ──
  var els = {
    signedOut: document.getElementById('signed-out'),
    signedIn: documentId('signed-in'),
    pageTitle: documentId('page-title'),
    pageSubtitle: documentId('page-subtitle'),
    authError: documentId('auth-error'),
    authErrorText: documentId('auth-error-text'),
    authSuccess: documentId('auth-success'),
    authSuccessText: documentId('auth-success-text'),
    googleBtn: documentId('google-signin-btn'),
    googleBtnContent: documentId('google-btn-content'),
    googleBtnLoader: documentId('google-btn-loader'),
    googleBtnText: documentId('google-btn-text'),
    userEmailDisplay: documentId('user-email-display'),
    signOutBtn: documentId('sign-out-btn'),

    signinWrapper: documentId('signin-form-wrapper'),
    signinForm: documentId('email-signin-form'),
    signinEmail: documentId('signin-email'),
    signinPassword: documentId('signin-password'),
    signinBtn: documentId('signin-btn'),
    rememberMe: documentId('remember-me'),

    signupWrapper: documentId('signup-form-wrapper'),
    signupForm: documentId('email-signup-form'),
    signupName: documentId('signup-name'),
    signupEmail: documentId('signup-email'),
    signupPassword: documentId('signup-password'),
    signupBtn: documentId('signup-btn'),

    forgotWrapper: documentId('forgot-form-wrapper'),
    forgotForm: documentId('forgot-form'),
    forgotEmail: documentId('forgot-email'),
    forgotBtn: documentId('forgot-btn'),

    resetWrapper: documentId('reset-form-wrapper'),
    resetForm: documentId('reset-form'),
    resetPassword: documentId('reset-password'),
    resetBtn: documentId('reset-btn'),
  };

  function documentId(id) { return document.getElementById(id); }

  // ── Helpers ──
  function showError(msg) {
    hideEl(els.authSuccess);
    els.authErrorText.textContent = msg;
    showEl(els.authError);
  }

  function showSuccess(msg) {
    hideEl(els.authError);
    els.authSuccessText.textContent = msg;
    showEl(els.authSuccess);
  }

  function hideError() { hideEl(els.authError); }
  function hideSuccess() { hideEl(els.authSuccess); }

  function hideEl(el) { if (el) el.classList.add('hidden'); }
  function showEl(el) { if (el) el.classList.remove('hidden'); }

  var googleLoading = false;
  function setGoogleLoading(loading) {
    googleLoading = loading;
    if (loading) {
      hideEl(els.googleBtnContent);
      showEl(els.googleBtnLoader);
      els.googleBtn.disabled = true;
    } else {
      showEl(els.googleBtnContent);
      hideEl(els.googleBtnLoader);
      els.googleBtn.disabled = false;
    }
  }

  function setFormLoading(formBtn, loading, text) {
    if (formBtn) {
      formBtn.disabled = loading;
      formBtn.textContent = loading ? (text || 'Please wait...') : text;
    }
  }

  function showSignedIn(user) {
    hideError();
    hideSuccess();
    hideEl(els.signedOut);
    showEl(els.signedIn);
    if (els.userEmailDisplay) els.userEmailDisplay.textContent = user.email || '';
  }

  function showSignedOut() {
    showEl(els.signedOut);
    hideEl(els.signedIn);
  }

  // ── Mode switching ──
  var currentAction = 'signin';

  function switchMode(action) {
    currentAction = action;
    hideError();
    hideSuccess();

    hideEl(els.signinWrapper);
    hideEl(els.signupWrapper);
    hideEl(els.forgotWrapper);
    hideEl(els.resetWrapper);

    if (action === 'signup') {
      showEl(els.signupWrapper);
      els.pageTitle.textContent = 'Create your account';
      els.pageSubtitle.textContent = 'Sign up to get started with Hello Darzi';
      els.googleBtnText.textContent = 'Sign up with Google';
      if (els.signupName) els.signupName.focus();
    } else if (action === 'forgot') {
      showEl(els.forgotWrapper);
      els.pageTitle.textContent = 'Reset your password';
      els.pageSubtitle.textContent = "We'll send you a reset link";
      els.googleBtnText.textContent = 'Continue with Google';
      if (els.forgotEmail) els.forgotEmail.focus();
    } else if (action === 'reset') {
      showEl(els.resetWrapper);
      els.pageTitle.textContent = 'Set new password';
      els.pageSubtitle.textContent = 'Enter your new password below';
      els.googleBtnText.textContent = 'Continue with Google';
      if (els.resetPassword) els.resetPassword.focus();
    } else {
      showEl(els.signinWrapper);
      els.pageTitle.textContent = 'Welcome back';
      els.pageSubtitle.textContent = 'Sign in to manage your account';
      els.googleBtnText.textContent = 'Continue with Google';
      if (els.signinEmail) els.signinEmail.focus();
    }
  }

  // Read action from URL
  var urlParams = new URLSearchParams(window.location.search);
  var actionParam = urlParams.get('action');
  if (actionParam === 'signup' || actionParam === 'forgot' || actionParam === 'reset') {
    switchMode(actionParam);
  }

  // ── Google Sign In ──
  async function handleGoogleSignIn() {
    if (googleLoading) return;
    hideError();
    hideSuccess();
    setGoogleLoading(true);
    try {
      var { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + '/auth/callback',
          queryParams: { access_type: 'offline', prompt: 'consent' },
        },
      });
      if (error) { showError(error.message); setGoogleLoading(false); }
    } catch (err) {
      showError('Failed to start Google sign in. Please try again.');
      setGoogleLoading(false);
    }
  }

  // ── Email Sign In ──
  async function handleEmailSignIn(e) {
    e.preventDefault();
    hideError();
    hideSuccess();

    var email = (els.signinEmail.value || '').trim();
    var password = els.signinPassword.value || '';

    if (!email || !password) { showError('Please enter your email and password.'); return; }

    setFormLoading(els.signinBtn, true, 'Sign in');
    try {
      var { data, error } = await supabase.auth.signInWithPassword({ email: email.toLowerCase(), password: password });
      if (error) { showError(error.message); setFormLoading(els.signinBtn, false, 'Sign in'); return; }
      if (data.session) showSignedIn(data.user);
    } catch (err) {
      showError('Connection failed. Please try again.');
      setFormLoading(els.signinBtn, false, 'Sign in');
    }
  }

  // ── Email Sign Up ──
  async function handleEmailSignUp(e) {
    e.preventDefault();
    hideError();
    hideSuccess();

    var name = (els.signupName.value || '').trim();
    var email = (els.signupEmail.value || '').trim();
    var password = els.signupPassword.value || '';

    if (!name) { showError('Please enter your name.'); return; }
    if (!email) { showError('Please enter your email.'); return; }
    if (password.length < 8) { showError('Password must be at least 8 characters.'); return; }

    setFormLoading(els.signupBtn, true, 'Creating account...');
    try {
      var { data, error } = await supabase.auth.signUp({
        email: email.toLowerCase(),
        password: password,
        options: {
          data: { name: name },
          emailRedirectTo: window.location.origin + '/auth/callback',
        },
      });

      if (error) { showError(error.message); setFormLoading(els.signupBtn, false, 'Create account'); return; }

      if (data.session) {
        showSignedIn(data.user);
      } else {
        showSuccess('Account created! Check your email for a confirmation link. You can sign in below.');
        switchMode('signin');
        els.signinEmail.value = email;
      }
    } catch (err) {
      showError('Connection failed. Please try again.');
    }
    setFormLoading(els.signupBtn, false, 'Create account');
  }

  // ── Forgot Password ──
  async function handleForgotPassword(e) {
    e.preventDefault();
    hideError();
    hideSuccess();

    var email = (els.forgotEmail.value || '').trim();
    if (!email) { showError('Please enter your email.'); return; }

    setFormLoading(els.forgotBtn, true, 'Sending...');
    try {
      var { error } = await supabase.auth.resetPasswordForEmail(email.toLowerCase(), {
        redirectTo: window.location.origin + '/auth/callback',
      });
      if (error) { showError(error.message); setFormLoading(els.forgotBtn, false, 'Send reset link'); return; }
      showSuccess('Check your email for a password reset link.');
      setFormLoading(els.forgotBtn, false, 'Send reset link');
    } catch (err) {
      showError('Connection failed. Please try again.');
      setFormLoading(els.forgotBtn, false, 'Send reset link');
    }
  }

  // ── Reset Password ──
  async function handleResetPassword(e) {
    e.preventDefault();
    hideError();
    hideSuccess();

    var password = els.resetPassword.value || '';
    if (password.length < 8) { showError('Password must be at least 8 characters.'); return; }

    setFormLoading(els.resetBtn, true, 'Resetting...');
    try {
      var { error } = await supabase.auth.updateUser({ password: password });
      if (error) { showError(error.message); setFormLoading(els.resetBtn, false, 'Reset password'); return; }
      showSuccess('Password updated successfully! You can now sign in with your new password.');
      setTimeout(function() { switchMode('signin'); }, 2000);
    } catch (err) {
      showError('Connection failed. Please try again.');
    }
    setFormLoading(els.resetBtn, false, 'Reset password');
  }

  // ── Sign Out ──
  async function handleSignOut() {
    hideError();
    hideSuccess();
    await supabase.auth.signOut();
    showSignedOut();
    els.signinEmail.value = '';
    els.signinPassword.value = '';
    switchMode('signin');
  }

  // ── Restore Session ──
  async function restoreSession() {
    try {
      var { data: { session } } = await supabase.auth.getSession();
      if (session) { showSignedIn(session.user); return true; }
    } catch (err) { /* noop */ }
    return false;
  }

  // ── Auth state listener ──
  supabase.auth.onAuthStateChange(function (event, session) {
    if (event === 'SIGNED_IN' && session) {
      showSignedIn(session.user);
    } else if (event === 'SIGNED_OUT') {
      showSignedOut();
    }
  });

  // ── Password toggle ──
  function setupPasswordToggle(toggleId, inputId, eyeId, eyeOffId) {
    var toggle = document.getElementById(toggleId);
    var input = document.getElementById(inputId);
    var eye = document.getElementById(eyeId);
    var eyeOff = document.getElementById(eyeOffId);
    if (!toggle || !input || !eye || !eyeOff) return;
    toggle.addEventListener('click', function() {
      var isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      eye.classList.toggle('hidden', !isPassword);
      eyeOff.classList.toggle('hidden', isPassword);
    });
  }
  setupPasswordToggle('toggle-signin-password', 'signin-password', 'signin-password-eye', 'signin-password-eye-off');
  setupPasswordToggle('toggle-signup-password', 'signup-password', 'signup-password-eye', 'signup-password-eye-off');
  setupPasswordToggle('toggle-reset-password', 'reset-password', 'reset-password-eye', 'reset-password-eye-off');

  // ── Wire events ──
  els.googleBtn.addEventListener('click', handleGoogleSignIn);
  els.signinForm.addEventListener('submit', handleEmailSignIn);
  els.signupForm.addEventListener('submit', handleEmailSignUp);
  els.forgotForm.addEventListener('submit', handleForgotPassword);
  els.resetForm.addEventListener('submit', handleResetPassword);
  els.signOutBtn.addEventListener('click', handleSignOut);

  // ── Init ──
  (async function init() {
    var hash = window.location.hash;
    if (hash && hash.includes('type=recovery')) {
      // Password recovery flow — show reset form
      showSignedOut();
      switchMode('reset');
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      return;
    }
    if (hash && (hash.includes('access_token') || hash.includes('error'))) {
      var { data: { session } } = await supabase.auth.getSession();
      if (session) {
        showSignedIn(session.user);
        window.history.replaceState(null, '', window.location.pathname);
        return;
      }
    }
    var restored = await restoreSession();
    if (!restored) {
      showSignedOut();
    }
  })();
})();
