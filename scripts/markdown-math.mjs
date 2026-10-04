// Preserve LaTeX before Markdown consumes backslashes or treats underscores as emphasis.
// MathJax renders these delimiters only on pages whose front matter sets math: true.
export default function mathDelimiters(md) {
  md.inline.ruler.before("escape", "latex", (state, silent) => {
    const start = state.pos;
    if (state.src.slice(start, start + 2) !== "\\(" && state.src.slice(start, start + 2) !== "\\[") return false;
    const closing = state.src[start + 1] === "(" ? "\\)" : "\\]";
    const end = state.src.indexOf(closing, start + 2);
    if (end < 0) return false;
    if (!silent) {
      const token = state.push("latex", "", 0);
      token.content = state.src.slice(start, end + 2);
    }
    state.pos = end + 2;
    return true;
  });
  md.renderer.rules.latex = (tokens, index) => md.utils.escapeHtml(tokens[index].content);
  md.block.ruler.before("code", "latex_block", (state, startLine, endLine, silent) => {
    const start = state.bMarks[startLine] + state.tShift[startLine];
    if (state.src.slice(start, start + 2) !== "\\[") return false;
    const end = state.src.indexOf("\\]", start + 2);
    if (end < 0) return false;
    let nextLine = startLine;
    while (nextLine < endLine && state.bMarks[nextLine] <= end) nextLine++;
    if (!silent) {
      const token = state.push("latex_block", "div", 0);
      token.content = state.src.slice(start, end + 2);
      token.map = [startLine, nextLine];
    }
    state.line = nextLine;
    return true;
  });
  md.renderer.rules.latex_block = (tokens, index) => `<div class="math-display">${md.utils.escapeHtml(tokens[index].content)}</div>\n`;
}
