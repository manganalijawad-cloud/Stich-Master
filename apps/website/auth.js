(function () {
  function getSupabaseUrl() {
    const env = window.ENV || {};
    return env.VITE_SUPABASE_URL || env.SUPABASE_URL || '';
  }

  function getSupabaseAnonKey() {
    const env = window.ENV || {};
    return env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || '';
  }

  const supabaseUrl = getSupabaseUrl();
  const supabaseAnonKey = getSupabaseAnonKey();

  if (!supabaseUrl || !supabaseAnonKey) {
    document.getElementById('auth-error-text').textContent = 'Authentication is not configured. Please contact support.';
    document.getElementById('auth-error').classList.remove('hidden');
    document.getElementById('google-signin-btn').disabled = true;
    document.getElementById('email-signin-btn').disabled = true;
    return;
  }

  const supabase = window.supabase.createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'hellodarzi-auth',
    },
  });

  const els = {
    signedOut: document.getElementById('signed-out'),
    signedIn: document.getElementById('signed-in'),
    authContainer: document.getElementById('auth-container'),
    googleBtn: document.getElementById('google-signin-btn'),
    googleBtnContent: document.getElementById('google-btn-content'),
    googleBtnLoader: document.getElementById('google-btn-loader'),
    googleBtnText: document.getElementById('google-btn-text'),
    authError: document.getElementById('auth-error'),
    authErrorText: document.getElementById('auth-error-text'),
    userEmailDisplay: document.getElementById('user-email-display'),
    signOutBtn: document.getElementById('sign-out-btn'),
    emailForm: document.getElementById('email-signin-form'),
    emailInput: document.getElementById('email-input'),
    passwordInput: document.getElementById('password-input'),
    emailSigninBtn: document.getElementById('email-signin-btn'),
    authContainer: document.getElementById('auth-container'),
  };

  function showError(msg) {
    els.authErrorText.textContent = msg;
    els.authError.classList.remove('hidden');
  }

  function hideError() {
    els.authError.classList.add('hidden');
  }

  function setGoogleLoading(loading) {
    if (loading) {
      els.googleBtnContent.classList.add('hidden');
      els.googleBtnLoader.classList.remove('hidden');
      els.googleBtn.disabled = true;
    } else {
      els.googleBtnContent.classList.remove('hidden');
      els.googleBtnLoader.classList.add('hidden');
      els.googleBtn.disabled = false;
    }
  }

  function showSignedIn(user) {
    hideError();
    els.signedOut.classList.add('hidden');
    els.signedIn.classList.remove('hidden');
    els.userEmailDisplay.textContent = user.email || 'Signed in successfully';
  }

  function showSignedOut() {
    els.signedOut.classList.remove('hidden');
    els.signedIn.classList.add('hidden');
  }

  function getRedirectTo() {
    return window.location.origin + '/auth/callback';
  }

  async function handleGoogleSignIn() {
    hideError();
    setGoogleLoading(true);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: getRedirectTo(),
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) {
        showError(error.message);
        setGoogleLoading(false);
      }
      // If no error, the browser will navigate away to Google
    } catch (err) {
      showError('Failed to start Google sign in. Please try again.');
      setGoogleLoading(false);
    }
  }

  async function handleEmailSignIn(e) {
    e.preventDefault();
    hideError();

    const email = els.emailInput.value.trim();
    const password = els.passwordInput.value;

    if (!email || !password) {
      showError('Please enter your email and password.');
      return;
    }

    els.emailSigninBtn.disabled = true;
    els.emailSigninBtn.textContent = 'Signing in...';

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password,
      });

      if (error) {
        showError(error.message);
        els.emailSigninBtn.disabled = false;
        els.emailSigninBtn.textContent = 'Sign in with Email';
        return;
      }

      if (data.session) {
        showSignedIn(data.user);
      }
    } catch (err) {
      showError('Connection failed. Please try again.');
      els.emailSigninBtn.disabled = false;
      els.emailSigninBtn.textContent = 'Sign in with Email';
    }
  }

  async function handleSignOut() {
    hideError();
    await supabase.auth.signOut();
    showSignedOut();
    els.emailInput.value = '';
    els.passwordInput.value = '';
    els.emailSigninBtn.disabled = false;
    els.emailSigninBtn.textContent = 'Sign in with Email';
  }

  async function restoreSession() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        showSignedIn(session.user);
      }
    } catch (err) {
      console.error('Session restore failed:', err);
    }
  }

  // Auth state listener
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session) {
      showSignedIn(session.user);
    } else if (event === 'SIGNED_OUT') {
      showSignedOut();
    } else if (event === 'TOKEN_REFRESHED') {
      // Session was refreshed, nothing to do UI-wise
    }
  });

  // Event listeners
  els.googleBtn.addEventListener('click', handleGoogleSignIn);
  els.emailForm.addEventListener('submit', handleEmailSignIn);
  els.signOutBtn.addEventListener('click', handleSignOut);

  // Check for hash fragment on page load (from redirect OAuth)
  (async function init() {
    const hash = window.location.hash;
    if (hash && (hash.includes('access_token') || hash.includes('error'))) {
      // The callback page should handle this, but just in case
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        showSignedIn(session.user);
        // Clean the URL
        window.history.replaceState(null, '', window.location.pathname);
        return;
      }
    }

    await restoreSession();
  })();
})();
