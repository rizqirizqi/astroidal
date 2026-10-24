import { tryGit } from "./git.js";
import { isNoise } from "./noise.js";
import {
  isSourcePath,
  languageFor,
  parseSyntax,
  resolveImport,
} from "./syntax.js";
import type { BlastBaseline } from "./types.js";

const MERGE_LIMIT = 12;
const CALLER_LIMIT = 40;

export function blastBaseline(
  root: string,
  score: (neighbors: number) => number,
): BlastBaseline | null {
  const branch = defaultBranch(root);
  if (!branch) return null;
  const listed = tryGit(root, [
    "log",
    "--merges",
    "-n",
    String(MERGE_LIMIT),
    "--format=%H",
    branch,
  ]);
  if (!listed) return null;
  const blasts: number[] = [];
  for (const commit of listed.split("\n")) {
    const hash = commit.trim();
    if (!hash) continue;
    const neighbors = neighborsAt(root, hash);
    if (neighbors == null) continue;
    blasts.push(score(neighbors));
  }
  if (blasts.length === 0) return null;
  return { branch, blastMedian: median(blasts), merges: blasts.length };
}

function defaultBranch(root: string): string | null {
  const origin = tryGit(root, [
    "symbolic-ref",
    "--short",
    "refs/remotes/origin/HEAD",
  ])?.trim();
  if (origin) return origin.replace(/^origin\//, "");
  for (const name of ["main", "master", "trunk", "develop"]) {
    if (
      tryGit(root, ["rev-parse", "--verify", "--quiet", `refs/heads/${name}`])
    )
      return name;
  }
  return null;
}

function neighborsAt(root: string, commit: string): number | null {
  const first = tryGit(root, [
    "rev-parse",
    "--verify",
    "--quiet",
    `${commit}^1`,
  ])?.trim();
  const second = tryGit(root, [
    "rev-parse",
    "--verify",
    "--quiet",
    `${commit}^2`,
  ])?.trim();
  if (!first || !second) return null;
  const names = tryGit(root, ["diff", "--name-only", first, second]);
  if (names == null) return null;
  const changed = new Set(
    names
      .split("\n")
      .map((path) => path.trim())
      .filter((path) => path.length > 0),
  );
  const known = new Set(
    (tryGit(root, ["ls-tree", "-r", "--name-only", second]) ?? "")
      .split("\n")
      .map((path) => path.trim())
      .filter((path) => path.length > 0),
  );
  const neighbors = new Set<string>();
  const exported: string[] = [];
  for (const path of changed) {
    if (isNoise(path) || !isSourcePath(path)) continue;
    const text = tryGit(root, ["show", `${second}:${path}`]) ?? "";
    if (!text || text.includes("\0")) continue;
    const parsed = parseSyntax(path, text);
    const language = languageFor(path);
    for (const item of parsed.imports) {
      const resolved = resolveImport(language, path, item.spec, known);
      if (!resolved || resolved === path || changed.has(resolved)) continue;
      neighbors.add(resolved);
    }
    for (const symbol of parsed.symbols) {
      if (symbol.exported && symbol.name.length >= 4)
        exported.push(symbol.name);
    }
  }
  if (exported.length === 0) return neighbors.size;
  const pattern = new RegExp(
    `\\b(${[...new Set(exported)].map(escapeRegExp).join("|")})\\s*\\(`,
    "g",
  );
  let scanned = 0;
  for (const path of known) {
    if (scanned >= CALLER_LIMIT || neighbors.size >= 80) break;
    if (changed.has(path) || isNoise(path) || !isSourcePath(path)) continue;
    scanned += 1;
    const text = tryGit(root, ["show", `${second}:${path}`]) ?? "";
    if (!text || text.includes("\0")) continue;
    pattern.lastIndex = 0;
    if (pattern.test(text)) neighbors.add(path);
  }
  return neighbors.size;
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  return Math.round(((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
