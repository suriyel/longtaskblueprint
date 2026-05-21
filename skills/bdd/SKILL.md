---
name: bdd
description: "当 SRS 已产出、设计与任务列表尚未开始时使用 — 仅依据需求文档产出 Gherkin BDD 用例（FIRST 原则、聚焦关键功能点、按需求→用例组织、含多域组合场景），用输入/验证反推需求完备性；对不明确或需求未提及的场景汇总后打回需求节点重新澄清，完备后交人评审。"
---

**语言规则**：用中文（简体）回复用户。所有生成的 Gherkin 用例、报告和面向用户的输出用中文（关键词 `Feature/Rule/Scenario/Given/When/Then/And/But/Example` 与代码标识符、JSON 字段名、`FR-xxx` 编号保持英文）。

# BDD 用例生成与需求完备性反推

输入：**已批准的 SRS**（`{{HARNESS_MEMORY_DIR}}/plans/srs.md`）+ 用户原话 + 存量代码库。
动作：把 SRS 的关键功能点翻成可执行行为规约（Gherkin BDD），在「写得出 / 写不出 given-when-then」的过程中反推需求完备性——能写全的留作评审产物，写不全的（不明确 / 未提及的场景）汇总成待澄清清单**打回需求节点**。

<HARD-GATE>
本节点**只依据需求**工作，**禁止读取或依赖设计文档** `{{HARNESS_MEMORY_DIR}}/plans/design.md`（即便因重跑 / brownfield 残留而存在也不读、不引用）。BDD 描述的是「系统应当表现出的可观察行为（WHAT/行为）」，不是「如何实现（HOW）」。唯一允许的需求来源：`srs.md` + `user-original-intent.md` + scan 节点产出的存量约定。
在向用户呈现并取得评审批准之前（Step 6），不得调用任何设计 skill、实现 skill、编写任何代码。
</HARD-GATE>

## Step 0 — 打回去重（最先执行，落实「只反馈本轮新增」）

本节点带 `onFail.rewindTo: req`：可能此前已就某些 gap 打回过需求节点、现在是回流重跑。**绝不重复打回同一 gap。**

1. 运行 {{TICKETS_GET}} —— 读取指向本节点的历史打回单（open / closed 皆看）。把每张单的 `message`（曾提出的待澄清项）汇成「**已提出集合**」。
2. 若 `{{HARNESS_MEMORY_DIR}}/plans/bdd.md` 已存在（上一轮产物），Read 它，把末尾「待澄清清单」一并并入「已提出集合」，并把已写好的 Gherkin 用例作为本轮基线（增量更新，不推倒重写）。
3. 无任何 ticket 且无旧 bdd.md → 「已提出集合」为空，本轮为首次执行，照常往下。

> 规则：Step 4 完备性推导得到的 gap，凡落在「已提出集合」内的一律视为「需求侧已知 / 处理中」，**不再计入本轮打回**；仅本轮**新发现**且仍未澄清的项才允许打回。

## Step 1 — 读需求（不读设计）

1. **优先 Read `{{HARNESS_MEMORY_DIR}}/plans/srs.md`**：逐条登记 FR / CON / ASM / IFR / EXC 及其验收标准（AC）、MoSCoW 优先级、`srs_trace` 关系。这是用例的需求骨架。
2. Read `{{HARNESS_MEMORY_DIR}}/intent/user-original-intent.md`：用户原话，校核 SRS 是否漏掉用户隐含期望的行为（用于 Step 4 发现「未提及场景」）。
3. 检查 `{{HARNESS_MEMORY_DIR}}/notes/rules/`（若存在）：scan 节点提取的存量代码库约定，作为「存量系统已确立行为」的依据。
4. 检查 `{{HARNESS_MEMORY_DIR}}/plans/srs-deferred.md`（若存在）：被延后的需求**不在本轮用例范围**，仅登记不写 scenario。

**禁止**：读 `design.md` 或任何 HOW 层文档来「补全」场景——缺的就是缺的，要打回需求，不能用设计私自填平。

## Step 2 — 存量交互探索（理清与存量系统的交互关系）

目的：① 为「多域组合用例」提供新需求 ↔ 存量模块的真实交互面；② 完备性自补背景——很多看似「需求没说」的行为，其实存量系统已有既定规则，**先自解、不打回**。

