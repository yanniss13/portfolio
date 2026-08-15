(function () {
  "use strict";
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Icons ---------- */
  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }

  /* ---------- Footer year ---------- */
  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* ---------- Typewriter terminal ---------- */
  var code = document.getElementById("typed");
  if (code) {
    // [className, text] — className "" means plain text
    var T = [
      ["tok-kw", "const"], ["", " developer "], ["tok-punc", "= "], ["tok-punc", "{"], ["", "\n"],
      ["", "  "], ["tok-prop", "name"], ["tok-punc", ": "], ["tok-str", "\"BOUZID Yanniss\""], ["tok-punc", ","], ["", "\n"],
      ["", "  "], ["tok-prop", "stack"], ["tok-punc", ": ["], ["tok-str", "\"Node.js\""], ["tok-punc", ", "], ["tok-str", "\"Express\""], ["tok-punc", ", "], ["tok-str", "\"Supabase\""], ["tok-punc", ", "], ["", "\n"], ["", "          "], ["tok-str", "\"PostgreSQL\""], ["tok-punc", ", "], ["tok-str", "\"PHP\""], ["tok-punc", ", "], ["tok-str", "\"JavaScript\""], ["tok-punc", "],"], ["", "\n"],
      ["", "  "], ["tok-prop", "ships"], ["tok-punc", ": ["], ["tok-str", "\"realtime\""], ["tok-punc", ", "], ["tok-str", "\"PWA\""], ["tok-punc", ", "], ["tok-str", "\"tested\""], ["tok-punc", ", "], ["tok-str", "\"CI/CD\""], ["tok-punc", "],"], ["", "\n"],
      ["", "  "], ["tok-prop", "status"], ["tok-punc", ": "], ["tok-str", "\"open_to_opportunities\""], ["tok-punc", ","], ["", "\n"],
      ["", "  "], ["tok-prop", "formation"], ["tok-punc", ": "], ["tok-str", "\"Développeur web et web mobile\""], ["", "\n"],
      ["tok-punc", "};"]
    ];
    var total = T.reduce(function (s, t) { return s + t[1].length; }, 0);
    var esc = function (s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); };
    var render = function (n) {
      var html = "", count = 0;
      for (var i = 0; i < T.length; i++) {
        if (count >= n) break;
        var cls = T[i][0], text = T[i][1];
        var take = Math.min(text.length, n - count);
        var part = esc(text.slice(0, take));
        html += cls ? '<span class="' + cls + '">' + part + "</span>" : part;
        count += take;
        if (take < text.length) break;
      }
      code.innerHTML = html + '<span class="caret"></span>';
    };

    if (reduceMotion) {
      render(total);
    } else {
      var n = 0;
      var tick = function () {
        n++;
        render(n);
        if (n < total) {
          var last = code.textContent.slice(-1);
          setTimeout(tick, last === "\n" ? 130 : last === "," ? 90 : 24);
        }
      };
      render(0);
      setTimeout(tick, 650);
    }
  }

  /* ---------- Conway's Game of Life (project thumbnail) ---------- */
  var canvas = document.getElementById("gol-canvas");
  if (canvas && canvas.getContext) {
    var ctx = canvas.getContext("2d");
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var cols, rows, cell, grid, timer = null;

    function seed() {
      grid = new Array(cols * rows);
      for (var i = 0; i < grid.length; i++) grid[i] = Math.random() < 0.28 ? 1 : 0;
    }
    function setup() {
      var w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return false;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      cell = Math.max(6, Math.round(w / 44)) * dpr;
      cols = Math.floor(canvas.width / cell);
      rows = Math.floor(canvas.height / cell);
      seed();
      return true;
    }
    function step() {
      var next = new Array(cols * rows);
      for (var y = 0; y < rows; y++) {
        for (var x = 0; x < cols; x++) {
          var n = 0;
          for (var dy = -1; dy <= 1; dy++) {
            for (var dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              var nx = (x + dx + cols) % cols, ny = (y + dy + rows) % rows;
              n += grid[ny * cols + nx];
            }
          }
          var alive = grid[y * cols + x];
          next[y * cols + x] = (alive && (n === 2 || n === 3)) || (!alive && n === 3) ? 1 : 0;
        }
      }
      grid = next;
    }
    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "rgba(0, 219, 233, 0.82)";
      var pad = Math.max(1, Math.floor(cell * 0.16));
      for (var y = 0; y < rows; y++) {
        for (var x = 0; x < cols; x++) {
          if (grid[y * cols + x]) ctx.fillRect(x * cell + pad, y * cell + pad, cell - pad * 2, cell - pad * 2);
        }
      }
    }
    function frame() { step(); draw(); }
    function start() { if (!timer && !reduceMotion) timer = setInterval(frame, 150); }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }

    if (setup()) {
      draw();
      if (reduceMotion) {
        // static single generation only
      } else if ("IntersectionObserver" in window) {
        new IntersectionObserver(function (entries) {
          entries.forEach(function (e) { e.isIntersecting ? start() : stop(); });
        }, { threshold: 0.1 }).observe(canvas);
      } else {
        start();
      }
    }

    var rt;
    window.addEventListener("resize", function () {
      clearTimeout(rt);
      rt = setTimeout(function () { stop(); if (setup()) { draw(); if (!reduceMotion) start(); } }, 200);
    });
  }

  /* ---------- Vignettes vidéo ----------
     La capture ne tourne qu'au survol. Sans ça le navigateur décoderait en
     continu une vidéo que personne ne voit : la vignette reste à opacity 0
     tant que la carte n'est pas survolée.
     Sous prefers-reduced-motion, la lecture n'est jamais lancée et l'affiche
     tient lieu d'image fixe — ce qu'un GIF ne permettait pas, puisque CSS ne
     peut pas l'arrêter : il fallait livrer un PNG de repli séparé. */
  document.querySelectorAll(".thumb video").forEach(function (video) {
    var carte = video.closest(".card");
    if (!carte) return;
    function jouer() {
      if (reduceMotion) return;
      var p = video.play();
      // Lecture refusée (politique d'autoplay, mode économie de données) :
      // l'affiche reste affichée, il n'y a rien à rattraper.
      if (p && p.catch) p.catch(function () {});
    }
    function arreter() { video.pause(); }
    carte.addEventListener("mouseenter", jouer);
    carte.addEventListener("mouseleave", arreter);
    carte.addEventListener("focusin", jouer);
    carte.addEventListener("focusout", arreter);
  });

  /* ---------- Scroll reveal ---------- */
  var reveals = document.querySelectorAll(".reveal");
  if (reduceMotion || !("IntersectionObserver" in window)) {
    reveals.forEach(function (el) { el.classList.add("in"); });
  } else {
    var revObs = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); obs.unobserve(e.target); }
      });
    }, { threshold: 0.14, rootMargin: "0px 0px -8% 0px" });
    reveals.forEach(function (el) { revObs.observe(el); });
  }

  /* ---------- Active nav state ---------- */
  var sections = document.querySelectorAll("main section[id], #home");
  var navLinks = Array.prototype.slice.call(document.querySelectorAll(".nav-link"));
  function setActive(id) {
    navLinks.forEach(function (a) {
      a.classList.toggle("active", a.getAttribute("href") === "#" + id);
    });
  }
  if ("IntersectionObserver" in window && navLinks.length) {
    var navObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) setActive(e.target.id); });
    }, { rootMargin: "-45% 0px -50% 0px", threshold: 0 });
    sections.forEach(function (s) { navObs.observe(s); });
  }

  /* ---------- Mobile menu ---------- */
  var burger = document.getElementById("burger");
  var menu = document.getElementById("mobile-menu");
  var menuClose = document.getElementById("menu-close");
  function openMenu() {
    menu.classList.add("open");
    menu.setAttribute("aria-hidden", "false");
    burger.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";
  }
  function closeMenu() {
    menu.classList.remove("open");
    menu.setAttribute("aria-hidden", "true");
    burger.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
  }
  if (burger && menu) {
    burger.addEventListener("click", openMenu);
    if (menuClose) menuClose.addEventListener("click", closeMenu);
    menu.querySelectorAll("a").forEach(function (a) { a.addEventListener("click", closeMenu); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && menu.classList.contains("open")) closeMenu();
    });
  }

  /* ---------- Contact form (Web3Forms) ---------- */
  var form = document.getElementById("contact-form");
  var success = document.getElementById("form-success");
  var errorBox = document.getElementById("form-error");
  var errorText = document.getElementById("form-error-text");
  var submitBtn = document.getElementById("form-submit");
  var submitLabel = document.getElementById("form-submit-label");

  var ENDPOINT = "https://api.web3forms.com/submit";
  var KEY_PLACEHOLDER = "REMPLACER_PAR_VOTRE_CLE_WEB3FORMS";
  var FALLBACK_EMAIL = "yanniss.27@hotmail.fr";

  if (form) {
    var hideMessages = function () {
      if (success) success.classList.remove("show");
      if (errorBox) errorBox.classList.remove("show");
    };
    var showError = function (msg) {
      if (!errorBox) return;
      if (errorText) errorText.textContent = msg;
      errorBox.classList.add("show");
    };
    var setLoading = function (on) {
      if (!submitBtn) return;
      submitBtn.disabled = on;
      if (submitLabel) submitLabel.textContent = on ? "Envoi en cours…" : "Envoyer le message";
    };

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      hideMessages();
      if (!form.checkValidity()) { form.reportValidity(); return; }

      // Fail loudly rather than pretending the message was sent.
      var keyField = form.querySelector('input[name="access_key"]');
      if (!keyField || !keyField.value || keyField.value === KEY_PLACEHOLDER) {
        showError("Le formulaire n'est pas encore configuré. Écrivez-moi directement à " + FALLBACK_EMAIL + ".");
        if (window.console) console.warn("[contact] Clé Web3Forms manquante — voir index.html, input[name=access_key].");
        return;
      }

      // Objet dynamique : rend la boîte de réception scannable d'un coup d'œil.
      var subjectField = form.querySelector('input[name="subject"]');
      var nameInput = document.getElementById("name");
      if (subjectField && nameInput) {
        var sender = nameInput.value.trim().replace(/\s+/g, " ").slice(0, 60);
        subjectField.value = sender
          ? "Nouveau message de " + sender
          : "Nouveau message depuis votre portfolio";
      }

      setLoading(true);
      fetch(ENDPOINT, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: new FormData(form)
      })
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (data) {
            return { ok: res.ok, data: data };
          });
        })
        .then(function (result) {
          setLoading(false);
          if (result.ok && result.data && result.data.success) {
            if (success) success.classList.add("show");
            form.reset();
          } else {
            // Le message de l'API est technique et en anglais : il va en console,
            // le visiteur reçoit une phrase claire avec une porte de sortie.
            if (window.console && result.data && result.data.message) {
              console.warn("[contact] Web3Forms:", result.data.message);
            }
            showError("L'envoi a échoué. Réessayez, ou écrivez-moi directement à " + FALLBACK_EMAIL + ".");
          }
        })
        .catch(function () {
          setLoading(false);
          showError("Connexion impossible. Vérifiez votre réseau ou écrivez-moi à " + FALLBACK_EMAIL + ".");
        });
    });
  }
})();