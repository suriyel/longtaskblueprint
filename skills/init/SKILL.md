---
name: init
description: "当设计文档存在但 items 未生成时使用 — 从 SRS FR 列表交互式生成任务列表并灌入 iter loop"
---

**语言规则**：你必须用中文（简体）回复用户。所有生成的文档、报告和面向用户的输出必须用中文编写。Skill 名称、代码标识符和 JSON 字段名保持英文。

# 初始化 Long-Task 项目

在 SRS 和设计均批准后运行一次。从 SRS FR 列表交互式生成 task[]（FR 已在需求阶段调整大小），为迭代 Worker 周期做准备。

## 输入文档

此 skill 从**两份**已批准文档读取：

| 文档 | 位置 | 提供内容 |
|------|------|---------|
| **SRS** | `{{HARNESS_MEMORY_DIR}}/plans/srs.md` | 功能需求（FR-xxx）、约束（CON-xxx）、假设（ASM-xxx）、接口需求（IFR-xxx）、术语表、用户画像、验收标准 |
| **设计** | `{{HARNESS_MEMORY_DIR}}/plans/design.md` | 技术栈、架构、数据模型、API 设计、测试策略 |
| **用户原始诉求** | `{{HARNESS_MEMORY_DIR}}/intent/user-original-intent.md` | 蓝图启动时用户原话（scan 节点固化）；用于背景对齐与 task[] 元数据校验，**不**作为决策依据（粒度规则由 req Step 5 锁定，本节点仅消费 SRS FR 列表）|

## 检查清单

你必须为每步创建 TodoWrite 任务并按顺序完成：

1. **阅读已批准的 SRS 和设计文档**
   - SRS：`{{HARNESS_MEMORY_DIR}}/plans/srs.md` — 需求、约束、假设、术语表、画像
   - 设计：`{{HARNESS_MEMORY_DIR}}/plans/design.md` — 技术栈、架构决策
   - 用户原始诉求：`{{HARNESS_MEMORY_DIR}}/intent/user-original-intent.md` — 背景对齐用，不影响 items[] 拆分粒度（粒度已在 req Step 5 确定）

2. **确定 `tech_stack`**：从设计文档 §3.4 / §11.7 提取 `language`、`test_framework`、`coverage_tool`、`mutation_tool`。
   - 若 `{{HARNESS_MEMORY_DIR}}/notes/rules/build-and-compilation.md` 存在：与扫描文档中的"测试与质量工具"表交叉检查 `tech_stack`：
     - 将 `test_framework` / `coverage_tool` / `mutation_tool` 与检测到的工具名匹配
     - **冲突处理**（任一工具 scanner ≠ Design §11.7）：`AskUserQuestion` 单选覆盖整组：
       - **A scanner 为准 + 回写 Design**：`tech_stack` = scanner 值；Edit Design §11.7 冲突行 + 注释 `<!-- Init 同步自 scanner — YYYY-MM-DD -->`
       - **C 跳过 + 记录漂移**：`tech_stack` = Design 值；记录到 `{{HARNESS_MEMORY_DIR}}/notes/tech-stack-drift.md`
     - 若工具类别在扫描文档中显示"none detected"，保留设计文档/语言预设值

