# 个人主页内容维护指南

这个指南只适用于 `ziyiwang03.github.io`。更新内容时使用 Markdown 和 YAML，模板负责生成 HTML。

## 一次更新的步骤

1. 编辑对应 `.md` 或 `.yml` 文件，必要时把照片或 PDF 放入 `src/assets/`。
2. 运行 `pnpm dev`，浏览本地页面。
3. 运行 `pnpm verify`，确认构建和链接检查通过。
4. 用 Git 提交并推送源码，GitHub Actions 自动构建和部署。

`_site/` 是生成结果，手动编辑后会在下一次构建时消失。

## YAML 基础

- 用空格缩进，不用 Tab；同层保持相同缩进。
- 日期建议加单引号：`'2026-10-04'` 或 `'2026-10'`。
- 路径从网站根目录开始：`/assets/notes/example.pdf`，对应本地文件 `src/assets/notes/example.pdf`。
- 空数组写 `[]`；没有内容的可选字段可以省略。
- 长段落用 `>-`，后面的文字缩进两个空格。

## 个人资料与导航

`src/_data/profile.yml` 保存姓名、介绍、邮箱、头像和 CV。`links` 使用 `key` 引用同文件字段，更新邮箱或 CV 时只改一处。

```yaml
email: your-address@example.com
cv: /assets/cv/ziyi-wang-cv.pdf
links:
  - label: Curriculum Vitae
    key: cv
    kind: download
  - label: Email
    key: email
```

上传同名 CV 即可更新下载内容。导航项在 `navigation.yml`，Life 子栏目在 `life.yml`。

## 教育与经历

分别编辑 `education.yml` 和 `experience.yml`。按 `start` 自动倒序排列。

```yaml
- start: '2027-01'
  end: '2027-12'
  title: Visiting Student
  institution: Inria Paris
  location: Paris, France
  host: Zhaonan Dong
  status: upcoming
```

`end: Present` 表示进行中。`status: upcoming` 用于尚未开始的安排；开始后应删除这个字段。日期、职位和身份以本人确认的信息为准。

## 添加新闻

编辑 `news.yml`，每条新闻包含日期、文字、分类、分组。日期自动倒序排列；`current` 与 `past` 分组由你维护。

```yaml
- date: '2026-10'
  text: Your confirmed update goes here.
  category: Academic
  group: current
```

不要把演示文字发布为真实新闻。可以把旧新闻的 `group` 改为 `past`；All 显示全部。

## 添加论文

目前 `publications.yml` 是空数组，页面显示真实空状态。添加首篇论文时，将 `[]` 替换成列表：

```yaml
- title: Your actual paper title
  authors:
    - Ziyi Wang
    - Coauthor Name
  year: 2026
  type: preprint
  venue: arXiv
  status: Preprint
  links:
    - label: PDF
      url: /assets/papers/your-paper.pdf
    - label: DOI
      url: https://doi.org/your-actual-doi
    - label: Code
      url: https://github.com/your-account/your-repository
```

类型为 `preprint`、`journal`、`conference` 或 `thesis`。姓名与 `profile.name` 一致时自动加粗。按年份倒序；筛选和数量自动更新。没有 PDF、DOI、Code 或 BibTeX 时省略对应链接，不填 `#`。

## 添加课程笔记

把 PDF 放到 `src/assets/notes/`，然后添加 `notes.yml` 条目：

```yaml
- title: Your course title
  category: graduate
  pages: 42
  url: /assets/notes/your-course.pdf
  note: Optional description
```

`category` 为 `graduate`、`undergraduate` 或 `frontiers`。文件大小由构建读取，无需填写；页数由你维护。失效文件路径会导致检查失败。

## 写博客

推荐先在 `src/content/drafts/` 新建 `.md`：

```markdown
---
layout: layouts/post.njk
title: 你的文章标题
description: 一两句话介绍文章内容。
date: '2026-10-04'
category: mathematics
tags: [posts]
navKey: blog
math: true
draft: true
permalink: false
---

正文直接使用 Markdown。

## 第一节

行内数学：\(u_t + \nabla \cdot F(u) = 0\)。

\[
  \int_K u_t v\,dx = 0.
\]

![图片说明](/assets/blog/your-image.webp)
```

文章准备好后，删除 `draft: true`，将 `permalink: false` 改为 `permalink: /blog/your-article-name/`。文件可以移到 `src/content/blog/`，文件夹名称不决定网址。`tags: [posts]` 让文章进入博客索引和 RSS。

