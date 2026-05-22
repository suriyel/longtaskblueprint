#!/usr/bin/env node
// gate_behavior.cjs —— BDD 行为门（loop iter 体内，置于 refactor 之后，body 末节点）
//
// 与 gate_red 的本质区别：gate_red 只静态 grep「BDD-\d+ token 是否在场」，不验断言保真。
// gate_behavior 进一步**真跑测试** + 采集「逐场景行为保真证据」，交由 review skill 的 LLM 终判：
//   - 每个相关 BDD 场景的 then/examples「精确可观察值」是否真的被断言（而非仅"被调用过"）；
//   - 产出该 then 的可观察面是否被整模块 mock 顶替。
//
// 设计：本脚本是**证据采集器 + 机检初判**（语言无关，纯字符串/进程操作）；
//       「断言是否真覆盖 then 语义」这一判断由 SKILL.md 的 LLM 读证据后裁定（复合门）。
//       这样既躲开跨语言断言 AST 解析的脆性，又保留机检的客观锚点。
//
// v10 风格：由 review skill 的 LLM 直接 `node` 运行（无框架 stdin）。cwd 即蓝图工作区。
// 当前 task 从 .harness/blueprint/state.json 的 state.loops[<loopId>].tasks[taskIndex] 取。
//
// stdout: 多行「证据报告」+ 最后一行 JSON {pass, message, blocked}
// exit:   0 always（LLM 读 stdout 决定 OK/FAIL/BLOCKED 三态）

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ID_TOKEN = /\bBDD-\d+\b/gi;
const MAX_REPORT = 40;
const BLOCK_RADIUS = 16;     // 标记行上下各取 N 行作为「测试块」近似
const SNIPPET_MAX = 1400;    // 单个证据片段字节上限

// 扫描排除目录 / 仅扫代码与测试扩展名 / 单文件大小上限 / 文件数预算（与 gate_red 对齐）
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

