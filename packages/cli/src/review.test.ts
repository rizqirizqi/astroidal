import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { test } from 'node:test'
import { buildMap, exposureScore, scoreReview } from './analyze.js'
import { main, parseArgs } from './cli.js'
import { countChangedSpan, parseUnifiedDiff } from './diff.js'
import { readEvidence, writeEvidence } from './evidence.js'
import { writePackets } from './packets.js'
import { rankFindings } from './rank.js'
import { parseSyntax } from './syntax.js'
import type { Graph } from './types.js'

test('parseArgs splits pull request lists and repeated labels', () => {
  const parsed = parseArgs(['graph', '--pr', '12,18', '--label', 'risk', '--label', 'security', '--open'])
  assert.equal(parsed.command, 'graph')
  assert.deepEqual(parsed.flags.get('pr'), ['12,18'])
  assert.deepEqual(parsed.flags.get('label'), ['risk', 'security'])
  assert.deepEqual(parsed.flags.get('open'), ['true'])
})

test('changed-span counts additions and deletions inside a symbol', () => {
  const patch = `diff --git a/src/auth.ts b/src/auth.ts
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -1,4 +1,4 @@
 export function login(password) {
   if (!password) return null
-  return db.query(password)
+  return db.query("SELECT " + password)
 }
`
  assert.equal(countChangedSpan(patch, 'new', 1, 4), 1)
  assert.equal(countChangedSpan(patch, 'old', 1, 4), 1)
  assert.equal(countChangedSpan(patch, 'new', 1, 2), 0)
})

test('unified diff keeps a rename and a new file', () => {
  const files = parseUnifiedDiff(`diff --git a/old.ts b/new.ts
similarity index 90%
rename from old.ts
rename to new.ts
--- a/old.ts
+++ b/new.ts
@@ -1 +1,2 @@
 export function kept() { return 1 }
+export function added() { return 2 }
diff --git a/fresh.py b/fresh.py
new file mode 100644
--- /dev/null
+++ b/fresh.py
@@ -0,0 +1,2 @@
+def load_user(user_id):
+    return user_id
`)
  assert.equal(files[0]?.path, 'new.ts')
  assert.equal(files[0]?.status, 'renamed')
  assert.equal(files[0]?.additions, 1)
  assert.equal(files[1]?.path, 'fresh.py')
  assert.equal(files[1]?.status, 'added')
})

test('syntax map finds javascript and python symbols', () => {
  const script = parseSyntax('src/auth.ts', `import { readFile } from 'node:fs'
export function loadUser(id) {
  if (!id) return null
  return db.query(id)
}
export class Users {
  get(id) {
    return loadUser(id)
  }
}
`)
  assert.deepEqual(script.symbols.map((symbol) => symbol.name), ['loadUser', 'Users', 'get'])
  assert.ok((script.symbols[0]?.decisions ?? 0) >= 1)
  const python = parseSyntax('app.py', `def load_user(user_id):
    if not user_id:
        return None
    return query(user_id)
`)
  assert.equal(python.symbols[0]?.name, 'load_user')
  assert.ok((python.symbols[0]?.decisions ?? 0) >= 1)
})

test('exposure score stays inside 0 to 100', () => {
  assert.equal(exposureScore(0, 5), 0)
  assert.ok(exposureScore(3, 5) > 0)
  assert.ok(exposureScore(100, 5) <= 100)
  assert.ok(exposureScore(3, 8) < 50)
})

test('an empty branch is not scored', () => {
  const root = mkdtempSync(join(tmpdir(), 'astroidal-empty-'))
  const previous = process.cwd()
  try {
    git(root, ['init', '-b', 'main'])
    git(root, ['config', 'user.email', 'astroidal@example.com'])
    git(root, ['config', 'user.name', 'Astroidal'])
    writeFileSync(join(root, 'readme.txt'), 'hello\n')
    git(root, ['add', '.'])
    git(root, ['commit', '-m', 'init'])
    process.chdir(root)
    assert.throws(() => main(['graph']), /An empty diff does not get a score/)
    assert.equal(existsSync(join(root, '.astroidal', 'constellation.html')), false)
  } finally {
    process.chdir(previous)
    rmSync(root, { recursive: true, force: true })
  }
})