分类为 `mathematics`、`life` 或 `notes`。无公式时省略 `math: true`，页面就不会加载 MathJax。目前使用 `\(...\)`、`\[...\]` 定界符；`$...$` 不作为数学定界符。

草稿不会出现在网页、站点地图或 RSS，但 Git 仓库中的草稿源码仍然可见。不要把私密内容提交到公开仓库。

## 教学与研讨班

编辑 `src/content/pages/teaching.md` 可改介绍。新课程可以是普通 Markdown，使用 `layout: layouts/page.njk`、`tags: [courses]`、`navKey: teaching`、`term`、`role` 和实际 `permalink`，会自动进入教学清单。

真实课程推荐使用 `layout: layouts/course.njk`。这个专用布局支持以下字段，正文就是 Overview，不需要自己写 HTML：

```yaml
layout: layouts/course.njk
title: 经过确认的课程名称
description: 课程简介。
tags: [courses]
navKey: teaching
code: 课程代码
term: 经过确认的学期
role: 经过确认的职责
format: Notes + problem sessions
status: Current
announcements:
  - date: '2026-10-04'
    title: 公告标题
    text: 公告正文，可用 Markdown。
schedule:
  - week: '01'
    topic: 本周实际主题
    links:
      - label: Notes
        url: /assets/notes/finite-element-method.pdf
resources:
  - label: Syllabus
    url: /assets/courses/your-syllabus.pdf
officeHours: 经确认的时间与地点，可用 Markdown。
draft: true
permalink: false
```

上面的值只作填写格式示范，不是新增教学经历。将 PDF 换成实际文件；准备发布后删除 `draft: true` 并设置真实课程网址。没有资料 URL 时省略对应链接，不填写 `#`。课程侧栏目录、公告、周计划、资源和返回链接自动生成。

`/teaching/course-template/` 是独立的布局示范页，明确标注并非教学经历，不进入真实课程清单或站点地图。旧 `#course-numerical-pde` 指向此模板，不再降级到 Teaching 首页。原始未确认课程草稿仍保持未发布。

研讨班使用 `tags: [seminars]`、`navKey: studies`，会自动进入 Studies；加 `kind: organized` 或 `kind: attended` 分别进入组织／参加栏目。未填写类型的条目显示在 Other seminars。没有真实研讨班时保留分类与真实空状态。

## 电影、照片、咖啡与运动

- `movies.yml`：稳定 `key`、标题、中英文名、年份、导演、海报。数组顺序决定 01、02… 排名。`review` 留空时保留原版待填写提示；有内容时显示 Markdown 短评。海报支持键盘／鼠标放大预览，关闭后焦点回到原海报。
- `photos.yml`：图片路径、`alt` 和 `shape`。相邻照片使用相同 `group` 时并排；单张使用 `wide`。
- `coffee.yml`：图片路径、`alt`、说明；长文字在 `src/content/life/coffee.md`。
- `sports.yml`：跑步成绩、游泳记录、球拍器材。保留原版四个纵向区块，桌面左介绍／右记录，手机上下排列。主拍／备用拍与六个器材字段始终保留，未填写的型号显示 To be added；马拉松未填写成绩时显示破折号与目标说明。足球的 `description` 支持 Markdown，教授链接直接放在正文中，不再重复单独的 `host` 字段。
- 各运动的 `photos` 可以填写 `src`、`alt`、`caption`，空数组不生成图片。乒乓球的 `photoSlots` 保留原版两张 Future image 预留框；添加真实 `photos` 后自动取代预留框。删除 `photoSlots` 或设为 `[]` 可隐藏预留区。
- 摄影器材在 `src/content/life/photography.md` 顶部的 `kit` 中填写 `format` 和 `camera`，正文仍写 Markdown；模板自动生成原版标签／器材名列表，不需要编辑 HTML。
- 生活页面的自由介绍都在 `src/content/life/` 的对应 `.md`。

照片、电影海报默认延迟加载，构建会自动写出图片实际宽高，减少版面跳动。新增图片须写准确的 `alt`，不使用第三方图床。

## 暑校日程与每日总结

`schools.yml` 每项包含日期、地点、主办方、图片、官方通知和 `sessions`。日程正文在 `src/content/schools/afepack-2026.md`。

日程已有 `summaries` 的日期项。直接填写 `text`：

```yaml
summaries:
  - date: '2026-07-21'
    text: >-
      A short summary of the actual lecture, with references or questions.
```

