import { readFileSync, statSync } from "node:fs";
import { parseUnifiedDiff, synthesizeAddition } from "./diff.js";
import {
  CommandError,
  gh,
  ghAvailable,
  git,
  repoRoot,
  tryGh,
  tryGit,
} from "./git.js";
import { insideRoot, toPosix } from "./paths.js";
import type { ChangeUnit, GraphOptions, ParsedFile } from "./types.js";

interface GhPull {
  number: number;
  title?: string;
  headRefName: string;
  baseRefName: string;
  url?: string;
  author?: { login?: string };
  labels?: Array<{ name?: string }>;
}

interface SelectedPull {
  number?: number;
  title?: string;
  url?: string;
  head: string;
  base: string;
  origin: "explicit" | "open" | "stack";
}

export interface ScopeResult {
  root: string;
  units: ChangeUnit[];
  notes: string[];
  commands: string[];
}

const GH_FIELDS = "number,title,headRefName,baseRefName,url,author,labels";

export function resolveScope(
  start: string,
  options: GraphOptions,
): ScopeResult {
  const root = repoRoot(start);
  const notes: string[] = [];
  const commands: string[] = [];
  const targeted =
    options.prs.length > 0 ||
    options.open ||
    options.authors.length > 0 ||
    options.labels.length > 0 ||
    options.stack ||
    Boolean(options.commit) ||
    options.staged ||
    options.unstaged;
  const units: ChangeUnit[] = [];

  if (options.commit) units.push(loadCommit(root, options.commit, commands));
  if (options.staged) units.push(loadWorktree(root, "staged", commands));
  if (options.unstaged) units.push(loadWorktree(root, "unstaged", commands));

  const selected: SelectedPull[] = [];
  if (options.open || options.authors.length > 0 || options.labels.length > 0) {
    selected.push(...listOpen(root, options, commands, notes));
  }
  for (const number of options.prs)
    selected.push(viewExplicit(root, number, commands));
  if (options.stack)
    selected.push(...walkStack(root, options, commands, notes));

  for (const pull of dedupePulls(selected, options.limit, notes)) {
    units.push(loadPull(root, pull, commands, notes));
  }

  if (!targeted) {
    const dirty = worktreeDirty(root);
    if (dirty && !options.base) {
      notes.push(
        "Mapped uncommitted changes, including untracked files. Pass --base <branch> to map the branch instead.",
      );
      units.push(loadWorktree(root, "all", commands));
    } else {
      const base = options.base ?? detectDefaultBase(root, notes);
      const branch = currentBranch(root);
      notes.push(`Mapped ${branch} against ${base}.`);
      if (dirty)
        notes.push(
          "Uncommitted changes are not in this map. Run without --base to map them.",
        );
      units.push(loadBranch(root, branch, base, branch, commands, notes));
    }
  }

  if (units.every((unit) => unit.files.length === 0))
    notes.push("No changes were in scope.");
  return { root, units, notes, commands };
}

function listOpen(
  root: string,
  options: GraphOptions,
  commands: string[],
  notes: string[],
): SelectedPull[] {
  if (!ghAvailable()) {
    throw new CommandError(
      "Listing open pull requests needs the GitHub CLI (gh) and an authenticated repository. Review the current branch, or pass --pr for branches that are already local.",
    );
  }
  const fetchLimit =
    options.labels.length > 0 ? Math.max(options.limit, 100) : options.limit;
  const args = [
    "pr",
    "list",
    "--state",
    "open",
    "--limit",
    String(fetchLimit),
    "--json",
    GH_FIELDS,
  ];
  if (options.authors.length === 1)
    args.push("--author", options.authors[0] ?? "");
  if (options.base) args.push("--base", shortName(options.base));
  record(commands, "gh", args);
  const pulls = parseGh<GhPull[]>(gh(root, args), "pull request list");
  const matched = pulls.filter((pull) => matchesFilter(pull, options));
  if (pulls.length === fetchLimit)
    notes.push(
      `GitHub returned ${fetchLimit} open pull requests. Raise --limit if the batch is larger.`,
    );
  return matched.map((pull) => ({
    number: pull.number,
    title: pull.title,
    url: pull.url,
    head: pull.headRefName,
    base: pull.baseRefName,
    origin: "open",
  }));
}

function viewExplicit(
  root: string,
  number: number,
  commands: string[],
): SelectedPull {
  if (!ghAvailable())
    throw new CommandError(
      `Reading pull request ${number} needs the GitHub CLI (gh).`,
    );
  const args = ["pr", "view", String(number), "--json", GH_FIELDS];
  record(commands, "gh", args);
  const pull = parseGh<GhPull>(gh(root, args), `pull request ${number}`);
  return {
    number: pull.number,
    title: pull.title,
    url: pull.url,
    head: pull.headRefName,
    base: pull.baseRefName,
    origin: "explicit",
  };
}

