---
name: wd
description: "在 TDD 之前产出**当前任务**的功能级详细设计文档（接口契约、实现摘要、边界/错误分析、测试清单和现有行为分析）"
---

# Worker — 阶段 A：Feature Design

为**当前任务**产出功能级详细设计文档。完成后由 harness 自动推进。

> **对 `category: "bugfix"` 任务**：精简模式，重点关注 (1) 根因文档，(2) 定向修复方案，(3) 回归测试清单。

## 获取当前任务

```bash
{{TASK_GET}}
```

输出 JSON，解析 `task.id` / `task.title` / `task.description` / 其他业务字段。loop 引擎已挑好当前任务，不要再自行锁定 / 改写 iter-tasks.json 的 current 字段。

## 你的任务

1. 读取执行规则：`reference/feature-design-execution.md`
2. 读取模板：`reference/feature-design-template.md`
3. 单次全量 Read 上下游：
   - SRS：`{{HARNESS_MEMORY_DIR}}/plans/srs.md`
   - 整体设计：`{{HARNESS_MEMORY_DIR}}/plans/design.md`
   - 项目上下文：`{{HARNESS_MEMORY_DIR}}/plans/project-context.md`（init 产出 — tech_stack 解析后权威源；沉淀进 feature.md §11.7 时优先于 design.md §11.7）
4. 读取代码库约定（如存在）：`{{HARNESS_MEMORY_DIR}}/notes/rules/*.md`

## 关键约束

- **SRS / Design 各单次全量 Read**：禁止 offset/limit 片段读、禁止 Grep 子串切片
- 输出路径：`{{HARNESS_MEMORY_DIR}}/notes/feature-<id>-design.md`（`<id>` 取自 `{{TASK_GET}}` 的 `task.id`）
- **feature.md 必含两沉淀章节**（作为 TDD R/G/R 唯一执行权威源）：
  - `## 全局约束摘录` — §11.1 子集（仅本特性涉及领域）+ §11.5 全表 + §11.6 全段
  - `## 静态分析与质量工具命令` — §11.4 静态分析命令 + §11.7 覆盖率/变异阈值
  - 两章节末尾各带溯源行 `> 摘自 Design §... — commit <sha>，date YYYY-MM-DD`
- 测试清单负向测试比例 >= 40%
- 测试清单类别应根据 SRS 验收标准覆盖 FUNC、BNDRY、SEC
- §11 合规：命名遵循 §11.5，操作使用 §11.1 库，错误处理遵循 §11.6
- **最大化复用**：设计前探索代码库 —— 理解与需求相关的现有行为，优先复用现有逻辑而非编写新代码
- **实现摘要**：精炼描述改哪些类、如何改，Red/Green/Refactor 严格遵从
- 设计输出中不包含 TDD 任务分解 —— TDD 执行由下游 red / green / refactor 节点处理
- 不要开始 TDD

## 关键规则

- **本节点只产出设计文档，不做 TDD**
- **SRS/Design 模糊不得假设** —— 上报 BLOCKED 或写入「澄清附录」让用户介入
- **遇错系统化调试** —— 读 `{{REFERENCE}}/systematic-debugging.md`；追根因不猜

## 红旗信号

| 逃避 | 正确动作 |
|---|---|
| "顺便把 TDD 也做了" | 本节点只出设计文档。TDD 由下游节点处理。 |
| "SRS 模糊但我就假设……" | 上报 BLOCKED 或写入「澄清附录」让用户介入 |
| "这个特性简单，跳过 Feature Design 直接 TDD" | 不可绕过。每特性都要。 |

