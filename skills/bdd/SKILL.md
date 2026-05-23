---
name: bdd
description: "当 SRS 已产出、设计与任务列表尚未开始时使用 — 仅依据需求文档产出结构化 JSON BDD 用例（bdd.json：按 feature 分组、每场景含 given/when/then/examples；FIRST 原则、聚焦关键功能点、按需求→用例组织、含多域组合场景），用输入/验证反推需求完备性；对不明确或需求未提及的场景汇总后打回需求节点重新澄清，完备后交人评审。下游有 gate_bdd 硬门校验产物规范性。"
---

**语言规则**：用中文（简体）回复用户。用例的描述文本（feature/scenario 名、given/when/then/examples 的值、报告与面向用户的输出）用中文；**JSON 字段名（key）、代码标识符、`FR-xxx` 编号保持英文**。

# BDD 用例生成与需求完备性反推

输入：**已批准的 SRS**（`{{HARNESS_MEMORY_DIR}}/plans/srs.md`）+ 用户原话 + 存量代码库。
动作：把 SRS 的关键功能点翻成可执行行为规约（BDD 场景，Gherkin 语义），落成**结构化 JSON**（`{{HARNESS_MEMORY_DIR}}/plans/bdd.json`，便于下游 `gate_bdd` 硬门机器校验规范性）；在「写得出 / 写不出 given-when-then」的过程中反推需求完备性——能写全的留作评审产物，写不全的（不明确 / 未提及的场景）汇总成待澄清清单**打回需求节点**。

<HARD-GATE>
本节点**只依据需求**工作，**禁止读取或依赖设计文档** `{{HARNESS_MEMORY_DIR}}/plans/design.md`（即便因重跑 / brownfield 残留而存在也不读、不引用）。BDD 描述的是「系统应当表现出的可观察行为（WHAT/行为）」，不是「如何实现（HOW）」。唯一允许的需求来源：`srs.md` + `user-original-intent.md` + scan 节点产出的存量约定。
在向用户呈现并取得评审批准之前（Step 6），不得调用任何设计 skill、实现 skill、编写任何代码。
</HARD-GATE>

## Step 0 — 打回去重（落实「只反馈本轮新增」）

本节点带 `onFail.rewindTo: req`：可能此前已就某些 gap 打回过需求节点、现在是回流重跑。**绝不重复打回同一 gap。**

1. 运行 {{TICKETS_GET}} —— 枚举指向本节点的历史打回单（open / closed 皆看，**用于去重**而非判断是否被打回）。把每张单的 `message`（曾提出的待澄清项）汇成「**已提出集合**」。
2. 若 `{{HARNESS_MEMORY_DIR}}/plans/bdd.json` 已存在（上一轮产物，可能是被 `gate_bdd` 打回重跑），Read 它，把 `clarifications[]` 一并并入「已提出集合」，并把已写好的用例作为本轮基线（增量更新，不推倒重写）。**已存在场景的 `id` 原样保留、不得重新编号**（下游测试已按 id 打标），仅给本轮新增场景续号。**若本轮是被 gate_bdd 因「规范性不达标」打回**（ticket 来自 gate_bdd），重点按其 message 修正 JSON 结构/字段，不重新发起需求侧打回。
3. 无任何 ticket 且无旧 bdd.json → 「已提出集合」为空，本轮为首次执行，照常往下。

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

## Step 3 — 生成 BDD 用例 JSON（聚焦关键功能点）

按下述 **JSON schema** 与原则，把 SRS 关键功能点写成结构化 BDD 用例，落 `{{HARNESS_MEMORY_DIR}}/plans/bdd.json`。**按 feature 分组**（= 需求单元），每个 scenario 承载 Gherkin 语义（given/when/then）+ 具体取值（examples）。

### 3.1 JSON Schema（严格遵循 — gate_bdd 据此校验规范性）

```json
{
  "features": [
    {
      "feature": "<对应一个 FR 或一组强相关 FR 的能力名>",
      "fr": ["FR-001"],
      "scenarios": [
        {
          "id": "BDD-001",
          "scenario": "<一个具体、可判定的行为场景名>",
          "given": ["<前置状态 / 已有数据 — 完整到可复现>"],
          "when": ["<触发的单一事件 / 操作>"],
          "then": ["<可观察、可判定的预期结果（断言）>"],
          "examples": ["<具体取值：输入 → 预期>", "<另一组：输入 → 预期>"]
        },
        {
          "id": "BDD-002",
          "scenario": "<跨域组合场景：与存量模块交互>",
          "cross_domain": "<存量符号，形如 模块名 @ src/foo.js:42>",
          "given": ["<存量侧状态>"],
          "when": ["<触发新行为>"],
          "then": ["<新需求结果 + 对存量状态的影响>"],
          "examples": ["<输入 → 预期>"]
        }
      ]
    }
  ],
  "clarifications": ["FR-003: <缺什么> — <为何写不出 given/then>"]
}
```

