// Language toggle
function toggleLang() {
  var html = document.documentElement;
  if (html.classList.contains("lang-en")) {
    html.classList.remove("lang-en");
    localStorage.setItem("lang", "zh");
  } else {
    html.classList.add("lang-en");
    localStorage.setItem("lang", "en");
  }
}

(function () {
  var saved = localStorage.getItem("lang");
  if (saved === "en") document.documentElement.classList.add("lang-en");
})();

// Section nav active state (homepage)
(function () {
  var navLinks = document.querySelectorAll(".section-nav a");
  if (!navLinks.length) return;
  var sections = [];
  navLinks.forEach(function (link) {
    var href = link.getAttribute("href");
    if (href && href.startsWith("#")) {
      var el = document.querySelector(href);
      if (el) sections.push({ el: el, link: link });
    }
  });
  if (!sections.length) return;
  function update() {
    var y = window.scrollY + 80;
    var cur = null;
    sections.forEach(function (s) {
      if (s.el.offsetTop <= y) cur = s;
    });
    navLinks.forEach(function (l) {
      l.classList.remove("active");
    });
    if (cur) cur.link.classList.add("active");
  }
  window.addEventListener("scroll", update, { passive: true });
})();

// Category filter (blog list page)
function filterCategory(category) {
  if (category) {
    window.location.href = "/blog?category=" + encodeURIComponent(category);
  } else {
    window.location.href = "/blog";
  }
}

// Categories are text data, never interpolated into JavaScript source.
document.querySelectorAll("[data-category]").forEach(function (button) {
  button.addEventListener("click", function () {
    filterCategory(button.dataset.category);
  });
});