Daily summaries 始终保留已有的八天日期入口，显示已填写／总日期数；空记录明确显示 Summary not added yet，不假装已有总结。填入 `text` 后自动显示 Markdown 正文。若总结含公式，给暑校 Markdown 的 front matter 加 `math: true`。

`sections` 控制 Programme 的分组标题、说明和所属 `tracks`；真实日程仍在 `sessions`，不用复制同一条讲座到不同地方。

新增暑校时给 YAML 项一个唯一 `key`，新建 Markdown 使用 `layout: layouts/school.njk`、同名 `schoolKey`、独立 `permalink`、`navKey: studies`。

## 博客精选、长影评与旅行文章

博客文章加 `featured: true` 后，最新两篇精选会显示在 Writing 顶部；可选 `previewMath` 写完整的 `\(...\)` 或 `\[...\]` Markdown 数学段，作为卡片预览。正文仍写在 Markdown，不需要复制全文。

长影评新建 Markdown，使用以下 front matter；准备发布后填写实际正文并解除草稿状态：

```yaml
layout: layouts/film-review.njk
title: 你的真实影评标题
description: 简短介绍。
date: '2026-10-04'
tags: [filmReviews]
movieKey: yi-yi
navKey: life
spoilers: true
draft: true
permalink: false
```

单部电影影评的 `movieKey` 必须对应 `movies.yml` 的 `key`。电影名称、年份、导演、海报自动读取，电影列表自动关联已发布影评；多影片综述可省略 `movieKey`，仍进入 Movies 底部的 Film essays 索引。`spoilers: true` 会把正文实际折叠在剧透提醒后。剧照、参考文献、链接都可以直接写 Markdown。未发布草稿不会关联。

旅行地点写在 `src/_data/travel.yml` 的 `places` 数组中，仅记录本人确认去过的地点：

```yaml
places:
  - key: your-place-key
    name: 实际地点名
    country: 实际国家或地区
    latitude: 0
    longitude: 0
    description: 实际旅行记录，可用 Markdown。
```

上面的 `0` 只是数值格式示范，必须替换成实际纬度和经度。`key` 使用唯一的英文小写短横线名称。纬度范围 -90～90，经度 -180～180；不合法坐标会使构建失败。页面的地图区是本地 SVG 经纬坐标概览，标记链接到对应地点说明，不调用第三方地图，也不是街道导航地图。

旅行文章使用 `layout: layouts/travel-entry.njk`、`tags: [travelEntries]`、`navKey: life`、`lifeKey: travel`，填 `title`、`description`、`date`、实际 `permalink`；`kind` 为 `guide`、`journal` 或 `photo-essay`。可选 `placeKey` 关联地点，地点列表会自动出现文章链接，文章也能返回地点说明。草稿仍使用 `draft: true` 和 `permalink: false`。

已发布博客、长影评、旅行文章统一进入 Writing 归档与 RSS；影评／旅行默认 Life 分类。没有真实地点或文章时显示空状态，不添加示范城市、假路线或假旅行记录。

## 筛选和阅读交互

新闻、笔记、论文、Writing、旅行分类在当前浏览器标签页内记住选择；跳到其他栏目再回来不会重置。关闭标签页后恢复默认值。浏览器禁用存储时仍可筛选，禁用 JavaScript 时显示全部内容和正常链接。

新闻列表保留独立滚动区域；换分类时从列表顶部开始。图片预览可用 Escape 或关闭按钮退出，并恢复原触发链接的键盘焦点；禁用 JavaScript 时海报链接直接打开本地原图。

## 页面与样式

所有页面共用 `layouts/base.njk`、页头与页脚。CSS 分为 `tokens`（颜色和尺寸）、`base`（基础和正文）、`layout`（导航及页面框架）、`components`（通用组件）、`pages`（栏目排版）。需要改变网页外观时编辑对应文件，避免在末尾不断追加覆盖规则。

新页面使用 `layout: layouts/page.njk`，填写 `title`、`description`、`permalink` 和 `navKey`。正文不要重复写一级标题，模板会生成唯一的 H1。

## 检查与部署

`pnpm verify` 检查数学 Markdown、构建、所有本地链接、图片/PDF、锚点、重复 ID、每页标题描述、canonical、Open Graph、站点地图和草稿设置。它不会联网检查讲者等第三方网站。

GitHub Pages 首次需将 Source 切换为 GitHub Actions，详见 README。此重构不需要改变域名或网址，旧 hash 书签在启用 JavaScript 时自动跳转。
