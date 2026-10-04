import test from 'node:test';
import assert from 'node:assert/strict';
import MarkdownIt from 'markdown-it';
import mathDelimiters from '../scripts/markdown-math.mjs';

const md = new MarkdownIt().use(mathDelimiters);
test('inline LaTeX survives Markdown escapes and emphasis', () => {
  const result = md.render(String.raw`Let \(u_t + \nabla \cdot F(u)=0\) hold.`);
  assert.match(result, /\\\(u_t/);
  assert.match(result, /\\nabla/);
  assert.doesNotMatch(result, /<em>/);
});
test('multiline display mathematics keeps alignment and its following paragraph', () => {
  const result = md.render(String.raw`\[
\begin{aligned}
a_1 & = b_1 \\
a_2 & = b_2
\end{aligned}
\]

The next paragraph.`);
  assert.match(result, /class="math-display"/);
  assert.match(result, /a_1 &amp; = b_1/);
  assert.match(result, /<p>The next paragraph\.<\/p>/);
});
test('unclosed mathematics and code blocks remain ordinary Markdown', () => {
  assert.doesNotMatch(md.render(String.raw`Unclosed \(x`), /class="math-display"/);
  assert.match(md.render('```tex\n\\[a_1\\]\n```'), /<code class="language-tex">/);
});