test('the review score reaches 100 for a one-line change and falls off as the change grows', () => {
  const calm = { blastRadius: 0, complexityDelta: 0, securityExposure: 0, performanceImpact: 0, blastFiles: 0, complexityRaw: 0, securityLeads: 0, performanceLeads: 0 }
  const typo = scoreReview({ impact: calm, findings: [], reviewed: true, partial: false, additions: 1, deletions: 0, files: 1, symbols: 0 })
  assert.equal(typo.verdict, 'passed')
  assert.equal(typo.value, 100)
  const edited = scoreReview({ impact: { ...calm, complexityDelta: 22 }, findings: [], reviewed: true, partial: false, additions: 18, deletions: 6, files: 1, symbols: 1 })
  assert.equal(edited.verdict, 'passed')
  assert.ok(edited.value >= 90 && edited.value <= 98)
  assert.ok(edited.value < typo.value)
  const wide = scoreReview({
    impact: { ...calm, securityExposure: 70, complexityDelta: 80, blastRadius: 40 },
    findings: [],
    reviewed: true,
    partial: true,
    additions: 400,
    deletions: 80,
    files: 12,
    symbols: 20,
  })
  assert.equal(wide.verdict, 'passed')
  assert.ok(wide.value >= 50 && wide.value < 80)
  assert.match(wide.reason, /Warning: the impact is high, so the score stays low/)
  assert.ok(wide.value < edited.value - 15)
  const unreviewed = scoreReview({ impact: calm, findings: [], reviewed: false, partial: false, additions: 1, deletions: 0, files: 1, symbols: 0 })
  assert.equal(unreviewed.verdict, 'fix')
  assert.ok(unreviewed.value < 80)
  const broken = scoreReview({ impact: calm, findings: [{ severity: 'high' }], reviewed: true, partial: false, additions: 1, deletions: 0, files: 1, symbols: 0 })
  assert.equal(broken.verdict, 'fix')
  assert.ok(broken.value < 80)
})

