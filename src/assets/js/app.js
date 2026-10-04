/* Small enhancements for static pages. All content and links work without JS. */
(() => {
  const root = document.documentElement;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
  const themeToggle = document.querySelector("#theme-toggle");
  let themePreference = root.dataset.themePreference || "system";

  function applyTheme() {
    const theme = themePreference === "system"
      ? (systemTheme.matches ? "dark" : "light")
      : themePreference;
    root.dataset.theme = theme;
    root.dataset.themePreference = themePreference;
    if (!themeToggle) return;
    const icon = themeToggle.querySelector(".theme-icon");
    const label = themeToggle.querySelector(".theme-label");
    const action = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
    if (icon) icon.textContent = theme === "dark" ? "☼" : "◐";
    if (label) label.textContent = theme === "dark" ? "Light" : "Dark";
    themeToggle.setAttribute("aria-label", action);
    themeToggle.title = action;
  }

  applyTheme();
  themeToggle?.addEventListener("click", () => {
    themePreference = root.dataset.theme === "dark" ? "light" : "dark";
    try { localStorage.setItem("ziyi-theme", themePreference); } catch { /* Session still works. */ }
    applyTheme();
  });
  const watchTheme = () => { if (themePreference === "system") applyTheme(); };
  if (systemTheme.addEventListener) systemTheme.addEventListener("change", watchTheme);
  else systemTheme.addListener(watchTheme);
  window.addEventListener("storage", (event) => {
    if (event.key !== "ziyi-theme" && event.key !== null) return;
    themePreference = event.newValue === "light" || event.newValue === "dark"
      ? event.newValue : "system";
    applyTheme();
  });

  const menuToggle = document.querySelector("[data-menu-toggle]");
  const nav = document.querySelector("#primary-nav");
  const header = menuToggle?.closest(".site-header");
  const compactHeader = window.matchMedia("(max-width: 860px)");
  if (menuToggle && nav && header) {
    const setMenu = (open, restoreFocus = false) => {
      header.dataset.menuOpen = String(open);
      menuToggle.setAttribute("aria-expanded", String(open));
      if (restoreFocus && compactHeader.matches) menuToggle.focus();
    };
    setMenu(false);
    menuToggle.addEventListener("click", () => setMenu(menuToggle.getAttribute("aria-expanded") !== "true"));
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && menuToggle.getAttribute("aria-expanded") === "true") {
        event.preventDefault();
        setMenu(false, true);
      }
    });
    nav.addEventListener("click", (event) => {
      if (event.target.closest("a")) setMenu(false);
    });
    document.addEventListener("click", (event) => {
      if (!header.contains(event.target) && menuToggle.getAttribute("aria-expanded") === "true") {
        setMenu(false, nav.contains(document.activeElement));
      }
    });
    const resizeMenu = () => {
      const focused = document.activeElement;
      setMenu(false, compactHeader.matches && nav.contains(focused));
      if (!compactHeader.matches && focused === menuToggle) nav.querySelector("a")?.focus();
    };
    if (compactHeader.addEventListener) compactHeader.addEventListener("change", resizeMenu);
    else compactHeader.addListener(resizeMenu);
  }

  // A focused category must be fully visible in the narrow, scrolling Life nav.
  // Scroll only this container, never the page or its other navigation menus.
  document.querySelectorAll(".life-subpage-header nav").forEach((categoryNav) => {
    categoryNav.addEventListener("focusin", (event) => {
      const link = event.target.closest("a");
      if (!link || !categoryNav.contains(link) || categoryNav.scrollWidth <= categoryNav.clientWidth) return;
      const bounds = categoryNav.getBoundingClientRect();
      const focused = link.getBoundingClientRect();
      const focusSpace = 7;
      if (focused.left < bounds.left + focusSpace) categoryNav.scrollLeft += focused.left - bounds.left - focusSpace;
      else if (focused.right > bounds.right - focusSpace) categoryNav.scrollLeft += focused.right - bounds.right + focusSpace;
    });
  });

  document.querySelectorAll("[data-filter-group]").forEach((group) => {
    // Each filter group owns its buttons and entries; groups never affect one another.
    const owned = (selector) => [...group.querySelectorAll(selector)]
      .filter((element) => element.closest("[data-filter-group]") === group);
    const buttons = owned("button[data-filter]");
    const entries = owned("[data-filter-item]");
    const empty = owned("[data-filter-empty]")[0];
    if (!buttons.length) return;
    const storageKey = group.dataset.filterKey ? `ziyi-filter:${group.dataset.filterKey}` : null;
    let initial = group.dataset.defaultFilter || "all";
    try { initial = storageKey && sessionStorage.getItem(storageKey) || initial; } catch { /* Filters still work without storage. */ }
    const applyFilter = (filter) => {
      let visible = 0;
      entries.forEach((entry) => {
        const categories = (entry.dataset.category || "").split(/\s+/);
        const show = filter === "all" || categories.includes(filter);
        entry.hidden = !show;
        if (show) visible += 1;
      });
      buttons.forEach((button) => {
        const selected = button.dataset.filter === filter;
        button.classList.toggle("is-active", selected);
        button.setAttribute("aria-pressed", String(selected));
      });
      if (empty) empty.hidden = visible > 0;
      const scrollArea = group.querySelector(".news-list");
      if (scrollArea) scrollArea.scrollTop = 0;
      try { if (storageKey) sessionStorage.setItem(storageKey, filter); } catch { /* Session still works. */ }
    };
    buttons.forEach((button) => button.addEventListener("click", () => applyFilter(button.dataset.filter)));
    applyFilter(buttons.some((button) => button.dataset.filter === initial) ? initial : buttons[0].dataset.filter);
  });

  // The links remain ordinary local-image links when JS or dialog is unavailable.
  const previewLinks = [...document.querySelectorAll("[data-image-preview]")];
  if (previewLinks.length && typeof HTMLDialogElement !== "undefined" && typeof HTMLDialogElement.prototype.showModal === "function") {
    const preview = document.createElement("dialog");
    preview.className = "image-preview";
    preview.setAttribute("aria-labelledby", "image-preview-title");
    const heading = document.createElement("h2");
    heading.id = "image-preview-title";
    heading.className = "image-preview-title";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "image-preview-close";
    close.textContent = "Close ×";
    close.setAttribute("aria-label", "Close image preview");
    const picture = document.createElement("img");
    picture.decoding = "async";
    const caption = document.createElement("p");
    caption.className = "image-preview-caption";
    const original = document.createElement("a");
    original.className = "image-preview-original-link";
    original.textContent = "Open original image ↗";
    original.target = "_blank";
    original.rel = "noopener noreferrer";
    preview.append(heading, close, picture, caption, original);
    document.body.append(preview);
    let trigger;
    const restore = () => {
      root.classList.remove("image-preview-open");
      trigger?.focus({ preventScroll: true });
    };
    close.addEventListener("click", () => preview.close());
    preview.addEventListener("close", restore);
    preview.addEventListener("click", (event) => {
      if (event.target !== preview) return;
      const bounds = preview.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) preview.close();
    });
    previewLinks.forEach((link) => link.addEventListener("click", (event) => {
      // Keep browser modifiers and new-tab gestures behaving like normal links.
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button > 0) return;
      const src = link.dataset.imageSrc || link.getAttribute("href");
      if (!src) return;
      event.preventDefault();
      trigger = link;
      heading.textContent = link.dataset.imageLabel || "Image preview";
      picture.src = src;
      picture.alt = link.dataset.imageAlt || link.querySelector("img")?.alt || "";
      caption.textContent = picture.alt;
      original.href = src;
      preview.showModal();
      root.classList.add("image-preview-open");
      close.focus();
    }));
  }

  document.querySelector("#back-to-top")?.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: reducedMotion.matches ? "auto" : "smooth" });
    document.querySelector(".brand")?.focus({ preventScroll: true });
  });

  // Existing bookmarks from the former single-page site retain their destination.
  // Restrict this to the homepage so real article anchors always stay intact.
  function redirectLegacyRoute() {
    if (location.pathname !== "/" && location.pathname !== "/index.html") return;
    const legacyRoutes = {
      home: "/",
      publications: "/publications/",
      research: "/research/",
      teaching: "/teaching/",
      studies: "/studies/",
      blog: "/blog/",
      life: "/life/",
      "life-sports": "/life/sports/",
      "life-movies": "/life/movies/",
      "life-coffee": "/life/coffee/",
      "life-photography": "/life/photography/",
      "life-travel": "/life/travel/",
      "course-numerical-pde": "/teaching/course-template/",
      "summer-school": "/schools/afepack-2026/",
    };
    const key = location.hash.slice(1);
    const route = Object.prototype.hasOwnProperty.call(legacyRoutes, key) ? legacyRoutes[key] : undefined;
    if (route) location.replace(route + location.search);
  }
  window.addEventListener("hashchange", redirectLegacyRoute);
  redirectLegacyRoute();
})();
