---
name: st
description: "当所有 task 均 passing 后运行一次 — 跨特性 / 系统级测试 + BDD 行为对账：在真实集成环境逐条 replay bdd.json 场景，确认整体系统行为与用例一致，产出结构化 JSON 验收报告 st-acceptance.json（含 bdd_reconcile/rtm/defects/verdict）供 gate_st 机检核实。"
---

**语言规则**：用中文（简体）回复用户；生成的文档与报告用中文。代码标识符、JSON 字段名保持英文。

# 系统测试 —— 跨特性校验 + BDD 行为对账

loop 内每个 task 已在 `gate_behavior` 单测/特性级核验过自身 BDD 行为。本阶段聚焦逐 task **无法**覆盖的：跨特性交互、多特性 E2E、系统级 NFR、兼容性、探索性测试，**以及在真实集成环境对全部 BDD 场景做一次行为对账**——堵住「单测真断言但集成接线断了」的逃逸（Mock-Leaked / Integration 类）。

## 输入

- 任务全集：`{{TASKS_GET}}`（取代独立 feature 清单文件——读 `srs_trace` / `bdd_ids` / `dependencies` / `category`）
- SRS：`{{HARNESS_MEMORY_DIR}}/plans/srs.md`（FR/NFR/IFR/CON、角色、术语）
- 设计：`{{HARNESS_MEMORY_DIR}}/plans/design.md`（架构、内部接口契约、外部接口）
- **BDD 用例：`{{HARNESS_MEMORY_DIR}}/plans/bdd.json`**（行为对账的权威源）
- 项目上下文：`{{HARNESS_MEMORY_DIR}}/plans/project-context.md`（tech_stack / 约束 / 假设）

## Checklist（按序，每步建 TodoWrite）

### 1. 就绪关卡
- `{{TASKS_GET}}` 全部 `status == "passing"`；否则停止本节点，{{ADVANCE_BLOCKED notes=<列出未通过 task>}}。
- 用项目方式激活环境/启动服务（CLI/纯库项目跳过）；服务起不来则记 BLOCKED，不静默跳过。

### 2. 回归
- 用项目测试命令跑**全量**测试套件；零失败、零错误；覆盖率阈值达标。任一失败 = 回归 → 先诊断。

### 3. 集成 / 全链路冒烟
- 对每对共享数据/状态/接口的 task（按 `dependencies[]` 图）：用**真实**资源（真实 DB/网络/文件系统，非 mock）校验跨边界数据流与契约。
- 至少 1 条真实端到端冒烟路径（input → 处理 → 持久化 → 读回 → output），全程无 mock。失败 = Critical。

### 4. 跨特性 E2E
- 对 SRS 每个角色，抽取**跨多特性**的主工作流（happy + 错误恢复），设初态 → 执行 → 校验中间与最终态 → 清理。
- UI 特性：用真实渲染环境（如 jsdom/happy-dom 或 Chrome DevTools MCP，视项目而定）做基于界面的 E2E。

### 5. **BDD 行为对账（本阶段核心，L4）**
Read `{{HARNESS_MEMORY_DIR}}/plans/bdd.json`，对**每一条** scenario，在**真实集成环境**（不 mock 产出可观察结果的表面；UI 用真实渲染环境、服务用真实服务/真实 I/O）逐条 replay：
1. 按 `given` 建初始状态；
2. 按 `when` 触发；
3. **断言 `then`/`examples` 的精确可观察值**（精确字符串/状态码/返回结构/持久化记录等，随技术栈而定）。
对账须落到**实测证据**：记录每条 scenario 的 `expected`（取自 then/examples 的精确值）、`actual`（真实环境实测值）、`evidence`（测试/命令/路径），判 `PASS` / `FAIL`。任一 `then` 在真实环境不匹配 = **Critical 缺陷**（典型：单测 mock 了可观察面而集成下真实实现偏离用例）。结果在 Step 8 落成结构化 JSON。

### 6. 系统级 NFR / 兼容性 / 探索性
- NFR：对 SRS 每个 NFR-xxx 用实测值校验（性能 p50/p95、安全输入校验/依赖扫描、可靠性降级等），记录实测 vs 阈值。
- 兼容性：SRS 指定多平台/浏览器/runtime 时逐目标跑；否则跳过。
- 探索性：每主特性区一个 charter，时间盒 15-30 分钟，记录发现。

