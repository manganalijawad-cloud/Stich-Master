(function () {
  var menuBtn = document.getElementById('mobile-menu-btn');
  var mobileMenu = document.getElementById('mobile-menu');
  var backdrop = document.getElementById('mobile-menu-backdrop');

  function closeMenu() {
    mobileMenu.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');
    menuBtn.setAttribute('aria-label', 'Open menu');
    menuBtn.innerHTML = '<svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
    document.body.style.overflow = '';
  }

  function openMenu() {
    mobileMenu.classList.add('open');
    if (backdrop) backdrop.classList.add('open');
    menuBtn.setAttribute('aria-label', 'Close menu');
    menuBtn.innerHTML = '<svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>';
    document.body.style.overflow = 'hidden';
  }

  if (menuBtn && mobileMenu) {
    menuBtn.addEventListener('click', function () {
      if (mobileMenu.classList.contains('open')) {
        closeMenu();
      } else {
        openMenu();
      }
    });

    document.querySelectorAll('#mobile-menu a').forEach(function (link) {
      link.addEventListener('click', closeMenu);
    });

    if (backdrop) {
      backdrop.addEventListener('click', closeMenu);
    }

    window.addEventListener('resize', function () {
      if (window.innerWidth >= 768 && mobileMenu.classList.contains('open')) {
        closeMenu();
      }
    });
  }
})();

(function () {
  var revealElements = document.querySelectorAll('.reveal, .step-item, .feature-card, .pricing-card, .screenshot-card');

  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
  );

  revealElements.forEach(function (el) {
    observer.observe(el);
  });
})();

(function () {
  var faqQuestions = document.querySelectorAll('.faq-question');

  faqQuestions.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var item = btn.closest('.faq-item');
      var isActive = item.classList.contains('active');

      document.querySelectorAll('.faq-item.active').forEach(function (openItem) {
        if (openItem !== item) {
          openItem.classList.remove('active');
        }
      });

      item.classList.toggle('active');
    });
  });
})();

(function () {
  var forms = document.querySelectorAll('#contact-form');

  forms.forEach(function (form) {
    var statusEl = document.getElementById('form-status');

    if (form && statusEl) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();

        var name = document.getElementById('name');
        var email = document.getElementById('email');
        var message = document.getElementById('message');
        if (!name || !email || !message) return;

        var nameVal = name.value.trim();
        var emailVal = email.value.trim();
        var messageVal = message.value.trim();

        if (!nameVal || !emailVal || !messageVal) {
          statusEl.textContent = 'Please fill in all required fields.';
          statusEl.className = 'text-center text-sm font-semibold text-red-500';
          statusEl.classList.remove('hidden');
          return;
        }

        statusEl.textContent = 'Thank you! We will get back to you soon.';
        statusEl.className = 'text-center text-sm font-semibold text-green-600';
        statusEl.classList.remove('hidden');

        form.reset();

        setTimeout(function () {
          statusEl.classList.add('hidden');
        }, 5000);
      });
    }
  });
})();

(function () {
  var downloadBtns = document.querySelectorAll('#download-btn');
  var versionEl = document.getElementById('download-version');
  var downloadUrl = null;

  function setLoading(btn, text) {
    btn.classList.add('loading');
    btn.classList.remove('error');
    btn.innerHTML = '<svg class="w-5 h-5 animate-spin" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg> ' + (text || 'Preparing download...');
  }

  function setReady(btn) {
    btn.classList.remove('loading', 'error');
    btn.innerHTML = '<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 2v12m0 0-3-3m3 3 3-3M5 19h14"/></svg> Download for Windows';
  }

  function setError(btn) {
    btn.classList.remove('loading');
    btn.classList.add('error');
    btn.innerHTML = '<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 2v12m0 0-3-3m3 3 3-3M5 19h14"/></svg> Download unavailable';
  }

  function triggerDownload(btn) {
    if (!downloadUrl) {
      setError(btn);
      return;
    }
    setLoading(btn, 'Preparing download...');
    var a = document.createElement('a');
    a.href = downloadUrl;
    a.download = '';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { setReady(btn); }, 2000);
  }

  function showLoading() {
    downloadBtns.forEach(function (btn) {
      btn.classList.add('loading');
      btn.innerHTML = '<svg class="w-5 h-5 animate-spin" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg> Checking for latest version...';
    });
    if (versionEl) {
      versionEl.innerHTML = '<span>Checking for latest version...</span>';
    }
  }

  function initDownload(manifest) {
    if (!manifest) { showError(); return; }
    downloadUrl = manifest.downloadUrl || (manifest.filename ? 'release/' + manifest.filename : null);
    if (!downloadUrl) { showError(); return; }

    downloadBtns.forEach(function (btn) {
      setReady(btn);
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        triggerDownload(btn);
      });
    });

    if (versionEl) {
      var ver = manifest.version || '';
      versionEl.innerHTML = '<span>' + (ver ? 'Version ' + ver + ' \u2014 ' : '') + 'Windows 10 and above</span>';
    }
  }

  function showError() {
    downloadBtns.forEach(function (btn) {
      setError(btn);
    });
    if (versionEl) {
      versionEl.innerHTML = '<span class="text-red-400">Unable to load download. Please try again later.</span>';
    }
  }

  showLoading();

  if (window.__RELEASE_MANIFEST__) {
    initDownload(window.__RELEASE_MANIFEST__);
    return;
  }

  var script = document.createElement('script');
  script.src = 'release/version.js';
  script.onload = function () {
    if (window.__RELEASE_MANIFEST__) {
      initDownload(window.__RELEASE_MANIFEST__);
    } else {
      fetch('release/manifest.json')
        .then(function (r) { if (!r.ok) throw Error('status ' + r.status); return r.json(); })
        .then(initDownload)
        .catch(showError);
    }
  };
  script.onerror = function () {
    fetch('release/manifest.json')
      .then(function (r) { if (!r.ok) throw Error('status ' + r.status); return r.json(); })
      .then(initDownload)
      .catch(showError);
  };
  document.head.appendChild(script);
})();

(function () {
  var header = document.querySelector('header');

  window.addEventListener('scroll', function () {
    var currentScroll = window.pageYOffset;

    if (currentScroll > 50) {
      header.classList.remove('bg-white/90');
      header.classList.add('bg-white/95');
      header.style.backdropFilter = 'blur(12px)';
    } else {
      header.classList.remove('bg-white/95');
      header.classList.add('bg-white/90');
    }
  });
})();
