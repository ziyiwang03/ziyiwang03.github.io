import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'parse5';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

const project = fileURLToPath(new URL('..', import.meta.url));

function nodeElements(root) {
  const result = [];
  function visit(node) {
    if (node.tagName) result.push({ node, tag: node.tagName, attrs: Object.fromEntries((node.attrs || []).map(({ name, value }) => [name, value])) });
    for (const child of node.childNodes || []) visit(child);
  }
  visit(root);
  return result;
}

function elements(html) {
  return nodeElements(parse(html));
}

function text(node) {
  return (node.nodeName === '#text' ? node.value : (node.childNodes || []).map(text).join('')).replace(/\s+/g, ' ').trim();
}

function hasClass(element, name) {
  return (element.attrs.class || '').split(/\s+/).includes(name);
}

function descendants(node, tag) {
  const result = [];
  function visit(current) {
    if (current.tagName === tag) result.push(current);
    for (const child of current.childNodes || []) visit(child);
  }
  visit(node);
  return result;
}

async function fixtureProject(t) {
  const fixture = await mkdtemp(path.join(tmpdir(), 'ziyi-home-parity-test-'));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  await Promise.all([
    cp(path.join(project, 'src'), path.join(fixture, 'src'), { recursive: true }),
    cp(path.join(project, 'scripts'), path.join(fixture, 'scripts'), { recursive: true }),
    cp(path.join(project, 'eleventy.config.js'), path.join(fixture, 'eleventy.config.js')),
    cp(path.join(project, 'package.json'), path.join(fixture, 'package.json')),
    symlink(path.join(project, 'node_modules'), path.join(fixture, 'node_modules'), 'dir'),
  ]);
  return fixture;
}

function build(fixture) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(fixture, 'node_modules/@11ty/eleventy/cmd.cjs')], { cwd: fixture, stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.once('error', reject);
    child.once('close', (code) => resolve({ code, output }));
  });
}

