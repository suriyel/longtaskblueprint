---
name: refactor
description: "TDD 重构阶段 -- 清理代码、运行静态分析、验证 S11 合规性。"
---

# TDD 重构 -- 清理 + 合规

重构代码、运行静态分析并验证代码库合规性。请自行阅读所有文档。

## 获取当前任务

```bash
{{TASK_GET}}
```

输出 JSON，解析 `task.id` / `task.title` / `task.description` / 其他业务字段。loop 引擎已挑好当前任务，通过上方命令获取。无需手动管理任务状态。

## 你的任务

1. 阅读执行规则：`reference/tdd-refactor-execution.md`
2. 阅读规则：`{{REFERENCE}}/iron-law.md`、`{{HARNESS_MEMORY_DIR}}/notes/rules/`

## 关键约束

**唯一权威源 = feature 设计文档**。单次 Read 整份 feature.md（路径：`{{HARNESS_MEMORY_DIR}}/notes/feature-<id>-design.md`，`<id>` 取自 `{{TASK_GET}}` 的 `task.id`）。禁止 Glob / Read / Grep `{{HARNESS_MEMORY_DIR}}/plans/srs.md` 或 `{{HARNESS_MEMORY_DIR}}/plans/design.md`。

- **阶段 1：重构** -- 提取重复代码、改善命名、简化逻辑。每次修改后都运行测试。不得添加新功能。
- **阶段 2：静态分析质量门禁** -- 运行 feature.md §静态分析与质量工具命令 / §11.4 静态分析命令 中列出的每个工具命令。修复所有违规项 -- 违规项为阻塞性问题。
- **阶段 3：S11 合规检查**（唯一依据 = feature.md §全局约束摘录）：
  - a) S11.1 合规：对功能变更执行 `git diff --name-only`。对新增/修改的文件 grep 检查 §全局约束摘录 §11.1 表中"被替代方案"列。匹配即违规，必须修复。
  - b) 现有代码复用：对每个 REUSE 项，grep 实现文件查找预期的导入。未导入但重新实现 -> 违规 -> 替换为 REUSE 导入。
  - c) 实现摘要合规：验证实现文件/类/方法与实现摘要一致，未遗漏变更项，未引入摘要外的类。
- 发现违规时：修复、重新运行测试、重新检查。
- 所有测试必须通过，静态分析零违规，S11 合规检查通过。

