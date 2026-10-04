import fs from "node:fs";
import YAML from "yaml";
import MarkdownIt from "markdown-it";
import anchor from "markdown-it-anchor";
import { imageSize } from "image-size";
import mathDelimiters from "./scripts/markdown-math.mjs";

export default function (eleventyConfig) {
  eleventyConfig.addDataExtension("yml,yaml", (source) => YAML.parse(source));
  eleventyConfig.setNunjucksEnvironmentOptions({ autoescape: true });
  const markdown = new MarkdownIt({ html: true, linkify: true, typographer: true })
    .use(mathDelimiters)
    .use(anchor, { level: [2, 3, 4], slugify: (text) => text.toLowerCase().trim().replace(/[^\p{L}\p{N}\s-]/gu, "").replace(/\s+/g, "-") });
  const defaultLink = markdown.renderer.rules.link_open;
  markdown.renderer.rules.link_open = (tokens, index, options, env, renderer) => {
    if (/^https?:\/\//i.test(tokens[index].attrGet("href") || "")) {
      tokens[index].attrSet("rel", "noopener noreferrer");
    }
    return defaultLink ? defaultLink(tokens, index, options, env, renderer) : renderer.renderToken(tokens, index, options);
  };
  eleventyConfig.setLibrary("md", markdown);
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addPassthroughCopy({ "src/.nojekyll": ".nojekyll" });
  eleventyConfig.addWatchTarget("src/assets");
  eleventyConfig.addGlobalData("build", () => ({ year: new Date().getUTCFullYear() }));
  eleventyConfig.addFilter("displayDate", (value, style = "month") => {
    if (!value || value === "Present") return value || "";
    const date = value instanceof Date ? value : new Date(`${String(value).slice(0, 10)}${String(value).length === 7 ? "-01" : ""}T12:00:00Z`);
    if (Number.isNaN(date.valueOf())) return String(value);
    return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", month: "short", year: "numeric", ...(style === "day" ? { day: "numeric" } : {}) }).format(date);
  });
  eleventyConfig.addFilter("isoDate", (value) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10));
  eleventyConfig.addFilter("newest", (items = [], field = "date") => [...items].sort((a, b) => String(b[field]).localeCompare(String(a[field]))));
  eleventyConfig.addFilter("fileSize", (url) => {
    const target = `src${url}`;
    if (!fs.existsSync(target)) throw new Error(`Missing download: ${url}`);
    const bytes = fs.statSync(target).size;
    return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
  });
  eleventyConfig.addFilter("twoDigits", (value) => String(value).padStart(2, "0"));
  eleventyConfig.addShortcode("image", (src, alt, lazy = true, className = "") => {
    const { width, height } = imageSize(fs.readFileSync(`src${src}`));
    const escape = markdown.utils.escapeHtml;
    return `<img src="${escape(src)}" alt="${escape(alt)}" width="${width}" height="${height}" decoding="async"${lazy ? ' loading="lazy"' : ' fetchpriority="high"'}${className ? ` class="${escape(className)}"` : ""}>`;
  });
  eleventyConfig.addFilter("findBy", (items = [], field, value) => items.find((item) => item[field] === value));
  eleventyConfig.addFilter("withText", (items = []) => items.filter((item) => item.text?.trim()));
  eleventyConfig.addFilter("entriesFor", (items = [], field, value) => items.filter((item) => item.data?.[field] === value));
  eleventyConfig.addFilter("writingCategory", (data) => data.category || (data.tags?.includes("posts") ? "notes" : "life"));
  eleventyConfig.addFilter("mapPoints", (places = []) => {
    const keys = new Set();
    return places.map((place) => {
      const { latitude, longitude, key, name } = place;
      if (typeof key !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key) || keys.has(key) || typeof name !== "string" || !name.trim()) {
        throw new Error("Travel places need unique lowercase keys and nonempty names.");
      }
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
        throw new Error(`Invalid travel coordinates: ${key}`);
      }
      keys.add(key);
      return { ...place, x: 20 + (longitude + 180) / 360 * 680, y: 20 + (90 - latitude) / 180 * 320 };
    });
  });
  eleventyConfig.addFilter("absoluteUrl", (path, origin) => new URL(path, origin).href);
  eleventyConfig.addFilter("jsonLd", (value) => JSON.stringify(value).replace(/</g, "\\u003c"));
  eleventyConfig.addFilter("markdown", (value = "") => markdown.render(value));
  eleventyConfig.addCollection("posts", (api) => api.getFilteredByTag("posts").filter((item) => !item.data.draft).sort((a, b) => b.date - a.date));
  const writing = (api) => api.getAll().filter((item) => {
    const tags = Array.isArray(item.data.tags) ? item.data.tags : [item.data.tags];
    return !item.data.draft && !item.data.noindex && tags.some((tag) => ["posts", "filmReviews", "travelEntries"].includes(tag));
  }).sort((a, b) => b.date - a.date);
  eleventyConfig.addCollection("writing", writing);
  eleventyConfig.addCollection("featuredPosts", (api) => writing(api).filter((item) => item.data.featured).slice(0, 2));
  eleventyConfig.addCollection("featuredMath", (api) => writing(api).filter((item) => item.data.featured).slice(0, 2).filter((item) => item.data.previewMath));
  for (const tag of ["courses", "seminars", "filmReviews", "travelEntries"]) {
    eleventyConfig.addCollection(tag, (api) => api.getFilteredByTag(tag).filter((item) => !item.data.draft).sort((a, b) => b.date - a.date));
  }
  eleventyConfig.addCollection("publicPages", (api) => api.getAll().filter((item) => item.url && !item.data.draft && !item.data.eleventyExcludeFromCollections && item.url.endsWith("/")).sort((a, b) => a.url.localeCompare(b.url)));
  eleventyConfig.addPreprocessor("drafts", "md,njk", (data) => {
    if (data.draft) {
      data.permalink = false;
      data.eleventyExcludeFromCollections = true;
    }
  });
  return {
    dir: { input: "src", output: "_site", includes: "_includes", data: "_data" },
    templateFormats: ["md", "njk"],
    markdownTemplateEngine: false,
    htmlTemplateEngine: "njk"
  };
}
