import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { parse } from 'parse5';
import { parse as parseYaml } from 'yaml';

const root = path.resolve(process.argv[2] || '_site');
const source = path.resolve('src');
const errors = [];
const pages = new Map();
const report = (file, message) => errors.push(`${path.relative(process.cwd(), file)}: ${message}`);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  }));
  return files.flat();
}

function nodes(tree, visit) {
  visit(tree);
  for (const child of tree.childNodes || []) nodes(child, visit);
}

function attrs(node) {
  return Object.fromEntries((node.attrs || []).map(({ name, value }) => [name, value]));
}

function text(node) {
  return node.nodeName === '#text' ? node.value : (node.childNodes || []).map(text).join('');
}

function absolute(value) {
  try { return new URL(value); } catch { return null; }
}

async function resolveLocal(url) {
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { return null; }
  const filename = path.resolve(root, `.${pathname}`);
  if (filename !== root && !filename.startsWith(`${root}${path.sep}`)) return null;
  try {
    const info = await stat(filename);
    if (info.isDirectory()) return path.join(filename, 'index.html');
    return filename;
  } catch {
    return null;
  }
}

let builtFiles;
try { builtFiles = await walk(root); } catch {
  console.error(`Build output not found: ${root}. Run npm run build first.`);
  process.exit(1);
}

for (const file of builtFiles.filter((file) => file.endsWith('.html'))) {
  const tree = parse(await readFile(file, 'utf8'));
  const all = [];
  nodes(tree, (node) => { if (node.tagName) all.push({ node, tag: node.tagName, attrs: attrs(node) }); });
  const ids = new Set();
  for (const item of all) {
    if (item.attrs.id) {
      if (ids.has(item.attrs.id)) report(file, `duplicate id ${JSON.stringify(item.attrs.id)}`);
      ids.add(item.attrs.id);
    }
  }
  const titles = all.filter((item) => item.tag === 'title' && item.node.parentNode?.tagName === 'head');
  if (titles.length !== 1 || !text(titles[0]?.node || {}).trim()) report(file, 'must have one nonempty title');
  const descriptions = all.filter((item) => item.tag === 'meta' && item.attrs.name === 'description');
  if (descriptions.length !== 1 || !descriptions[0]?.attrs.content?.trim()) report(file, 'must have one nonempty meta description');
  if (all.filter((item) => item.tag === 'h1').length !== 1) report(file, 'must have exactly one h1');
  const canonicals = all.filter((item) => item.tag === 'link' && item.attrs.rel?.split(/\s+/).includes('canonical'));
  const canonical = absolute(canonicals[0]?.attrs.href);
  if (canonicals.length !== 1 || !canonical || canonical.protocol !== 'https:' || canonical.hash || canonical.search) {
    report(file, 'canonical must be one absolute HTTPS URL without a query or fragment');
  }
  const og = Object.fromEntries(all.filter((item) => item.tag === 'meta' && item.attrs.property?.startsWith('og:')).map((item) => [item.attrs.property, item.attrs.content]));
  for (const key of ['og:title', 'og:description', 'og:url', 'og:type']) {
    if (!og[key]?.trim()) report(file, `missing ${key}`);
  }
  for (const key of ['og:url', 'og:image']) {
    if (og[key] && !absolute(og[key])) report(file, `${key} must be absolute`);
  }
  if (canonical && og['og:url'] !== canonical.href) report(file, 'og:url must match canonical');
  const pagePath = `/${path.relative(root, file).split(path.sep).join('/')}`.replace(/index\.html$/, '');
  if (canonical && decodeURIComponent(canonical.pathname) !== pagePath) report(file, `canonical path does not match output route ${pagePath}`);
  for (const { tag, attrs: attributes } of all) {
    if (tag === 'img' && !Object.hasOwn(attributes, 'alt')) report(file, `image is missing alt: ${attributes.src || '(no src)'}`);
    if (tag === 'a' && attributes.href === '#') report(file, 'placeholder href="#"');
    if (attributes.href?.startsWith('javascript:')) report(file, 'javascript: link');
  }
  if (pagePath === '/' && all.some(({ tag, attrs: attributes }) => tag === 'script' && /mathjax/i.test(attributes.src || ''))) {
    report(file, 'homepage loads MathJax even though it has no mathematical content');
  }
  const noindex = all.some((item) => item.tag === 'meta' && item.attrs.name === 'robots' && /\bnoindex\b/.test(item.attrs.content || ''));
  pages.set(file, { all, ids, canonical, pagePath, noindex });
}