1. 先复用已有产物（不重复扫描）：Read `{{HARNESS_MEMORY_DIR}}/plans/codebase-scan.md` 与 `{{HARNESS_MEMORY_DIR}}/notes/codebase-research.md`（若存在）。
2. 若上述产物未覆盖本需求触及的交互面（典型：新 FR 要调用 / 修改 / 依赖某存量模块、复用既有鉴权 / 数据 / 配置通道），则做**针对性补充探索**（非阻塞）：

   加载并执行技能 explore-guide，按其流程顺序执行探索阶段（结构扫描 → 维度分析 → 综合 → 输出）。

   参数：
   - Depth: {省略，让 LOC 自检}
   - Focus: `domain,architecture,integration`（交互/集成视角——重点找新需求与存量模块的调用边界、共享状态、契约）
   - Path: {从 SRS FR 推导的存量子树或 "."}
   - User question: "为给 SRS FR-xxx / FR-yyy 写 BDD 行为用例，识别这些需求与存量系统的交互点（被调用 / 调用方、共享数据与状态、既有错误处理与默认值），以及 SRS 假定但代码实际可能不同的行为。"
   - output_path: `{{HARNESS_MEMORY_DIR}}/notes/bdd-interaction-research.md`
   - rules_dir: `{{HARNESS_MEMORY_DIR}}/notes/rules/`
   - report_template: `{{SHARE-REFERENCE}}/explore-report-template.md`

3. 产出（内部态）：**交互面清单** —— 每条记 `{新需求 FR → 存量符号 file:line → 交互方式（调用 / 被调 / 共享状态 / 复用契约）→ 存量既定行为（默认值 / 错误处理 / 边界）}`。
4. BLOCKED / 无有用结果 → 静默跳过，仍照常进入 Step 3（此步非阻塞）；但 Step 4 不得把「本可由探索澄清却因跳过而未澄清」的项当作需求 gap 打回。

## Step 3 — 生成 Gherkin BDD 用例（聚焦关键功能点）

按下述格式与原则，把 SRS 关键功能点写成 BDD 用例，落 `{{HARNESS_MEMORY_DIR}}/plans/bdd.md`。

### 3.1 格式（严格遵循）

```gherkin
Feature: <对应一个 FR 或一组强相关 FR 的能力名>
  <一句话价值陈述：作为<角色>，我要<能力>，以便<收益>>

  Rule: <该 Feature 下的一条业务规则 / 约束>

    Scenario: <一个具体、可判定的行为场景>
      Given <前置状态 / 已有数据 — 完整到可复现>
      When <触发的单一事件 / 操作>
      Then <可观察、可判定的预期结果（断言）>
      And <补充的 Given 或 Then>
      But <反向 / 排除性断言>

      Example:
        <为该 Scenario 给出的具体取值样例（输入→预期），让验收无歧义>
```

> 关键词大小写遵循 Gherkin 惯例（`Feature/Rule/Scenario/Given/When/Then/And/But/Example`），描述文本用中文。`Scenario Outline` + `Examples:` 表可用于同一行为的多组数据。

### 3.2 FIRST 原则（适配 BDD 场景质量）

| 字母 | 含义 | 本场景必须满足 |
|---|---|---|
| **F** | Focused 聚焦 | 只为**关键功能点**写用例（按 MoSCoW 取 **Must / Should**）。不堆砌穷举、不为 trivial 的 getter/字段回显单列场景。 |
| **I** | Independent 独立 | 每个 Scenario 自洽，不依赖其他 Scenario 的执行顺序或残留产物；Given 自带全部前置。 |
| **R** | Repeatable 可复现 | Given 把前置状态设全，结果**确定**，不依赖隐含环境 / 时钟 / 随机；同输入恒同输出。 |
| **S** | Self-validating 自验证 | Then 是**明确的二元断言**（可判定通过/失败），不写「应该正常工作」「合理地」这类模糊措辞。 |
| **T** | Traceable 可追溯 | 每个 Scenario / Rule 标注追溯的 `FR-xxx`（写在 Scenario 描述或紧邻注释里），形成**需求→用例**映射。 |

### 3.3 组织方式：按「需求 → 用例」

- 以 SRS 的 FR 为骨架：每个关键 FR 一个 `Feature`（强相关的多个 FR 可合一个 Feature，但 Scenario 仍各自标 `FR-xxx`）。
- 每个 FR 至少覆盖：**正常路径**（Happy Path）+ 关键**异常/边界路径**（来自 AC 的错误处理、CON 约束触发、IFR 接口失败）。
- 文件顶部放一张「**需求→用例 覆盖表**」：`| FR-ID | MoSCoW | Feature | Scenario 数 | 备注 |`，让评审者一眼看出哪些需求被覆盖、覆盖到什么程度。

### 3.4 多域间组合用例（强制单列一节）

依据 Step 2 的交互面清单，单列一个 `Rule: 跨域组合 / 与存量系统交互` 分组，写**跨越「新需求 ↔ 存量模块」边界**的场景：

- 新 FR 调用 / 依赖存量模块时：Given 设存量侧状态，When 触发新行为，Then 同时断言**新需求结果 + 对存量状态的影响**（双侧验证）。
- 复用既有通道（鉴权 / 数据 / 配置 / 事件）时：写「复用契约被遵守」与「契约被违背时的失败行为」两类场景。
- 这些组合场景同样标 `FR-xxx`，并在描述中点名涉及的存量符号（`模块名 @ file:line`）。

## Step 4 — 完备性反推（用输入/验证倒逼）

