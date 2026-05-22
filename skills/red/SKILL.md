---
name: red
description: "TDD Red 阶段 -- 为功能测试清单编写失败测试。"
---

# TDD Red -- 编写失败测试

为所有测试清单行编写失败测试。请自行读取所有文档。

解析 {{TASK_GET}} 输出的 JSON，取 `task.id` / `task.title` / `task.description` / 其他业务字段。loop 引擎已挑好当前任务，无需手动管理任务状态。

## 你的任务

1. 读取执行规则：`reference/tdd-red-execution.md`
2. 读取规则：`{{SHARE-REFERENCE}}/iron-law.md`，`{{HARNESS_MEMORY_DIR}}/notes/rules/`
3. 读取反模式：`{{SHARE-REFERENCE}}/testing-anti-patterns.md`

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
- 禁止 Glob / Read / Grep `{{HARNESS_MEMORY_DIR}}/plans/srs.md` 或 `{{HARNESS_MEMORY_DIR}}/plans/design.md`（任何切片方式皆禁）；同样**不直读 `bdd.json`**——BDD 行为已由 wd 沉淀进 §测试清单（"追踪到"列带 `BDD-xxx`）
- 所有上游约束（SRS FR / Design §11 / BDD 场景等）已由 wd 节点沉淀到 feature 设计文档；若发现缺失 → 返回 BLOCKED，不自行回访上游

## BDD 追溯打标（强约束）

§测试清单是 wd **以 bdd.json 为源**构建的：源自 BDD 行为的行，其"追踪到"列带 `BDD-xxx` id。

- 为「"追踪到"含 `BDD-xxx`」的**每一行**写测试时，**必须用该 id 给测试打标**——测试名后缀（如 `test_empty_pw_rejected_BDD001`）或紧邻注释（`# BDD-001` / `// BDD-001`），使「BDD 场景 → 测试代码」追溯链在代码层可见。
- 覆盖每个带 `BDD-xxx` 的清单行，**一个都不能少**：下游 `gate_red` 硬门 grep 工作区测试文件逐 id 核对，缺任一即打回本节点。
- **BDD 可观察面禁 mock（铁律）**：对每个 `BDD-xxx` 行，产出其 `then` 可观察结果的那张表面（断言直接读取的模块/函数 —— 随技术栈而定，如返回值、输出/渲染文本、状态码、持久化记录、发出的事件等）**不得被 mock/stub 整体替换**。若沿用现有测试里的整模块打桩（视语言/框架而定，如 `vi.mock` / `jest.mock` / `unittest.mock.patch` / `Mockito.mock` 等）把该模块换成桩 → 视为漏覆盖，必须改写为真实调用。mock 只允许打在比可观察面更外层的真实系统边界（外部网络/三方/时钟/文件系统等）。
- **预期值即断言（铁律）**：该行断言必须直接断言 `then`/`examples` 给出的**精确可观察值**（精确字符串、精确状态码、精确返回结构等），**禁止仅用"被调用过"类断言（视框架而定，如 `toHaveBeenCalled` / `assert_called` / `verify(...)`）冒充对 `then` 的覆盖**。下游 `gate_behavior` 硬门真跑测试并核对这两条——可观察面被 mock、或只断言被调用未断言精确值，即打回本节点。
- **降级护栏**：若被 `gate_red` / `gate_behavior` 打回、其 ticket 指出某 `BDD-xxx` 缺失或其 `then` 精确预期值在 §测试清单中根本不存在（= wd 漏列该场景 / 漏写预期值）→ 返回 BLOCKED 说明情况（属 wd 层缺口），**不臆造测试、不硬编预期值**。

## 关键约束

- **BDD 追溯打标**：§测试清单"追踪到"含 `BDD-xxx` 的行，对应测试必须带该 id 标记——gate_red 据此判定，优先级高于"精简"
- 先写集成测试，再写单元测试
- 按 `{{SHARE-REFERENCE}}/iron-law.md` §R1-R9 执行（本文件不重复）
- 所有测试必须失败（退出码 != 0 为成功）。退出码 0 表示测试有误 — 重写
- 遵循相关现有测试约定以保持一致性。§11.5 和测试清单优先
- 测试输出协议：先静默运行 → 若 PASS（错误！）重写；若全部 FAIL（正确！）完成。不确定 → 详细输出查错