3. **生成工具命令指南** → `{{HARNESS_MEMORY_DIR}}/notes/tool-commands-guide.md`：

   a. **收集配置来源**（优先级顺序）：
      - `{{HARNESS_MEMORY_DIR}}/notes/rules/build-and-compilation.md`（若存在）— 提取构建命令、测试命令、包管理器
      - 项目根的 build / test 命令清单（来自 `package.json` / `pyproject.toml` / `Cargo.toml` / `Makefile` / `pom.xml` 等）
   b. **指南内容 — 仅包含以下三章节**：
      1. **Test Commands** — quiet 模式（仅出 PASS/FAIL）+ detail 模式（含 traceback）+ 完整测试命令
      2. **UT Style** — 项目特定的 UT 约定：
         - UT + mock 框架（从依赖清单 / 配置文件检测）
         - mock 风格（基于代码示例的 mock 方式）
         - **固定约定**：编写前探索现有测试 + 源码；复用 fixture
         - 若 `{{HARNESS_MEMORY_DIR}}/notes/rules/coding-constraints.md` 存在：用扫描值覆盖检测项
      3. **Caveats** — 项目特定的工具注意事项（**LLM 探查生成，非模板**）：
         - **对每条维度**：读取项目实际配置（pom.xml / package.json / pyproject.toml / CMakeLists.txt / conftest.py 等），回答该维度的问题
         - 若 `{{HARNESS_MEMORY_DIR}}/notes/rules/coding-constraints.md` 存在：额外检查扫描发现的 mock 框架、断言库、内部库约束
         - **输出规则**：
           - 仅写入有实际发现的条目（无发现则跳过该维度）
           - 每条 ≤ 1 行，格式：`- [类别] 发现 → 结论`
           - 总条目数控制在 3-10 条（精选最影响下游 SubAgent 的）
           - 重点关注：**必须参数**（漏掉会导致失败）、**工具冲突**（版本不兼容）、**项目已有选择**（统一而非引入新方案）
   c. **不要包含**：TDD 工作流、验证规则、关键规则、静态分析、persist 步骤 — 这些在下游节点 SKILL.md 里
   d. **自检**：手动确认三章节完整、Caveats ≤ 10 条、无空章节

4. **从 SRS FR 列表交互式生成功能** — FR 已在需求阶段调整大小（G1-G6 过大 + S1-S4 过小启发式）。粒度已在 SRS 阶段最终确定；此步仅将 FR 映射为功能（1 个 FR 或多个相关 FR → 1 个功能）。

   a. **提取 FR**：从 `{{HARNESS_MEMORY_DIR}}/plans/srs.md` 提取所有 FR-xxx 条目（FR ID、title、description、acceptance criteria、SRS 优先级若有）
   b. **呈现分组建议**：按 SRS 章节/领域给出建议分组（相关 FR 聚合为垂直切片，每个功能目标 ≈ 1000 行实现代码）。展示给用户：
      ```
      建议分组：
      Feature 1：[title] — FR-001, FR-002（理由：共同领域/前后端配对）
      Feature 2：[title] — FR-003（理由：独立功能）
      ...
      ```
   c. **用户批准分组**（AskUserQuestion 或自由响应）。用户可调整 FR 组合、重命名、重排序、增改依赖。
   d. **按批准结果填充 `items[]`**：
      - `srs_trace`：该功能覆盖的 FR ID 数组
      - `title` + `description`：用户给出，或从首个 FR 派生
      - `priority`：取该组 FR 最高优先级（若 SRS 有 MoSCoW/P0-P3 字段）；默认 `"medium"`
      - `dependencies`：从 SRS 显式 FR 依赖或用户指定推断；无则空数组
      - `status`：始终 `"failing"`
      - `verification_steps` 可选 — 若提供，将所有映射 FR 的验收标准整合为行为场景（Given/When/Then）：
        - 每步必须是含 Given/When/Then 结构的行为场景，非简单断言
        - 错误：`"Login page displays correctly"` → 无动作、无断言
        - 正确：`"Given a registered user, when POST /api/orders with valid payload, then response 201 with order ID; and GET /api/orders/{id} returns the created order with correct fields"`
        - 对有后端依赖的功能：至少一步必须验证跨依赖边界的真实数据流
        - **最低复杂度**：每个功能应有 ≥ 1 个含 3+ 链式操作的 verification_step
      - **排序**：按用户批准的顺序；每个功能必须可独立验证且在一个会话内完成
   e. **验证门禁**（inline 校验）：填充所有功能后人工检查：
      - SRS 中每个 FR-xxx 至少出现在一个功能的 `srs_trace` 中（无孤立需求）
      - 每个功能的 `srs_trace` 至少包含一个 FR（无空追溯）
      - 字段齐全（id 唯一、title/description 非空、priority/status 合法枚举值）
   f. **单轮标志传播**：若 SRS 文档元数据包含 `Single-Round: Yes`，在根层级设置 `"single_round": true`。这是信息性标志 — 无论此标志如何，所有 Worker 步骤执行其完整标准流程。

