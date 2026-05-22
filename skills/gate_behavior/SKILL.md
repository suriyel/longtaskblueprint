---
name: gate_behavior
description: BDD 行为门 — 复合门 review skill：运行 gate_behavior.cjs 真跑测试并采集逐场景行为保真证据（带标记测试块、疑似 mock 可观察面、then 精确值命中），由你读证据裁定「每个相关 BDD 场景的 then 是否被真实精确断言、可观察面是否被 mock 顶替」，按 OK/FAIL/BLOCKED 三态回报框架。
---

# BDD 行为门（环内，置于 refactor 之后）

本门补上 `gate_red` 的天花板：`gate_red` 只验「`BDD-xxx` token 在场」，本门进一步**真跑测试 + 核验断言保真**——确保每个相关 BDD 场景的 `then`/`examples` **可观察值真的被精确断言**，且产出该值的**可观察面没有被整模块 mock 顶替**（详见 `{{SHARE-REFERENCE}}/testing-anti-patterns.md` 反模式 6）。

这是**复合门**：脚本做语言无关的客观采证（跑测试、定位带标记测试块、抽 then 期望值、标记疑似 mock），最终「断言是否真覆盖 then 语义」由你读证据裁定。

<!-- gate-wrapper: shared-scripts/gate_behavior.cjs -->
## 门禁校验（本节点唯一职责）

1. 运行校验脚本：`node {{SCRIPTS}}/gate_behavior.cjs`。**必须真正运行后再判定，不得臆测。**
2. 读完整 stdout：先是「证据报告」（逐场景列出 then/examples 原文、期望可观察 token、带标记测试块片段、疑似 mock 行、期望值命中数），最后一行是 JSON `{pass, message, blocked}`（机检初判，**仅供参考**）。
3. **逐个相关 BDD 场景**按下面判据裁定（脚本的 pass 是 advisory，你要据证据复核，尤其是「期望值是否真被断言」这步机检无法确证）：
   - **该场景的 `then`/`examples` 可观察值是否被精确断言？** 读测试块片段：断言目标必须是 then 描述的最终可观察输出的**精确值**（精确字符串/状态码/返回结构等），而非仅「被调用过」（视框架而定的 was-called 类断言）。期望值命中为 0 且 then 有具体可观察值 → 判为未断言。
   - **产出该 `then` 的可观察面是否被 mock 顶替？** 看「疑似 mock」证据：若所 mock 的目标正是产出本场景 then 可观察结果的那张表面（断言本应直接读取它）→ 违规。若 mock 只打在更外层真实边界（网络/三方/时钟/文件系统）则不算违规。
   - **测试是否全绿？** 行为只能在绿测试上核验；测试未全绿则不能放行。
4. 据裁定按三态收尾：
   - **全部相关场景的 then 均被真实精确断言、可观察面未被顶替、测试全绿** → {{ADVANCE_OK}}
   - **任一场景：漏覆盖 / 可观察面被 mock / 仅"被调用过"未断言 then 精确值 / 测试未全绿** → {{ADVANCE_FAIL notes=<逐 id 写清：期望的 then 可观察值是什么、当前测试为何未真正断言它（漏标记/被 mock/仅断言被调用）、整改要点，回传上游 red>}}（触发打回 → red 改写为不 mock 可观察面、断言 then 精确值的测试）
   - **测试跑不起来 / 缺依赖 / 框架报错 / 无法判定，且无具体行为缺口** → {{ADVANCE_BLOCKED notes=<原因；若属一步可修的依赖缺失，可先修后重跑，勿反复空耗>}}
5. **降级护栏**：若打回原因是「某场景 then 的精确预期值在 wd §测试清单中根本不存在」（= wd 漏写预期值，red 无从下手），应让 red 走其 BLOCKED 护栏指向 wd，而非要求 red 硬编预期值。
6. bp-advance 是本回合最后一个动作，调用后立即结束本回合。
