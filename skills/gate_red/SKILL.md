---
name: gate_red
description: BDD 覆盖硬门 — 脚本门禁 review skill：运行 gate_red.cjs，按 FR 交集算出当前特性相关的 BDD 场景，grep 工作区测试文件核对每个场景 id 都有带标记的测试覆盖（缺一即打回 red），按 OK/FAIL/BLOCKED 三态回报框架。
---

# BDD 覆盖硬门（环内，置于 red 之后）

<!-- gate-wrapper: shared-scripts/gate_red.cjs -->
## 门禁校验（本节点唯一职责）
1. 运行校验脚本：`node {{SCRIPTS}}/gate_red.cjs`。
2. 阅读脚本输出（stdout / 退出码，可能是 JSON 也可能是纯文本），自行判定校验结论，按三态收尾：
   - **通过** → {{ADVANCE_OK}}
   - **未通过**（脚本明确判定有相关 BDD 场景未被任何带 id 标记的测试覆盖）→ {{ADVANCE_FAIL notes=<把缺失的场景 id 与整改要点写清，回传上游 red 节点>}}（触发整改打回 → red 为缺失场景补写带标记的失败测试）
   - **脚本跑不起来 / 缺依赖 / 无法判定** → {{ADVANCE_BLOCKED notes=<原因>}}（若属一步可修的依赖缺失，可先修后重跑，勿反复空耗）
3. 不要臆测脚本结果，必须真正运行脚本后再判定；bp-advance 是本回合最后一个动作，调用后立即结束本回合。
