# 项目规则

## 三层架构规范

项目采用严格的三层架构，各层各司其职，**禁止跨层调用**。

```
Actions/API（薄适配） → Services（业务编排） → Lib（原子能力/DB）
```

### Actions 层（`src/actions/`）

- **职责**：鉴权 + zod 校验 + 委托 service
- **禁止**：直接调用 `prisma`、跨层调用 `@/lib/*`（`@/lib/auth`、`@/lib/errors` 除外）
- **禁止**：包含业务逻辑（校验规则、数据转换、副作用触发）

### API 层（`src/pages/api/`）

- **职责**：鉴权 + 格式转换 + 委托 service
- **禁止**：直接调用 `prisma`、跨层调用 `@/lib/*`（`@/lib/agent`、`@/lib/utils`、`@/lib/errors`、`@/lib/auth` 除外）
- **禁止**：包含业务逻辑

### Service 层（`src/services/`）

- **职责**：业务编排，协调 lib 原子能力
- **允许**：调用任意 `@/lib/*` 函数、调用其他 Service 函数
- **禁止**：直接调用 `prisma`（必须通过 lib 层）、依赖 Astro 上下文

### Lib 层（`src/lib/`）

- **职责**：原子能力，数据库 CRUD、纯工具函数
- **允许**：直接调用 `prisma`、封装数据库事务
- **禁止**：调用 Service 层函数（反向依赖）、包含业务逻辑

### 核心规则

1. **单向依赖**：上层只能调用下层，禁止反向
2. **禁止跨层**：Actions/API 不能直接调用 Lib（auth/errors/agent/utils 除外）
3. **Service 是唯一业务入口**：所有业务操作必须通过 Service 层
4. **Lib 是唯一数据入口**：所有数据库操作必须通过 Lib 层

详细规范见 `docs/milestones/service-layer-evolution.md`

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
