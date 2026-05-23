#!/usr/bin/env node
// gate_srs.cjs —— SRS 硬门
// 检查 .harness/memory/plans/srs.md 存在且含必填段落。
//
// stdin: {schemaVersion:2, cwd, ...}
// stdout: 最后一行 JSON {pass: bool, message: string}
// exit: 0 normal / 2 schema error

const fs = require('fs');
const path = require('path');

function emit(pass, message) {
  process.stdout.write(JSON.stringify({ pass: !!pass, message: String(message || '') }) + '\n');
  process.exit(0);
}

// ---- 粒度软告警（仅在校验通过时附加，不改 pass）-------------------------------
// 脚本估不了 LOC，只能数 FR 数与每 FR 的 AC 分布——这些是弱代理指标，故只作「建议」，
// pass 恒保持 true，最终裁量交给 gate_srs review skill 的 LLM（见 skills/gate_srs/SKILL.md）。
// 目的：补「纯靠 req Step 5 提示词约束、LLM 可能跳过 G/S 检测」的洞，把过度拆解信号摆到台面。
function granularityAdvisory(content) {
  // 1) 切出每个 FR 段落：### FR-001[: 标题] ... 直到下一个 FR 段头或文件尾
  // 注：只匹配纯数字 ID（FR-003a 这类字母后缀不命中）；门禁跑的是 Step 8.2 保存前已「按顺序重编为三位数字」的终态 SRS，故无碍。
  const headerRe = /(^|\n)#{2,4}\s*FR[-_]?(\d+)\b([^\n]*)/g;
  const heads = [];
  let m;
  while ((m = headerRe.exec(content)) !== null) {
    heads.push({ id: m[2], title: (m[3] || '').replace(/^[:：\s]+/, '').trim(), start: m.index + m[1].length });
  }
  if (heads.length === 0) return ''; // 非 ### FR-N 格式 → 不给信号，避免误判

  // 2) 每个 FR 段内数验收标准（AC）条目
  const acCounts = [];
  for (let i = 0; i < heads.length; i++) {
    const segEnd = i + 1 < heads.length ? heads[i + 1].start : content.length;
    const seg = content.slice(heads[i].start, segEnd);
    let acBlock = seg;
    const acMark = seg.search(/(验收标准|验收准则|接受准则|Acceptance Criteria)/i);
    if (acMark >= 0) {
      const after = seg.slice(acMark);
      const nl = after.indexOf('\n');
      const body = nl >= 0 ? after.slice(nl + 1) : '';
      // 验收块止于下一个 **加粗段** 或 --- 分隔线
      const stop = body.search(/\n\s*(\*\*[^*\n]+\*\*|---)/);
      acBlock = stop >= 0 ? body.slice(0, stop) : body;
    }
    // 数项目符号行作 AC 数；若某项目把 Given/When/Then 拆成多行 bullet，会高估 AC 数 →
    // 偏向「少报过度拆解」（保守，安全方向，对软告警可接受）。
    acCounts.push((acBlock.match(/^\s*[-*]\s+\S/gm) || []).length);
  }

  const n = heads.length;
  const sorted = acCounts.slice().sort((a, b) => a - b);
  const sum = acCounts.reduce((a, b) => a + b, 0);
  const avg = sum / n;
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const lowFRs = acCounts.filter((c) => c <= 2).length; // 各仅 1-2 个 AC 的 FR 数

  // 3) 过度拆解软告警（任一命中即提示）
  const flags = [];
  if (avg < 2) flags.push('平均 AC/FR < 2');
  if (lowFRs >= 3) flags.push('有 ' + lowFRs + ' 个 FR 各仅 1-2 个 AC');
  if (n >= 8 && avg < 3) flags.push('FR 数 ' + n + ' 且平均 AC/FR < 3');

  // 4) 同源线索：FR 标题中被 ≥2 个 FR 共用的词（英文标识 / 中文 2-gram），提示可能该按 S5 聚合
  // 注：中文 2-gram 会带少量噪声 bigram（如「令执」），无害——只指向同一簇，且仅作建议；不值得引入分词器。
  const tokenFRs = {};
  for (const h of heads) {
    const tokens = new Set();
    for (const t of (h.title.match(/[A-Za-z_][A-Za-z0-9_]{2,}/g) || [])) tokens.add(t.toLowerCase());
    for (const cj of (h.title.match(/[一-龥]{2,}/g) || [])) {
      for (let k = 0; k + 2 <= cj.length; k++) tokens.add(cj.slice(k, k + 2));
    }
    for (const t of tokens) (tokenFRs[t] = tokenFRs[t] || new Set()).add(h.id);
  }
  const hints = Object.entries(tokenFRs)
    .filter(([, set]) => set.size >= 2)
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, 6)
    .map(([tok, set]) => '「' + tok + '」→ '
      + Array.from(set).sort((a, b) => Number(a) - Number(b)).map((x) => 'FR-' + x).join('/'));

  let msg = '\n[粒度信号] FR 数=' + n + '；AC/FR min=' + sorted[0] + ' 中位=' + median
    + ' max=' + sorted[n - 1] + ' 平均=' + avg.toFixed(1) + '。';
  if (flags.length) msg += '\n⚠ 疑似过度拆解（' + flags.join('；') + '），建议复核 req Step 5 的 S5 同源兄弟聚合。';
  if (hints.length) msg += '\n标题同源线索（核对是否应按 S5 聚合）：' + hints.join('；') + '。';
  return msg;
}

(async () => {
  // v10: 脚本由 review skill 的 LLM 直接 `node` 运行（无框架 stdin）。
  // cwd 即 LLM 运行目录（= 蓝图工作区）；不再读 schemaVersion stdin。

  const srsPath = path.join(process.cwd(), '.harness', 'memory', 'plans', 'srs.md');
  if (!fs.existsSync(srsPath)) {
    emit(false, 'SRS 未生成: ' + path.relative(process.cwd(), srsPath));
  }

  const content = fs.readFileSync(srsPath, 'utf8');
  // 宽松匹配：允许编号前缀 (## 4. 功能需求 / ## 4 功能需求 / ### FR-001 等)
  const required = [
    { re: /(^|\n)##+\s+[\d\.\s]*\s*(Functional Requirements|功能需求|功能性需求|Functional Reqs)|(^|\n)###?\s*FR[-_]?\d+/i, name: 'FR 段（含 Functional Requirements / 功能需求 / FR-N）' },
    { re: /(^|\n)##+\s+[\d\.\s]*\s*(Acceptance Criteria|验收标准|验收准则|接受准则|AC)|(^|\n)###?\s*AC[-_]?\d+/i, name: '验收准则段（含 Acceptance Criteria / 验收 / AC-N）' }
  ];
  const missing = [];
  for (const r of required) if (!r.re.test(content)) missing.push(r.name);

  if (missing.length) {
    emit(false, 'SRS 缺必填段落: ' + missing.join('；') + '\n（路径：' + path.relative(process.cwd(), srsPath) + '，长度 ' + content.length + ' chars）');
  }
  if (content.length < 500) {
    emit(false, 'SRS 内容过短 (' + content.length + ' < 500 chars)，疑似桩文件');
  }
  emit(true, 'SRS 校验通过 (' + content.length + ' chars)' + granularityAdvisory(content));
})();
