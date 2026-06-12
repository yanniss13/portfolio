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
      ["", "  "], ["tok-prop", "stack"], ["tok-punc", ": ["], ["tok-str", "\"Node.js\""], ["tok-punc", ", "], ["tok-str", "\"Express\""], ["tok-punc", ", "], ["tok-str", "\"MongoDB\""], ["tok-punc", ", "], ["", "\n"], ["", "          "], ["tok-str", "\"PHP\""], ["tok-punc", ", "], ["tok-str", "\"JavaScript\""], ["tok-punc", "],"], ["", "\n"],
      ["", "  "], ["tok-prop", "status"], ["tok-punc", ": "], ["tok-str", "\"open_to_opportunities\""], ["tok-punc", ","], ["", "\n"],
      ["", "  "], ["tok-prop", "bootcamp"], ["tok-punc", ": "], ["tok-str", "\"RI7 Coding Bootcamp\""], ["", "\n"],
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

  /* ---------- Contact form ---------- */
  var form = document.getElementById("contact-form");
  var success = document.getElementById("form-success");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      if (success) {
        success.classList.add("show");
        if (window.lucide) window.lucide.createIcons();
      }
      form.reset();
    });
  }
})();