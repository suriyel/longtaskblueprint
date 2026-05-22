#!/usr/bin/env node
// gate_red.cjs —— BDD 覆盖硬门（loop iter 体内，置于 red 之后）
// 校验：当前特性相关的 BDD 场景（优先按 task.bdd_ids 指派，回退 FR 交集）是否都被
//       red 产出的、带场景 id 标记的测试覆盖。这是「BDD 场景 → 测试代码」唯一一道
//       机检无损门——red 须为每个相关场景写带 id 标记（如 # BDD-001）的失败测试。
//
// v10 风格：由 review skill 的 LLM 直接 `node` 运行（无框架 stdin）。
// cwd 即蓝图工作区。当前 task 从 .harness/blueprint/state.json 的
// state.loops[<loopId>].tasks[taskIndex] 取（引擎已挑好当前任务）。
//
// stdout: 最后一行 JSON {pass: bool, message: string}
// exit:   0 always（LLM 读 stdout 决定 ok/failed/blocked 三态）
//
// 映射规则：相关场景 = task.bdd_ids 指派的场景（init 写入的权威指针）；task 无 bdd_ids 时
//           回退到 bdd.json 中 feature.fr ∩ task.srs_trace ≠ ∅ 的 feature 下全部 scenario。
//           与 gate_behavior 同口径——避免按 FR 沾边把它任务的场景误纳入本任务。
// 通过条件：每个相关场景的 id 都能在工作区测试/源码（排除 .harness 等）中以 BDD-\d+ 出现
// 不运行测试（red 阶段测试本应失败）——仅做覆盖标记静态核对。

const fs = require('fs');
const path = require('path');

const ID_TOKEN = /\bBDD-\d+\b/gi;
const MAX_REPORT = 40;

// 扫描排除目录 / 仅扫代码与测试扩展名 / 单文件大小上限 / 文件数预算
const IGNORE_DIRS = new Set([
  '.harness', 'node_modules', '.git', 'dist', 'build', 'out', '.venv', 'venv',
  '__pycache__', '.pytest_cache', 'target', 'coverage', '.next', '.nuxt',
  '.idea', '.vscode', '.gradle', 'bin', 'obj', 'vendor', '.tox', '.mypy_cache',
]);
const CODE_EXT = new Set([
  '.py', '.js', '.ts', '.tsx', '.jsx', '.mjs', '.cjs', '.java', '.go', '.rs',
  '.rb', '.cs', '.cpp', '.cc', '.cxx', '.c', '.h', '.hpp', '.hh', '.kt', '.kts',
  '.swift', '.php', '.scala', '.m', '.mm', '.feature', '.groovy', '.dart',
  '.ex', '.exs', '.clj', '.cljs', '.lua', '.pl', '.r',
]);
const MAX_FILE = 1024 * 1024; // 1MB
const FILE_BUDGET = 20000;

function emit(pass, message) {
  process.stdout.write(JSON.stringify({ pass: !!pass, message: String(message || '') }) + '\n');
  process.exit(0);
}
function isNonEmptyString(v) { return typeof v === 'string' && v.trim().length > 0; }

// 从 state.loops 里挑出「当前有任务的」loop —— 正常仅一个（iter）。
function pickCurrentTask(state) {
  const loops = (state && state.loops) || {};
  for (const ls of Object.values(loops)) {
    if (!ls || !Array.isArray(ls.tasks) || ls.exited) continue;
    const idx = (ls.taskIndex != null) ? ls.taskIndex : -1;
    if (idx >= 0 && idx < ls.tasks.length && ls.tasks[idx]) return ls.tasks[idx];
  }
  return null;
}

// 递归扫描工作区，收集出现过的 BDD-\d+（大写归一）。
function scanWorkspace(root) {
  const found = new Set();
  const budget = { files: FILE_BUDGET };
  (function walk(dir) {
    if (budget.files <= 0) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const e of entries) {
      if (budget.files <= 0) return;
      if (e.isSymbolicLink && e.isSymbolicLink()) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (IGNORE_DIRS.has(e.name)) continue;
        walk(full);
      } else if (e.isFile()) {
        if (!CODE_EXT.has(path.extname(e.name).toLowerCase())) continue;
        let st;
        try { st = fs.statSync(full); } catch (_) { continue; }
        if (st.size > MAX_FILE) continue;
        budget.files--;
        let txt;
        try { txt = fs.readFileSync(full, 'utf8'); } catch (_) { continue; }
        const m = txt.match(ID_TOKEN);
        if (m) for (const t of m) found.add(t.toUpperCase());
      }
    }
  })(root);
  return found;
}