function walkStack(
  root: string,
  options: GraphOptions,
  commands: string[],
  notes: string[],
): SelectedPull[] {
  const chain: SelectedPull[] = [];
  const seen = new Set<string>();
  const stop = shortName(options.base ?? detectDefaultBase(root, notes));
  let branch = currentBranch(root);
  while (branch && !seen.has(branch) && chain.length < 15) {
    seen.add(branch);
    const meta = lookupHead(root, branch, commands);
    const base = shortName(
      meta?.baseRefName ?? upstreamBase(root, branch) ?? stop,
    );
    chain.push({
      number: meta?.number,
      title: meta?.title,
      url: meta?.url,
      head: branch,
      base,
      origin: "stack",
    });
    if (!base || base === stop || base === branch || seen.has(base)) break;
    branch = base;
  }
  notes.push(
    chain.length > 1
      ? `Mapped a stack of ${chain.length} branches.`
      : "Stack walk found the current branch only.",
  );
  return chain;
}

function lookupHead(
  root: string,
  head: string,
  commands: string[],
): GhPull | null {
  if (!ghAvailable() || head === "HEAD") return null;
  const args = [
    "pr",
    "list",
    "--head",
    head,
    "--state",
    "open",
    "--limit",
    "1",
    "--json",
    GH_FIELDS,
  ];
  record(commands, "gh", args);
  const text = tryGh(root, args);
  if (!text) return null;
  const pulls = parseGh<GhPull[]>(text, `pull request for ${head}`);
  return pulls[0] ?? null;
}

