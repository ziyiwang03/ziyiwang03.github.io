import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { parse } from 'parse5';

let chromium;
try {
  ({ chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright'));
} catch {
  console.error('Browser checks need Playwright. Install it with npm install --no-save playwright, or set PLAYWRIGHT_MODULE to an installed Playwright module.');
  process.exit(1);
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]))).flat();
}

function visit(node, callback) {
  callback(node);
  for (const child of node.childNodes || []) visit(child, callback);
}

const routes = [];
// This manifest comes from the previous site's actual destinations. Discovering
// only today's output cannot catch a page that the refactor accidentally removed.
const legacyParity = {
  home: { path: '/', title: 'Ziyi Wang', nav: '/' },
  publications: { path: '/publications/', title: 'Publications', nav: '/publications/' },
  research: { path: '/research/', title: 'Research interests', nav: '/research/' },
  teaching: { path: '/teaching/', title: 'Teaching', nav: '/teaching/' },
  studies: { path: '/studies/', title: 'Studies', nav: '/studies/' },
  blog: { path: '/blog/', title: 'Notes & writing', nav: '/blog/' },
  life: { path: '/life/', title: 'Outside mathematics', nav: '/life/' },
  'life-sports': { path: '/life/sports/', title: 'Movement & practice', nav: '/life/' },
  'life-movies': { path: '/life/movies/', title: 'Ten films I keep returning to', nav: '/life/' },
  'life-coffee': { path: '/life/coffee/', title: 'Brewing notebook', nav: '/life/' },
  'life-photography': { path: '/life/photography/', title: 'Selected photographs', nav: '/life/' },
  'life-travel': { path: '/life/travel/', title: 'Places & field notes', nav: '/life/' },
  'summer-school': { path: '/schools/afepack-2026/', title: 'Adaptive Finite Element Algorithms & AFEPack Applications', nav: '/studies/' },
  'course-numerical-pde': { path: '/teaching/course-template/', title: 'Numerical Methods for Partial Differential Equations', nav: '/teaching/' },
};
for (const filename of (await walk('_site')).filter((file) => file.endsWith('.html'))) {
  const document = parse(await readFile(filename, 'utf8'));
  let canonical;
  let math = false;
  visit(document, (node) => {
    const attributes = Object.fromEntries((node.attrs || []).map(({ name, value }) => [name, value]));
    if (node.tagName === 'link' && attributes.rel === 'canonical') canonical = attributes.href;
    if (node.tagName === 'script' && /mathjax/i.test(attributes.src || '')) math = true;
  });
  assert.ok(canonical, `${filename} has no canonical URL; run npm run check for details`);
  routes.push({ path: new URL(canonical).pathname, math });
}
for (const [legacy, expected] of Object.entries(legacyParity)) {
  assert.ok(routes.some((route) => route.path === expected.path), `Legacy #${legacy} destination must still be generated: ${expected.path}`);
}

