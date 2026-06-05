# 项目规则

## Astro 模板表达式

**禁止在 Astro 模板的 `{}` 表达式中直接使用比较运算符**（`<`、`<=`、`>`、`>=`）。

Astro 编译器会将 `<=` 中的 `<` 误解析为 JSX Fragment 标签，Prettier 格式化也可能将 `{` 拆到独占一行加剧此问题。

错误写法：

```astro
{items.length <= 1 ? <p>空</p> : <List items={items} />}
```

正确写法 — 在 frontmatter 中提取为变量：

```astro
---
const hasItems = items.length > 1;
---

{!hasItems ? <p>空</p> : <List items={items} />}
```

## 格式化

- 缩进：tab，1 tab = 4 空格
- 尾逗号：无
- 引号：单引号
- 运行 `npm run format` 格式化，`npm run format:check` 检查

## 代码规范

- 所有代码必须有详细中文注释
- 每个函数/方法必须有完整说明（功能、参数、返回值）
- 环境变量通过 `import.meta.env` 读取（Astro/Vite），非 Astro 上下文回退 `process.env`