test('legacy page identities and populated collections survive the refactor', { timeout: 60000 }, async (t) => {
  const fixture = await fixtureProject(t);
  const result = await build(fixture);
  assert.equal(result.code, 0, result.output);
  const output = (filename) => readFile(path.join(fixture, '_site', filename), 'utf8');
  // Fixed baseline identities are deliberate. Merely checking whatever pages
  // happen to exist would accept deleting the course room or a Life category.
  const expectedPages = {
    'index.html': 'Ziyi Wang',
    'publications/index.html': 'Publications',
    'research/index.html': 'Research interests',
    'teaching/index.html': 'Teaching',
    'teaching/course-template/index.html': 'Numerical Methods for Partial Differential Equations',
    'studies/index.html': 'Studies',
    'blog/index.html': 'Notes & writing',
    'life/index.html': 'Outside mathematics',
    'life/sports/index.html': 'Movement & practice',
    'life/movies/index.html': 'Ten films I keep returning to',
    'life/coffee/index.html': 'Brewing notebook',
    'life/photography/index.html': 'Selected photographs',
    'life/travel/index.html': 'Places & field notes',
    'schools/afepack-2026/index.html': 'Adaptive Finite Element Algorithms & AFEPack Applications',
  };
  const documents = new Map();
  for (const [filename, heading] of Object.entries(expectedPages)) {
    const html = await output(filename);
    const all = elements(html);
    const h1s = all.filter((element) => element.tag === 'h1');
    assert.equal(h1s.length, 1, `${filename}: one page heading`);
    assert.ok(text(h1s[0].node).includes(heading), `${filename}: preserves ${heading}`);
    documents.set(filename, { html, all });
  }

  const home = documents.get('index.html').all;
  const news = home.filter((element) => Object.hasOwn(element.attrs, 'data-filter-item'));
  for (const original of ['Began my M.Sc. studies at UESTC', 'Completed my B.Sc. studies at Yangzhou University', 'Added and reorganized a collection of mathematics notes', 'Received Finalist recognition']) {
    assert.ok(news.some((item) => text(item.node).includes(original)), `retains news item: ${original}`);
  }
  assert.ok(home.some((element) => element.attrs.href === '/assets/cv/ziyi-wang-cv.pdf'), 'CV remains accessible');

  const studies = documents.get('studies/index.html').all;
  const noteFiles = studies.filter((element) => element.tag === 'a').map((element) => element.attrs.href);
  for (const filename of ['finite-element-method', 'navier-stokes-foundations', 'probability-theory', 'real-analysis', 'complex-analysis', 'numerical-analysis', 'linear-algebra', 'ordinary-differential-equations', 'mathematical-analysis', 'real-analysis-homework']) {
    assert.ok(noteFiles.includes(`/assets/notes/${filename}.pdf`), `retains downloadable ${filename} notes`);
  }
  assert.ok(studies.some((element) => element.attrs.id === 'seminars-title'), 'Seminars remains an identifiable section even before records are added');
  assert.ok(studies.some((element) => element.attrs.href === '/schools/afepack-2026/'), 'Studies still opens the workshop directly');

  const life = documents.get('life/index.html').all;
  assert.equal(life.filter((element) => hasClass(element, 'life-landing')).length, 1, 'Life retains its narrower landing wrapper');
  const directory = life.find((element) => hasClass(element, 'life-directory'));
  assert.ok(directory, 'Life retains its five-category directory');
  const lifeLinks = nodeElements(directory.node).filter((element) => element.tag === 'a');
  assert.deepEqual(lifeLinks.map((element) => element.attrs.href), ['/life/sports/', '/life/movies/', '/life/coffee/', '/life/photography/', '/life/travel/']);
  assert.deepEqual(lifeLinks.map((element) => text(descendants(element.node, 'strong')[0])), ['Sports', 'Movies', 'Coffee', 'Photography', 'Travel']);

  // These are layout/content contracts, not merely page existence. The previous
  // title-only check silently accepted replacing four full-width rows by cards.
  const sports = documents.get('life/sports/index.html').all;
  const activityList = sports.find((element) => hasClass(element, 'activity-list'));
  assert.ok(activityList, 'Sports uses the original sequential activity list');
  assert.equal(sports.filter((element) => hasClass(element, 'sports-grid')).length, 0, 'Sports is not a two-by-two card grid');
  const activities = nodeElements(activityList.node).filter((element) => hasClass(element, 'activity-block'));
  assert.equal(activities.length, 4, 'all four activities remain independent rows');
  assert.deepEqual(activities.map((element) => {
    const intro = nodeElements(element.node).find((candidate) => hasClass(candidate, 'activity-intro'));
    assert.ok(intro, 'each activity has its own introduction column');
    return text(descendants(intro.node, 'h2')[0]);
  }), ['Running', 'Table Tennis', 'Swimming', 'Football']);
  const running = nodeElements(activities[0].node);
  const pbs = running.find((element) => hasClass(element, 'pb-list'));
  assert.ok(pbs, 'running personal bests retain their own list');
  assert.deepEqual(descendants(pbs.node, 'dt').map(text), ['1 km', '5 km', '10 km', 'Half marathon', 'Marathon']);
  assert.deepEqual(descendants(pbs.node, 'dd').slice(0, 4).map(text), ['04:21', '24:50', '54:01', '02:01:12']);
  const openTarget = running.find((element) => hasClass(element, 'pb-open'));
  assert.ok(openTarget, 'the unfinished marathon is distinct from a recorded time');
  assert.equal(text(descendants(openTarget.node, 'small')[0]), 'Open target');
  const tableTennis = nodeElements(activities[1].node);
  assert.match(text(activities[1].node), /Main and backup racket configurations/);
  const setups = tableTennis.filter((element) => hasClass(element, 'racket-setup'));
  assert.equal(setups.length, 2, 'main and backup equipment remain separately grouped');
  assert.deepEqual(setups.map((element) => text(nodeElements(element.node).find((candidate) => /^h[34]$/.test(candidate.tag)).node)), ['Main racket', 'Backup racket']);
  for (const setup of setups) assert.deepEqual(descendants(setup.node, 'dt').map(text), ['Blade', 'Forehand rubber', 'Backhand rubber']);
  const reserve = tableTennis.find((element) => hasClass(element, 'sports-photo-reserve'));
  assert.ok(reserve, 'the empty table-tennis photo region is not silently deleted');
  assert.deepEqual(descendants(reserve.node, 'span').map(text), ['Playing photo', 'Equipment detail']);
  assert.deepEqual(descendants(reserve.node, 'small').map(text), ['Future image', 'Future image']);
  assert.equal(descendants(reserve.node, 'img').length, 0, 'future-photo slots are honest labels, not broken images');
  const swimming = nodeElements(activities[2].node).find((element) => hasClass(element, 'single-stat'));
  assert.ok(swimming, 'swimming keeps its prominent single-stat display');
  assert.equal(text(descendants(swimming.node, 'strong')[0]), '≈ 41:00');
  assert.equal(text(descendants(swimming.node, 'span')[0]), '1 km PB');
  const football = nodeElements(activities[3].node);
  const hostLinks = football.filter((element) => element.tag === 'a' && element.attrs.href === 'http://yiqigu.org.cn/index.html');
  assert.equal(hostLinks.length, 1, 'football keeps one usable professor link');
  assert.equal(hostLinks[0].attrs.target, '_blank', 'football preserves the original new-tab external link');
  assert.equal((text(activities[3].node).match(/Prof\. Yiqi Gu/g) || []).length, 1, 'the host name is not duplicated outside the sentence');
  assert.equal(hostLinks[0].node.parentNode.tagName, 'p', 'football host is linked within the narrative');

  const movies = documents.get('life/movies/index.html').all;
  const previews = movies.filter((element) => element.tag === 'a' && Object.hasOwn(element.attrs, 'data-image-preview'));
  const originalPosters = ['yi-yi.jpg', 'interstellar.jpg', 'sun-also-rises.jpg', 'blade-runner-2049.png', 'la-la-land.png', 'beautiful-mind.jpg', 'theory-of-everything.jpg', 'chungking-express.jpg', 'bouquet.jpg', 'inception.jpg'];
  for (const filename of originalPosters) assert.ok(previews.some((element) => element.attrs.href === `/assets/posters/${filename}`), `poster ${filename} retains a usable image link`);
  assert.deepEqual(movies.filter((element) => hasClass(element, 'movie-rank')).slice(0, 10).map((element) => text(element.node)), ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10']);
  const movieCards = movies.filter((element) => hasClass(element, 'movie-card'));
  assert.equal(movieCards.length, 10);
  for (const card of movieCards) assert.equal(descendants(card.node, 'p').filter((node) => text(node) === 'Personal note to be added.').length, 1, 'each film retains its honest empty personal-note slot');

  const photography = documents.get('life/photography/index.html').all;
  const kit = photography.find((element) => hasClass(element, 'photography-kit'));
  assert.ok(kit, 'photography equipment remains a dedicated compact list');
  assert.equal(kit.tag, 'dl', 'the equipment list is not flattened into a generic Markdown table');
  assert.deepEqual(descendants(kit.node, 'dt').map(text), ['Digital', 'Film', 'Action']);
  assert.deepEqual(descendants(kit.node, 'dd').map(text), ['Sony A7C II', 'Canon AE-1', 'DJI Osmo Action 4']);
  assert.equal(photography.filter((element) => element.tag === 'table').length, 0, 'Photography has no replacement equipment table');
  const photos = photography.filter((element) => element.tag === 'img').map((element) => element.attrs.src);
  for (const name of ['blue-hour', 'tabby-portrait', 'coffee-table', 'misty-city', 'night-bridge', 'sleeping-cat', 'waterside']) assert.ok(photos.includes(`/assets/photography/${name}.webp`), `retains photograph ${name}`);
  const coffee = documents.get('life/coffee/index.html').all.filter((element) => element.tag === 'img').map((element) => element.attrs.src);
  for (const name of ['pour-over', 'latte-retouched']) assert.ok(coffee.includes(`/assets/coffee/${name}.webp`), `retains coffee photograph ${name}`);

  const school = documents.get('schools/afepack-2026/index.html').all;
  const daily = school.find((element) => hasClass(element, 'foundation-day-list'));
  assert.ok(daily, 'empty daily-summary slots are present');
  assert.deepEqual(descendants(daily.node, 'time').map((node) => Object.fromEntries(node.attrs.map(({ name, value }) => [name, value])).datetime), ['2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25', '2026-07-26', '2026-07-27', '2026-07-28']);
  assert.ok(school.some((element) => element.tag === 'details' && hasClass(element, 'foundation-notes')), 'daily summary disclosure remains usable');
  assert.ok(school.some((element) => hasClass(element, 'programme-track-heading') && text(element.node).includes('Foundations')), 'retains Foundations programme group');
  assert.ok(school.some((element) => hasClass(element, 'programme-track-heading') && text(element.node).includes('Frontier lectures')), 'retains Frontier lectures programme group');
  assert.equal(school.filter((element) => hasClass(element, 'programme-row')).length, 10, 'all ten programme sessions survive exactly once');

  const course = documents.get('teaching/course-template/index.html');
  assert.ok(course.all.some((element) => element.tag === 'meta' && element.attrs.name === 'robots' && /noindex/.test(element.attrs.content)), 'course sample is transparently excluded from indexing');
  for (const id of ['course-overview', 'course-schedule', 'course-resources']) {
    assert.ok(course.all.some((element) => element.attrs.id === id), `course room retains ${id}`);
    assert.ok(course.all.some((element) => element.tag === 'a' && element.attrs.href === `#${id}`), `course room links to ${id}`);
  }
  assert.ok(course.all.some((element) => element.attrs.href === '/teaching/'), 'course room links back to Teaching');
  const sitemap = await output('sitemap.xml');
  assert.ok(!sitemap.includes('/teaching/course-template/'), 'course template is not listed as a public academic page');
});

test('Sports data updates fill the original rows without mutating real personal content', { timeout: 60000 }, async (t) => {
  const fixture = await fixtureProject(t);
  const filename = path.join(fixture, 'src/_data/sports.yml');
  const sports = parseYaml(await readFile(filename, 'utf8'));
  sports.running.description = 'Fixture running description with training.';
  sports.running.personalBests[0].time = '03:33';
  sports.tableTennis.description = 'Fixture equipment description with control.';
  sports.tableTennis.rackets[0].blade = 'Fixture main blade <Control>';
  sports.tableTennis.rackets[0].forehand = 'Fixture main forehand';
  sports.tableTennis.rackets[0].backhand = 'Fixture main backhand';
  sports.tableTennis.rackets[1].blade = 'Fixture backup blade';
  sports.tableTennis.rackets[1].forehand = 'Fixture backup forehand';
  sports.tableTennis.rackets[1].backhand = 'Fixture backup backhand';
  sports.swimming.personalBest = '≈ 39:59';
  sports.football.description = 'Fixture group training with [Fixture host](/life/) only once.';
  for (const key of ['running', 'tableTennis', 'swimming', 'football']) {
    sports[key].photos = [{ src: '/assets/posters/yi-yi.jpg', alt: `Fixture ${key} photograph <test>`, caption: `Fixture ${key} photo caption` }];
  }
  await writeFile(filename, stringifyYaml(sports));
  const result = await build(fixture);
  assert.equal(result.code, 0, result.output);
  const html = await readFile(path.join(fixture, '_site/life/sports/index.html'), 'utf8');
  const all = elements(html);
  assert.equal(all.filter((element) => hasClass(element, 'sports-photo-reserve')).length, 0, 'genuine photographs replace reserved empty slots');
  const activities = all.filter((element) => hasClass(element, 'activity-block'));
  assert.equal(activities.length, 4);
  assert.match(text(activities[0].node), /Fixture running description with training/);
  assert.match(text(activities[0].node), /03:33/);
  assert.match(text(activities[1].node), /Fixture equipment description with control/);
  for (const value of ['Fixture main blade <Control>', 'Fixture main forehand', 'Fixture main backhand', 'Fixture backup blade', 'Fixture backup forehand', 'Fixture backup backhand']) assert.ok(text(activities[1].node).includes(value), `renders ${value}`);
  const swimming = nodeElements(activities[2].node).find((element) => hasClass(element, 'single-stat'));
  assert.equal(text(descendants(swimming.node, 'strong')[0]), '≈ 39:59');
  const football = nodeElements(activities[3].node);
  assert.equal(football.filter((element) => element.tag === 'a' && element.attrs.href === '/life/' && text(element.node) === 'Fixture host').length, 1);
  assert.ok(!text(activities[3].node).includes('Prof. Yiqi Gu'), 'Markdown football narrative is not followed by a stale hard-coded host');
  for (const [index, key] of ['running', 'tableTennis', 'swimming', 'football'].entries()) {
    const images = descendants(activities[index].node, 'img');
    assert.equal(images.length, 1, `${key} consumes its photo data`);
    const attrs = Object.fromEntries(images[0].attrs.map(({ name, value }) => [name, value]));
    assert.equal(attrs.src, '/assets/posters/yi-yi.jpg');
    assert.equal(attrs.alt, `Fixture ${key} photograph <test>`);
    assert.ok(Number(attrs.width) > 0 && Number(attrs.height) > 0, 'new photos retain intrinsic dimensions');
    assert.ok(text(activities[index].node).includes(`Fixture ${key} photo caption`));
  }
  assert.ok(html.includes('Fixture main blade &lt;Control&gt;'), 'equipment values remain HTML-escaped');

  // An empty photo region is also content-driven, rather than hard-coded in the
  // template. Rebuild only this isolated copy, never the user's actual data.
  for (const key of ['running', 'tableTennis', 'swimming', 'football']) sports[key].photos = [];
  sports.tableTennis.photoSlots = [{ label: 'Fixture playing photo slot' }, { label: 'Fixture equipment photo slot' }];
  await writeFile(filename, stringifyYaml(sports));
  const secondBuild = await build(fixture);
  assert.equal(secondBuild.code, 0, secondBuild.output);
  const emptyHtml = await readFile(path.join(fixture, '_site/life/sports/index.html'), 'utf8');
  const reserve = elements(emptyHtml).find((element) => hasClass(element, 'sports-photo-reserve'));
  assert.ok(reserve);
  assert.deepEqual(descendants(reserve.node, 'span').map(text), ['Fixture playing photo slot', 'Fixture equipment photo slot']);
  assert.deepEqual(descendants(reserve.node, 'small').map(text), ['Future image', 'Future image']);
  assert.equal(descendants(reserve.node, 'img').length, 0);
});
