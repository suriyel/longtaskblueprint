---
name: wd
description: "在 TDD 之前产出**当前任务**的功能级详细设计文档（接口契约、实现摘要、边界/错误分析、测试清单、集成接缝与存量复用接地）"
---

# Worker — 阶段 A：Feature Design

为**当前任务**产出功能级详细设计文档。完成后由 harness 自动推进。

> **对 `category: "bugfix"` 任务**：精简模式，重点关注 (1) 根因文档，(2) 定向修复方案，(3) 回归测试清单。

解析 {{TASK_GET}} 输出的 JSON，取 `task.id` / `task.title` / `task.description` / 其他业务字段。loop 引擎已挑好当前任务，无需手动管理任务状态。

## 你的任务

1. 读取执行规则：`reference/feature-design-execution.md`
2. 读取模板：`reference/feature-design-template.md`
3. 单次全量 Read 上下游：
   - SRS：`{{HARNESS_MEMORY_DIR}}/plans/srs.md`
   - 整体设计：`{{HARNESS_MEMORY_DIR}}/plans/design.md`
   - 项目上下文：`{{HARNESS_MEMORY_DIR}}/plans/project-context.md`（init 产出 — tech_stack 与项目级 constraints/assumptions 解析后权威源；tech_stack 沉淀进 feature.md §11.7 时优先于 design.md §11.7）
   - **BDD 行为用例：`{{HARNESS_MEMORY_DIR}}/plans/bdd.json`**（bdd 节点产出，经 gate_bdd 校验）——**以当前 `task.bdd_ids`（{{TASK_GET}} 取，init 已按 FR 交集填好的权威指针）逐 id 取出对应 scenario** = **本特性必测行为**。不再自行做 `fr ∩ srs_trace` 推导（指针在 init 阶段已固化）；若 `task.bdd_ids` 为空但本特性显然有行为面 → 返回 BLOCKED（属 init 层缺口）。这是 §测试清单的源与底线（见下）。
4. 读取代码库约定（如存在）：`{{HARNESS_MEMORY_DIR}}/notes/rules/*.md`
5. **接地集成与存量代码（强制，见执行规则 §1c）**：先识别本特性的接触面——`{{TASKS_GET}}` 取全量任务找协作特性（消费/被调/共享）、Design §6.2 契约、要触及的存量逻辑；再针对性探索工作树定位它们的**真实实现**（含本次迭代已生成的代码）。被消费的接口绑定真实实现，找不到且 Provider 待实现则记契约 + pending —— 不得静默 mock。

## 关键约束

- **SRS / Design 各单次全量 Read**：禁止 offset/limit 片段读、禁止 Grep 子串切片
- 输出路径：`{{HARNESS_MEMORY_DIR}}/notes/feature-<id>-design.md`（`<id>` 取自 `{{TASK_GET}}` 的 `task.id`）
- **feature.md 必含两沉淀章节**（作为 TDD R/G/R 唯一执行权威源）：
  - `## 全局约束摘录` — §11.1 子集（仅本特性涉及领域）+ §11.5 全表 + §11.6 全段
  - `## 静态分析与质量工具命令` — §11.4 静态分析命令 + §11.7 覆盖率/变异阈值
  - 两章节末尾各带溯源行 `> 摘自 Design §... — commit <sha>，date YYYY-MM-DD`
- **§测试清单以 BDD 为源与底线**：`task.bdd_ids` 逐 id 取出的**每个相关 BDD 场景至少 1 行**，该行「追踪到」列写其 `BDD-xxx` id（可并列 FR-AC / 设计章节）；「输入/设置」取自场景 `given`/`examples`、「预期」取自场景 `then`，再用 §接口契约 边界/Raises 充实成精确值。设计内部测试点（§4.N 命名接口、UML 分支、集成边界）作为**额外行**补充——BDD 提供「测什么」的底线，设计补「怎么测」的深度。**漏掉任一相关场景**下游 `gate_red` 会查出并打回。
- **「预期」列必须落到精确可观察值（强约束）**：BDD-derived 行的「预期」列**必须把场景 `then`/`examples` 的可观察结果原样编码成可断言的精确值**（精确字符串、精确状态码、精确返回结构、精确持久化记录等，随技术栈而定），**不得抽象成"显示成功""调用成功""返回正确"等无法精确断言的措辞**。同时在该行「追踪到」或备注列标注**可观察面** = 产出此 `then` 的真实模块/符号（供下游 red 判断哪张面禁 mock）。预期列写虚 → 下游 `gate_behavior` 真跑测试核验时必打回。
- 测试清单负向测试比例 >= 40%
- 测试清单类别应根据 SRS 验收标准覆盖 FUNC、BNDRY、SEC
- §11 合规：命名遵循 §11.5，操作使用 §11.1 库，错误处理遵循 §11.6
- **设计前接地（两类现实，见 §1c）**：① 针对性探索工作树存量代码（含本次迭代已生成的），优先复用真实实现而非新写；② 显式建模本特性与其它功能点/存量逻辑的交互协作——调谁、被谁调、共享什么，绑定真实接缝而非 mock
- **实现摘要**：精炼描述改哪些类、如何改，Red/Green/Refactor 严格遵从
- 设计输出中不包含 TDD 任务分解 —— TDD 执行由下游 red / green / refactor 节点处理
- 不要开始 TDD

## 关键规则

- **本节点只产出设计文档，不做 TDD**
- **SRS/Design 模糊不得假设** —— 上报 BLOCKED 或写入「澄清附录」让用户介入
- **遇错系统化调试** —— 读 `{{SHARE-REFERENCE}}/systematic-debugging.md`；追根因不猜

## 红旗信号

| 逃避 | 正确动作 |
|---|---|
| "顺便把 TDD 也做了" | 本节点只出设计文档。TDD 由下游节点处理。 |
| "SRS 模糊但我就假设……" | 上报 BLOCKED 或写入「澄清附录」让用户介入 |
| "这个特性简单，跳过 Feature Design 直接 TDD" | 不可绕过。每特性都要。 |
| "只看 SRS/Design 就开始设计" | 先按 §1c 接地工作树真实实现与协作面（含本次迭代已生成的代码） |
| "要调别的功能/接口，找不到就写个 mock" | 先在工作树定位真实实现；确实没有则显式记为待实现 + 集成测试 pending，不得静默 mock |