(async () => {
  try {
    const cwd = process.cwd();

    // ---- 当前 task ----
    let state = {};
    try { state = JSON.parse(fs.readFileSync(path.join(cwd, '.harness', 'blueprint', 'state.json'), 'utf8')); }
    catch (_) { emit(false, '无法读取 .harness/blueprint/state.json（loop 状态不可读，无法定位当前 task）'); }

    const task = pickCurrentTask(state);
    if (!task) emit(false, '未能在 state.loops 中定位当前 task（tasks 为空或 taskIndex 越界）');
    const tid = task.id;
    const srsTrace = Array.isArray(task.srs_trace)
      ? task.srs_trace.filter(isNonEmptyString).map((s) => s.trim())
      : [];
    const bddIds = Array.isArray(task.bdd_ids)
      ? task.bdd_ids.filter(isNonEmptyString).map((s) => s.trim().toUpperCase())
      : [];

    // task 既无 bdd_ids 也无 srs_trace → 无法映射相关场景，跳过（属 init 职责，非 red 之过）
    if (bddIds.length === 0 && srsTrace.length === 0) {
      emit(true, `task#${tid} 既无 bdd_ids 也无 srs_trace，无法映射 BDD 场景，跳过覆盖校验`);
    }

    // ---- bdd.json → 相关场景 id 集 ----
    const bddPath = path.join(cwd, '.harness', 'memory', 'plans', 'bdd.json');
    if (!fs.existsSync(bddPath)) {
      emit(false, 'bdd.json 缺失: ' + path.relative(cwd, bddPath) + '（应由上游 bdd 节点产出）');
    }
    let bdd;
    try { bdd = JSON.parse(fs.readFileSync(bddPath, 'utf8')); }
    catch (e) { emit(false, 'bdd.json 不是合法 JSON: ' + e.message); }
    if (!bdd || typeof bdd !== 'object' || !Array.isArray(bdd.features)) {
      emit(false, 'bdd.json 结构异常（features 非数组），无法映射相关场景');
    }

    // 全量索引：大写 id -> { label, frHit }（frHit = feature.fr ∩ task.srs_trace ≠ ∅）
    const scenarioById = new Map();
    for (const feat of bdd.features) {
      if (!feat || typeof feat !== 'object' || !Array.isArray(feat.scenarios)) continue;
      const fname = isNonEmptyString(feat.feature) ? feat.feature.trim() : '?';
      const frHit = Array.isArray(feat.fr)
        && feat.fr.some((f) => typeof f === 'string' && srsTrace.includes(f.trim()));
      for (const sc of feat.scenarios) {
        if (!sc || typeof sc !== 'object' || !isNonEmptyString(sc.id)) continue;
        const id = sc.id.trim().toUpperCase();
        const label = fname + ' / ' + (isNonEmptyString(sc.scenario) ? sc.scenario.trim() : id);
        scenarioById.set(id, { label, frHit });
      }
    }

    // 相关场景：优先 task.bdd_ids（init 写入的权威指针），否则兜底 fr ∩ srs_trace。
    // 与 gate_behavior 同口径，避免按 FR 沾边把它任务的场景误纳入本任务。
    const relevant = new Map(); // 大写 id -> 可读标签
    let unknownNote = '';
    if (bddIds.length) {
      const unknown = [];
      for (const id of bddIds) {
        const meta = scenarioById.get(id);
        if (meta) relevant.set(id, meta.label);
        else unknown.push(id);
      }
      if (unknown.length) {
        unknownNote = `\n⚠ task.bdd_ids 含 bdd.json 中不存在的 id：${unknown.join(',')}`
          + `（init 指派与 bdd 产出不一致，请核对；本门仅按已存在的场景校验覆盖）`;
      }
    } else {
      for (const [id, meta] of scenarioById) {
        if (meta.frHit) relevant.set(id, meta.label);
      }
    }

    if (relevant.size === 0) {
      emit(true, `task#${tid}（bdd_ids=${bddIds.join(',') || '∅'}, srs_trace=${srsTrace.join(',') || '∅'}）无映射到的 BDD 场景，覆盖校验通过（空集）${unknownNote}`);
    }

    // ---- 扫描工作区测试/源码 ----
    const found = scanWorkspace(cwd);
    const missing = [];
    for (const [id, label] of relevant) {
      if (!found.has(id)) missing.push(id + '（' + label + '）');
    }

    if (missing.length) {
      const shown = missing.slice(0, MAX_REPORT);
      const more = missing.length > MAX_REPORT ? `\n…另有 ${missing.length - MAX_REPORT} 个未列出` : '';
      emit(false, `BDD 覆盖不全：task#${tid} 有 ${missing.length}/${relevant.size} 个相关场景未在测试代码中找到 id 标记：\n- ${shown.join('\n- ')}${more}\n`
        + `（请为每个缺失场景补写一条失败测试并以其 id 打标，如注释 # ${[...relevant.keys()][0]}；bdd_ids=${bddIds.join(',') || '∅'}）${unknownNote}`);
    }

    emit(true, `BDD 覆盖校验通过：task#${tid} 的 ${relevant.size} 个相关场景 id 均在测试代码中出现${unknownNote}`);
  } catch (e) {
    emit(false, 'gate_red 内部错误（请检查 state.json / bdd.json 可读性）: ' + (e && e.message ? e.message : String(e)));
  }
})();
