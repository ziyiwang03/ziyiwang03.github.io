# Project scope

This is the **ziyiwang03.github.io** personal homepage. Do not use the unrelated `ZyeWang33.github.io` site as the source of content or design.

# Editing

- Maintain user content in `src/content/**/*.md` and `src/_data/*.yml`.
- Keep HTML structure in `src/_includes`, UI enhancements in `src/assets/js`, and CSS in the five existing layer files.
- Never edit `_site`: it is generated output.
- Do not invent academic experience, publications, teaching, dates, statistics or autobiographical text.
- Preserve source drafts with `draft: true` and `permalink: false` until the user authorizes publication. Do not replace empty collections with realistic-looking examples.
- Use actual file paths and omit unavailable links; never add `href="#"` placeholders.
- Keep profile contact details and CV URLs in one source (`profile.yml`).
- Use local assets. Preserve all existing PDFs and photographs unless the user asks to remove them.
- For mathematical Markdown use `\(...\)` and `\[...\]` with `math: true`.

# Validation and delivery

- Run `pnpm verify` after content/template/build changes.
- For layout or JS changes, also run the browser checks if Playwright is available; inspect desktop and mobile screenshots.
- Keep no-JavaScript navigation and content readable. JavaScript enhances filtering, theme and the mobile menu.
- Preserve root legacy hash bookmarks while allowing normal document fragments.
- Do not commit or push, modify remote Pages settings, or publish without user authorization.
- Report any required deployment-setting change. The workflow builds `_site` for GitHub Actions Pages hosting.