function dedupePulls(
  pulls: SelectedPull[],
  limit: number,
  notes: string[],
): SelectedPull[] {
  const explicit: SelectedPull[] = [];
  const stack: SelectedPull[] = [];
  const open: SelectedPull[] = [];
  const seen = new Set<string>();
  for (const pull of pulls) {
    const key = pull.number ? `pr:${pull.number}` : `branch:${pull.head}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (pull.origin === "explicit") explicit.push(pull);
    else if (pull.origin === "stack") stack.push(pull);
    else open.push(pull);
  }
  const openKept = open.slice(0, limit);
  if (open.length > openKept.length)
    notes.push(
      `Kept ${openKept.length} of ${open.length} open pull requests because --limit is ${limit}.`,
    );
  return [...explicit, ...stack, ...openKept];
}

function loadPull(
  root: string,
  pull: SelectedPull,
  commands: string[],
  notes: string[],
): ChangeUnit {
  const headRef = resolveRef(root, pull.head);
  const baseRef = resolveRef(root, pull.base);
  let files: ParsedFile[] = [];
  let source: ChangeUnit["source"] = "local";
  if (headRef && baseRef) files = diffRange(root, baseRef, headRef, commands);
  else if (pull.number && ghAvailable()) {
    const args = ["pr", "diff", String(pull.number)];
    record(commands, "gh", args);
    files = parseUnifiedDiff(gh(root, args));
    source = "remote-diff";
    notes.push(
      `PR ${pull.number} is not checked out locally. Its diff was read with one gh pr diff.`,
    );
  } else {
    notes.push(
      `Could not read ${pull.head}. Check the branch out locally, or authenticate gh.`,
    );
  }
  return {
    id: pull.number ? `pr:${pull.number}` : `branch:${pull.head}`,
    label: pull.number ? `PR ${pull.number}` : pull.head,
    pr: pull.number,
    title: pull.title,
    url: pull.url,
    source,
    base: pull.base,
    head: pull.head,
    files,
  };
}

function loadBranch(
  root: string,
  label: string,
  base: string,
  head: string,
  commands: string[],
  notes: string[],
): ChangeUnit {
  const baseRef = resolveRef(root, base);
  const headRef = resolveRef(root, head);
  const files =
    baseRef && headRef ? diffRange(root, baseRef, headRef, commands) : [];
  if (!baseRef || !headRef)
    notes.push(`Could not diff ${head} against ${base}.`);
  return { id: `branch:${label}`, label, source: "local", base, head, files };
}

function loadCommit(root: string, sha: string, commands: string[]): ChangeUnit {
  const args = ["show", "--format=", "--unified=3", sha];
  record(commands, "git", args);
  const files = parseUnifiedDiff(git(root, args));
  const short = sha.slice(0, 7);
  return {
    id: `commit:${short}`,
    label: `commit ${short}`,
    source: "local",
    head: sha,
    files,
  };
}

function loadWorktree(
  root: string,
  mode: "all" | "staged" | "unstaged",
  commands: string[],
): ChangeUnit {
  const args =
    mode === "staged"
      ? ["diff", "--cached", "--unified=3"]
      : mode === "unstaged"
        ? ["diff", "--unified=3"]
        : ["diff", "HEAD", "--unified=3"];
  record(commands, "git", args);
  const files = parseUnifiedDiff(tryGit(root, args) ?? "");
  if (mode !== "staged") {
    record(commands, "git", ["status", "--porcelain=v1", "-z"]);
    for (const path of untracked(root)) {
      const absolute = insideRoot(root, path);
      if (!absolute) continue;
      let text = "";
      try {
        if (statSync(absolute).size > 400_000) continue;
        text = readFileSync(absolute, "utf8");
      } catch {
        continue;
      }
      if (text.includes("\0")) continue;
      files.push(synthesizeAddition(path, text));
    }
  }
  const label = mode === "all" ? "worktree" : mode;
  return {
    id: label,
    label,
    source: "local",
    head: mode === "staged" ? "INDEX" : "WORKTREE",
    files,
  };
}

function diffRange(
  root: string,
  base: string,
  head: string,
  commands: string[],
): ParsedFile[] {
  const args = ["diff", "--unified=3", `${base}...${head}`];
  record(commands, "git", args);
  return parseUnifiedDiff(git(root, args));
}

function untracked(root: string): string[] {
  const raw = tryGit(root, ["status", "--porcelain=v1", "-z"]) ?? "";
  const chunks = raw.split("\0");
  const paths: string[] = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    if (!chunk) continue;
    const xy = chunk.slice(0, 2);
    let path = chunk.slice(2);
    if (path.startsWith(" ")) path = path.slice(1);
    if (xy.includes("R") || xy.includes("C")) {
      path = chunks[index + 1] ?? path;
      index += 1;
    }
    if (xy === "??") paths.push(toPosix(path));
  }
  return paths;
}

function worktreeDirty(root: string): boolean {
  const raw = tryGit(root, ["status", "--porcelain=v1"]) ?? "";
  return raw.trim().length > 0;
}

function detectDefaultBase(root: string, notes: string[]): string {
  const origin = tryGit(root, [
    "symbolic-ref",
    "--short",
    "refs/remotes/origin/HEAD",
  ])?.trim();
  if (origin) return origin;
  for (const name of ["main", "master", "trunk", "develop"]) {
    const ref = resolveRef(root, name);
    if (ref) return ref;
  }
  notes.push(
    "No default branch was found. The branch diff falls back to HEAD.",
  );
  return "HEAD";
}

function currentBranch(root: string): string {
  const name = tryGit(root, ["rev-parse", "--abbrev-ref", "HEAD"])?.trim();
  return !name || name === "HEAD" ? "HEAD" : name;
}

function resolveRef(root: string, name: string): string | null {
  if (!name) return null;
  for (const candidate of [
    name,
    `refs/heads/${name}`,
    `refs/remotes/${name}`,
    `refs/remotes/origin/${shortName(name)}`,
  ]) {
    if (tryGit(root, ["rev-parse", "--verify", "--quiet", candidate]))
      return candidate;
  }
  return null;
}

function upstreamBase(root: string, branch: string): string | null {
  const upstream = tryGit(root, [
    "rev-parse",
    "--abbrev-ref",
    `${branch}@{upstream}`,
  ])?.trim();
  if (!upstream || upstream === "HEAD") return null;
  return shortName(upstream);
}

function matchesFilter(pull: GhPull, options: GraphOptions): boolean {
  if (
    options.authors.length > 0 &&
    !options.authors.includes(pull.author?.login ?? "")
  )
    return false;
  if (
    options.base &&
    shortName(pull.baseRefName) !== shortName(options.base) &&
    pull.baseRefName !== options.base
  )
    return false;
  if (options.labels.length > 0) {
    const names = new Set(
      (pull.labels ?? [])
        .map((label) => label.name)
        .filter((name): name is string => Boolean(name)),
    );
    if (!options.labels.some((label) => names.has(label))) return false;
  }
  return true;
}

function shortName(ref: string): string {
  return ref
    .replace(/^refs\/heads\//, "")
    .replace(/^refs\/remotes\/origin\//, "")
    .replace(/^origin\//, "");
}

function record(commands: string[], bin: string, args: string[]): void {
  commands.push([bin, ...args].join(" "));
}

function parseGh<T>(text: string, label: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new CommandError(
      `Could not parse the GitHub CLI response for ${label}.`,
    );
  }
}

export function readRepoFile(root: string, relPath: string): string | null {
  const absolute = insideRoot(root, relPath);
  if (!absolute) return null;
  try {
    if (statSync(absolute).size > 400_000) return null;
    const text = readFileSync(absolute, "utf8");
    if (text.includes("\0")) return null;
    return text;
  } catch {
    return null;
  }
}