写用例的过程本身就是完备性探针。对每个 FR，逐一尝试写出 Given（输入/前置）/ When（触发）/ Then（验证）。**写不下去的地方就是需求缺口**，归两类：

- **(A) 不明确场景**：SRS 提到了，但**输入取值范围 / 默认值 / 触发条件 / 预期结果 / 错误处理**未定，导致 Given 或 Then 无法写成确定断言。
- **(B) 未提及场景**：从用户原话或存量交互**显然应当存在**、但 SRS 完全没写的行为（典型：并发/重复操作、越权、空/超限输入、存量契约冲突、回滚/补偿路径）。

**缺口过滤（顺序严格）**：

1. **先自解**：用 Step 2 的存量既定行为回填——若存量系统对该输入/边界已有确定规则（默认值 / 错误处理 / 约束），则**该 gap 视为已澄清**，在用例里按存量行为写 Then，并在用例注释标 `（沿用存量行为：file:line）`，**不打回**。
2. **再去重**：剩余 gap 与 Step 0「已提出集合」比对，落在集合内的剔除（已在需求侧处理中）。
3. **只留本轮新增**：经 1、2 过滤后仍**不明确且未提出过**的项，才计入本轮「待澄清清单」。

清单每条写清：`FR-xxx | 类型(A不明确/B未提及) | 缺什么(具体到字段/边界/路径) | 为什么写不出 given/then`。无法落点到具体 FR 的（纯未提及）记 `FR=∅` + 行为描述。

## Step 5 — 落盘

把 Step 3 的 Gherkin 用例 + Step 3.3 覆盖表写入 `{{HARNESS_MEMORY_DIR}}/plans/bdd.md`；文件**末尾**追加「## 待澄清清单（本轮）」小节，列出 Step 4 过滤后的本轮新增 gap（无则写「无 — 需求对关键功能点完备」）。无论后续走打回还是评审，都先落盘，**进度不丢**。

## Step 6 — 三态收尾（本回合最后一个动作）

依据 Step 4 结果分支，调用一次收尾命令后立即结束本回合：

- **有本轮新增未澄清缺口**（待澄清清单非空）→ 把清单汇成 notes 打回需求节点重新澄清：
  {{ADVANCE_FAIL notes=<逐条：FR-xxx 缺什么、为何写不出 given/then；纯未提及的写行为描述>}}
  （触发 onFail → rewind 到 req；req 会聚焦这些 gap 做 Gap Fill 后回流，本节点重跑时 Step 0 会自动去重）
- **无本轮新增缺口（完备）**→ 用 **AskUserQuestion** 向用户呈现 `bdd.md`（覆盖表 + 关键 Feature/Scenario 摘要），请其评审，选项：**批准 / 指出需调整的场景 / 补充澄清后重审**：
  - 批准 → {{ADVANCE_OK artifact={{HARNESS_MEMORY_DIR}}/plans/bdd.md}}
  - 指出需调整 → 按反馈改 `bdd.md` 后重新呈现（不退出本回合）
  - 补充澄清后重审：若用户的补充等于暴露了新的需求缺口 → 计入待澄清清单 → 改走 ADVANCE_FAIL 打回
- **读不到 srs.md / 无法判定**（如 SRS 缺失或不可读，非需求内容问题）→ {{ADVANCE_BLOCKED notes=<原因>}}

> 不要臆测：必须真正读完 SRS、做完探索与完备性反推后再判定三态。

## 反模式

| 合理化 | 正确回应 |
|--------|---------|
| "看一眼 design.md 就能把场景补全" | HARD-GATE 禁止。BDD 只描述需求行为；缺的场景是需求 gap，要打回 req，不能用设计私填。 |
| "把 SRS 的 EARS 句子直接抄成 Then 就行" | 翻译式照搬不是行为用例。要写出可复现的 Given + 可判定的 Then + 具体 Example，照搬发现不了完备性缺口。 |
| "每个字段、每条 FR 都写满 scenario" | 违反 F（聚焦）。只覆盖关键功能点（Must/Should）+ 关键异常路径；trivial 项不单列。 |
| "存量没说清的也打回需求" | 先做 Step 2 自解：存量已有既定行为的，按存量写 Then 并标注来源，不打回。只打回存量也无法澄清、且 SRS 未定的。 |
| "上轮打回过的 gap 这轮再提一次" | Step 0 去重铁律。只反馈本轮新发现且未提出过的项，否则与 req 死循环（maxAttempts=3 会 halt）。 |
| "Then 写'应正常返回'即可" | 违反 S（自验证）。Then 必须是明确二元断言（具体值 / 状态 / 错误码）。 |
| "组合场景太麻烦，只写单域" | 多域组合是本节点的核心价值之一（理清与存量交互）。Step 3.4 强制单列。 |
| "有缺口也先让用户评审完整版" | 有本轮新增缺口直接 ADVANCE_FAIL 打回 req；评审只在完备时进行，避免让用户反复审残缺产物。 |
