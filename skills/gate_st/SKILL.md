---
name: gate_st
description: ST 验收对账硬门 — 脚本门禁 review skill：运行 gate_st.cjs，逐字段机检结构化 JSON 验收报告 st-acceptance.json 的 bdd_reconcile[] 是否覆盖 bdd.json 全部场景且均 verdict=PASS + evidence 非空、整体非 No-Go、无未关闭 Critical/Major，缺失/FAIL/无证据即打回 st，按 OK/FAIL/BLOCKED 三态回报框架。
---

# ST BDD 对账硬门（顶层，置于 st 之后）

校验系统测试是否在真实集成环境对**每一条** BDD 场景做了行为对账——这是与 loop 内 `gate_behavior`（单测/特性级）互补的系统级闸，捕获「单测真断言但集成接线断了」的逃逸。

<!-- gate-wrapper: shared-scripts/gate_st.cjs -->
## 门禁校验（本节点唯一职责）
1. 运行校验脚本：`node {{SCRIPTS}}/gate_st.cjs`。
2. 阅读脚本输出（stdout / 退出码，可能是 JSON 也可能是纯文本），自行判定校验结论，按三态收尾：
   - **通过**（st-acceptance.json 的 bdd_reconcile[] 覆盖 bdd.json 全部场景且均 verdict=PASS + evidence 非空、整体非 No-Go、无未关闭 Critical/Major）→ {{ADVANCE_OK}}
   - **未通过**（有场景未对账 / 判为 FAIL / PASS 但无 evidence / 整体 No-Go / 有未关闭 Critical/Major）→ {{ADVANCE_FAIL notes=<把未对账或 FAIL 的 scenario id 与整改要点写清，回传上游 st 节点>}}（触发整改打回 → st 补全/修正 st-acceptance.json 或修复 FAIL 项后重跑）
   - **st-acceptance.json 缺失 / 非合法 JSON / bdd.json 不可读 / 无法判定** → {{ADVANCE_BLOCKED notes=<原因>}}（若属一步可修的缺失，可先补后重跑，勿反复空耗）
3. 不要臆测脚本结果，必须真正运行脚本后再判定；bp-advance 是本回合最后一个动作，调用后立即结束本回合。
