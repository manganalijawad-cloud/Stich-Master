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

  function setError(btn) {
    btn.href = 'https://github.com/manganalijawad-cloud/Stich-Master/releases';
    btn.innerHTML = '<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 2v12m0 0-3-3m3 3 3-3M5 19h14"/></svg> Download from GitHub';
    btn.classList.remove('loading');
    btn.classList.add('error');
    if (versionEl) versionEl.textContent = 'Visit GitHub to download';
  }

  downloadBtns.forEach(function (btn) {
    btn.classList.add('loading');
    btn.innerHTML = '<svg class="w-5 h-5 animate-spin" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg> Fetching latest version...';
  });

  if (versionEl) {
    versionEl.textContent = 'Checking for latest version...';
  }

  fetch('https://api.github.com/repos/manganalijawad-cloud/Stich-Master/releases/latest')
    .then(function (res) {
      if (!res.ok) throw new Error('GitHub API error: ' + res.status);
      return res.json();
    })
    .then(function (data) {
      var asset = data.assets.find(function (a) {
        return a.name.endsWith('.exe') && a.name.toLowerCase().includes('setup');
      });
      var url;
      if (asset) {
        url = asset.browser_download_url;
      } else {
        var exeAsset = data.assets.find(function (a) {
          return a.name.endsWith('.exe');
        });
        url = exeAsset ? exeAsset.browser_download_url : null;
      }

      downloadBtns.forEach(function (btn) {
        if (url) {
          btn.href = url;
          btn.innerHTML = '<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 2v12m0 0-3-3m3 3 3-3M5 19h14"/></svg> Download for Windows';
          btn.classList.remove('loading');
        } else {
          setError(btn);
        }
      });

      if (versionEl) {
        var tag = data.tag_name || '';
        versionEl.textContent = tag ? tag.replace(/^v/, 'Version ') + ' \u2014 Windows 10 and above' : 'Windows 10 and above';
      }
    })
    .catch(function () {
      downloadBtns.forEach(function (btn) {
        setError(btn);
      });
      if (versionEl) {
        versionEl.textContent = 'Unable to fetch version. Visit GitHub to download.';
      }
    });
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