**字段硬规则（gate_bdd 逐条校验，违反即打回 bdd 重出）**：
- 合法 JSON、顶层对象；`features` 非空数组；`clarifications` 为字符串数组（无缺口则 `[]`）。
- 每个 feature：`feature` 非空字符串；`fr` 非空数组且每项匹配 `^[A-Z]{2,4}-\d+$`（如 FR-001 / IFR-002 / CON-001）；`scenarios` 非空数组。
- 每个 scenario：`id` 非空且匹配 `^BDD-\d+$`、**全局唯一**（跨 feature 也不重号）；`scenario` 非空字符串；`given` / `when` / `then` / `examples` 均为**非空字符串数组**。
- `cross_domain` 可选；若存在须为非空字符串（形如 `"模块名 @ src/foo.js:42"`）。

> **场景 `id` 是下游追溯锚点**：TDD Red 节点会用该 id 给对应单元测试打标，环内 `gate_red` 硬门据此机检「每个相关场景都有测试覆盖」。故 **id 一旦分配不得变动**——重跑（被 gate_bdd / req 打回）时保留既有场景 id，只给本轮新增场景续号。

### 3.2 FIRST 原则（适配 BDD 场景质量）

| 字母 | 含义 | 本场景必须满足 |
|---|---|---|
| **F** | Focused 聚焦 | 只为**关键功能点**写用例（按 MoSCoW 取 Must / Should）。不堆砌穷举、不为 trivial 项单列场景。 |
| **I** | Independent 独立 | 每个 scenario 自洽，不依赖其他 scenario 的顺序或残留；`given` 自带全部前置。 |
| **R** | Repeatable 可复现 | `given` 设全前置、结果**确定**，不依赖隐含环境 / 时钟 / 随机；`examples` 给确定的输入→预期。 |
| **S** | Self-validating 自验证 | `then` 是**明确二元断言**（可判定通过/失败），不写「应该正常工作」这类模糊措辞。 |
| **T** | Traceable 可追溯 | feature 的 `fr` 字段填追溯的 `FR-xxx`（非空），形成**需求→用例**映射。 |

### 3.3 组织方式：按「需求 → 用例」

- 以 SRS 的 FR 为骨架：每个关键 FR（或一组强相关 FR）一个 feature 条目，`fr` 标注其覆盖的需求。
- 每个 feature 至少覆盖：**正常路径** + 关键**异常/边界路径**（来自 AC 的错误处理、CON 约束触发、IFR 接口失败），各用一个 scenario 表达。
- `examples` 每条给一组具体取值「输入 → 预期」，让验收无歧义；同一行为的多组数据并列多条 example 字符串。

### 3.4 多域间组合用例（强制）

依据 Step 2 的交互面清单，在所属 feature 内产出**跨越「新需求 ↔ 存量模块」边界**的 scenario（置 `cross_domain` 字段标存量符号）：

- 新 FR 调用 / 依赖存量模块时：`given` 设存量侧状态，`when` 触发新行为，`then` 同时断言**新需求结果 + 对存量状态的影响**（双侧验证）。
- 复用既有通道（鉴权 / 数据 / 配置 / 事件）时：写「契约被遵守」与「契约被违背时的失败行为」两类 scenario。
- `cross_domain` 填涉及的存量符号（`"模块名 @ file:line"`，非空）。
- 若本需求经 Step 2 确认**确无任何存量交互**（纯 greenfield 孤立功能），可不产出 cross_domain 场景——gate_bdd 对此仅告警不打回。

### 3.5 场景逻辑自洽自检（强制）

每个场景落盘前自查一次：`given → when → then` 必须在 **SRS（及 scan 存量约定）明文规定的规则**下成立，不得自相矛盾。

对多步场景（`when` 含顺序操作、或 `then` 描述逐步演进的结果）尤须逐步核验：从 `given` 出发，依次施加 `when` 的每一步，确认 `then` 声称的每个中间结果与最终结果都确由规则推得；若某一步会被规则拒绝或中断，其后的 `then` 便不成立。

发现矛盾：可修正的就**改写或拆分场景**使其自洽；若因 **SRS 规则缺失或含糊**而无法判定，按 Step 4 记入 `clarifications` 打回需求，不要臆造一个"恰好成立"的版本。

> 只依据项目自身规则推演判断。自相矛盾或无法推得的场景即便落盘，下游也无法实现通过。

## Step 4 — 完备性反推（用输入/验证倒逼）

写用例的过程本身就是完备性探针。对每个 FR，逐一尝试写出 given（输入/前置）/ when（触发）/ then（验证）/ examples（取值）。**写不下去的地方就是需求缺口**，归两类：

- **(A) 不明确场景**：SRS 提到了，但**输入取值范围 / 默认值 / 触发条件 / 预期结果 / 错误处理**未定，导致 given/then/examples 无法写成确定断言。
- **(B) 未提及场景**：从用户原话或存量交互**显然应当存在**、但 SRS 完全没写的行为（典型：并发/重复操作、越权、空/超限输入、存量契约冲突、回滚/补偿路径）。

**缺口过滤（顺序严格）**：

