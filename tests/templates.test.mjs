import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parse, stringify } from 'yaml';
import { parse as parseHtml } from 'parse5';

const project = fileURLToPath(new URL('..', import.meta.url));

async function fixtureProject(t) {
  const fixture = await mkdtemp(path.join(os.tmpdir(), 'ziyi-home-template-test-'));
  // This is the exact directory created above, never the repository or tmp root.
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

async function readData(fixture, name) {
  return parse(await readFile(path.join(fixture, 'src', '_data', `${name}.yml`), 'utf8'));
}

async function writeData(fixture, name, value) {
  await writeFile(path.join(fixture, 'src', '_data', `${name}.yml`), stringify(value));
}

async function writeMarkdown(fixture, relative, data, body = '') {
  const filename = path.join(fixture, 'src', 'content', relative);
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, `---\n${stringify(data)}---\n\n${body}\n`);
}

function runNode(fixture, script) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      cwd: fixture,
      env: { ...process.env, ELEVENTY_ENV: 'test' },
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60000,
    });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal, output }));
  });
}

function build(fixture) {
  return runNode(fixture, path.join(fixture, 'node_modules', '@11ty', 'eleventy', 'cmd.cjs'));
}

async function output(fixture, relative) {
  return readFile(path.join(fixture, '_site', relative), 'utf8');
}

function sectionText(html, headingId) {
  let section;
  function find(node) {
    if (node.tagName === 'section' && node.attrs.some((attr) => attr.name === 'aria-labelledby' && attr.value === headingId)) section = node;
    for (const child of node.childNodes || []) find(child);
  }
  function text(node) { return node.nodeName === '#text' ? node.value : (node.childNodes || []).map(text).join(' '); }
  find(parseHtml(html));
  assert.ok(section, `expected section labelled by ${headingId}`);
  return text(section).replace(/\s+/g, ' ').trim();
}

