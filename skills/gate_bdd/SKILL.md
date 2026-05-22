---
name: gate_bdd
description: BDD 硬门 review skill：先运行 gate_bdd.cjs 校验 bdd.json 的结构/字段规范性，再人工复核各场景在 SRS 规则下的逻辑自洽性，按 OK/FAIL/BLOCKED 三态回报框架。
---

# BDD 规范性硬门

<!-- gate-wrapper: shared-scripts/gate_bdd.cjs -->
## 门禁校验（本节点唯一职责）

1. **结构规范性（脚本机检）**：运行 `node {{SCRIPTS}}/gate_bdd.cjs`，阅读其输出（stdout / 退出码，可能是 JSON 也可能是纯文本），判定 bdd.json 的结构与字段是否规范。

2. **逻辑自洽性（人工复核，脚本查不到）**：脚本只验格式，不验场景本身能否成立。Read `{{HARNESS_MEMORY_DIR}}/plans/srs.md` 与 bdd.json，逐场景核对 `given → when → then` 是否在 SRS 明文规则下成立；多步场景须按规则把 `when` 逐步推一遍，确认 `then` 确能推得、中途不会被规则拒绝或中断。仅就**明确**的自相矛盾或不可推得判负，并指实矛盾点（哪个场景、哪一步、与哪条规则冲突）。

3. **三态收尾**（本回合最后一个动作）：
   - **结构规范且场景自洽** → {{ADVANCE_OK}}
   - **结构不规范，或存在明确自相矛盾/不可推得的场景** → {{ADVANCE_FAIL notes=<写清不规范原因，或矛盾场景 id、矛盾点与整改方向，回传上游 bdd 节点>}}（触发整改打回 → bdd 修正或重出 JSON）
   - **脚本跑不起来 / 缺依赖 / 读不到 srs.md / 无法判定** → {{ADVANCE_BLOCKED notes=<原因>}}（一步可修的依赖缺失可先修后重跑，勿反复空耗）

不要臆测：必须真正运行脚本、读完 SRS 与 bdd.json 后再判定。bp-advance 是本回合最后一个动作，调用后立即结束本回合。