1. **先自解**：用 Step 2 的存量既定行为回填——若存量系统对该输入/边界已有确定规则（默认值 / 错误处理 / 约束），则**该 gap 视为已澄清**，在用例里按存量行为写 then，并在 examples 注明 `（沿用存量行为：file:line）`，**不打回**。
2. **再去重**：剩余 gap 与 Step 0「已提出集合」比对，落在集合内的剔除（已在需求侧处理中）。
3. **只留本轮新增**：经 1、2 过滤后仍**不明确且未提出过**的项，才计入本轮「待澄清清单」。

每条 gap 落成 `clarifications[]` 的一个字符串：`"FR-xxx: <缺什么，具体到字段/边界/路径> — <为何写不出 given/then>"`。无法落点到具体 FR 的（纯未提及）以 `"∅: <行为描述>"` 记。

## Step 5 — 落盘

把 Step 3 的 `features`（每条 = `feature` + `fr` + `scenarios`）+ Step 4 过滤后的本轮新增 gap（`clarifications`，无缺口则 `[]`）组装成完整 JSON，写入 `{{HARNESS_MEMORY_DIR}}/plans/bdd.json`。务必是**合法 JSON**（无注释、无尾逗号、UTF-8）。无论后续走打回还是评审，都先落盘，**进度不丢**。

## Step 6 — 三态收尾（本回合最后一个动作）

依据 Step 4 结果分支，调用一次收尾命令后立即结束本回合：

- **有本轮新增未澄清缺口**（待澄清清单非空）→ 把清单汇成 notes 打回需求节点重新澄清：
  {{ADVANCE_FAIL notes=<逐条：FR-xxx 缺什么、为何写不出 given/then；纯未提及的写行为描述>}}
  （触发 onFail → rewind 到 req；req 会聚焦这些 gap 做 Gap Fill 后回流，本节点重跑时 Step 0 会自动去重）
- **无本轮新增缺口（完备）**→ 用 **AskUserQuestion** 向用户呈现评审：JSON 对人不友好，呈现时**把 `bdd.json` 渲染成可读 Gherkin 文本**（按 feature 列出各 scenario 的 Given-When-Then + Examples 摘要）放进问题描述，请其评审。选项：**批准 / 指出需调整的场景 / 补充澄清后重审**：
  - 批准 → {{ADVANCE_OK artifact={{HARNESS_MEMORY_DIR}}/plans/bdd.json}}（随后进入 `gate_bdd` 规范性硬门）
  - 指出需调整 → 按反馈改 `bdd.json` 后重新呈现（不退出本回合）
  - 补充澄清后重审：若用户的补充等于暴露了新的需求缺口 → 追加到 `clarifications` → 改走 ADVANCE_FAIL 打回
- **读不到 srs.md / 无法判定**（如 SRS 缺失或不可读，非需求内容问题）→ {{ADVANCE_BLOCKED notes=<原因>}}

> 不要臆测：必须真正读完 SRS、做完探索与完备性反推后再判定三态。
> 注意分工：本节点 ADVANCE_OK 后由 `gate_bdd` 机器校验 JSON **规范性**（结构/字段/examples 非空），若不规范会打回本节点修正——故 Step 5 落盘务必产出合法、字段齐全的 JSON。

## 反模式

| 合理化 | 正确回应 |
|--------|---------|
| "看一眼 design.md 就能把场景补全" | HARD-GATE 禁止。BDD 只描述需求行为；缺的场景是需求 gap，要打回 req，不能用设计私填。 |
| "把 SRS 的 EARS 句子直接抄成 then 就行" | 翻译式照搬不是行为用例。要写出可复现的 given + 可判定的 then + 具体 examples，照搬发现不了完备性缺口。 |
| "每个字段、每条 FR 都写满 scenario" | 违反 F（聚焦）。只覆盖关键功能点（Must/Should）+ 关键异常路径；trivial 项不单列。 |
| "存量没说清的也打回需求" | 先做 Step 2 自解：存量已有既定行为的，按存量写 then 并标注来源，不打回。只打回存量也无法澄清、且 SRS 未定的。 |
| "上轮打回过的 gap 这轮再提一次" | Step 0 去重铁律。只反馈本轮新发现且未提出过的项，否则与 req 死循环（maxAttempts=3 会 halt）。 |
| "then 写'应正常返回'即可" | 违反 S（自验证）。then 必须是明确二元断言（具体值 / 状态 / 错误码）。 |
| "examples 留空或写'见上'" | examples 每场景必填非空，给具体「输入 → 预期」取值；gate_bdd 校验非空，空则打回。 |
| "组合场景太麻烦，只写单域" | 多域组合是本节点核心价值之一（理清与存量交互）。Step 3.4：有存量交互就必须产出带 cross_domain 的场景；仅纯 greenfield 无交互可豁免。 |
| "多步场景凭直觉写就行" | 违反 Step 3.5。须按 SRS 明文规则把 when 逐步推一遍，确认 then 确能推得；推不通就改写或拆分场景，规则缺失则打回需求，不落盘自相矛盾的场景。 |
| "有缺口也先让用户评审完整版" | 有本轮新增缺口直接 ADVANCE_FAIL 打回 req；评审只在完备时进行，避免让用户反复审残缺产物。 |