test('new real content reaches its pages, collections, feed, and sitemap', { timeout: 60000 }, async (t) => {
  const fixture = await fixtureProject(t);
  // Synthetic content exists only inside this isolated fixture, never actual src.
  await writeData(fixture, 'publications', [
    {
      title: 'Fixture <Journal> & Boundaries',
      authors: ['Ziyi Wang', 'Fixture <Coauthor> & Guest'],
      year: 2025,
      type: 'journal',
      venue: 'Fixture Journal & Methods',
      links: [{ label: 'PDF', url: '/assets/notes/finite-element-method.pdf' }],
    },
    {
      title: 'Fixture Preprint',
      authors: ['Ziyi Wang'],
      year: 2026,
      type: 'preprint',
      venue: 'Fixture repository',
      status: 'Preprint',
      links: [{ label: 'Source', url: 'https://example.org/fixture-preprint' }],
    },
  ]);
  await writeMarkdown(fixture, 'blog/fixture-published.md', {
    layout: 'layouts/post.njk',
    title: 'Fixture <Graph> & Grid',
    description: 'A test of conservation & escaped metadata.',
    date: '2026-10-03',
    tags: ['posts'],
    category: 'mathematics',
    math: true,
    featured: true,
    previewMath: String.raw`\(u_t + \nabla \cdot F(u)=0\)`,
    navKey: 'blog',
    permalink: '/blog/fixture-published/',
  }, String.raw`A conservation law uses \(u_t + \nabla \cdot F(u)=0\).

\[
\begin{aligned}
a_1 & = b_1 \\
a_2 & = b_2
\end{aligned}
\]

The paragraph after the formula survives.`);
  await writeMarkdown(fixture, 'drafts/fixture-tagged-draft.md', {
    layout: 'layouts/post.njk',
    title: 'Fixture secret draft',
    description: 'This must never reach public output.',
    date: '2026-10-04',
    tags: ['posts'],
    category: 'notes',
    draft: true,
    permalink: false,
  }, 'Fixture confidential draft body.');
  await writeMarkdown(fixture, 'pages/fixture-svg.md', {
    layout: 'layouts/page.njk', title: 'Fixture accessible diagram',
    description: 'A synthetic SVG title must not count as the HTML document title.',
    permalink: '/fixture-svg/',
  }, '<svg viewBox="0 0 100 40" role="img" aria-labelledby="fixture-svg-label"><title id="fixture-svg-label">Fixture SVG label</title><rect width="100" height="40"/></svg>');
  await writeMarkdown(fixture, 'courses/fixture-course.md', {
    layout: 'layouts/course.njk',
    title: 'Fixture Course <PDE>',
    description: 'A synthetic course used only by this test.',
    date: '2026-09-01',
    tags: ['courses'],
    term: 'Fixture Term',
    role: 'Teaching Assistant',
    code: 'FIXTURE · PDE',
    format: 'Notes + problem sessions',
    announcements: [{ date: '2026-09-25', title: 'Fixture schedule update', text: 'Bring **cell conservation** notes.' }],
    schedule: [{ week: '01', topic: 'Fixture weak formulations', links: [{ label: 'Fixture weekly notes', url: '/assets/notes/finite-element-method.pdf' }] }],
    resources: [{ label: 'Fixture syllabus', url: '/assets/cv/ziyi-wang-cv.pdf', kind: 'PDF' }],
    officeHours: 'Fixture office hours: Tuesday, **14:00–15:00**.',
    navKey: 'teaching',
    permalink: '/teaching/fixture-course/',
  }, 'Fixture course resources.');
  await writeMarkdown(fixture, 'seminars/fixture-seminar.md', {
    layout: 'layouts/page.njk',
    title: 'Fixture Seminar & Analysis',
    description: 'A synthetic seminar used only by this test.',
    date: '2026-09-02',
    tags: ['seminars'],
    navKey: 'studies',
    permalink: '/studies/fixture-seminar/',
  }, 'Fixture seminar reading list.');
  for (const kind of ['organized', 'attended']) {
    await writeMarkdown(fixture, `seminars/fixture-${kind}.md`, {
      layout: 'layouts/page.njk', title: `Fixture ${kind} seminar`,
      description: `A synthetic ${kind} seminar used only by this test.`,
      date: '2026-09-03', tags: ['seminars'], kind, navKey: 'studies',
      permalink: `/studies/fixture-${kind}/`,
    }, `Fixture ${kind} reading list.`);
  }
  const movies = await readData(fixture, 'movies');
  assert.ok(movies[0].key, 'movies have stable keys for related long reviews');
  await writeMarkdown(fixture, 'film-reviews/fixture-review.md', {
    layout: 'layouts/film-review.njk',
    title: 'Fixture film essay <Light>',
    description: 'A synthetic long review & spoiler disclosure.',
    date: '2026-10-02',
    tags: ['filmReviews'],
    movieKey: movies[0].key,
    spoilers: true,
    navKey: 'life',
    lifeKey: 'movies',
    permalink: '/life/movies/fixture-review/',
  }, 'Fixture spoiler body with **a memorable frame**.');
  await writeMarkdown(fixture, 'film-reviews/fixture-standalone.md', {
    layout: 'layouts/film-review.njk', title: 'Fixture standalone film essay',
    description: 'A synthetic film essay without a single associated movie.',
    date: '2026-09-30', tags: ['filmReviews'], navKey: 'life', lifeKey: 'movies',
    permalink: '/life/movies/fixture-standalone/',
  }, 'Fixture broader cinema essay body.');
  await writeMarkdown(fixture, 'drafts/fixture-film-draft.md', {
    layout: 'layouts/film-review.njk',
    title: 'Fixture secret film draft',
    movieKey: movies[0].key,
    tags: ['filmReviews'],
    draft: true,
    permalink: false,
  }, 'Fixture secret film body.');
  await writeData(fixture, 'travel', { places: [{
    key: 'fixture-place', name: 'Fixture City <River>', country: 'Fixture Country',
    latitude: 31.2, longitude: 121.5, description: 'Synthetic coordinates used only in this isolated test.',
  }] });
  await writeMarkdown(fixture, 'travel/fixture-journal.md', {
    layout: 'layouts/travel-entry.njk',
    title: 'Fixture travel journal <Paths>',
    description: 'A synthetic journey & coordinates.',
    date: '2026-10-01',
    tags: ['travelEntries'],
    placeKey: 'fixture-place',
    kind: 'journal',
    navKey: 'life',
    lifeKey: 'travel',
    permalink: '/life/travel/fixture-journal/',
  }, 'Fixture travel body and route notes.');
  await writeMarkdown(fixture, 'drafts/fixture-travel-draft.md', {
    layout: 'layouts/travel-entry.njk',
    title: 'Fixture secret travel draft',
    tags: ['travelEntries'],
    placeKey: 'fixture-place',
    draft: true,
    permalink: false,
  }, 'Fixture secret travel body.');
  const schools = await readData(fixture, 'schools');
  const foundations = schools[0].sessions.find((session) => session.track === 'Foundations');
  foundations.summaries[0].text = 'Fixture summary with **cell conservation** and [the published fixture](/blog/fixture-published/).';
  schools[0].sessions.push({
    start: '2026-08-06', times: [], track: 'Fixture Unknown Track',
    title: 'Fixture uncategorized workshop session',
  });
  await writeData(fixture, 'schools', schools);

  const measuredUrl = '/assets/notes/fixture-measured-note.pdf';
  const measuredBytes = 2560 * 1024;
  await writeFile(path.join(fixture, 'src', measuredUrl), Buffer.alloc(measuredBytes));
  const notes = await readData(fixture, 'notes');
  notes.push({ title: 'Fixture measured note', category: 'graduate', pages: 1, size: '0 KB', url: measuredUrl });
  await writeData(fixture, 'notes', notes);

  const result = await build(fixture);
  assert.equal(result.code, 0, result.output);
  const [publications, blog, post, teaching, studies, school, feed, sitemap, moviePage, filmReview, travelPage, travelEntry, course] = await Promise.all([
    output(fixture, 'publications/index.html'),
    output(fixture, 'blog/index.html'),
    output(fixture, 'blog/fixture-published/index.html'),
    output(fixture, 'teaching/index.html'),
    output(fixture, 'studies/index.html'),
    output(fixture, 'schools/afepack-2026/index.html'),
    output(fixture, 'feed.xml'),
    output(fixture, 'sitemap.xml'),
    output(fixture, 'life/movies/index.html'),
    output(fixture, 'life/movies/fixture-review/index.html'),
    output(fixture, 'life/travel/index.html'),
    output(fixture, 'life/travel/fixture-journal/index.html'),
    output(fixture, 'teaching/fixture-course/index.html'),
  ]);

  assert.match(publications, /data-category="journal"/);
  assert.match(publications, /data-category="preprint"/);
  assert.match(publications, /Fixture &lt;Journal&gt; &amp; Boundaries/);
  assert.match(publications, /Fixture &lt;Coauthor&gt; &amp; Guest/);
  assert.match(publications, /<strong>Ziyi Wang<\/strong>/);
  assert.match(publications, /href="\/assets\/notes\/finite-element-method\.pdf"/);
  assert.match(publications, /href="https:\/\/example\.org\/fixture-preprint"/);
  assert.ok(publications.indexOf('Fixture Preprint') < publications.indexOf('Fixture &lt;Journal&gt;'), 'Newest publication appears first');
  assert.doesNotMatch(publications, /href="#"/);

  assert.match(blog, /href="\/blog\/fixture-published\/"/);
  assert.match(blog, /datetime="2026-10-03"/);
  assert.match(blog, /3 Oct 2026/);
  assert.match(blog, /class="blog-feature"/);
  assert.match(blog, /class="mini-equation"/);
  assert.match(blog, /src="\/assets\/mathjax-tex-svg\.js"/);
  assert.match(post, /Fixture &lt;Graph&gt; &amp; Grid/);
  assert.match(post, /datetime="2026-10-03"/);
  assert.match(post, /class="math-display"/);
  assert.match(post, /\\\(u_t \+ \\nabla/);
  assert.match(post, /a_1 &amp; = b_1/);
  assert.match(post, /The paragraph after the formula survives\./);
  assert.match(post, /src="\/assets\/mathjax-tex-svg\.js"/);
  assert.match(feed, /<title>Fixture &lt;Graph&gt; &amp; Grid<\/title>/);
  assert.match(feed, /<updated>2026-10-03T00:00:00\.000Z<\/updated>/);
  assert.match(feed, /https:\/\/ziyiwang03\.github\.io\/blog\/fixture-published\//);
  assert.match(sitemap, /https:\/\/ziyiwang03\.github\.io\/blog\/fixture-published\//);

  assert.match(teaching, /href="\/teaching\/fixture-course\/"/);
  assert.match(teaching, /Fixture Course &lt;PDE&gt;/);
  assert.match(teaching, /Fixture Term/);
  assert.match(teaching, /Teaching Assistant/);
  assert.match(studies, /href="\/studies\/fixture-seminar\/"/);
  assert.match(studies, /Fixture Seminar &amp; Analysis/);
  const seminarKinds = {
    organized: 'Fixture organized seminar',
    attended: 'Fixture attended seminar',
    other: 'Fixture Seminar & Analysis',
  };
  for (const [kind, title] of Object.entries(seminarKinds)) {
    const group = sectionText(studies, `seminar-${kind}-title`);
    assert.ok(group.includes(title), `${kind} category preserves its seminar`);
    for (const other of Object.values(seminarKinds).filter((value) => value !== title)) assert.ok(!group.includes(other), `${kind} does not contain another category's item`);
  }
  assert.match(course, /Fixture course resources\./);
  for (const id of ['course-overview', 'course-schedule', 'course-resources', 'course-office-hours']) assert.match(course, new RegExp(`id="${id}"`));
  assert.match(course, /FIXTURE · PDE/);
  assert.match(course, /Fixture schedule update/);
  assert.match(course, /Bring <strong>cell conservation<\/strong> notes/);
  assert.match(course, /Fixture weak formulations/);
  assert.match(course, /href="\/assets\/notes\/finite-element-method\.pdf"/);
  assert.match(course, /Fixture syllabus/);
  assert.match(course, /href="\/assets\/cv\/ziyi-wang-cv\.pdf"/);
  assert.match(course, /Fixture office hours/);
  assert.match(course, /href="\/teaching\/"/);
  assert.match(await output(fixture, 'studies/fixture-seminar/index.html'), /Fixture seminar reading list\./);
  assert.match(sitemap, /https:\/\/ziyiwang03\.github\.io\/teaching\/fixture-course\//);
  assert.match(sitemap, /https:\/\/ziyiwang03\.github\.io\/studies\/fixture-seminar\//);
  assert.match(moviePage, /href="\/life\/movies\/fixture-review\/"/);
  assert.match(moviePage, /Fixture film essay &lt;Light&gt;/);
  assert.match(moviePage, /class="film-essay-index"/);
  assert.match(moviePage, /href="\/life\/movies\/fixture-standalone\/"/);
  assert.match(moviePage, /Fixture standalone film essay/);
  const standaloneReview = await output(fixture, 'life/movies/fixture-standalone/index.html');
  assert.match(standaloneReview, /Fixture broader cinema essay body/);
  assert.match(standaloneReview, /film-review-header-no-poster/);
  assert.match(filmReview, /Fixture spoiler body/);
  assert.match(filmReview, /class="spoiler-review"/);
  assert.match(filmReview, /<details[^>]*class="spoiler-review"[^>]*>/);
  assert.doesNotMatch(filmReview, /<details[^>]*class="spoiler-review"[^>]*\bopen\b/);
  assert.match(filmReview, new RegExp(movies[0].title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(filmReview, /href="\/life\/movies\/"/);
  assert.match(filmReview, /property="og:type" content="article"/);
  assert.match(travelPage, /Fixture City &lt;River&gt;/);
  assert.match(travelPage, /id="place-fixture-place"/);
  assert.match(travelPage, /href="#place-fixture-place"/);
  assert.match(travelPage, /href="\/life\/travel\/fixture-journal\/"/);
  assert.match(travelPage, /Fixture travel journal &lt;Paths&gt;/);
  assert.match(travelEntry, /Fixture travel body and route notes/);
  assert.match(travelEntry, /href="\/life\/travel\/#place-fixture-place"/);
  assert.match(travelEntry, /property="og:type" content="article"/);
  assert.match(feed, /https:\/\/ziyiwang03\.github\.io\/life\/movies\/fixture-review\//);
  assert.match(feed, /https:\/\/ziyiwang03\.github\.io\/life\/travel\/fixture-journal\//);
  assert.match(blog, /href="\/life\/movies\/fixture-review\/"/);
  assert.match(blog, /href="\/life\/travel\/fixture-journal\/"/);
  assert.match(sitemap, /https:\/\/ziyiwang03\.github\.io\/life\/movies\/fixture-review\//);
  assert.match(sitemap, /https:\/\/ziyiwang03\.github\.io\/life\/travel\/fixture-journal\//);

  assert.match(school, /<strong>cell conservation<\/strong>/);
  assert.match(school, /href="\/blog\/fixture-published\/"/);
  assert.equal(school.split('Fixture uncategorized workshop session').length - 1, 1, 'a new unconfigured programme track is displayed exactly once');
  assert.match(school, /id="programme-other-title"/);
  assert.equal((school.match(/class="programme-row(?:\s[^"]*)?"/g) || []).length, 11, 'the original ten sessions and the new unknown track each render once');
  assert.match(studies, /href="\/assets\/notes\/fixture-measured-note\.pdf"/);
  assert.match(studies, /PDF · 2\.5 MB ↗/);
  assert.equal((await stat(path.join(fixture, '_site', measuredUrl))).size, measuredBytes);

  for (const document of [blog, feed, sitemap, teaching, studies, moviePage, travelPage]) {
    assert.doesNotMatch(document, /Fixture secret draft|Fixture confidential draft body|Fixture secret film|Fixture secret travel/);
  }
  await assert.rejects(stat(path.join(fixture, '_site', 'content/drafts/fixture-tagged-draft/index.html')), { code: 'ENOENT' });
  const checked = await runNode(fixture, path.join(fixture, 'scripts', 'check.mjs'));
  assert.equal(checked.code, 0, checked.output);
});

test('a missing downloadable note fails the build with download-source diagnostics', { timeout: 60000 }, async (t) => {
  const fixture = await fixtureProject(t);
  const notes = await readData(fixture, 'notes');
  notes.push({ title: 'Fixture missing file', category: 'graduate', pages: 1, url: '/assets/notes/fixture-missing-file.pdf' });
  await writeData(fixture, 'notes', notes);
  const result = await build(fixture);
  assert.notEqual(result.code, 0, 'Missing downloads must fail the build');
  // Eleventy may wrap the original error in a Nunjucks filter error.
  assert.match(result.output, /Missing download: \/assets\/notes\/fixture-missing-file\.pdf|Nunjucks Filter `fileSize`/);
  assert.match(result.output, /studies\/index\.html|studies\.md/);
});

test('invalid travel coordinates fail the build with place diagnostics', { timeout: 60000 }, async (t) => {
  const fixture = await fixtureProject(t);
  await writeData(fixture, 'travel', { places: [{
    key: 'fixture-invalid-place', name: 'Fixture Invalid Place',
    latitude: 91, longitude: 121.5,
  }] });
  const result = await build(fixture);
  assert.notEqual(result.code, 0, 'invalid latitude must fail the build');
  assert.match(result.output, /Invalid travel coordinates: fixture-invalid-place|Nunjucks Filter `mapPoints`/);
  assert.match(result.output, /life\/travel\/index\.html|travel\.md/);
});
