---
layout: layouts/page.njk
title: Why allow a numerical solution to be discontinuous?
date: '2026-01-18'
category: Mathematics
description: A visual introduction to the design idea behind discontinuous Galerkin methods, beginning with conservation on one cell.
math: true
draft: true
permalink: false
---

<!-- 从旧站示例卡片迁移。正文尚未完成，日期沿用旧站示例，不代表已经发表。 -->

A visual introduction to the design idea behind discontinuous Galerkin methods, beginning with conservation on one cell.

\[
  \int_K u_t\,v\,dx -
  \int_K F(u)\cdot\nabla v\,dx +
  \int_{\partial K}\widehat F\cdot n\,v\,ds = 0.
\]
