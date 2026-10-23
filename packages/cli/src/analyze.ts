import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { changedLines, countChangedSpan, reconstructSide } from "./diff.js";
import { tryGit } from "./git.js";
import { isNoise } from "./noise.js";
import { toPosix } from "./paths.js";
import { readRepoFile, type ScopeResult } from "./scope.js";
import {
  countDecisions,
  excerpt,
  isSourcePath,
  languageFor,
  lineCount,
  parseSyntax,
  resolveImport,
  type Language,
} from "./syntax.js";
import type {
  BuildResult,
  BuiltFile,
  BuiltSymbol,
  ChangeUnit,
  FileVariant,
  Graph,
  GraphEdge,
  GraphNeighbor,
  GraphNode,
  ImpactScores,
  Lead,
  ParsedFile,
  ReviewScore,
  RiskTier,
  Severity,
  Spectral,
  SyntaxSymbol,
} from "./types.js";

const SKIP_DIRS = new Set([
  "node_modules",
  "vendor",
  "dist",
  "build",
  "coverage",
  "target",
  "generated",
  "third_party",
  "__pycache__",
  ".next",
  ".nuxt",
  ".output",
  "venv",
  ".venv",
  ".git",
  ".astroidal",
  "out",
  "tmp",
  ".turbo",
  ".cache",
]);

const SECURITY_PATH =
  /(auth|session|crypto|secret|password|token|payment|billing|acl|permission)/i;
const UX_PATH =
  /\.(vue|svelte|tsx|jsx|css|html)$|\/(pages|views|components|screens|ui|routes)\//i;
const CONTRACT_EXT = new Set([".sql", ".graphql", ".gql", ".proto", ".prisma"]);