## 任务结构



<!-- SCHEMA START: default -->
### Tasks schema "default" — items[] for `bp-tasks set iter`

```json
// items[] 结构（注释即字段语义）
[
  {
    "id": 1, // L1 必填: string | number
    "status": "failing", // L1 必填: string; default "failing"; doneValues=["passing"] 时该 task 视为完成
    "dependencies": [], // L1 必填: array; items: string | number; default []
    "title": "登录表单组件", // L2 optional: string
    "description": "邮箱 + 密码字段、必填校验、submit 触发回调", // L2 optional: string
    "priority": "high", // L2 optional: string; enum=["high","medium","low"]
    "dependencies": [], // L2 optional: array
    "category": "core", // L3 optional: string
    "srs_trace": ["FR-001","FR-003"], // L3 optional: array
    "verification_steps": ["页面渲染表单","空提交报错","成功 submit 调回调"], // L3 optional: array
    "tech_stack": {}, // L3 optional: object
    "constraints": [], // L3 optional: array
    "assumptions": [], // L3 optional: array
    "single_round": false // L3 optional: boolean
  }
]
```

**为每个task填充 SRS 字段** — 从 **SRS 文档**：                                                                                                                                                  
   - `constraints[]` — 复制 SRS "约束"章节中的 CON-xxx 项；每项为简洁字符串                                                                                                                      
   - `assumptions[]` — 复制 SRS "假设与依赖"章节中的 ASM-xxx 项；每项为简洁字符串 

## ⚠️ 灌入 `iter` loop（必须执行，否则 run 卡死）

**漏调后果**：下游 `iter` loop 入口检测 `state.loops.iter.tasks` 为空 → halt（reason: `loop_no_tasks_seeded`）。

**步骤**：
1. 根据上面 schema 结构和你的分析结果，构造 items JSON 数组（每条 task 的 id 必须唯一）
2. **在 `bp-advance` 之前**执行以下命令将 items JSON 直接灌入引擎 state：

{{TASKS_SET loop=iter}}

> 未声明字段透传，body skill 可用 `{{loop.task.<field>}}` 引用。
<!-- SCHEMA END: default -->



## 生成公共上下文 md

将 SRS §约束 / §假设原文写到两个临时 JSON 数组文件，然后调脚本生成 `project-context.md`：

1. Write `{{HARNESS_MEMORY_DIR}}/plans/_constraints.json`，纯字符串数组：
   ```json
   ["<CON-001 文本>", "<CON-002 文本>", "..."]
   ```
2. Write `{{HARNESS_MEMORY_DIR}}/plans/_assumptions.json`，同样字符串数组：
   ```json
   ["<ASM-001 文本>", "<ASM-002 文本>", "..."]
   ```
3. 调脚本（`--lang` 命中 preset 时自动填工具默认值，显式 flag 覆盖）：
   ```bash
   node {{SCRIPTS}}/init_project.cjs "<project-name>" \
     --memory-dir={{HARNESS_MEMORY_DIR}} \
     --lang=<python|java|javascript|typescript|c|cpp> \
     --test-framework=<...> --coverage-tool=<...> \
     --constraints-file={{HARNESS_MEMORY_DIR}}/plans/_constraints.json \
     --assumptions-file={{HARNESS_MEMORY_DIR}}/plans/_assumptions.json
   ```
4. 产出：`{{HARNESS_MEMORY_DIR}}/plans/project-context.md`（下游 wd 读取的 tech_stack 解析后权威源）

