#!/usr/bin/env node
// gate_bdd.cjs —— BDD 规范性硬门
// 校验 bdd 节点产出的 .harness/memory/plans/bdd.json 的结构/字段/取值规范性。
//
// v10: 由 review skill 的 LLM 直接 `node` 运行（无框架 stdin）。
// cwd 即 LLM 运行目录（= 蓝图工作区）。
//
// stdout: 最后一行 JSON {pass: bool, message: string}
// exit:   0 always（LLM 读 stdout 决定 ok/failed/blocked 三态）
//
// schema（按 feature 分组 + examples 数组）：
//   { features: [ { feature, fr:[FR-xxx], scenarios: [
//       { scenario, given:[], when:[], then:[], examples:[], cross_domain? } ] } ],
//     clarifications: [ "FR-xxx: ..." ] }
//
// 硬校验（违反即 fail → 打回 bdd 重出规范 JSON）：
//   - 合法 JSON 且顶层为对象
//   - features 非空数组；clarifications 为字符串数组（存在，可空）
//   - 每 feature: feature 非空字符串 + fr 非空数组(每项匹配 ^[A-Z]{2,4}-\d+$) + scenarios 非空数组
//   - 每 scenario: scenario 非空; given/when/then/examples 均为非空字符串数组;
//                  cross_domain 若存在须为非空字符串
// 软（仅告警不 fail）：零 cross_domain 场景

const fs = require('fs');
const path = require('path');

const FR_PATTERN = /^[A-Z]{2,4}-\d+$/;
const MAX_REPORT = 25; // 报告的错误条数上限，避免 message 爆长

function emit(pass, message) {
  process.stdout.write(JSON.stringify({ pass: !!pass, message: String(message || '') }) + '\n');
  process.exit(0);
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}
function isNonEmptyStringArray(v) {
  return Array.isArray(v) && v.length > 0 && v.every(isNonEmptyString);
}

(async () => {
  const cwd = process.cwd();
  const bddPath = path.join(cwd, '.harness', 'memory', 'plans', 'bdd.json');
  const rel = path.relative(cwd, bddPath);

  if (!fs.existsSync(bddPath)) {
    emit(false, 'BDD 用例未生成: ' + rel);
  }

  let raw;
  try { raw = fs.readFileSync(bddPath, 'utf8'); }
  catch (e) { emit(false, '读取失败: ' + e.message + '（' + rel + '）'); }

  let doc;
  try { doc = JSON.parse(raw); }
  catch (e) { emit(false, 'bdd.json 不是合法 JSON: ' + e.message + '（请去掉注释/尾逗号，' + rel + '）'); }

  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    emit(false, 'bdd.json 顶层必须是对象 {features, clarifications}');
  }

  const errors = [];
  const warnings = [];

  // ---- 顶层容器 ----
  if (!Array.isArray(doc.features) || doc.features.length === 0) {
    errors.push('顶层 features 必须是非空数组');
  }
  if (!Array.isArray(doc.clarifications)) {
    errors.push('顶层 clarifications 必须是数组（字符串数组，无缺口则 []）');
  } else {
    for (let i = 0; i < doc.clarifications.length; i++) {
      if (!isNonEmptyString(doc.clarifications[i])) errors.push('clarifications[' + i + ']: 必须是非空字符串');
    }
  }

  // 顶层结构若已坏，直接报，不再深入（避免误导性级联报错）
  if (errors.length) {
    emit(false, 'BDD 规范性校验未通过：' + errors.join('；') + '\n（路径：' + rel + '）');
  }

  // ---- 逐 feature / scenario ----
  let scenarioCount = 0;
  let crossDomainCount = 0;

  for (let fi = 0; fi < doc.features.length; fi++) {
    const feat = doc.features[fi];
    const fp = 'features[' + fi + ']';
    if (feat === null || typeof feat !== 'object' || Array.isArray(feat)) {
      errors.push(fp + ': 必须是对象'); continue;
    }
    if (!isNonEmptyString(feat.feature)) errors.push(fp + ': 缺非空 feature（能力名）');
    const fname = isNonEmptyString(feat.feature) ? feat.feature : '?';

    // fr：非空数组 + 模式
    if (!Array.isArray(feat.fr) || feat.fr.length === 0) {
      errors.push(fp + ' (' + fname + '): fr 必须是非空数组（追溯 FR-xxx）');
    } else {
      for (const f of feat.fr) {
        if (typeof f !== 'string' || !FR_PATTERN.test(f)) {
          errors.push(fp + ' (' + fname + '): fr 项 "' + f + '" 应匹配 ^[A-Z]{2,4}-\\d+$（如 FR-001）');
        }
      }
    }

    if (!Array.isArray(feat.scenarios) || feat.scenarios.length === 0) {
      errors.push(fp + ' (' + fname + '): scenarios 必须是非空数组'); continue;
    }

    for (let si = 0; si < feat.scenarios.length; si++) {
      const sc = feat.scenarios[si];
      const sp = fp + '.scenarios[' + si + ']';
      if (sc === null || typeof sc !== 'object' || Array.isArray(sc)) {
        errors.push(sp + ': 必须是对象'); continue;
      }
      scenarioCount++;
      const sname = isNonEmptyString(sc.scenario) ? sc.scenario : '#' + si;

      if (!isNonEmptyString(sc.scenario)) errors.push(sp + ': 缺非空 scenario（场景名）');

      // given / when / then / examples：均非空字符串数组
      for (const key of ['given', 'when', 'then', 'examples']) {
        if (!isNonEmptyStringArray(sc[key])) {
          errors.push(sp + ' (' + sname + '): ' + key + ' 必须是非空字符串数组');
        }
      }

      // cross_domain 可选；存在则须非空字符串
      if ('cross_domain' in sc) {
        if (!isNonEmptyString(sc.cross_domain)) {
          errors.push(sp + ' (' + sname + '): cross_domain 若存在须为非空字符串（"模块名 @ file:line"）');
        } else {
          crossDomainCount++;
        }
      }

      if (errors.length > MAX_REPORT) break;
    }
    if (errors.length > MAX_REPORT) break;
  }

  // ---- 软告警 ----
  if (crossDomainCount === 0) {
    warnings.push('未产出带 cross_domain 的跨域组合场景（若本需求确无存量交互可忽略；否则应补）');
  }

  if (errors.length) {
    const shown = errors.slice(0, MAX_REPORT);
    const more = errors.length > MAX_REPORT ? `\n…另有 ${errors.length - MAX_REPORT} 条未列出` : '';
    const warn = warnings.length ? '\n[告警] ' + warnings.join('；') : '';
    emit(false, 'BDD 规范性校验未通过（' + errors.length + ' 项）：\n- ' + shown.join('\n- ') + more + warn + '\n（路径：' + rel + '）');
  }

  const warn = warnings.length ? '；[告警] ' + warnings.join('；') : '';
  emit(true, `BDD 规范性校验通过：${doc.features.length} 个 feature / ${scenarioCount} 个 scenario / ${crossDomainCount} 个跨域组合 / ${doc.clarifications.length} 项待澄清${warn}`);
})();