const SECURITY_RULES: Array<[RegExp, string]> = [
  [/eval\s*\(|new Function\s*\(/, "dynamic code execution"],
  [/dangerouslySetInnerHTML|innerHTML\s*=/, "HTML injection sink"],
  [
    /child_process|os\.system\b|subprocess\b|shell\s*=\s*True|\bexec\s*\(/,
    "command execution",
  ],
  [
    /rejectUnauthorized\s*:\s*false|verify\s*=\s*False|InsecureSkipVerify/,
    "TLS verification disabled",
  ],
  [
    /(password|secret|api[_-]?key|access[_-]?token)\s*[:=]\s*['"][^'"]{6,}['"]/i,
    "possible hardcoded credential",
  ],
  [
    /query\s*\(\s*[`'"].*\$\{|execute\s*\(.*\+|SELECT\s+.+\+|WHERE\s+.+\+/i,
    "possible query concatenation",
  ],
  [/pickle\.loads|yaml\.load\s*\(/i, "unsafe deserialization"],
  [
    /Access-Control-Allow-Origin\s*[:=]\s*['"]\*['"]/i,
    "permissive cross-origin policy",
  ],
];

const STATE_RULES: Array<[RegExp, string]> = [
  [/ALTER\s+TABLE|DROP\s+(TABLE|COLUMN)|CREATE\s+TABLE/i, "schema change"],
  [/\b(rollback|commit)\b/i, "transaction boundary"],
  [/\b(delete|remove|destroy)\s*\(/i, "write that can discard state"],
];

const PERF_RULES: Array<[RegExp, string]> = [
  [/readFileSync|writeFileSync|execSync|spawnSync/, "synchronous I/O"],
  [/\.forEach\s*\(\s*async\b/, "async callback inside forEach is not awaited"],
];

const LOGIC_RULES: Array<[RegExp, string]> = [
  [/catch\s*(\([^)]*\))?\s*\{\s*\}/, "empty catch"],
  [/except\b[^:\n]*:\s*(pass|\.\.\.)\s*$/m, "swallowed exception"],
];

interface IndexedFile {
  path: string;
  text: string;
  language: Language;
}

export function exposureScore(count: number, slope: number): number {
  if (count <= 0) return 0;
  return Math.max(
    0,
    Math.min(100, Math.round(100 * (1 - Math.exp(-count / slope)))),
  );
}

const PASS_LINE = 80;

export function scoreReview(input: {
  impact: ImpactScores;
  findings: Array<{ severity: Severity }>;
  reviewed: boolean;
  partial: boolean;
  additions: number;
  deletions: number;
  files: number;
  symbols: number;
}): ReviewScore {
  const critical = input.findings.filter(
    (finding) => finding.severity === "critical",
  ).length;
  const high = input.findings.filter(
    (finding) => finding.severity === "high",
  ).length;
  const medium = input.findings.filter(
    (finding) => finding.severity === "medium",
  ).length;
  const lines = Math.max(0, input.additions + input.deletions);
  const drag =
    Math.sqrt(lines) * 0.003 +
    Math.sqrt(Math.max(input.files - 1, 0)) * 0.035 +
    Math.sqrt(Math.max(input.symbols, 0)) * 0.008 +
    (input.impact.blastRadius / 100) * 0.28 +
    (input.impact.complexityDelta / 100) * 0.28 +
    (input.impact.securityExposure / 100) * 0.62 +
    (input.impact.performanceImpact / 100) * 0.22 +
    critical * 0.95 +
    high * 0.48 +
    medium * 0.24 +
    (input.partial ? 0.05 : 0) +
    (input.reviewed ? 0 : 0.42);
  const raw = Math.max(0, Math.min(100, Math.round(100 * Math.exp(-drag))));
  const clean = critical + high + medium === 0;
  const passed = input.reviewed && clean;
  const value =
    passed && raw < PASS_LINE
      ? Math.min(PASS_LINE - 1, Math.round(raw + (PASS_LINE - raw) * 0.45))
      : raw;
  let reason =
    "No important findings, and the impact stays under the pass line.";
  if (!input.reviewed) reason = "Rank the findings before this can pass.";
  else if (!clean) reason = "Fix the cusp alerts before this passes.";
  else if (value < PASS_LINE)
    reason =
      "No findings. Warning: the impact is high, so the score stays low.";
  return { value, verdict: passed ? "passed" : "fix", reason };
}

export function buildMap(scope: ScopeResult): BuildResult {
  const notes = [...scope.notes];
  const skipped: string[] = [];
  const built: BuiltFile[] = [];

  for (const unit of scope.units) {
    for (const file of unit.files) {
      if (isNoise(file.path)) {
        if (skipped.length < 30) skipped.push(file.path);
        continue;
      }
      const existing = built.find((item) => item.path === file.path);
      const loaded = loadFile(scope.root, unit, file);
      const variant = variantFrom(unit, file, loaded);
      if (existing) {
        existing.units = unique([...existing.units, unit.id]);
        existing.prs = uniqueValues([...existing.prs, ...unitPrs(unit)]);
        existing.additions += file.additions;
        existing.deletions += file.deletions;
        existing.variants.push(variant);
        continue;
      }
      built.push(materialize(unit, file, loaded, variant));
    }
  }

  let stacked = false;
  let split = false;
  let remote = false;
  for (const file of built) {
    const tips = stackTips(file.variants, scope.units);
    const winner =
      tips[tips.length - 1] ?? file.variants[file.variants.length - 1];
    if (tips.length > 1) split = true;
    if (file.variants.length > tips.length) stacked = true;
    if (file.variants.some((variant) => variant.partial)) remote = true;
    if (winner) {
      file.text = winner.text;
      file.oldText = winner.oldText;
      file.partial = winner.partial;
    }
    file.patch = file.variants
      .map((variant) => variant.patch)
      .filter(Boolean)
      .join("\n");
  }
  if (stacked)
    notes.push(
      "Stacked pull requests share files. The mapped body is the tip of that stack. The bug map still lists every pull request's added lines.",
    );
  if (split)
    notes.push(
      "Some files are changed by pull requests that are not stacked on each other. Read every pull request's added lines, not only the mapped body.",
    );
  if (remote)
    notes.push(
      "A remote diff only contains the changed lines. Review the added lines in the bug map. A blank symbol excerpt is missing context, not an empty change.",
    );

  if (skipped.length > 0)
    notes.push(
      `Skipped ${skipped.length} generated or lockfile path${skipped.length === 1 ? "" : "s"}.`,
    );

  const index = indexRepository(
    scope.root,
    new Set(built.map((file) => file.path)),
  );
  if (index.truncated)
    notes.push(
      "Neighbor search stopped early because the repository index reached its cap.",
    );

  const known = new Set(index.files.map((file) => file.path));
  for (const file of built) known.add(file.path);

  const leads: Lead[] = [];
  const neighbors: GraphNeighbor[] = [];
  const neighborSeen = new Set<string>();

  for (const file of built) {
    file.spectral = spectralFor(file);
    const oldSymbols = file.oldText
      ? parseSyntax(file.path, file.oldText).symbols
      : [];
    const fresh = parseSyntax(file.path, file.text);
    const paired = pairSymbols(file, fresh.symbols, oldSymbols);
    file.symbols = paired.symbols;
    file.complexityDelta = paired.total;
    if (file.partial) {
      const lines = changedLines(file.patch);
      file.complexityDelta =
        countDecisions(lines.added.join("\n")) -
        countDecisions(lines.removed.join("\n"));
    }
    collectLeads(file, leads);
    collectImportNeighbors(
      file,
      fresh.imports,
      known,
      new Set(built.map((item) => item.path)),
      neighbors,
      neighborSeen,
    );
  }

  collectCallers(built, index.files, neighbors, neighborSeen);
  const impact = scoreImpact(built, leads, neighbors, scope.units);
  const tier = riskTier(built);
  const nodes = buildNodes(built, neighbors);
  const edges = buildEdges(built, nodes, neighbors);
  const changedSymbols = nodes.filter(
    (node) => node.role === "changed" && node.kind !== "file",
  ).length;
  const additions = built.reduce((sum, file) => sum + file.additions, 0);
  const deletions = built.reduce((sum, file) => sum + file.deletions, 0);
  const score = scoreReview({
    impact,
    findings: [],
    reviewed: false,
    partial: built.some((file) => file.partial),
    additions,
    deletions,
    files: built.length,
    symbols: changedSymbols,
  });

  const graph: Graph = {
    version: 1,
    generatedAt: new Date().toISOString(),
    repoName: basename(scope.root),
    notes,
    commands: scope.commands,
    units: scope.units.map((unit) => ({
      id: unit.id,
      label: unit.label,
      pr: unit.pr,
      title: unit.title,
      url: unit.url,
      source: unit.source,
      base: unit.base,
      head: unit.head,
    })),
    impact,
    score,
    summary: {
      files: built.length,
      symbols: changedSymbols,
      neighbors: neighbors.length,
      additions,
      deletions,
      riskTier: tier,
      truncated:
        index.truncated ||
        nodes.length < changedSymbols + Math.min(neighbors.length, 80),
      reviewed: false,
    },
    files: built.map((file) => ({
      path: file.path,
      oldPath: file.oldPath,
      status: file.status,
      spectral: file.spectral,
      units: file.units,
      prs: file.prs,
      additions: file.additions,
      deletions: file.deletions,
      binary: file.binary,
      partial: file.partial,
      patch: file.patch,
    })),
    neighbors,
    nodes,
    edges,
    leads,
    findings: [],
    groups: [],
  };

  return { graph, files: built };
}

function materialize(
  unit: ChangeUnit,
  file: ParsedFile,
  loaded: { text: string; oldText: string; partial: boolean },
  variant: FileVariant,
): BuiltFile {
  return {
    path: file.path,
    oldPath:
      file.oldPath && file.oldPath !== "/dev/null" ? file.oldPath : undefined,
    status: file.status,
    spectral: "text",
    units: [unit.id],
    prs: unitPrs(unit),
    additions: file.additions,
    deletions: file.deletions,
    binary: file.binary,
    partial: loaded.partial,
    patch: file.patch,
    text: loaded.text,
    oldText: loaded.oldText,
    variants: [variant],
    symbols: [],
    complexityDelta: 0,
  };
}

function variantFrom(
  unit: ChangeUnit,
  file: ParsedFile,
  loaded: { text: string; oldText: string; partial: boolean },
): FileVariant {
  return {
    unit: unit.id,
    pr: unit.pr,
    patch: file.patch,
    text: loaded.text,
    oldText: loaded.oldText,
    partial: loaded.partial,
  };
}

function stackTips(
  variants: FileVariant[],
  units: ChangeUnit[],
): FileVariant[] {
  return variants.filter((variant) => {
    const unit = units.find((item) => item.id === variant.unit);
    if (!unit?.head) return true;
    return !variants.some((other) => {
      if (other.unit === variant.unit) return false;
      const otherUnit = units.find((item) => item.id === other.unit);
      return otherUnit ? isAncestor(unit, otherUnit, units) : false;
    });
  });
}

function isAncestor(
  ancestor: ChangeUnit,
  descendant: ChangeUnit,
  units: ChangeUnit[],
): boolean {
  if (!ancestor.head) return false;
  const byHead = new Map(
    units.flatMap((unit) => (unit.head ? [[unit.head, unit] as const] : [])),
  );
  let base = descendant.base;
  const seen = new Set<string>();
  while (base && !seen.has(base)) {
    seen.add(base);
    if (base === ancestor.head) return true;
    const parent = byHead.get(base);
    if (!parent) return false;
    base = parent.base;
  }
  return false;
}

function loadFile(
  root: string,
  unit: ChangeUnit,
  file: ParsedFile,
): { text: string; oldText: string; partial: boolean } {
  if (file.binary || file.status === "deleted") {
    const oldText =
      unit.source === "remote-diff"
        ? reconstructSide(file.patch, "old")
        : showAt(root, oldRef(unit), file.oldPath ?? file.path);
    return { text: "", oldText, partial: unit.source === "remote-diff" };
  }
  if (unit.source === "remote-diff") {
    return {
      text: reconstructSide(file.patch, "new"),
      oldText: reconstructSide(file.patch, "old"),
      partial: true,
    };
  }
  const text =
    unit.id === "staged"
      ? showAt(root, "INDEX", file.path)
      : unit.head === "WORKTREE"
        ? (readRepoFile(root, file.path) ?? "")
        : showAt(root, unit.head ?? "HEAD", file.path);
  const oldText = showAt(root, oldRef(unit), file.oldPath ?? file.path);
  if (!text && file.additions > 0) {
    return { text: reconstructSide(file.patch, "new"), oldText, partial: true };
  }
  return { text, oldText, partial: false };
}

function oldRef(unit: ChangeUnit): string {
  if (unit.id === "worktree" || unit.id === "staged" || unit.id === "unstaged")
    return "HEAD";
  return unit.base ?? "HEAD";
}

function showAt(root: string, ref: string, path: string): string {
  if (!path || path === "/dev/null") return "";
  const spec = ref === "INDEX" ? `:${path}` : `${ref}:${path}`;
  return tryGit(root, ["show", spec]) ?? "";
}

function pairSymbols(
  file: BuiltFile,
  fresh: SyntaxSymbol[],
  previous: SyntaxSymbol[],
): { symbols: BuiltSymbol[]; total: number } {
  const oldByKey = new Map(
    previous.map((symbol) => [`${symbol.kind}:${symbol.name}`, symbol]),
  );
  const used = new Set<string>();
  let total = 0;
  const symbols: BuiltSymbol[] = fresh.map((symbol) => {
    const key = `${symbol.kind}:${symbol.name}`;
    const prior = oldByKey.get(key);
    used.add(key);
    const complexity = 1 + symbol.decisions;
    const delta = complexity - (prior ? 1 + prior.decisions : 0);
    total += delta;
    return {
      ...symbol,
      path: file.path,
      complexity,
      complexityDelta: delta,
      additions: countChangedSpan(
        file.patch,
        "new",
        symbol.line,
        symbol.endLine,
      ),
      deletions: prior
        ? countChangedSpan(file.patch, "old", prior.line, prior.endLine)
        : 0,
      oldLine: prior?.line,
      oldEndLine: prior?.endLine,
      units: file.units,
      prs: file.prs,
      spectral: file.spectral,
    };
  });
  for (const [key, prior] of oldByKey) {
    if (used.has(key)) continue;
    const complexity = 1 + prior.decisions;
    total -= complexity;
    symbols.push({
      ...prior,
      path: file.path,
      complexity: 0,
      complexityDelta: -complexity,
      additions: 0,
      deletions: countChangedSpan(file.patch, "old", prior.line, prior.endLine),
      decisions: 0,
      calls: [],
      units: file.units,
      prs: file.prs,
      spectral: file.spectral,
      signature: `removed ${prior.signature}`,
    });
  }
  return { symbols, total };
}

function spectralFor(file: BuiltFile): Spectral {
  const extension = file.path.includes(".")
    ? file.path.slice(file.path.lastIndexOf("."))
    : "";
  if (CONTRACT_EXT.has(extension)) return "contract";
  const lines = [
    ...changedLines(file.patch).added,
    ...changedLines(file.patch).removed,
  ];
  const contract =
    /\b(export\s+(default\s+)?(async\s+)?(function|class|const|type|interface|enum)|public\s+|CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE|router\.|app\.(get|post|put|patch|delete)|schema\b)/i;
  const logic =
    /\b(if|else|for|while|switch|case|catch|throw|return|await|match|elif|except)\b|&&|\|\|/;
  if (lines.some((line) => contract.test(line))) return "contract";
  if (lines.some((line) => logic.test(line))) return "logic";
  return "text";
}

function collectLeads(file: BuiltFile, leads: Lead[]): void {
  const added = changedLines(file.patch).added;
  const addedText = added.join("\n");
  pushRuleLeads(file, addedText, SECURITY_RULES, "security", leads);
  pushRuleLeads(file, addedText, STATE_RULES, "state", leads);
  pushRuleLeads(file, addedText, PERF_RULES, "performance", leads);
  pushRuleLeads(file, addedText, LOGIC_RULES, "logic", leads);
  if (SECURITY_PATH.test(file.path) && file.additions + file.deletions > 0) {
    leads.push({
      category: "security",
      path: file.path,
      line: 1,
      units: file.units,
      detail: "change touches a security-sensitive path",
    });
  }
  if (
    UX_PATH.test(file.path) &&
    added.some((line) =>
      /\b(navigate|redirect|href|onClick|onSubmit|disabled|loading|empty|error)\b/.test(
        line,
      ),
    )
  ) {
    leads.push({
      category: "ux",
      path: file.path,
      line:
        lineInText(
          file.text,
          /\b(navigate|redirect|href|onClick|onSubmit|disabled|loading|empty|error)\b/,
        ) ?? 1,
      units: file.units,
      detail: "user-flow branch changed",
    });
  }
  for (const symbol of file.symbols) {
    if (
      symbol.exported &&
      !symbol.signature.startsWith("removed ") &&
      (file.spectral === "contract" || Math.abs(symbol.complexityDelta) >= 2)
    ) {
      leads.push({
        category:
          file.spectral === "contract" || symbol.kind === "type"
            ? "contract"
            : "architecture",
        path: file.path,
        line: symbol.line,
        units: file.units,
        detail: `exported ${symbol.kind} ${symbol.name} changed`,
      });
    }
    const body = excerpt(file.text, symbol.line, symbol.endLine, 80);
    if (
      /\b(for|while)\b/.test(body) &&
      /\b(await|fetch|query|select)\b/i.test(body)
    ) {
      leads.push({
        category: "performance",
        path: file.path,
        line: symbol.line,
        units: file.units,
        detail: `${symbol.name} loops around a wait or query`,
      });
    }
  }
}

function pushRuleLeads(
  file: BuiltFile,
  addedText: string,
  rules: Array<[RegExp, string]>,
  category: Lead["category"],
  leads: Lead[],
): void {
  for (const [pattern, detail] of rules) {
    if (!pattern.test(addedText)) continue;
    leads.push({
      category,
      path: file.path,
      line: lineInText(file.text, pattern) ?? 1,
      units: file.units,
      detail,
    });
  }
}

function lineInText(text: string, pattern: RegExp): number | null {
  const index = text.split(/\r?\n/).findIndex((line) => pattern.test(line));
  return index >= 0 ? index + 1 : null;
}

function collectImportNeighbors(
  file: BuiltFile,
  imports: { spec: string; line: number }[],
  known: Set<string>,
  changed: Set<string>,
  neighbors: GraphNeighbor[],
  seen: Set<string>,
): void {
  const language = languageFor(file.path);
  for (const item of imports) {
    const resolved = resolveImport(language, file.path, item.spec, known);
    if (
      !resolved ||
      resolved === file.path ||
      changed.has(resolved) ||
      neighbors.length >= 80
    )
      continue;
    const key = `${resolved}|import|${file.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    neighbors.push({
      path: resolved,
      via: file.path,
      reason: `imported by ${file.path}`,
    });
  }
}

function collectCallers(
  files: BuiltFile[],
  indexed: IndexedFile[],
  neighbors: GraphNeighbor[],
  seen: Set<string>,
): void {
  const changed = new Set(files.map((file) => file.path));
  const exported = files.flatMap((file) =>
    file.symbols
      .filter(
        (symbol) =>
          symbol.exported &&
          symbol.name.length >= 4 &&
          !symbol.signature.startsWith("removed "),
      )
      .map((symbol) => ({ symbol, path: file.path })),
  );
  if (exported.length === 0) return;
  const names = [...new Set(exported.map((item) => item.symbol.name))];
  const pattern = new RegExp(
    `\\b(${names.map(escapeRegExp).join("|")})\\s*\\(`,
    "g",
  );
  const perName = new Map<string, number>();
  for (const file of indexed) {
    if (changed.has(file.path) || neighbors.length >= 80) continue;
    pattern.lastIndex = 0;
    const matched = new Set<string>();
    for (const match of file.text.matchAll(pattern)) {
      const name = match[1];
      if (!name || matched.has(name)) continue;
      const count = perName.get(name) ?? 0;
      if (count >= 8) continue;
      matched.add(name);
      perName.set(name, count + 1);
      const owner = exported.find((item) => item.symbol.name === name);
      if (!owner) continue;
      const key = `${file.path}|caller|${name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const line = file.text.slice(0, match.index ?? 0).split(/\r?\n/).length;
      neighbors.push({
        path: file.path,
        via: owner.path,
        reason: `possible caller of ${name} at ${file.path}:${line}`,
      });
      if (neighbors.length >= 80) break;
    }
  }
}

function scoreImpact(
  files: BuiltFile[],
  leads: Lead[],
  neighbors: GraphNeighbor[],
  units: ChangeUnit[],
): Graph["impact"] {
  const total = impactFor(files, leads, neighbors);
  return {
    ...total,
    byUnit: units.map((unit) => {
      const unitFiles = files.filter((file) => file.units.includes(unit.id));
      const paths = new Set(unitFiles.map((file) => file.path));
      return {
        unitId: unit.id,
        label: unit.label,
        ...impactFor(
          unitFiles,
          leads.filter((lead) => lead.units.includes(unit.id)),
          neighbors.filter((neighbor) => paths.has(neighbor.via)),
        ),
      };
    }),
  };
}

function impactFor(
  files: BuiltFile[],
  leads: Lead[],
  neighbors: GraphNeighbor[],
): ImpactScores {
  const blastFiles = new Set(neighbors.map((neighbor) => neighbor.path)).size;
  const complexityRaw = files.reduce(
    (sum, file) => sum + file.complexityDelta,
    0,
  );
  const securityLeads = leads.filter(
    (lead) => lead.category === "security",
  ).length;
  const performanceLeads = leads.filter(
    (lead) => lead.category === "performance",
  ).length;
  return {
    blastRadius: exposureScore(blastFiles, 16),
    complexityDelta: exposureScore(Math.abs(complexityRaw), 36),
    securityExposure: exposureScore(securityLeads, 8),
    performanceImpact: exposureScore(performanceLeads, 8),
    blastFiles,
    complexityRaw,
    securityLeads,
    performanceLeads,
  };
}

function riskTier(files: BuiltFile[]): RiskTier {
  const lines = files.reduce(
    (sum, file) => sum + file.additions + file.deletions,
    0,
  );
  const security = files.some((file) => SECURITY_PATH.test(file.path));
  if (security || files.length > 50) return "full";
  if (lines <= 10 && files.length <= 20) return "trivial";
  if (lines <= 100 && files.length <= 20) return "lite";
  return "full";
}

function buildNodes(
  files: BuiltFile[],
  neighbors: GraphNeighbor[],
): GraphNode[] {
  const nodes: GraphNode[] = [];
  for (const file of files) {
    if (file.symbols.length === 0) {
      nodes.push(fileNode(file));
      continue;
    }
    for (const symbol of file.symbols) {
      nodes.push({
        id: nodeId(file.path, symbol.kind, symbol.name, symbol.line),
        name: symbol.name,
        kind: symbol.kind,
        path: file.path,
        line: symbol.line,
        endLine: symbol.endLine,
        signature: symbol.signature,
        exported: symbol.exported,
        complexity: symbol.complexity,
        complexityDelta: symbol.complexityDelta,
        spectral: file.spectral,
        role: "changed",
        units: file.units,
        prs: file.prs,
        calls: symbol.calls,
        excerpt: excerpt(
          symbol.signature.startsWith("removed ") ? file.oldText : file.text,
          symbol.line,
          symbol.endLine,
          12,
        ),
        additions: symbol.additions,
        deletions: symbol.deletions,
        oldLine: symbol.oldLine,
        oldEndLine: symbol.oldEndLine,
      });
    }
  }
  const seen = new Set<string>();
  for (const neighbor of neighbors) {
    if (seen.has(neighbor.path) || nodes.length >= 280) continue;
    seen.add(neighbor.path);
    nodes.push({
      id: `neighbor:${neighbor.path}`,
      name: basename(neighbor.path),
      kind: "file",
      path: neighbor.path,
      line: 1,
      endLine: 1,
      signature: neighbor.reason,
      exported: false,
      complexity: 0,
      complexityDelta: 0,
      spectral: "text",
      role: "neighbor",
      units: [],
      prs: [],
      calls: [],
      excerpt: "",
      additions: 0,
      deletions: 0,
    });
  }
  return nodes;
}

function fileNode(file: BuiltFile): GraphNode {
  return {
    id: nodeId(file.path, "file", basename(file.path), 1),
    name: basename(file.path),
    kind: "file",
    path: file.path,
    line: 1,
    endLine: Math.max(1, lineCount(file.text)),
    signature: `${file.status} ${file.path}`,
    exported: false,
    complexity: 0,
    complexityDelta: file.complexityDelta,
    spectral: file.spectral,
    role: "changed",
    units: file.units,
    prs: file.prs,
    calls: [],
    excerpt: excerpt(file.text || file.oldText, 1, 12, 12),
    additions: file.additions,
    deletions: file.deletions,
  };
}

function buildEdges(
  files: BuiltFile[],
  nodes: GraphNode[],
  neighbors: GraphNeighbor[],
): GraphEdge[] {
  const edges: GraphEdge[] = [];
  const byPath = new Map<string, GraphNode[]>();
  for (const node of nodes) {
    const list = byPath.get(node.path) ?? [];
    list.push(node);
    byPath.set(node.path, list);
  }
  for (const file of files) {
    const locals = new Map(
      file.symbols.map((symbol) => [
        symbol.name,
        nodeId(file.path, symbol.kind, symbol.name, symbol.line),
      ]),
    );
    for (const symbol of file.symbols) {
      for (const call of symbol.calls) {
        const target = locals.get(call);
        const source = locals.get(symbol.name);
        if (!target || !source || target === source) continue;
        edges.push({ from: source, to: target, kind: "call" });
      }
    }
  }
  for (const neighbor of neighbors) {
    const target = nodes.find(
      (node) => node.role === "neighbor" && node.path === neighbor.path,
    );
    const sources = byPath.get(neighbor.via) ?? [];
    const source = sources[0];
    if (!target || !source) continue;
    if (neighbor.reason.startsWith("possible caller"))
      edges.push({ from: target.id, to: source.id, kind: "caller" });
    else edges.push({ from: source.id, to: target.id, kind: "import" });
  }
  const changed = new Set(files.map((file) => file.path));
  for (const file of files) {
    const source = byPath.get(file.path)?.[0];
    if (!source || !file.text) continue;
    for (const item of parseSyntax(file.path, file.text).imports) {
      const resolved = resolveImport(
        languageFor(file.path),
        file.path,
        item.spec,
        changed,
      );
      if (!resolved || resolved === file.path) continue;
      const target = byPath.get(resolved)?.[0];
      if (!target || target.id === source.id) continue;
      edges.push({ from: source.id, to: target.id, kind: "import" });
    }
  }
  const seen = new Set<string>();
  return edges.filter((edge) => {
    const key = `${edge.from}|${edge.to}|${edge.kind}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function indexRepository(
  root: string,
  required: Set<string>,
): { files: IndexedFile[]; truncated: boolean } {
  const files: IndexedFile[] = [];
  const state = { files: 0, bytes: 0, truncated: false };
  walk(root, root, files, state);
  for (const path of required) {
    if (files.some((file) => file.path === path) || !isSourcePath(path))
      continue;
    const text = readCapped(join(root, path), 200_000);
    if (text == null) continue;
    files.push({ path, text, language: languageFor(path) });
  }
  return { files, truncated: state.truncated };
}

function walk(
  root: string,
  directory: string,
  files: IndexedFile[],
  state: { files: number; bytes: number; truncated: boolean },
): void {
  if (state.files >= 3000 || state.bytes >= 40_000_000) {
    state.truncated = true;
    return;
  }
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (state.files >= 3000 || state.bytes >= 40_000_000) {
      state.truncated = true;
      return;
    }
    if (entry.name.startsWith(".git") || SKIP_DIRS.has(entry.name)) continue;
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(root, full, files, state);
      continue;
    }
    if (!entry.isFile()) continue;
    const path = toPosix(full.slice(root.length + 1));
    if (!isSourcePath(path) || isNoise(path)) continue;
    const text = readCapped(full, 200_000);
    if (text == null) continue;
    state.files += 1;
    state.bytes += text.length;
    files.push({ path, text, language: languageFor(path) });
  }
}

function readCapped(path: string, limit: number): string | null {
  try {
    if (statSync(path).size > limit) return null;
    const text = readFileSync(path, "utf8");
    if (text.includes("\0")) return null;
    return text;
  } catch {
    return null;
  }
}

function nodeId(
  path: string,
  kind: string,
  name: string,
  line: number,
): string {
  return `${path}#${kind}:${name}:${line}`;
}

function unitPrs(unit: ChangeUnit): Array<number | string> {
  return unit.pr ? [unit.pr] : [unit.label];
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function uniqueValues(values: Array<number | string>): Array<number | string> {
  return [...new Set(values)];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