test('a stacked remote diff keeps the child body and every added line', () => {
  const root = mkdtempSync(join(tmpdir(), 'astroidal-stack-'))
  const parentPatch = `diff --git a/src/cell.ts b/src/cell.ts
--- a/src/cell.ts
+++ b/src/cell.ts
@@ -1,3 +1,3 @@
 export function readCell(cell) {
-  return plain(cell.result || value.result)
+  return plain(cell.result ?? value.result)
 }
`
  const childPatch = `diff --git a/src/cell.ts b/src/cell.ts
--- a/src/cell.ts
+++ b/src/cell.ts
@@ -1,3 +1,6 @@
 export function readCell(cell) {
-  return plain(cell.result ?? value.result)
+  const result = cell.result ?? value.result
+  return plain(excelToDate(result, false))
 }
+function excelToDate(serial, date1904) {
+  return new Date(Math.round((serial - 25569) * 86400000))
+}
`
  try {
    const result = buildMap({
      root,
      notes: [],
      commands: [],
      units: [
        { id: 'pr:96', label: 'PR 96', pr: 96, title: 'date', source: 'remote-diff', base: 'fix/formula-cell-value', head: 'fix/formula-date-cell', files: parseUnifiedDiff(childPatch) },
        { id: 'pr:94', label: 'PR 94', pr: 94, title: 'formula', source: 'remote-diff', base: 'main', head: 'fix/formula-cell-value', files: parseUnifiedDiff(parentPatch) },
      ],
    })
    const file = result.files.find((item) => item.path === 'src/cell.ts')
    assert.match(file?.text ?? '', /function excelToDate/)
    assert.doesNotMatch(file?.text ?? '', /cell\.result \|\| value\.result/)
    writePackets(join(root, '.astroidal'), result)
    const bugMap = readFileSync(join(root, '.astroidal', 'packets', 'bug-map.md'), 'utf8')
    assert.match(bugMap, /function excelToDate/)
    assert.match(bugMap, /PR 94/)
    assert.match(bugMap, /return plain\(cell\.result \?\? value\.result\)/)
    writeEvidence(root, result.files)
    const ranked = rankFindings(result.graph, {
      findings: [{
        pr: 96,
        severity: 'high',
        description: 'A formula date serial becomes a different ISO day than a typed date cell.',
        path: 'src/cell.ts',
        quote: 'function excelToDate(serial, date1904) {',
        recommendation: 'Build the date with the same calendar components the other reader uses.',
        category: 'logic',
      }],
    }, (path) => readEvidence(root, path))
    assert.equal(ranked.findings.length, 1)
    assert.equal(ranked.dropped.length, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('rank keeps a quoted bug and drops a nit', () => {
  const graph = {
    version: 1,
    files: [{ path: 'src/auth.ts', units: ['worktree'], prs: ['worktree'] }],
    neighbors: [{ path: 'src/app.ts', via: 'src/auth.ts', reason: 'possible caller of loadUser' }],
    units: [{ id: 'worktree', label: 'worktree', source: 'local' }],
    findings: [],
  } as unknown as Graph
  const corpus = new Map([
    ['src/auth.ts', 'export function login(password) {\n  return db.query("SELECT " + password)\n}\n'],
    ['src/app.ts', 'export function start() {\n  return login("secret")\n}\n'],
  ])
  const ranked = rankFindings(graph, {
    findings: [
      {
        severity: 'high',
        description: 'Password is concatenated into a query.',
        path: 'src/auth.ts',
        quote: 'return db.query("SELECT " + password)',
        recommendation: 'Pass the password as a bound parameter.',
        category: 'security',
      },
      {
        severity: 'nit',
        description: 'Rename the function.',
        path: 'src/auth.ts',
        quote: 'export function login(password) {',
        recommendation: 'Use a longer name.',
      },
    ],
  }, (path) => corpus.get(path) ?? null)
  assert.equal(ranked.findings.length, 1)
  assert.equal(ranked.findings[0]?.id, 'A-001')
  assert.equal(ranked.findings[0]?.severity, 'high')
  assert.equal(ranked.dropped.length, 1)
  assert.deepEqual(ranked.groups, [])
})

test('rank keeps a logical group and drops a path outside the map', () => {
  const graph = {
    files: [{ path: 'src/auth.ts' }, { path: 'src/session.ts' }],
    neighbors: [{ path: 'src/app.ts' }],
    units: [],
  } as unknown as Graph
  const ranked = rankFindings(graph, {
    findings: [],
    groups: [
      { name: 'Sign in', paths: ['src/auth.ts', './src/app.ts', 'src/missing.ts'] },
      { name: 'Solo', paths: ['src/auth.ts'] },
    ],
  }, () => null)
  assert.deepEqual(ranked.groups, [{ name: 'Sign in', paths: ['src/auth.ts', 'src/app.ts'] }])
})

test('graph and rank review a worktree without adding a dependency', () => {
  const root = makeRepo()
  const home = mkdtempSync(join(tmpdir(), 'astroidal-home-'))
  const previous = process.cwd()
  const previousHome = process.env.HOME
  try {
    process.chdir(root)
    process.env.HOME = home
    assert.equal(main(['init']), 0)
    assert.equal(main(['graph']), 0)
    const graph = JSON.parse(readFileSync(join(root, '.astroidal', 'graph.json'), 'utf8')) as Graph
    const auth = graph.files.find((file) => file.path === 'src/auth.ts')
    const login = graph.nodes.find((node) => node.name === 'login' && node.path === 'src/auth.ts')
    assert.ok(auth)
    assert.match(auth.patch, /SELECT/)
    assert.equal(login?.additions, 1)
    assert.equal(login?.deletions, 1)
    assert.ok((login?.complexity ?? 0) >= 2)
    assert.ok(graph.files.some((file) => file.path === 'src/Login.tsx'))
    assert.ok(graph.neighbors.some((neighbor) => neighbor.path === 'src/app.ts'))
    assert.equal(readFileSync(join(root, 'package.json'), 'utf8').includes('astroidal'), false)
    assert.ok(existsSync(join(root, '.cursor', 'skills', 'astroidal', 'SKILL.md')))
    assert.match(readFileSync(join(root, '.cursor', 'skills', 'astroidal', 'references', 'review-lenses.md'), 'utf8'), /Review lenses/)
    assert.ok(readFileSync(join(root, '.gitignore'), 'utf8').includes('.astroidal/'))
    writeFileSync(join(root, '.astroidal', 'findings.json'), JSON.stringify({
      findings: [
        {
          severity: 'critical',
          description: 'The login query concatenates the password.',
          path: 'src/auth.ts',
          quote: 'return db.query("SELECT " + password)',
          recommendation: 'Bind the password instead of concatenating it.',
          category: 'security',
        },
        {
          severity: 'low',
          description: 'The component name is short.',
          path: 'src/Login.tsx',
          quote: 'export function Login() {',
          recommendation: 'Rename it.',
        },
      ],
    }))
    assert.equal(main(['rank']), 0)
    const review = readFileSync(join(root, '.astroidal', 'review.md'), 'utf8')
    assert.match(review, /\| ID \| Severity \| Issue Description \| File Path \| Recommendation \| PR \|/)
    assert.match(review, /A-001/)
    assert.match(review, /src\/auth\.ts/)
    const table = review.split('## Dropped')[0] ?? ''
    assert.doesNotMatch(table, /component name is short/)
    const html = readFileSync(join(root, '.astroidal', 'constellation.html'), 'utf8')
    assert.match(html, /Astroidal score/)
    assert.match(html, /AI code review map/)
    assert.doesNotMatch(html, /Share the score/)
    assert.match(html, /Fix first/)
    assert.match(review, /AI code review map for this change/)
    assert.match(html, /Impact surface/)
    assert.match(html, /A-001/)
    assert.match(html, /id="view-tree" class="is-on"/)
    assert.match(html, /id="symbol-list" hidden/)
    assert.match(html, /id="symbol-tree"/)
    assert.doesNotMatch(html, /id="symbol-tree" hidden/)
    assert.match(html, /complexity \d+ <em>/)
    const bugMap = readFileSync(join(root, '.astroidal', 'packets', 'bug-map.md'), 'utf8')
    assert.match(bugMap, /Security bugs/)
    assert.match(bugMap, /src\/auth\.ts/)
  } finally {
    process.chdir(previous)
    if (previousHome === undefined) delete process.env.HOME
    else process.env.HOME = previousHome
    rmSync(root, { recursive: true, force: true })
    rmSync(home, { recursive: true, force: true })
  }
})

test('init --global installs the skill under the home directory', () => {
  const root = makeRepo()
  const home = mkdtempSync(join(tmpdir(), 'astroidal-home-'))
  writeFileSync(join(home, '.gitignore'), 'keep\n')
  const previous = process.cwd()
  const previousHome = process.env.HOME
  try {
    process.chdir(root)
    process.env.HOME = home
    assert.equal(main(['init', '--global']), 0)
    const cursorSkill = join(home, '.cursor', 'skills', 'astroidal', 'SKILL.md')
    const agentsSkill = join(home, '.agents', 'skills', 'astroidal', 'SKILL.md')
    assert.match(readFileSync(cursorSkill, 'utf8'), /name: astroidal/)
    assert.match(readFileSync(agentsSkill, 'utf8'), /name: astroidal/)
    assert.match(readFileSync(join(home, '.cursor', 'skills', 'astroidal', 'references', 'review-lenses.md'), 'utf8'), /Review lenses/)
    assert.match(readFileSync(join(home, '.agents', 'skills', 'astroidal', 'references', 'review-lenses.md'), 'utf8'), /Review lenses/)
    assert.equal(existsSync(join(root, '.cursor', 'skills', 'astroidal', 'SKILL.md')), false)
    assert.equal(existsSync(join(root, '.agents', 'skills', 'astroidal', 'SKILL.md')), false)
    assert.equal(readFileSync(join(root, '.gitignore'), 'utf8').includes('.astroidal/'), false)
    assert.equal(readFileSync(join(home, '.gitignore'), 'utf8'), 'keep\n')
    writeFileSync(cursorSkill, 'custom\n')
    assert.equal(main(['init', '--global']), 0)
    assert.equal(readFileSync(cursorSkill, 'utf8'), 'custom\n')
    assert.equal(main(['init', '--global', '--force']), 0)
    assert.match(readFileSync(cursorSkill, 'utf8'), /name: astroidal/)
  } finally {
    process.chdir(previous)
    if (previousHome === undefined) delete process.env.HOME
    else process.env.HOME = previousHome
    rmSync(root, { recursive: true, force: true })
    rmSync(home, { recursive: true, force: true })
  }
})

test('explicit pull requests use the local branch instead of gh pr diff', () => {
  const root = makeRepo()
  const bin = join(root, 'bin')
  mkdirSync(bin)
  const log = join(root, 'gh.log')
  writeFileSync(join(bin, 'gh'), `#!/bin/sh
echo "$@" >> "$GH_LOG"
if [ "$1" = "--version" ]; then
  echo "gh version test"
  exit 0
fi
if [ "$1" = "pr" ] && [ "$2" = "view" ]; then
  printf '%s\\n' '{"number":12,"title":"Fix login","headRefName":"feature","baseRefName":"main","url":"https://example.test/12","author":{"login":"ada"},"labels":[]}'
  exit 0
fi
if [ "$1" = "pr" ] && [ "$2" = "diff" ]; then
  echo "unexpected diff" >&2
  exit 1
fi
echo "[]"
exit 0
`)
  chmodSync(join(bin, 'gh'), 0o755)
  git(root, ['checkout', '-b', 'feature'])
  writeFileSync(join(root, 'src', 'auth.ts'), 'export function login(password) {\n  if (!password) return null\n  return db.query(password)\n}\nexport function audit(password) {\n  return password\n}\n')
  git(root, ['add', '.'])
  git(root, ['commit', '-m', 'feature'])
  const previousPath = process.env.PATH
  const previousLog = process.env.GH_LOG
  const home = mkdtempSync(join(tmpdir(), 'astroidal-home-'))
  const previousHome = process.env.HOME
  process.env.PATH = `${bin}${delimiter}${previousPath ?? ''}`
  process.env.GH_LOG = log
  process.env.HOME = home
  const previous = process.cwd()
  try {
    process.chdir(root)
    assert.equal(main(['graph', '--pr', '12']), 0)
    const graph = JSON.parse(readFileSync(join(root, '.astroidal', 'graph.json'), 'utf8')) as Graph
    assert.ok(graph.files.some((file) => file.path === 'src/auth.ts'))
    assert.equal(graph.units[0]?.label, 'PR 12')
    const calls = readFileSync(log, 'utf8')
    assert.match(calls, /pr view 12/)
    assert.doesNotMatch(calls, /pr diff/)
  } finally {
    process.chdir(previous)
    process.env.PATH = previousPath
    if (previousLog === undefined) delete process.env.GH_LOG
    else process.env.GH_LOG = previousLog
    if (previousHome === undefined) delete process.env.HOME
    else process.env.HOME = previousHome
    rmSync(root, { recursive: true, force: true })
    rmSync(home, { recursive: true, force: true })
  }
})

test('graph refreshes an unmodified global skill and leaves edits and project copies', () => {
  const root = makeRepo()
  const home = mkdtempSync(join(tmpdir(), 'astroidal-home-'))
  const previous = process.cwd()
  const previousHome = process.env.HOME
  try {
    process.chdir(root)
    process.env.HOME = home
    assert.equal(main(['init']), 0)
    assert.equal(main(['init', '--global']), 0)
    const projectSkill = join(root, '.cursor', 'skills', 'astroidal')
    const globalSkill = join(home, '.cursor', 'skills', 'astroidal')
    const agentsSkill = join(home, '.agents', 'skills', 'astroidal')
    rewriteStamp(projectSkill, '0.0.1')
    rewriteStamp(join(root, '.agents', 'skills', 'astroidal'), '0.0.1')
    rewriteStamp(globalSkill, '0.0.1')
    rewriteStamp(agentsSkill, '0.0.1')
    const updated = captureLog(() => {
      assert.equal(main(['graph']), 0)
    })
    assert.match(updated, /Updated Astroidal skill 0\.0\.1 → 0\.1\.0\./)
    assert.equal(stampVersion(globalSkill), '0.1.0')
    assert.equal(stampVersion(agentsSkill), '0.1.0')
    assert.equal(stampVersion(projectSkill), '0.0.1')

    writeFileSync(join(globalSkill, 'SKILL.md'), 'custom\n')
    rewriteStamp(globalSkill, '0.0.1')
    const edited = captureLog(() => {
      assert.equal(main(['graph']), 0)
    })
    assert.match(edited, /Run astroidal init --force to replace it/)
    assert.equal(readFileSync(join(globalSkill, 'SKILL.md'), 'utf8'), 'custom\n')
    assert.equal(stampVersion(globalSkill), '0.0.1')

    assert.equal(main(['init', '--global', '--force']), 0)
    rmSync(join(globalSkill, '.install.json'))
    rmSync(join(agentsSkill, '.install.json'))
    const adopted = captureLog(() => {
      assert.equal(main(['graph']), 0)
    })
    assert.doesNotMatch(adopted, /Updated Astroidal skill/)
    assert.doesNotMatch(adopted, /init --force/)
    assert.equal(stampVersion(globalSkill), '0.1.0')
    assert.equal(stampVersion(agentsSkill), '0.1.0')

    rewriteStamp(globalSkill, '9.0.0')
    rewriteStamp(agentsSkill, '9.0.0')
    const stayed = captureLog(() => {
      assert.equal(main(['graph']), 0)
    })
    assert.doesNotMatch(stayed, /Updated Astroidal skill/)
    assert.equal(stampVersion(globalSkill), '9.0.0')

    rmSync(join(globalSkill, '.install.json'))
    writeFileSync(join(globalSkill, 'SKILL.md'), 'legacy\n')
    const legacy = captureLog(() => {
      assert.equal(main(['graph']), 0)
    })
    assert.match(legacy, /init --force/)
    assert.equal(readFileSync(join(globalSkill, 'SKILL.md'), 'utf8'), 'legacy\n')

    rmSync(join(globalSkill, 'references', 'review-lenses.md'))
    const repaired = captureLog(() => {
      assert.equal(main(['init', '--global']), 0)
    })
    assert.match(repaired, /init --force/)
    assert.equal(readFileSync(join(globalSkill, 'SKILL.md'), 'utf8'), 'legacy\n')
    assert.match(readFileSync(join(globalSkill, 'references', 'review-lenses.md'), 'utf8'), /Review lenses/)
    assert.equal(stampVersion(projectSkill), '0.0.1')
    assert.equal(stampVersion(agentsSkill), '9.0.0')
  } finally {
    process.chdir(previous)
    if (previousHome === undefined) delete process.env.HOME
    else process.env.HOME = previousHome
    rmSync(root, { recursive: true, force: true })
    rmSync(home, { recursive: true, force: true })
  }
})

function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'astroidal-'))
  git(root, ['init', '-b', 'main'])
  git(root, ['config', 'user.email', 'astroidal@example.com'])
  git(root, ['config', 'user.name', 'Astroidal'])
  mkdirSync(join(root, 'src'))
  writeFileSync(join(root, 'package.json'), '{"dependencies":{}}\n')
  writeFileSync(join(root, '.gitignore'), 'node_modules\n')
  writeFileSync(join(root, 'src', 'app.ts'), 'import { login } from "./auth"\nexport function start() {\n  return login("secret")\n}\n')
  writeFileSync(join(root, 'src', 'auth.ts'), 'export function login(password) {\n  if (!password) return null\n  return db.query(password)\n}\n')
  git(root, ['add', '.'])
  git(root, ['commit', '-m', 'init'])
  writeFileSync(join(root, 'src', 'auth.ts'), 'export function login(password) {\n  if (!password) return null\n  return db.query("SELECT " + password)\n}\n')
  writeFileSync(join(root, 'src', 'Login.tsx'), 'export function Login() {\n  if (error) return null\n  return <a href="/home">Home</a>\n}\n')
  return root
}

function git(cwd: string, args: string[]): void {
  execFileSync('git', args, { cwd, encoding: 'utf8' })
}

function captureLog(run: () => void): string {
  const lines: string[] = []
  const previous = console.log
  console.log = (message?: unknown) => {
    lines.push(String(message ?? ''))
  }
  try {
    run()
  } finally {
    console.log = previous
  }
  return lines.join('\n')
}

function rewriteStamp(dir: string, version: string): void {
  const path = join(dir, '.install.json')
  const stamp = JSON.parse(readFileSync(path, 'utf8')) as { version: string }
  stamp.version = version
  writeFileSync(path, `${JSON.stringify(stamp, null, 2)}\n`)
}

function stampVersion(dir: string): string {
  const stamp = JSON.parse(readFileSync(join(dir, '.install.json'), 'utf8')) as { version: string }
  return stamp.version
}
