/* ─── Mobile Menu ─── */
(function () {
  const menuBtn = document.getElementById('mobile-menu-btn');
  const mobileMenu = document.getElementById('mobile-menu');

  if (menuBtn && mobileMenu) {
    menuBtn.addEventListener('click', function () {
      const isOpen = mobileMenu.classList.toggle('hidden');
      menuBtn.setAttribute('aria-label', isOpen ? 'Open menu' : 'Close menu');
      menuBtn.innerHTML = isOpen
        ? '<svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></svg>'
        : '<svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>';
    });

    document.querySelectorAll('#mobile-menu a').forEach(function (link) {
      link.addEventListener('click', function () {
        mobileMenu.classList.add('hidden');
        menuBtn.setAttribute('aria-label', 'Open menu');
        menuBtn.innerHTML = '<svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
      });
    });
  }
})();

/* ─── Scroll Reveal ─── */
(function () {
  const revealElements = document.querySelectorAll('.reveal, .step-item, .feature-card, .pricing-card, .screenshot-card');

  const observer = new IntersectionObserver(
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

/* ─── FAQ Accordion ─── */
(function () {
  const faqQuestions = document.querySelectorAll('.faq-question');

  faqQuestions.forEach(function (btn) {
    btn.addEventListener('click', function () {
      const item = btn.closest('.faq-item');
      const isActive = item.classList.contains('active');

      document.querySelectorAll('.faq-item.active').forEach(function (openItem) {
        if (openItem !== item) {
          openItem.classList.remove('active');
        }
      });

      item.classList.toggle('active');
    });
  });
})();

/* ─── Contact Form ─── */
(function () {
  const form = document.getElementById('contact-form');
  const statusEl = document.getElementById('form-status');

  if (form && statusEl) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();

      const name = document.getElementById('name').value.trim();
      const email = document.getElementById('email').value.trim();
      const message = document.getElementById('message').value.trim();

      if (!name || !email || !message) {
        statusEl.textContent = 'Please fill in all required fields.';
        statusEl.className = 'text-center text-sm font-semibold text-red-500';
        statusEl.classList.remove('hidden');
        return;
      }

      statusEl.textContent = 'Thank you for your message! We will get back to you soon.';
      statusEl.className = 'text-center text-sm font-semibold text-green-600';
      statusEl.classList.remove('hidden');

      form.reset();

      setTimeout(function () {
        statusEl.classList.add('hidden');
      }, 5000);
    });
  }
})();

/* ─── Download Button — Fetch Latest Release from GitHub ─── */
(function () {
  const downloadBtn = document.getElementById('download-btn');

  if (downloadBtn) {
    downloadBtn.classList.add('loading');
    downloadBtn.textContent = 'Fetching latest version...';

    fetch('https://api.github.com/repos/manganalijawad-cloud/Stich-Master/releases/latest')
      .then(function (res) {
        if (!res.ok) throw new Error('GitHub API error');
        return res.json();
      })
      .then(function (data) {
        var asset = data.assets.find(function (a) {
          return a.name.endsWith('.exe') && a.name.includes('Setup');
        });
        if (asset) {
          downloadBtn.href = asset.browser_download_url;
          downloadBtn.textContent = 'Download for Windows';
          downloadBtn.classList.remove('loading');
        } else {
          downloadBtn.href = 'https://github.com/manganalijawad-cloud/Stich-Master/releases';
          downloadBtn.textContent = 'View Releases';
          downloadBtn.classList.remove('loading');
        }
      })
      .catch(function () {
        downloadBtn.href = 'https://github.com/manganalijawad-cloud/Stich-Master/releases';
        downloadBtn.textContent = 'Download from GitHub';
        downloadBtn.classList.remove('loading');
      });
  }
})();

/* ─── Navbar background on scroll ─── */
(function () {
  var header = document.querySelector('header');
  var lastScroll = 0;

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

    lastScroll = currentScroll;
  });
})();
