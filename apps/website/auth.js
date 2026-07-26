(function () {
  var signedOut = document.getElementById('signed-out');
  var signedIn = document.getElementById('signed-in');
  var pageTitle = document.getElementById('page-title');
  var pageSubtitle = document.getElementById('page-subtitle');

  if (pageTitle) pageTitle.textContent = 'Desktop app only';
  if (pageSubtitle) {
    pageSubtitle.textContent =
      'Hello Darzi runs fully offline on your computer. Sign-in and all shop data live in the desktop app — there is no web account.';
  }

  if (signedIn) signedIn.classList.add('hidden');
  if (signedOut) {
    signedOut.classList.remove('hidden');
    // Hide email/password form controls if present; keep download CTA.
    ['email', 'password', 'auth-submit', 'forgot-password-link', 'toggle-mode'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) {
        var wrap = el.closest('form') || el.closest('div') || el;
        if (wrap && wrap !== signedOut) wrap.classList.add('hidden');
        else el.classList.add('hidden');
      }
    });
    var form = signedOut.querySelector('form');
    if (form) form.classList.add('hidden');
  }

  var errEl = document.getElementById('auth-error');
  var errText = document.getElementById('auth-error-text');
  if (errEl && errText) {
    errText.textContent =
      'Use the Hello Darzi desktop application to set up your shop and sign in. This website does not host accounts or data.';
    errEl.classList.remove('hidden');
  }
})();