// 整模块 / 整符号「打桩」的跨生态指示（非穷尽——仅作证据，最终由 LLM 判定是否命中可观察面）。
// 故意不含 spyOn / 单方法 stub 这类「外层边界 mock」常见且合法的形态。
const MOCK_PATTERNS = [
  /\bvi\.mock\s*\(/,            // vitest
  /\bjest\.mock\s*\(/,          // jest
  /\bjest\.doMock\s*\(/,
  /\bmock\.module\s*\(/,        // bun
  /@\s*patch\s*\(/,             // python unittest.mock 装饰器
  /@\s*mock\.patch\s*\(/,
  /\bmock\.patch\s*\(/,         // python 上下文/直接
  /\bmocker\.patch\s*\(/,       // pytest-mock
  /\bMockito\.mock\s*\(/,       // java
  /@\s*Mock\b/,                 // java mockito 注解
  /\bgomock\b/,                 // go
  /\bsinon\.(stub|mock|replace)\s*\(/, // js sinon
  /\bunittest\.mock\b/,
];

function emit(pass, message, blocked) {
  process.stdout.write(JSON.stringify({ pass: !!pass, message: String(message || ''), blocked: !!blocked }) + '\n');
  process.exit(0);
}
function isNonEmptyString(v) { return typeof v === 'string' && v.trim().length > 0; }
function clip(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n) + ' …[truncated]' : s; }

// 从 state.loops 里挑出「当前有任务的」loop（与 gate_red 一致）。
function pickCurrentTask(state) {
  const loops = (state && state.loops) || {};
  for (const ls of Object.values(loops)) {
    if (!ls || !Array.isArray(ls.tasks) || ls.exited) continue;
    const idx = (ls.taskIndex != null) ? ls.taskIndex : -1;
    if (idx >= 0 && idx < ls.tasks.length && ls.tasks[idx]) return ls.tasks[idx];
  }
  return null;
}

// 递归扫描工作区：记录每个 BDD-\d+ 出现的位置 id -> [{file, line}]。
function scanWorkspaceLocations(root) {
  const locs = new Map(); // 大写 id -> [{file(rel), line(1-based)}]
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
        if (!ID_TOKEN.test(txt)) { ID_TOKEN.lastIndex = 0; continue; }
        ID_TOKEN.lastIndex = 0;
        const lines = txt.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
          const m = lines[i].match(ID_TOKEN);
          if (!m) continue;
          for (const t of m) {
            const id = t.toUpperCase();
            if (!locs.has(id)) locs.set(id, []);
            locs.get(id).push({ file: path.relative(root, full), line: i + 1, _full: full });
          }
        }
      }
    }
  })(root);
  return locs;
}

// 取某文件标记行附近的窗口片段 + 该窗口内命中的 mock 指示。
function blockEvidence(loc) {
  let lines;
  try { lines = fs.readFileSync(loc._full, 'utf8').split(/\r?\n/); } catch (_) { return null; }
  const from = Math.max(0, loc.line - 1 - BLOCK_RADIUS);
  const to = Math.min(lines.length, loc.line - 1 + BLOCK_RADIUS + 1);
  const window = lines.slice(from, to);
  const snippet = window.join('\n');
  const mocks = [];
  for (let i = 0; i < window.length; i++) {
    for (const re of MOCK_PATTERNS) {
      if (re.test(window[i])) { mocks.push(`${loc.file}:${from + i + 1}: ${window[i].trim()}`); break; }
    }
  }
  return { snippet: clip(snippet, SNIPPET_MAX), mocks };
}

// 从场景 then[] + examples[] 抽「期望可观察 token」：引号内字符串 + 独立整数/状态码。
function extractExpectedTokens(sc) {
  const tokens = new Set();
  const raw = [];
  const harvest = (arr, tag) => {
    if (!Array.isArray(arr)) return;
    for (const item of arr) {
      const s = String(item == null ? '' : item);
      if (s.trim()) raw.push(`${tag}: ${s.trim()}`);
      // 引号内字符串（'..' "..", “..” 「..」）
      const qre = /'([^']{1,120})'|"([^"]{1,120})"|“([^”]{1,120})”|「([^」]{1,120})」/g;
      let m;
      while ((m = qre.exec(s)) !== null) {
        const v = m[1] || m[2] || m[3] || m[4];
        if (v && v.trim().length >= 1) tokens.add(v.trim());
      }
      // 独立整数（如状态码 200/400/404；过滤 0/1 这类噪声坐标可由 LLM 自行判断，这里仍收集）
      const nre = /(?<![\w.])(\d{2,})(?![\w.])/g;
      let n;
      while ((n = nre.exec(s)) !== null) tokens.add(n[1]);
    }
  };
  harvest(sc.then, 'then');
  harvest(sc.examples, 'examples');
  return { tokens: [...tokens], raw };
}

// 探测技术栈并真跑测试（best-effort，覆盖 node/python/rust，与 gate_static 对齐；其余栈跳过运行）。
function detectAndRunTests(cwd) {
  const sh = process.platform === 'win32';
  const run = (bin, args, label) => {
    const r = spawnSync(bin, args, { cwd, encoding: 'utf8', shell: sh, timeout: 180000 });
    if (r.error) return { ran: false, ok: false, label, info: `${label}: 无法执行（${r.error.code || r.error.message}）` };
    const tail = clip((r.stdout || '') + '\n' + (r.stderr || ''), 1200);
    return { ran: true, ok: r.status === 0, label, info: `${label}: exit=${r.status}`, tail };
  };
  if (fs.existsSync(path.join(cwd, 'package.json'))) {
    let pkg = {};
    try { pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8')); } catch (_) {}
    if (pkg.scripts && pkg.scripts.test && !/no test specified/i.test(pkg.scripts.test)) {
      return run('npm', ['test', '--silent'], 'npm test');
    }
    return { ran: false, ok: false, label: 'npm test', info: 'package.json 无可用 test 脚本' };
  }
  if (fs.existsSync(path.join(cwd, 'pyproject.toml')) || fs.existsSync(path.join(cwd, 'pytest.ini')) || fs.existsSync(path.join(cwd, 'setup.cfg'))) {
    return run('python', ['-m', 'pytest', '-q'], 'pytest');
  }
  if (fs.existsSync(path.join(cwd, 'Cargo.toml'))) {
    return run('cargo', ['test', '--quiet'], 'cargo test');
  }
  return { ran: false, ok: false, label: '(test)', info: '未识别测试栈（无 package.json / pyproject.toml / Cargo.toml 等）—未运行测试，仅静态证据' };
}

(async () => {
  try {
    const cwd = process.cwd();
    const out = [];
    out.push('=== gate_behavior 证据报告 ===');

    // ---- 当前 task ----
    let state = {};
    try { state = JSON.parse(fs.readFileSync(path.join(cwd, '.harness', 'blueprint', 'state.json'), 'utf8')); }
    catch (_) { emit(false, '无法读取 .harness/blueprint/state.json（loop 状态不可读，无法定位当前 task）', true); }

    const task = pickCurrentTask(state);
    if (!task) emit(false, '未能在 state.loops 中定位当前 task（tasks 为空或 taskIndex 越界）', true);
    const tid = task.id;
    const srsTrace = Array.isArray(task.srs_trace) ? task.srs_trace.filter(isNonEmptyString).map(s => s.trim()) : [];
    const bddIds = Array.isArray(task.bdd_ids) ? task.bdd_ids.filter(isNonEmptyString).map(s => s.trim().toUpperCase()) : [];
    out.push(`task#${tid}  srs_trace=[${srsTrace.join(',')}]  bdd_ids=[${bddIds.join(',')}]`);

    // ---- bdd.json ----
    const bddPath = path.join(cwd, '.harness', 'memory', 'plans', 'bdd.json');
    if (!fs.existsSync(bddPath)) emit(false, 'bdd.json 缺失（应由上游 bdd 节点产出）：' + path.relative(cwd, bddPath), true);
    let bdd;
    try { bdd = JSON.parse(fs.readFileSync(bddPath, 'utf8')); }
    catch (e) { emit(false, 'bdd.json 不是合法 JSON：' + e.message, true); }
    if (!bdd || typeof bdd !== 'object' || !Array.isArray(bdd.features)) emit(false, 'bdd.json 结构异常（features 非数组）', true);

    // ---- 相关场景：优先 task.bdd_ids（L3 权威指针），否则兜底 fr ∩ srs_trace ----
    const scenarioById = new Map(); // 大写 id -> {feature, scenario obj}
    for (const feat of bdd.features) {
      if (!feat || typeof feat !== 'object' || !Array.isArray(feat.scenarios)) continue;
      const fname = isNonEmptyString(feat.feature) ? feat.feature.trim() : '?';
      const frHit = Array.isArray(feat.fr) && feat.fr.some(f => typeof f === 'string' && srsTrace.includes(f.trim()));
      for (const sc of feat.scenarios) {
        if (!sc || typeof sc !== 'object' || !isNonEmptyString(sc.id)) continue;
        const id = sc.id.trim().toUpperCase();
        scenarioById.set(id, { fname, sc, frHit });
      }
    }
    let relevant;
    if (bddIds.length) {
      relevant = bddIds.filter(id => scenarioById.has(id));
      const unknown = bddIds.filter(id => !scenarioById.has(id));
      if (unknown.length) out.push(`⚠ task.bdd_ids 含 bdd.json 不存在的 id：${unknown.join(',')}`);
    } else {
      relevant = [...scenarioById.entries()].filter(([, v]) => v.frHit).map(([id]) => id);
      out.push('（task 无 bdd_ids，回退 fr ∩ srs_trace 推导相关场景）');
    }
    relevant = [...new Set(relevant)];
    if (relevant.length === 0) {
      out.push('相关 BDD 场景：空集 → 本 task 无行为面需核验，通过。');
      process.stdout.write(out.join('\n') + '\n');
      emit(true, `task#${tid} 无相关 BDD 场景，gate_behavior 跳过`);
    }
    out.push(`相关 BDD 场景（${relevant.length}）：${relevant.join(', ')}`);

    // ---- 真跑测试 ----
    const t = detectAndRunTests(cwd);
    out.push('');
    out.push('[测试运行] ' + t.info);
    if (t.tail) out.push('  ↳ ' + t.tail.replace(/\n/g, '\n  '));

    // ---- 逐场景采证 ----
    const locs = scanWorkspaceLocations(cwd);
    const flags = { missing: [], mocked: [], noExact: [] };
    out.push('');
    out.push('逐场景证据：');
    for (const id of relevant) {
      const meta = scenarioById.get(id);
      const label = meta ? `${meta.fname} / ${isNonEmptyString(meta.sc.scenario) ? meta.sc.scenario.trim() : id}` : id;
      out.push(`- ${id} 「${label}」`);
      const { tokens, raw } = meta ? extractExpectedTokens(meta.sc) : { tokens: [], raw: [] };
      out.push(`    then/examples 原文：${raw.length ? raw.join(' | ') : '(空)'}`);
      out.push(`    期望可观察 token：${tokens.length ? tokens.map(x => JSON.stringify(x)).join(', ') : '(未能自动抽取——请人工读 then 判定)'}`);

      const idLocs = locs.get(id) || [];
      if (idLocs.length === 0) {
        flags.missing.push(id);
        out.push('    ✗ 工作区无任何带该 id 标记的测试/源码（漏覆盖）');
        continue;
      }
      // 该 id 涉及的文件集合
      const filesForId = [...new Set(idLocs.map(l => l.file))];
      out.push(`    带标记位置：${idLocs.slice(0, 6).map(l => l.file + ':' + l.line).join(', ')}${idLocs.length > 6 ? ' …' : ''}`);

      // mock 证据：扫描该 id **全部出现位置**的窗口（不止首个；标记可能落在源码注释里），
      // 代表性片段优先取测试文件（路径含 test/spec），否则取首个。
      let mocks = [];
      let snippet = null;
      for (const loc of idLocs.slice(0, 10)) {
        const ev = blockEvidence(loc);
        if (!ev) continue;
        if (ev.mocks.length) mocks = mocks.concat(ev.mocks);
        if (!snippet || /(^|[\\/])(tests?|spec|__tests__)([\\/]|$)|\.(test|spec)\./i.test(loc.file)) snippet = ev.snippet;
      }
      mocks = [...new Set(mocks)];
      if (mocks.length) {
        flags.mocked.push(id);
        out.push('    ⚠ 带标记文件中出现整模块/符号打桩（需 LLM 判定所 mock 目标是否为该 then 的产出面）：');
        for (const mk of mocks.slice(0, 8)) out.push('        ' + mk);
      }

      // 期望 token 是否在相关文件中以字面量出现
      if (tokens.length) {
        const fileTexts = filesForId.map(rel => { try { return fs.readFileSync(path.join(cwd, rel), 'utf8'); } catch (_) { return ''; } }).join('\n');
        const hit = tokens.filter(tk => fileTexts.includes(tk));
        const miss = tokens.filter(tk => !fileTexts.includes(tk));
        out.push(`    期望值命中：${hit.length}/${tokens.length}${miss.length ? '；未命中 ' + miss.map(x => JSON.stringify(x)).join(', ') : ''}`);
        if (hit.length === 0) flags.noExact.push(id);
      } else {
        out.push('    期望值命中：无法自动抽取 token，转 LLM 人工核验');
      }

      if (snippet) { out.push('    测试块片段：'); out.push('      ' + snippet.replace(/\n/g, '\n      ')); }
    }

    // ---- 机检初判（advisory；最终三态由 SKILL.md LLM 裁定）----
    out.push('');
    const problems = [];
    if (flags.missing.length) problems.push(`漏覆盖 id：${flags.missing.join(',')}`);
    if (flags.mocked.length) problems.push(`疑似 mock 可观察面 id：${flags.mocked.join(',')}（需 LLM 确认所 mock 目标是否为该 then 的产出面）`);
    if (flags.noExact.length) problems.push(`then 精确值无任一命中 id：${flags.noExact.join(',')}（疑似仅"被调用过"断言）`);
    if (t.ran && !t.ok) problems.push('测试未全绿（无法在绿测试上核验行为）');
    if (!t.ran) problems.push('测试未运行（' + t.info + '）');

    const advisoryPass = problems.length === 0;
    out.push('[机检初判] ' + (advisoryPass ? 'pass（无机检红旗；仍需 LLM 复核期望值是否真被断言）'
      : 'fail/blocked 候选：' + problems.slice(0, MAX_REPORT).join('；')));

    process.stdout.write(out.join('\n') + '\n');

    if (advisoryPass) {
      emit(true, `task#${tid} 的 ${relevant.length} 个相关 BDD 场景：测试已全绿，无漏覆盖/疑似 mock 可观察面/缺精确断言的机检红旗。请 LLM 复核期望值确被断言后放行。`);
    } else {
      // 仅当「测试没跑起来」且「无任何静态红旗」时建议 BLOCKED（环境型不可判）；
      // 否则有具体行为缺口 → FAIL。最终三态仍由 SKILL.md 的 LLM 裁定。
      const hasStaticRedFlag = !!(flags.missing.length || flags.mocked.length || flags.noExact.length || (t.ran && !t.ok));
      const blockedHint = !hasStaticRedFlag && !t.ran;
      emit(false, '行为门候选未通过：' + problems.join('；'), blockedHint);
    }
  } catch (e) {
    emit(false, 'gate_behavior 内部错误（请检查 state.json / bdd.json 可读性、测试命令）：' + (e && e.message ? e.message : String(e)), true);
  }
})();