const artifacts = await mkdtemp(path.join(tmpdir(), 'ziyi-home-browser-'));
console.log(`Browser check: ${routes.length} pages. Screenshots: ${artifacts}`);
const server = spawn(process.execPath, ['scripts/serve.mjs'], { env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
let serverErrors = '';
server.stderr.on('data', (chunk) => { serverErrors = (serverErrors + String(chunk)).slice(-4000); });
let browser;
try {
  const base = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Preview server did not start in 10 seconds')), 10000);
    server.stdout.on('data', (chunk) => {
      const match = String(chunk).match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) { clearTimeout(timeout); resolve(match[0]); }
    });
    server.once('error', (error) => { clearTimeout(timeout); reject(error); });
    server.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`Preview server stopped (${code}): ${serverErrors.trim()}`)); });
  });
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}), ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
  const failures = [];
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(`JavaScript error at ${page.url()}: ${error.message}`));
  page.on('response', (response) => {
    if (response.url().startsWith(base) && response.status() >= 400) failures.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  page.on('requestfailed', (request) => {
    if (request.url().startsWith(base) && !/ERR_ABORTED/.test(request.failure()?.errorText || '')) failures.push(`Resource failed: ${request.url()} (${request.failure()?.errorText})`);
  });

  async function load(route) {
    const response = await page.goto(`${base}${route}`, { waitUntil: 'networkidle' });
    assert.equal(response.status(), 200, `${route} should be directly accessible`);
    await page.locator('main').waitFor({ state: 'visible' });
  }

  async function checkOverflow(label) {
    const geometry = await page.evaluate(() => {
      const main = document.querySelector('main').getBoundingClientRect();
      return { viewport: innerWidth, document: document.documentElement.scrollWidth, mainLeft: main.left, mainRight: main.right };
    });
    assert.ok(geometry.document <= geometry.viewport + 1, `${label}: document overflow ${JSON.stringify(geometry)}`);
    assert.ok(geometry.mainLeft >= -1 && geometry.mainRight <= geometry.viewport + 1, `${label}: main extends beyond viewport ${JSON.stringify(geometry)}`);
  }

  async function screenshot(filename, { viewport = false } = {}) {
    if (!viewport) {
      await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
      await page.waitForFunction(() => window.scrollY === 0);
    }
    // Full-page capture does not itself scroll to lazy images. Load them only in
    // this browser document so the artifact shows the complete gallery.
    await page.locator('img[src]').evaluateAll(async (images) => {
      await Promise.all(images.map(async (image) => {
        const loading = image.getAttribute('loading');
        image.loading = 'eager';
        try { await image.decode(); } finally {
          if (loading === null) image.removeAttribute('loading');
          else image.setAttribute('loading', loading);
        }
      }));
    });
    await page.screenshot({ path: path.join(artifacts, filename), fullPage: !viewport });
  }

  async function parity(name, run) {
    try { await run(); } catch (error) {
      error.message = `Parity case "${name}": ${error.message}`;
      throw error;
    }
    console.log(`Parity passed: ${name}.`);
  }

  function near(actual, expected, message, tolerance = 1) {
    assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: expected ${expected}, received ${actual}`);
  }

  const lifeCategories = ['Sports', 'Movies', 'Coffee', 'Photography', 'Travel'];
  const lifePaths = ['/life/sports/', '/life/movies/', '/life/coffee/', '/life/photography/', '/life/travel/'];

  async function checkLifeLayout(width) {
    const mobile = width <= 760;
    await load('/life/');
    await page.evaluate(() => document.fonts.ready);
    const links = page.locator('.life-directory > a');
    assert.deepEqual(await links.locator('strong').allTextContents(), lifeCategories, 'Life directory preserves category order');
    assert.deepEqual(await links.evaluateAll((elements) => elements.map((element) => element.getAttribute('href'))), lifePaths);
    assert.equal(await page.locator('.life-landing').count(), 1, 'Life has its original narrow landing wrapper');
    const landing = await page.evaluate(() => {
      const rect = (element) => { const { left, right, top, bottom, width } = element.getBoundingClientRect(); return { left, right, top, bottom, width }; };
      const page = document.querySelector('.page.life-page');
      const wrapper = document.querySelector('.life-landing');
      return { main: rect(document.querySelector('main')), page: rect(page), wrapper: rect(wrapper),
        rows: [...document.querySelectorAll('.life-directory > a')].map((element) => {
          const style = getComputedStyle(element);
          return { ...rect(element), paddingTop: parseFloat(style.paddingTop), paddingBottom: parseFloat(style.paddingBottom),
            titleSize: parseFloat(getComputedStyle(element.querySelector('strong')).fontSize),
            descriptionSize: parseFloat(getComputedStyle(element.querySelector('small')).fontSize) };
        }) };
    });
    near(landing.page.width, Math.min(900, landing.main.width), `${width}px Life outer content width`);
    if (mobile) near(landing.main.width, width - 28, `${width}px Life retains 14px side gutters`);
    near(landing.wrapper.width, Math.min(760, landing.page.width), `${width}px Life landing width`);
    near(landing.wrapper.left, landing.page.left, `${width}px narrow directory stays left aligned`);
    for (const [index, row] of landing.rows.entries()) {
      near(row.width, landing.wrapper.width, `${width}px category row fills landing`);
      near(row.titleSize, mobile ? 21 : 23, `${width}px category title size`);
      near(row.descriptionSize, mobile ? 12 : 13, `${width}px category description size`);
      near(row.paddingTop, mobile ? 16 : 19, `${width}px directory top spacing`);
      near(row.paddingBottom, mobile ? 16 : 19, `${width}px directory bottom spacing`);
      if (index) assert.ok(row.top >= landing.rows[index - 1].bottom - 1, 'directory rows are sequential, never a card grid');
    }
    await checkOverflow(`${width}px Life landing`);
    await screenshot(`life-${width === 1440 ? 'desktop' : `mobile-${width}`}.png`);

    await links.first().click();
    assert.equal(new URL(page.url()).pathname, '/life/sports/', 'directory opens the real Sports page');
    await page.evaluate(() => document.fonts.ready);
    const activities = page.locator('.activity-list > .activity-block');
    assert.equal(await activities.count(), 4, 'Sports keeps four full-width activity rows');
    assert.equal(await page.locator('.sports-grid').count(), 0, 'Sports must not silently become a two-column card grid');
    assert.deepEqual(await activities.locator('.activity-intro h2').allTextContents(), ['Running', 'Table Tennis', 'Swimming', 'Football']);
    assert.equal(await page.locator('.pb-list > div').count(), 5, 'running retains all five distances');
    assert.equal((await page.locator('.pb-open small').textContent()).trim(), 'Open target');
    assert.equal(await page.locator('.racket-setups > .racket-setup').count(), 2, 'main and backup remain independent setups');
    for (const setup of await page.locator('.racket-setup').all()) {
      assert.deepEqual(await setup.locator('dt').allTextContents(), ['Blade', 'Forehand rubber', 'Backhand rubber']);
    }
    assert.equal(await page.locator('.sports-photo-reserve > div').count(), 2, 'empty table-tennis photos preserve two labelled slots');
    assert.equal(await page.locator('.sports-photo-reserve img').count(), 0, 'empty photo slots never pretend to contain images');
    assert.equal(await page.locator('.single-stat strong').innerText(), '≈ 41:00');
    assert.equal((await page.locator('.single-stat span').textContent()).trim(), '1 km PB');
    const football = activities.last();
    assert.equal((await football.innerText()).match(/Prof\. Yiqi Gu/g)?.length, 1, 'host name appears exactly once in football narrative');
    assert.equal(await football.locator('p a[href="http://yiqigu.org.cn/index.html"]').count(), 1, 'football link is inline within its sentence');
    const sports = await page.evaluate(() => {
      const rect = (element) => { const { left, right, top, bottom, width, height } = element.getBoundingClientRect(); return { left, right, top, bottom, width, height }; };
      const list = document.querySelector('.activity-list');
      const reserve = document.querySelector('.sports-photo-reserve');
      const nav = document.querySelector('.life-subpage-header nav');
      const stat = document.querySelector('.single-stat strong');
      return { main: rect(document.querySelector('main')), page: rect(document.querySelector('.page.life-page')), list: rect(list),
        headingSize: parseFloat(getComputedStyle(document.querySelector('main h1')).fontSize),
        rows: [...list.querySelectorAll(':scope > .activity-block')].map((element) => {
          const intro = element.querySelector('.activity-intro');
          const detail = [...element.children].find((child) => child !== intro && !child.matches('.sport-photos, .sports-photo-reserve'));
          const heading = getComputedStyle(intro.querySelector('h2'));
          return { ...rect(element), intro: rect(intro), detail: rect(detail), columns: getComputedStyle(element).gridTemplateColumns.split(' ').length,
            headingLineHeight: parseFloat(heading.lineHeight), headingLetterSpacing: heading.letterSpacing };
        }),
        pbValues: [...document.querySelectorAll('.pb-list dd')].map(rect), pbList: rect(document.querySelector('.pb-list')),
        rackets: [...document.querySelectorAll('.racket-setup')].map(rect),
        equipment: [...document.querySelectorAll('.equipment-list > div')].map((element) => ({ row: rect(element), label: rect(element.querySelector('dt')), value: rect(element.querySelector('dd')) })),
        stat: { ...rect(stat), size: parseFloat(getComputedStyle(stat).fontSize), label: rect(document.querySelector('.single-stat span')) },
        reserve: rect(reserve), slots: [...reserve.children].map(rect),
        nav: { ...rect(nav), wrap: getComputedStyle(nav).flexWrap, overflow: getComputedStyle(nav).overflowX, scrollWidth: nav.scrollWidth,
          links: [...nav.querySelectorAll('a')].map((element) => ({ ...rect(element), href: element.getAttribute('href'), size: parseFloat(getComputedStyle(element).fontSize) })) } };
    });
    near(sports.page.width, Math.min(900, sports.main.width), `${width}px Life subpage width`);
    near(sports.headingSize, mobile ? 31 : 36, `${width}px Sports section heading size`);
    near(sports.list.width, sports.page.width, `${width}px activity list fills content width`);
    for (const [index, row] of sports.rows.entries()) {
      near(row.left, sports.list.left, `${width}px activity left edge`);
      near(row.width, sports.list.width, `${width}px activity is full width`);
      near(row.headingLineHeight, 27 * (mobile ? 1.52 : 1.54), `${width}px activity heading retains the original line height`);
      assert.equal(row.headingLetterSpacing, 'normal', 'activity headings keep their original letter spacing');
      assert.equal(row.columns, mobile ? 1 : 2, `${width}px original 760px activity breakpoint`);
      if (index) assert.ok(row.top >= sports.rows[index - 1].bottom - 1, 'activities must stack vertically, never appear side-by-side');
      if (mobile) {
        near(row.intro.left, row.detail.left, `${width}px detail is below its introduction`);
        near(row.detail.width, index === 3 ? Math.min(590, row.intro.width) : row.intro.width, `${width}px mobile detail retains its original readable width`);
        assert.ok(row.detail.top >= row.intro.bottom - 1, `${width}px introduction comes before detail`);
      } else {
        near(row.intro.width, 235, `${width}px original introduction column`);
        near(row.detail.left - row.intro.right, 54, `${width}px original detail column gap`);
        if (index === 3) near(row.detail.width, Math.min(590, row.right - row.detail.left), `${width}px football narrative retains its 590px reading limit`);
        else near(row.detail.right, row.right, `${width}px detail ends at the row edge`);
      }
    }
    for (const value of sports.pbValues) near(value.right, sports.pbList.right, `${width}px running times align to the right edge`);
    assert.ok(sports.rackets[1].top >= sports.rackets[0].bottom, 'backup racket is below main racket, not alongside it');
    for (const equipment of sports.equipment) {
      near(equipment.label.width, mobile ? 112 : 130, `${width}px equipment label width`);
      assert.ok(equipment.value.left >= equipment.label.right, 'equipment values have their own column');
      assert.ok(equipment.value.right <= equipment.row.right + 1, 'equipment values stay inside their row');
    }
    near(sports.stat.size, 44, `${width}px swimming result retains large-stat typography`);
    assert.ok(sports.stat.label.top >= sports.stat.bottom - 1, 'swimming PB label stays below its prominent time');
    near(sports.reserve.width, sports.rows[1].width, `${width}px photo reserve spans the entire table-tennis row`);
    near(sports.reserve.left, sports.rows[1].left, `${width}px photo reserve left alignment`);
    if (mobile) {
      near(sports.slots[0].width, sports.reserve.width, `${width}px photo slot fills the row`);
      assert.ok(sports.slots[1].top >= sports.slots[0].bottom, 'mobile photo slots stack');
    } else {
      near(sports.slots[0].top, sports.slots[1].top, `${width}px photo slots stay side-by-side`);
      assert.ok(sports.slots[1].left >= sports.slots[0].right, 'desktop photo slots use two columns');
    }
    assert.equal(sports.nav.wrap, 'nowrap', 'Life category navigation preserves its single-line treatment');
    for (const link of sports.nav.links) {
      near(link.top, sports.nav.links[0].top, 'Life category links share a baseline');
      near(link.size, mobile ? 13 : 14, `${width}px Life category navigation font size`);
    }
    if (mobile) assert.ok(['auto', 'scroll'].includes(sports.nav.overflow), 'mobile Life navigation may scroll inside its own container');
    // Tab through all five categories. At 320px the last link is initially off
    // screen; keyboard focus must reveal it without widening the document.
    await page.locator('.life-subpage-header .back-link').focus();
    for (const expected of lifePaths) {
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.getAttribute('href')), expected, 'all Life categories are keyboard reachable');
    }
    const focused = await page.locator('.life-subpage-header nav a').last().evaluate((element) => {
      const link = element.getBoundingClientRect();
      const nav = element.closest('nav').getBoundingClientRect();
      return { left: link.left, right: link.right, navLeft: nav.left, navRight: nav.right };
    });
    assert.ok(focused.left >= focused.navLeft - 1 && focused.right <= focused.navRight + 1, 'keyboard focus reveals the last Life category');
    await checkOverflow(`${width}px Sports original row layout`);
    // The keyboard assertions above deliberately scroll/focus the last tab.
    // Restore the ordinary opening state for a meaningful visual comparison.
    await page.evaluate(() => {
      document.activeElement?.blur();
      document.querySelector('.life-subpage-header nav').scrollLeft = 0;
    });
    await screenshot(`sports-${width === 1440 ? 'desktop' : `mobile-${width}`}.png`);
    await page.locator('.life-subpage-header .back-link').click();
    assert.equal(new URL(page.url()).pathname, '/life/', 'Sports still returns to its directory');
  }

  await parity('original default news and course-note filters', async () => {
    await load('/');
    const news = page.locator('[data-filter-key="news"]');
    assert.equal(await news.count(), 1, 'news filter must be present');
    assert.equal(await news.locator('[data-filter="current"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await news.locator('[data-filter-item]:visible').count(), await news.locator('[data-filter-item][data-category="current"]').count(), 'homepage initially shows current news only');
    await load('/studies/');
    const notes = page.locator('[data-filter-key="notes"]');
    assert.equal(await notes.count(), 1, 'notes filter must be present');
    assert.equal(await notes.locator('[data-filter="graduate"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await notes.locator('[data-filter-item]:visible').count(), await notes.locator('[data-filter-item][data-category="graduate"]').count(), 'studies initially shows graduate PDFs only');
  });

  await parity('filter choices survive ordinary navigation', async () => {
    await load('/');
    await page.locator('[data-filter-key="news"] [data-filter="past"]').click();
    await page.locator('#primary-nav a[href="/life/"]').click();
    await page.locator('#primary-nav a[href="/"]').click();
    assert.equal(await page.locator('[data-filter-key="news"] [data-filter="past"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('[data-filter-key="news"] [data-filter-item]:visible').count(), await page.locator('[data-filter-key="news"] [data-filter-item][data-category="past"]').count());
    await page.locator('[data-filter-key="news"] [data-filter="current"]').click();
    await load('/studies/');
    await page.locator('[data-filter-key="notes"] [data-filter="undergraduate"]').click();
    await page.locator('#primary-nav a[href="/"]').click();
    await page.locator('#primary-nav a[href="/studies/"]').click();
    assert.equal(await page.locator('[data-filter-key="notes"] [data-filter="undergraduate"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('[data-filter-key="notes"] [data-filter-item]:visible').count(), await page.locator('[data-filter-key="notes"] [data-filter-item][data-category="undergraduate"]').count());
    await page.locator('[data-filter-key="notes"] [data-filter="graduate"]').click();
  });

  await parity('bounded news scrolling resets on filter change', async () => {
    await load('/');
    const news = page.locator('[data-filter-key="news"]');
    await news.locator('[data-filter="all"]').click();
    const list = news.locator('.news-list');
    const overflow = await list.evaluate((element) => getComputedStyle(element).overflowY);
    assert.ok(['auto', 'scroll'].includes(overflow), 'news uses its own scrolling area');
    // Extra entries live only in this browser document, to exercise the same
    // container after a future year of updates without touching personal data.
    await list.evaluate((element) => {
      const entry = element.querySelector('[data-filter-item]');
      for (let i = 0; i < 8; i++) element.append(entry.cloneNode(true));
      element.scrollTop = element.scrollHeight;
    });
    assert.ok(await list.evaluate((element) => element.scrollTop > 0 && element.clientHeight < element.scrollHeight));
    await news.locator('[data-filter="current"]').click();
    await page.waitForFunction(() => document.querySelector('[data-filter-key="news"] .news-list').scrollTop < 1);
    await load('/');
  });

  await parity('course-room identity, real anchors and return navigation', async () => {
    await load('/teaching/');
    const sample = page.locator('main a[href="/teaching/course-template/"]');
    assert.equal(await sample.count(), 1, 'Teaching retains an entry into the explicitly marked course template');
    await sample.click();
    assert.match(await page.locator('main h1').innerText(), /Numerical Methods for Partial Differential Equations/);
    assert.equal(await page.locator('#primary-nav [aria-current="page"]').getAttribute('href'), '/teaching/');
    assert.match(await page.locator('meta[name="robots"]').getAttribute('content'), /noindex/);
    await screenshot('course-template-desktop.png');
    for (const id of ['course-overview', 'course-schedule', 'course-resources']) {
      assert.equal(await page.locator(`#${id}`).count(), 1, `course section ${id} is retained`);
      await page.locator(`.course-sidebar a[href="#${id}"]`).click();
      await page.waitForFunction((id) => location.hash === `#${id}`, id);
      assert.equal(new URL(page.url()).pathname, '/teaching/course-template/', 'course anchors must not route to Home');
      await page.waitForFunction((id) => {
        const top = document.getElementById(id).getBoundingClientRect().top;
        return top > -1 && top < innerHeight;
      }, id);
    }
    await page.locator('.back-link[href="/teaching/"]').click();
    assert.equal(new URL(page.url()).pathname, '/teaching/');
    const sitemap = await (await context.request.get(`${base}/sitemap.xml`)).text();
    assert.ok(!sitemap.includes('/teaching/course-template/'), 'the sample must not be advertised as a real course');
  });

  await parity('eight daily-summary slots remain expandable', async () => {
    await load('/schools/afepack-2026/');
    const details = page.locator('.foundation-notes');
    assert.equal(await details.count(), 1, 'empty summaries retain their disclosure');
    assert.match(await details.locator('summary').innerText(), /0\s*\/\s*8/);
    assert.equal(await details.locator('.foundation-day-list time').count(), 8);
    assert.equal(await details.getAttribute('open'), null);
    await details.locator('summary').click();
    assert.equal(await details.evaluate((element) => element.open), true);
    for (const day of await details.locator('.foundation-day-list time').all()) assert.ok(await day.isVisible());
    await screenshot('school-desktop-expanded.png');
    await details.locator('summary').press('Enter');
    assert.equal(await details.evaluate((element) => element.open), false, 'keyboard can close the same disclosure');
    assert.ok(await page.locator('.programme-track-block').count() >= 2, 'Foundations and Frontier lectures are still grouped');
    await page.locator('.back-link[href="/studies/"]').click();
    assert.equal(new URL(page.url()).pathname, '/studies/');
  });

  await parity('ranked movie posters enlarge and offer an accessible preview', async () => {
    await load('/life/movies/');
    assert.deepEqual(await page.locator('.movie-rank').allTextContents(), ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10']);
    const trigger = page.locator('a[data-image-preview]').first();
    assert.equal(await page.locator('a[data-image-preview]').count(), 10);
    const image = trigger.locator('img');
    await trigger.hover();
    await page.waitForFunction(() => {
      const image = document.querySelector('a[data-image-preview] img');
      const transform = getComputedStyle(image).transform;
      return transform !== 'none' && new DOMMatrix(transform).a > 1.1;
    });
    await page.mouse.move(0, 0);
    await page.waitForFunction(() => {
      const transform = getComputedStyle(document.querySelector('a[data-image-preview] img')).transform;
      return transform === 'none' || new DOMMatrix(transform).a <= 1.001;
    });
    await page.locator('.life-subpage-header nav a').last().focus();
    await page.keyboard.press('Tab');
    assert.equal(await trigger.evaluate((element) => document.activeElement === element), true, 'poster is reachable by keyboard');
    await page.waitForFunction(() => {
      const image = document.querySelector('a[data-image-preview] img');
      const transform = getComputedStyle(image).transform;
      return transform !== 'none' && new DOMMatrix(transform).a > 1.1;
    });
    assert.ok(await image.isVisible());
    await trigger.click();
    const dialog = page.locator('dialog.image-preview');
    await dialog.waitFor({ state: 'visible' });
    assert.ok(await dialog.evaluate((element) => element.open));
    assert.equal(new URL(await dialog.locator('img').getAttribute('src'), base).href, new URL(await trigger.getAttribute('href'), base).href);
    await screenshot('movie-preview-desktop.png', { viewport: true });
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(await trigger.evaluate((element) => document.activeElement === element), true, 'Escape restores poster focus');
    await trigger.press('Enter');
    await dialog.waitFor({ state: 'visible' });
    await dialog.locator('.image-preview-close').click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(await trigger.evaluate((element) => document.activeElement === element), true, 'close button restores poster focus');
    assert.equal(new URL(page.url()).pathname, '/life/movies/');
    await screenshot('movies-desktop.png');
  });

  for (const width of [1440, 390, 320, 760, 761]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    await parity(`Life and Sports preserve their original layout at ${width}px`, () => checkLifeLayout(width));
  }
  await page.setViewportSize({ width: 1440, height: 1000 });

  async function checkFilters(route) {
    for (const group of await page.locator('[data-filter-group]').all()) {
      const items = group.locator('[data-filter-item]');
      const total = await items.count();
      for (const button of await group.locator('button[data-filter]').all()) {
        const value = await button.getAttribute('data-filter');
        const expected = await items.evaluateAll((elements, selected) => elements.filter((item) => selected === 'all' || item.dataset.category?.split(/[\s,]+/).includes(selected)).length, value);
        await button.click();
        assert.equal(await button.getAttribute('aria-pressed'), 'true', `${route}: filter ${value} is selected`);
        assert.equal(await group.locator('[data-filter-item]:visible').count(), expected, `${route}: filter ${value} must show matching items`);
        const empty = group.locator('[data-filter-empty]');
        if (await empty.count()) assert.equal(await empty.isVisible(), expected === 0, `${route}: empty state for ${value}`);
        if (expected < total) assert.ok(await group.locator('[data-filter-item]:not(:visible)').count() > 0, `${route}: filter must actually hide other items`);
      }
      const all = group.locator('button[data-filter="all"]');
      if (await all.count()) await all.click();
    }
  }

  for (const route of routes) {
    await load(route.path);
    await checkOverflow(`desktop ${route.path}`);
    await checkFilters(route.path);
    for (const image of await page.locator('main img[src]').all()) {
      const local = await image.evaluate((element, origin) => new URL(element.src).origin === origin, new URL(base).origin);
      if (local) {
        await image.scrollIntoViewIfNeeded();
        await image.evaluate((element) => element.decode());
        assert.ok(await image.evaluate((element) => element.naturalWidth > 0), `${route.path}: local image decodes correctly`);
      }
    }
    if (route.math && await page.locator('.math-inline, .math-display').count()) {
      await page.waitForFunction(() => document.querySelector('mjx-container'), undefined, { timeout: 20000 });
      assert.ok(await page.locator('mjx-container svg').count(), `${route.path}: mathematical content renders as SVG`);
    }
    if (['/life/photography/', '/studies/'].includes(route.path)) await screenshot(`${route.path.slice(1).replaceAll('/', '-')}-desktop.png`);
  }
  console.log('Desktop pages, images, filters and mathematical rendering passed.');

  await load('/');
  const lightBackground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.locator('#theme-toggle').click();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark', 'theme button selects dark mode');
  assert.notEqual(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), lightBackground, 'theme changes the visible background');
  await load('/research/');
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark', 'theme preference persists between pages');
  await screenshot('research-desktop-dark.png');
  await page.locator('#theme-toggle').click();
  await load('/');
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light', 'theme preference persists after switching back');
  await screenshot('home-desktop-light.png');

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    for (const route of routes) {
      await load(route.path);
      await checkOverflow(`${width}px ${route.path}`);
    }
    await load('/');
    const toggle = page.locator('[data-menu-toggle]');
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true', 'mobile menu expands');
    assert.ok(await page.locator('#primary-nav a[href="/life/"]').isVisible(), 'mobile menu makes every main section available');
    await checkOverflow(`${width}px open menu`);
    await page.keyboard.press('Escape');
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false', 'Escape closes mobile menu');
    await screenshot(`home-mobile-${width}.png`);
    if (width === 390) {
      await load('/teaching/course-template/');
      await screenshot('course-template-mobile-390.png');
      await load('/life/movies/');
      await screenshot('movies-mobile-390.png');
      await page.locator('a[data-image-preview]').first().click();
      await page.locator('dialog.image-preview').waitFor({ state: 'visible' });
      await checkOverflow('390px movie preview');
      await screenshot('movie-preview-mobile-390.png', { viewport: true });
      await page.keyboard.press('Escape');
      await load('/schools/afepack-2026/');
      await page.locator('.foundation-notes summary').click();
      await screenshot('school-mobile-390-expanded.png');
    }
  }

  console.log('Mobile layouts, theme persistence and menu controls passed.');
  for (const [hash, expected] of Object.entries(legacyParity)) {
    await load('/');
    await page.goto(`${base}/#${hash}`, { waitUntil: 'networkidle' });
    await page.waitForURL((url) => url.pathname === expected.path && url.hash === '', { timeout: 5000 });
    assert.equal(new URL(page.url()).pathname, expected.path, `legacy #${hash} retains its actual destination`);
    assert.ok((await page.locator('main h1').innerText()).includes(expected.title), `legacy #${hash} retains its page identity`);
    assert.equal(await page.locator('#primary-nav [aria-current="page"]').count(), 1, `legacy #${hash} has one active main section`);
    assert.equal(await page.locator('#primary-nav [aria-current="page"]').getAttribute('href'), expected.nav);
    if (expected.path.startsWith('/life/') && expected.path !== '/life/') {
      assert.equal(await page.locator('.life-subpage-header nav [aria-current="page"]').getAttribute('href'), expected.path);
    }
  }
  await page.goto(`${base}/#content`, { waitUntil: 'networkidle' });
  assert.equal(new URL(page.url()).pathname, '/', 'skip-to-content hash is not treated as a legacy route');
  assert.equal(new URL(page.url()).hash, '#content', 'skip-to-content hash is preserved');

  const noJs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const noJsPage = await noJs.newPage();
  for (const route of routes) {
    await noJsPage.goto(`${base}${route.path}`, { waitUntil: 'load' });
    assert.ok(await noJsPage.locator('main h1').isVisible(), `no JavaScript: ${route.path} content is readable`);
    assert.ok(await noJsPage.locator('#primary-nav a[href="/life/"]').isVisible(), `no JavaScript: ${route.path} navigation is available`);
    for (const item of await noJsPage.locator('[data-filter-item]').all()) assert.ok(await item.isVisible(), `no JavaScript: ${route.path} filter content is visible`);
  }
  await noJsPage.goto(`${base}/life/movies/`, { waitUntil: 'load' });
  assert.equal(await noJsPage.locator('a[data-image-preview]').count(), 10, 'no JavaScript: poster previews remain real links');
  assert.ok((await noJsPage.locator('a[data-image-preview]').first().getAttribute('href')).startsWith('/assets/posters/'));
  await noJsPage.goto(`${base}/schools/afepack-2026/`, { waitUntil: 'load' });
  await noJsPage.locator('.foundation-notes summary').click();
  assert.equal(await noJsPage.locator('.foundation-notes').evaluate((element) => element.open), true, 'no JavaScript: daily summaries still expand');
  await noJs.close();
  assert.deepEqual(failures, [], 'pages have no local resource or JavaScript errors');
  await context.close();
  console.log(`Browser checks passed: ${routes.length} pages at 1440px / 390px / 320px, theme persistence, mobile navigation, filters, legacy links, MathJax and no-JavaScript content.`);
  console.log(`Screenshots: ${artifacts}`);
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}
