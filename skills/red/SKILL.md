---
name: red
description: "TDD Red 阶段 -- 为功能测试清单编写失败测试。"
---

# TDD Red -- 编写失败测试

为所有测试清单行编写失败测试。请自行读取所有文档。

## 获取当前任务

```bash
{{TASK_GET}}
```

输出 JSON，解析 `task.id` / `task.title` / `task.description` / 其他业务字段。loop 引擎已挑好当前任务，通过上方命令获取。无需手动管理任务状态。

## 你的任务

1. 读取执行规则：`{{SKILL_DIR}}/reference/tdd-red-execution.md`
2. 读取规则：`{{REFERENCE}}/iron-law.md`，`{{HARNESS_MEMORY_DIR}}/notes/rules/`
3. 读取反模式：`{{REFERENCE}}/testing-anti-patterns.md`

## 规格输入（唯一权威源 = feature 设计文档）

**单次 Read 整份功能设计文档**（路径：`{{HARNESS_MEMORY_DIR}}/notes/feature-<id>-design.md`，`<id>` 取自 `{{TASK_GET}}` 的 `task.id`）。按顺序在已读入的内容中定位以下章节：

1. §测试清单 -- 主要输入。每行 → 一个或多个测试用例。
2. §接口契约 -- 方法签名、前/后置条件、§11.1 库注释、边界决策表、错误处理表。
3. §现有代码复用 -- 工具函数、API 客户端、§11 库&复用映射。
4. §实现摘要 -- 变更文件/类/方法清单，确保每个变更方法有测试覆盖。
5. **§全局约束摘录** -- §11.1 强制库（本特性交集）+ §11.5 命名 + §11.6 错误处理；测试断言风格与错误类型依据本节。
6. §澄清附录（如存在）-- 用户批准的决议。
7. 相关现有测试 -- 探索依赖功能的测试文件，获取断言风格、fixtures、导入、mock 模式。

**禁令**：
- 禁止 Glob / Read / Grep `{{HARNESS_MEMORY_DIR}}/plans/srs.md` 或 `{{HARNESS_MEMORY_DIR}}/plans/design.md`（任何切片方式皆禁）
- 所有上游约束（SRS FR / Design §11 等）已由 wd 节点沉淀到 feature.md §全局约束摘录；若发现缺失 → 返回 BLOCKED，不自行回访上游

## 关键约束

- 先写集成测试，再写单元测试
- 按 `{{REFERENCE}}/iron-law.md` §R1-R9 执行（本文件不重复）
- 所有测试必须失败（退出码 != 0 为成功）。退出码 0 表示测试有误 — 重写
- 遵循相关现有测试约定以保持一致性。§11.5 和测试清单优先
- 测试输出协议：先静默运行 → 若 PASS（错误！）重写；若全部 FAIL（正确！）完成。不确定 → 详细输出查错

