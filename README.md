# Ziyi Wang — Academic Homepage

个人学术主页，网址为 <https://ziyiwang03.github.io>。

内容使用 **Markdown + YAML** 编辑，Eleventy 自动生成独立静态页面。原来的照片、PDF 和页面视觉风格已迁移；部署后的网页不需要服务器或数据库。

## 日常更新从这里开始

| 要更新什么 | 编辑的位置 |
| --- | --- |
| 姓名、介绍、邮箱、CV 链接 | [`src/_data/profile.yml`](src/_data/profile.yml) |
| 教育、访问经历 | [`education.yml`](src/_data/education.yml)、[`experience.yml`](src/_data/experience.yml) |
| 首页新闻 | [`src/_data/news.yml`](src/_data/news.yml) |
| 论文 | [`src/_data/publications.yml`](src/_data/publications.yml) |
| 课程笔记 PDF 清单 | [`src/_data/notes.yml`](src/_data/notes.yml) |
| 页面正文 | [`src/content/pages/`](src/content/pages/) |
| 电影、摄影、咖啡、运动 | [`src/_data/`](src/_data/)、[`src/content/life/`](src/content/life/) |
| 暑校日程和每日总结 | [`schools.yml`](src/_data/schools.yml)、[`暑校正文`](src/content/schools/afepack-2026.md) |
| 草稿文章、待确认课程 | [`src/content/drafts/`](src/content/drafts/) |

详细示例见 [内容维护指南](docs/editing.md)。平时无需修改 `_includes`、CSS 或生成后的 `_site`。

## 本地预览

需要 Node.js 24（最低 22）和 pnpm。安装 Node 后可使用 `corepack enable` 启用 pnpm；若发行版未提供 Corepack，可使用 `npm install -g pnpm@11.19.0`。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

打开终端提示的本地网址。修改 Markdown、YAML 或样式后自动重建。

```sh
pnpm verify       # 数学与新增内容测试、构建、内链/资源/元数据检查
pnpm build        # 输出 _site/
pnpm preview      # 单独预览 _site/，默认 http://127.0.0.1:4173
```

可选浏览器检查覆盖桌面、390px/320px 手机、主题、菜单、过滤、公式、旧链接和禁用 JavaScript 的情况。需要另行安装 Playwright：

```sh
pnpm add -D playwright
pnpm exec playwright install chromium
pnpm build
pnpm test:browser
```

已经安装 Playwright 时也可设置 `PLAYWRIGHT_MODULE` 为其模块路径；使用现有 Chrome 可设置 `PLAYWRIGHT_CHANNEL=chrome`。截图保存到系统临时目录。

## GitHub Pages

仓库包含 [`pages.yml`](.github/workflows/pages.yml)。提交后会构建、检查，并将 `_site/` 部署到 GitHub Pages；Pull Request 只构建检查，不部署。

**首次切换需要在 GitHub 仓库 → Settings → Pages → Build and deployment → Source 选择 GitHub Actions。** 旧的“从 main 根目录部署”模式不再适用于这个源码结构。只提交源码和锁文件；不要提交 `node_modules/` 或 `_site/`。

该项目为账户主页，部署根路径是 `/`。如果以后迁移到子目录站点，需一起调整资源路径和站点配置。

## 结构

```text
src/
  _data/          # YAML 资料、列表和日程
  content/        # Markdown 正文、文章、草稿
  _includes/      # 固定布局与组件
  assets/         # 图片、PDF、CSS 和 JS
  404.md          # 404 页面
  feed.njk        # 自动文章订阅
  sitemap.njk     # 自动站点地图
scripts/          # 构建辅助与检查
tests/            # 数学 Markdown 与内容发布回归测试
docs/editing.md   # 中文维护指南
_site/            # 自动生成，Git 忽略
```

旧的 `/#research`、`/#life-photography`、`/#summer-school` 等书签会跳到对应的独立页面。真实锚点如 `#content` 保持原来的作用。

原先用于演示的论文和博客仍保存为未发布草稿。独立课程布局示范页明确标注为模板、不是教学经历，不进入真实课程列表或站点地图；原课程草稿也没有被发布。没有虚构条目或无效按钮出现在正式页面。

完整功能包括课程侧栏／公告／周计划／资源，暑校分组和每日总结入口，电影排名和可键盘操作的原图预览，长影评、旅行地点与文章模板，精选 Writing 与统一 RSS，以及跨页面保留分类选择。具体字段与使用方法见维护指南。
