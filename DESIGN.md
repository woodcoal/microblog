---
version: alpha
name: 睦谈
description: 轻量级多用户社区的内容优先界面规范；以克制的信息层级、可读性和跨频道一致性为核心。
colors:
    primary: '#4F46E5'
    primaryHover: '#4338CA'
    text: '#1A1A2E'
    muted: '#64748B'
    background: '#FFFFFF'
    surface: '#F8FAFC'
    border: '#E2E8F0'
    danger: '#EF4444'
    success: '#15803D'
typography:
    display:
        fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Noto Sans SC, Microsoft YaHei, sans-serif'
        fontSize: '2.75rem'
        fontWeight: 800
        lineHeight: 1.12
        letterSpacing: '-0.055em'
    h1:
        fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Noto Sans SC, Microsoft YaHei, sans-serif'
        fontSize: '1.75rem'
        fontWeight: 800
        lineHeight: 1.25
        letterSpacing: '-0.04em'
    body-md:
        fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Noto Sans SC, Microsoft YaHei, sans-serif'
        fontSize: '0.9375rem'
        fontWeight: 400
        lineHeight: 1.55
rounded:
    sm: 6px
    md: 8px
    lg: 12px
    xl: 16px
spacing:
    1: 4px
    2: 8px
    3: 12px
    4: 16px
    5: 20px
    6: 24px
    8: 32px
    10: 40px
    12: 48px
components:
    button-primary:
        backgroundColor: '{colors.primary}'
        textColor: '#FFFFFF'
        rounded: '{rounded.sm}'
        padding: '0 16px'
        height: 44px
    button-secondary:
        backgroundColor: '{colors.background}'
        textColor: '{colors.text}'
        rounded: '{rounded.sm}'
        padding: '0 16px'
        height: 44px
    input:
        backgroundColor: '{colors.background}'
        textColor: '{colors.text}'
        rounded: '{rounded.sm}'
        padding: '0 12px'
        height: 44px
    badge:
        backgroundColor: '{colors.surface}'
        textColor: '{colors.primary}'
        rounded: 9999px
        padding: '3px 8px'
---

## Overview

睦谈是一个由微博、论坛和博客共同构成的轻量社区。界面首先服务于阅读、表达和管理，不用营销卡片或无意义的装饰代替信息层级。实现以 `src/styles/tokens.css` 为唯一运行时 token 来源；本文件提供可供前端、设计与自动化工具消费的稳定规范。

## Colors

- 浅色主题使用 `background`、`surface`、`text` 和 `border`；高强调操作只使用 `primary`。
- 暗色、护眼与高对比主题必须继续使用 `tokens.css` 中同名的 `--color-*` 变量，不得在页面内重定义品牌色。
- 成功、危险和待审核状态只表达系统状态，不能作为频道的品牌色。

## Typography

- 内容壳以 `body-md` 为基准；阅读型博客正文可使用系统衬线作为局部例外。
- 页面标题使用 `h1`；首页 C 型发现页才可使用 `display`。
- 中文正文行高不得低于 1.55，内容列不可依靠缩小字体来提高密度。

## Layout

- 内容浏览页仅使用三档：mobile `<768px`、tablet `768–1023px`、desktop `≥1024px`。容器宽度为 `100%`，最大 `1500px` 并居中。
- `ChannelShell` 提供 `three-column`、`nav-main`、`main-aside` 与 `single` 四种语义变体。A 内容壳主阅读列最宽 760px；搜索与通知采用 `single`，最大 1024px。
- tablet 使用 100px 图标导航轨（每项带可访问名称与悬浮/焦点提示）；desktop 导航轨为 200px。只有实际提供辅助内容且阅读列可保持 760px 时才显示 300px 右栏。
- 桌面顶部操作区始终贴近浏览器视口右侧，头像是最后一个元素；移动端保留头像并将频道入口收至底部导航或横向导航。
- 所有可操作控件最小高度 44px（后台紧凑工具按钮可为 34px），焦点样式不可移除。

## Elevation & Depth

内容页面优先用边框和留白分组。仅浮层、账户面板和登录卡片可使用轻微阴影；后台数据表不使用玻璃、渐变或大面积投影。

## Shapes

圆角仅使用 6 / 8 / 12 / 16px 阶梯。徽标和头像使用全圆角。禁止用超大圆角作为弱层级内容的替代。

## Components

- `button-primary`：发布、保存和确认等单一高优先级操作；一个表单区域最多一个。
- `button-secondary`：筛选、导出、取消等低优先级操作。
- `input`：默认边框清晰，聚焦时使用主题主色和可见 focus ring。
- `badge`：频道、状态或数量；文本必须短且可扫描。
- 顶部账户区：搜索、主题、通知、头像按此顺序排列；头像位于最右。

## Do's and Don'ts

- 应复用 `--color-*`、间距、圆角和响应式断点。
- 应根据表面选择构图：内容浏览用 A，后台操作用 B，首页引导用 C。
- 不要为频道另设整套色彩或导航。
- 不要使用大面积渐变、玻璃拟态、虚构数据看板或等权功能卡片。
- 不要把桌面侧栏硬塞到移动端；应折叠成底部或横向导航。