if (!pages.size) report(root, 'no HTML pages were generated');
const origin = [...pages.values()].find(({ canonical }) => canonical)?.canonical.origin || 'https://example.invalid';

async function checkReference(file, value, base, label, { fragment = false } = {}) {
  if (!value || /^(?:data:|mailto:|tel:|blob:)/i.test(value)) return;
  let url;
  try { url = new URL(value, base); } catch { report(file, `invalid ${label}: ${value}`); return; }
  if (!['https:', 'http:'].includes(url.protocol) || url.origin !== origin) return;
  const target = await resolveLocal(url);
  if (!target) { report(file, `missing local ${label}: ${value}`); return; }
  try { await stat(target); } catch { report(file, `missing local ${label}: ${value}`); return; }
  if (fragment && url.hash && pages.has(target)) {
    let id;
    try { id = decodeURIComponent(url.hash.slice(1)); } catch { report(file, `invalid fragment: ${value}`); return; }
    if (!pages.get(target).ids.has(id)) report(file, `missing fragment target: ${value}`);
  }
}

for (const [file, { all, canonical, pagePath }] of pages) {
  const base = canonical?.href || new URL(pagePath, origin).href;
  for (const { tag, attrs: attributes } of all) {
    if (['a', 'link'].includes(tag) && attributes.href) await checkReference(file, attributes.href, base, 'link', { fragment: tag === 'a' });
    if (['script', 'img', 'source', 'iframe', 'video', 'audio'].includes(tag) && attributes.src) await checkReference(file, attributes.src, base, 'resource');
    if (attributes.poster) await checkReference(file, attributes.poster, base, 'poster');
    if (attributes.srcset && !attributes.srcset.startsWith('data:')) {
      for (const candidate of attributes.srcset.split(',')) await checkReference(file, candidate.trim().split(/\s+/)[0], base, 'srcset image');
    }
    if (tag === 'meta' && attributes.property === 'og:image') await checkReference(file, attributes.content, base, 'Open Graph image');
  }
}

for (const file of builtFiles.filter((file) => file.endsWith('.css'))) {
  const css = await readFile(file, 'utf8');
  const base = new URL(`/${path.relative(root, file).split(path.sep).join('/')}`, origin).href;
  for (const match of css.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/g)) {
    if (!match[2].startsWith('#')) await checkReference(file, match[2], base, 'CSS resource');
  }
}

try {
  for (const file of await walk(source)) {
    if (/\.ya?ml$/.test(file)) {
      try { parseYaml(await readFile(file, 'utf8'), { uniqueKeys: true }); } catch (error) { report(file, `invalid YAML: ${error.message}`); }
    }
    if (file.endsWith('.md')) {
      const content = await readFile(file, 'utf8');
      const frontMatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
      if (!frontMatter) continue;
      try {
        const data = parseYaml(frontMatter[1], { uniqueKeys: true });
        if (data?.draft === true && data.permalink !== false) report(file, 'drafts must set permalink: false so they cannot be published');
      } catch (error) { report(file, `invalid front matter: ${error.message}`); }
    }
  }
} catch (error) { report(source, `cannot inspect source content: ${error.message}`); }

const sitemapFile = path.join(root, 'sitemap.xml');
try {
  const sitemap = await readFile(sitemapFile, 'utf8');
  const locations = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1].replaceAll('&amp;', '&'));
  for (const { canonical, noindex } of pages.values()) {
    if (canonical && !noindex && !locations.includes(canonical.href)) report(sitemapFile, `missing page: ${canonical.href}`);
    if (canonical && noindex && locations.includes(canonical.href)) report(sitemapFile, `noindex page must not be listed: ${canonical.href}`);
  }
  for (const location of locations) await checkReference(sitemapFile, location, origin, 'sitemap route');
} catch { report(sitemapFile, 'missing sitemap.xml'); }

if (errors.length) {
  console.error(`Static checks failed (${errors.length}):\n${errors.map((error) => `  - ${error}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`Static checks passed: ${pages.size} pages, ${builtFiles.length} files, local links/resources/fragments, metadata and editable content.`);
}
