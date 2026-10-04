/* Runs before styles are loaded so the first paint uses the chosen theme. */
(() => {
  const root = document.documentElement;
  root.classList.add("js");
  let preference = null;
  try {
    const stored = localStorage.getItem("ziyi-theme");
    if (stored === "light" || stored === "dark") preference = stored;
  } catch {
    // Private browsing or storage restrictions must not prevent rendering.
  }
  const systemDark = typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-color-scheme: dark)").matches;
  root.dataset.theme = preference || (systemDark ? "dark" : "light");
  root.dataset.themePreference = preference || "system";
})();
