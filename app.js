const routes = new Set([
  "home",
  "publications",
  "research",
  "teaching",
  "studies",
  "blog",
  "life",
  "life-sports",
  "life-movies",
  "life-coffee",
  "life-photography",
  "life-travel",
  "course-numerical-pde",
  "summer-school",
]);

const pageTitles = {
  home: "Ziyi Wang · Academic Homepage",
  publications: "Publications · Ziyi Wang",
  research: "Research · Ziyi Wang",
  teaching: "Teaching · Ziyi Wang",
  studies: "Studies · Ziyi Wang",
  blog: "Blog · Ziyi Wang",
  life: "Life · Ziyi Wang",
  "life-sports": "Sports · Life · Ziyi Wang",
  "life-movies": "Movies · Life · Ziyi Wang",
  "life-coffee": "Coffee · Life · Ziyi Wang",
  "life-photography": "Photography · Life · Ziyi Wang",
  "life-travel": "Travel · Life · Ziyi Wang",
  "course-numerical-pde": "Numerical Methods for PDEs · Course Room",
  "summer-school": "Adaptive FEM & AFEPack Workshop · Ziyi Wang",
};

const root = document.documentElement;
const themeToggle = document.querySelector("#theme-toggle");
const themeIcon = document.querySelector(".theme-icon");
const themeLabel = document.querySelector(".theme-label");
const storedTheme = localStorage.getItem("ziyi-theme");
const preferredTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
  ? "dark"
  : "light";

function applyTheme(theme) {
  root.dataset.theme = theme;
  themeIcon.textContent = theme === "dark" ? "☼" : "◐";
  themeLabel.textContent = theme === "dark" ? "Light" : "Theme";
  themeToggle.setAttribute(
    "aria-label",
    theme === "dark" ? "Switch to light theme" : "Switch to dark theme",
  );
}

applyTheme(storedTheme || preferredTheme);

themeToggle.addEventListener("click", () => {
  const nextTheme = root.dataset.theme === "dark" ? "light" : "dark";
  localStorage.setItem("ziyi-theme", nextTheme);
  applyTheme(nextTheme);
});

function currentRoute() {
  const requested = window.location.hash.replace(/^#/, "");
  return routes.has(requested) ? requested : "home";
}

function primaryRoute(route) {
  if (route === "course-numerical-pde") return "teaching";
  if (route === "summer-school") return "studies";
  if (route.startsWith("life-")) return "life";
  return route;
}

function renderRoute() {
  const route = currentRoute();
  const primary = primaryRoute(route);
  const pageRoute = route.startsWith("life-") ? "life" : route;

  document.querySelectorAll("[data-page]").forEach((page) => {
    page.hidden = page.dataset.page !== pageRoute;
  });

  document.querySelector(".life-landing").hidden = route !== "life";
  document.querySelector(".life-subpage-header").hidden = route === "life";
  document.querySelectorAll(".life-section").forEach((section) => {
    section.hidden = route === "life" || section.id !== route;
  });

  document.querySelectorAll("[data-life-nav]").forEach((link) => {
    const isActive = link.dataset.lifeNav === route;
    link.classList.toggle("is-active", isActive);
    if (isActive) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });

  document.querySelectorAll("[data-nav]").forEach((link) => {
    const isActive = link.dataset.nav === primary;
    link.classList.toggle("is-active", isActive);
    if (isActive) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });

  document.title = pageTitles[route];
  window.scrollTo({ top: 0, behavior: "instant" });

  if (window.MathJax?.typesetPromise) {
    window.MathJax.typesetPromise([
      document.querySelector(`[data-page="${pageRoute}"]`),
    ]).catch(() => {});
  }
}

window.addEventListener("hashchange", renderRoute);
renderRoute();

document.querySelectorAll('a[href="#"]').forEach((link) => {
  link.addEventListener("click", (event) => event.preventDefault());
});

document.querySelectorAll(".filter-button").forEach((button) => {
  button.addEventListener("click", () => {
    const filter = button.dataset.filter;

    document.querySelectorAll(".filter-button").forEach((item) => {
      const isActive = item === button;
      item.classList.toggle("is-active", isActive);
      item.setAttribute("aria-pressed", String(isActive));
    });

    document.querySelectorAll("[data-news]").forEach((item) => {
      item.hidden = filter !== "all" && item.dataset.news !== filter;
    });

    document.querySelector(".news-list").scrollTo({
      top: 0,
      behavior: "smooth",
    });
  });
});

document.querySelectorAll("[data-note-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    const filter = button.dataset.noteFilter;

    document.querySelectorAll("[data-note-filter]").forEach((item) => {
      const isActive = item === button;
      item.classList.toggle("is-active", isActive);
      item.setAttribute("aria-pressed", String(isActive));
    });

    document.querySelectorAll("[data-note-category]").forEach((item) => {
      item.hidden = item.dataset.noteCategory !== filter;
    });
  });
});

document.querySelectorAll(".publication-filters button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".publication-filters button").forEach((item) => {
      item.classList.toggle("is-active", item === button);
    });
  });
});

document.querySelector("#back-to-top").addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});