### 7. 缺陷 Triage + 逃逸分析
- 按 Critical/Major/Minor/Cosmetic 分级；Critical/Major 阻塞 Go。
- 每个缺陷标 **Escaped From**（Unit / Behavior-Gate / Mock-Leaked / Integration / Spec）以暴露系统性缺口。
- 存在 Critical/Major：把受影响 task 在引擎里标回 failing 并回 loop 修（本节点 {{ADVANCE_BLOCKED}} 说明，由上层决策回退），修后重跑受影响类别。

### 8. 验收报告（结构化 JSON —— 权威产物，供 gate_st 机检核实）
生成 `{{HARNESS_MEMORY_DIR}}/plans/st-acceptance.json`（**这是 gate_st 校验的权威验收报告**，字段如下）：

```json
{
  "schemaVersion": 1,
  "reconciledAt": "<ISO8601 时间>",
  "environment": "<真实环境描述，如 jsdom / 真实服务 + 真实 DB>",
  "bdd_reconcile": [
    {
      "id": "BDD-001",
      "verdict": "PASS",                 // PASS | FAIL（大小写不敏感）
      "expected": "<then/examples 的精确可观察值>",
      "actual": "<真实环境实测值>",
      "evidence": "<测试名/命令/输出片段/文件路径等可核实证据，非空>"
    }
    // bdd.json 中每条 scenario 一条，不得遗漏
  ],
  "rtm": [                                // 需求覆盖（推荐）
    { "req": "FR-001", "approach": "<测试方式>", "result": "PASS" }
  ],
  "defects": [                            // 缺陷（如有）
    { "severity": "Critical", "escaped_from": "Mock-Leaked", "desc": "<描述>", "status": "open" }
  ],
  "verdict": "Go"                         // Go | Conditional-Go | No-Go
}
```

**硬约束（gate_st 逐字段机检）**：bdd.json 每条 `scenario.id` 在 `bdd_reconcile[]` 都有一条 `verdict=="PASS"` 且 `evidence` 非空的记录；整体 `verdict != "No-Go"`；`defects[]` 中无未关闭（status ∉ fixed/deferred/closed）的 Critical/Major。

（可选）另产出人读版 `{{HARNESS_MEMORY_DIR}}/plans/st-report.md`（Executive Summary / RTM / Test Execution / Defect / Risk / Recommendations）作为叙述视图——但**验收核实以 st-acceptance.json 为准**，markdown 仅供阅读，gate 不校验它。

### 9. Verdict + 收尾
- 按出口标准（回归全绿 / 每边界真实集成 / 全部 BDD 场景对账 PASS / 无未关闭 Critical/Major / RTM 100%）给 Go / Conditional-Go / No-Go，写入报告。
- **收尾**：
  - `st-acceptance.json` 齐全且 Go/Conditional-Go → {{ADVANCE_OK artifact={{HARNESS_MEMORY_DIR}}/plans/st-acceptance.json}}（随后进入 `gate_st` 对账硬门）
  - 存在未关闭 Critical/Major（含任一 BDD 对账 FAIL）/ 环境起不来 / 全量测试跑不通 → {{ADVANCE_BLOCKED notes=<原因与受影响 task / scenario>}}

## 关键规则
- **证据导向裁决** —— 每个 PASS 必有实测证据；"看着行"不是证据。
- **BDD 对账不可遗漏** —— bdd.json 每条 scenario 都须在真实环境 replay 并在 `st-acceptance.json` 的 `bdd_reconcile[]` 留 PASS + evidence；`gate_st` 逐 id 机检该 JSON。
- **可观察面禁 mock** —— 对账 replay 中产出 `then` 可观察结果的表面不得 mock（见 `{{SHARE-REFERENCE}}/testing-anti-patterns.md` 反模式 6）。
- **所有 bug 都必须修** —— ST 中发现的任何缺陷（前端/后端/集成）发布前必修，无"不是我的代码"豁免。
- **ST 期间无新特性** —— 按原样测试已集成系统。
