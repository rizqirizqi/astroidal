#!/usr/bin/env node
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { buildMap, scoreReview, verdictLabel } from "./analyze.js";
import { appendReviewLog } from "./log.js";
import { writeEvidence, readEvidence } from "./evidence.js";
import { CommandError, repoRoot } from "./git.js";
import { renderConstellation } from "./html.js";
import { installSkill, packageRoot, refreshGlobalSkill } from "./init.js";
import { writePackets } from "./packets.js";
import { readRepoFile, resolveScope } from "./scope.js";
import { postComment } from "./comment.js";
import { assignUnitScores, rankFindings, renderReview } from "./rank.js";
import type { Graph, GraphOptions } from "./types.js";

const HELP = `Astroidal is the AI code review map, scorer, and helper.
It draws the blast radius, hands an agent a bug map, and scores what survives.
It does not add itself as a dependency.

  npx --yes astroidal init
  npx --yes astroidal graph
  npx --yes astroidal rank
  npx --yes astroidal comment

graph
  --pr 12,18          Explicit pull requests. Local branches are diffed with git.
  --open              Open pull requests, capped by --limit (default 20).
  --author login      Filter open pull requests. Repeatable.
  --label name        Filter open pull requests. Repeatable; any label matches.
  --base branch       Diff base, open-PR filter, or stack stop.
  --stack             Current branch plus parent pull requests.
  --commit sha        One commit.
  --staged            Staged changes only.
  --unstaged          Unstaged changes and untracked files.
  --limit n           Cap the open pull request list.
  --repo path         Repository to map. Defaults to the current directory.

With no scope flags, a dirty worktree maps uncommitted changes. A clean
branch maps that branch against the default base. GitHub pull requests use
gh. GitLab merge requests use glab when the origin host is GitLab, or when
that host is listed in the glab config.

rank
  --findings file     Defaults to .astroidal/findings.json

rank exits 1 on Fix first. Passed and Review exit 0. A missing map or
findings file still errors.

comment
  --pr n              Pull request or merge request to update.
                      Defaults to the one pull request on the map.

comment writes one comment: the score, the verdict, and the cusp paths.
It updates that comment on the next run. It does not approve, merge,
or request reviewers.

init
  --agent name        agents, claude, codex, copilot, cursor, or all.
                      Repeatable. Default: agents (.agents/skills).
  --force             Replace an installed skill, including local edits.
  --global            Install for every repository, under the home directory.

Codex reads the default .agents/skills copy. --agent copilot uses
.github/skills in a repo and ~/.copilot/skills for --global.
graph and rank update an unmodified global skill when this package is newer.
`;

export function main(argv: string[]): number {
  const parsed = parseArgs(argv);
  const command = parsed.command;
  if (
    !command ||
    command === "help" ||
    parsed.flags.has("help") ||
    parsed.flags.has("h")
  ) {
    console.log(HELP);
    return 0;
  }
  if (command === "version" || parsed.flags.has("version")) {
    console.log(readVersion());
    return 0;
  }
  const start = (parsed.flags.get("repo") ?? [])[0] ?? process.cwd();
  if (command === "init") {
    const notes = installSkill(
      start,
      enabled(parsed.flags, "force"),
      enabled(parsed.flags, "global"),
      parsed.flags.get("agent"),
    );
    console.log(
      [
        "Astroidal skill installed. The AI code review map is ready.",
        "No dependency was added.",
        ...notes,
        "Map a change with: npx --yes astroidal graph",
        "Then open .astroidal/constellation.html and share the score.",
      ].join("\n"),
    );
    return 0;
  }
  if (command === "graph") {
    const scope = resolveScope(start, graphOptions(parsed.flags));
    const built = buildMap(scope);
    assertMappable(built.graph);
    const directory = join(scope.root, ".astroidal");
    mkdirSync(directory, { recursive: true });
    writeEvidence(scope.root, built.files);
    writeFileSync(
      join(directory, "graph.json"),
      JSON.stringify(built.graph, null, 2),
    );
    writePackets(directory, built);
    writeFileSync(
      join(directory, "constellation.html"),
      renderConstellation(built.graph),
    );
    console.log(
      [refreshGlobalSkill(), summarize(built.graph)].filter(Boolean).join("\n"),
    );
    return 0;
  }
  if (command === "rank") {
    const root = repoRoot(start);
    const graphPath = join(root, ".astroidal", "graph.json");
    if (!existsSync(graphPath))
      throw new CommandError("Run astroidal graph before rank.");
    const findingsPath =
      (parsed.flags.get("findings") ?? [])[0] ??
      join(root, ".astroidal", "findings.json");
    if (!existsSync(findingsPath)) {
      throw new CommandError(
        `Write findings to ${findingsPath} before rank.\nEach finding needs severity, description, path, quote, and recommendation.`,
      );
    }
    const graph = JSON.parse(readFileSync(graphPath, "utf8")) as Graph;
    assertMappable(graph);
    const input = JSON.parse(readFileSync(findingsPath, "utf8")) as unknown;
    const ranked = rankFindings(graph, input, (path) =>
      corpus(root, graph, path),
    );
    graph.findings = ranked.findings;
    graph.groups = ranked.groups;
    graph.summary.reviewed = true;
    graph.score = scoreReview({
      impact: graph.impact,
      findings: ranked.findings,
      reviewed: true,
      partial: graph.files.some((file) => file.partial),
      additions: graph.summary.additions,
      deletions: graph.summary.deletions,
      files: graph.summary.files,
      symbols: graph.summary.symbols,
      agentScore: ranked.agentScore,
      covered: ranked.covered,
      baseline: graph.baseline
        ? {
            blast: graph.impact.blastRadius,
            median: graph.baseline.blastMedian,
            branch: graph.baseline.branch,
          }
        : null,
    });
    assignUnitScores(graph, ranked.findings, ranked.missing, ranked.agentScore);
    const directory = join(root, ".astroidal");
    writeFileSync(
      join(directory, "graph.json"),
      JSON.stringify(graph, null, 2),
    );
    writeFileSync(join(directory, "review.md"), renderReview(graph, ranked));
    appendReviewLog(root, graph);
    writeFileSync(
      join(directory, "constellation.html"),
      renderConstellation(graph),
    );
    const verdict = verdictLabel(graph.score.verdict);
    console.log(
      [
        refreshGlobalSkill(),
        `Kept ${ranked.findings.length} findings. Dropped ${ranked.dropped.length}.\nWrote .astroidal/review.md and updated .astroidal/constellation.html\nShare: Astroidal ${graph.score.value} · ${verdict} on ${graph.repoName}. The AI code review map. npx --yes astroidal graph`,
      ]
        .filter(Boolean)
        .join("\n"),
    );
    return graph.score.verdict === "fix" ? 1 : 0;
  }
  if (command === "comment") {
    const root = repoRoot(start);
    console.log(
      [
        refreshGlobalSkill(),
        postComment(root, (parsed.flags.get("pr") ?? [])[0]),
      ]
        .filter(Boolean)
        .join("\n"),
    );
    return 0;
  }
  throw new CommandError(`Unknown command "${command}". Run astroidal --help.`);
}

function corpus(root: string, graph: Graph, path: string): string | null {
  const changed = graph.files.some((file) => file.path === path);
  const neighbor = graph.neighbors.some((item) => item.path === path);
  if (!changed && !neighbor) return null;
  if (changed) {
    const saved = readEvidence(root, path);
    if (saved != null) return saved;
  }
  return readRepoFile(root, path);
}

function assertMappable(graph: Graph): void {
  if (graph.summary.files > 0) return;
  const detail = graph.notes.filter(Boolean).join("\n");
  throw new CommandError(
    ["No changes to map. An empty diff does not get a score.", detail]
      .filter(Boolean)
      .join("\n"),
  );
}

function summarize(graph: Graph): string {
  const impact = graph.impact;
  const lines = [
    `Mapped ${graph.units.map((unit) => unit.label).join(", ") || "nothing"}: ${graph.summary.files} files, ${graph.summary.symbols} symbols, ${graph.summary.neighbors} neighbors.`,
    `Impact: blast ${impact.blastRadius} (${impact.blastFiles} files), complexity ${impact.complexityRaw >= 0 ? "+" : ""}${impact.complexityRaw}, security ${impact.securityExposure}, performance ${impact.performanceImpact}.`,
    `Score ${graph.score.value}: ${verdictLabel(graph.score.verdict)}. ${graph.score.reason}`,
    ...graph.notes,
    graph.commands.length > 0 ? `Commands: ${graph.commands.join(" | ")}` : "",
    "Wrote .astroidal/constellation.html and .astroidal/packets/bug-map.md",
  ];
  return lines.filter(Boolean).join("\n");
}

function graphOptions(flags: Map<string, string[]>): GraphOptions {
  const prs = (flags.get("pr") ?? [])
    .flatMap((value) => value.split(","))
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);
  const limit = Number((flags.get("limit") ?? [])[0] ?? 20);
  return {
    prs,
    open: enabled(flags, "open"),
    authors: flags.get("author") ?? [],
    labels: flags.get("label") ?? [],
    base: (flags.get("base") ?? [])[0],
    stack: enabled(flags, "stack"),
    commit: (flags.get("commit") ?? [])[0],
    staged: enabled(flags, "staged"),
    unstaged: enabled(flags, "unstaged"),
    limit: Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 20,
  };
}

export function parseArgs(argv: string[]): {
  command?: string;
  flags: Map<string, string[]>;
} {
  const flags = new Map<string, string[]>();
  const positionals: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    if (arg === "--") continue;
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
    const body = arg.slice(2);
    const eq = body.indexOf("=");
    const key = eq === -1 ? body : body.slice(0, eq);
    const values = flags.get(key) ?? [];
    if (eq !== -1) values.push(body.slice(eq + 1));
    else if (argv[index + 1] && !(argv[index + 1] ?? "").startsWith("--")) {
      values.push(argv[index + 1] ?? "");
      index += 1;
    } else values.push("true");
    flags.set(key, values);
  }
  return { command: positionals[0], flags };
}

function enabled(flags: Map<string, string[]>, name: string): boolean {
  const values = flags.get(name);
  if (!values) return false;
  return values.every((value) => value !== "false");
}

function readVersion(): string {
  const file = join(packageRoot(), "package.json");
  const pkg = JSON.parse(readFileSync(file, "utf8")) as { version?: string };
  return pkg.version ?? "0.0.0";
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(entry)).href;
  } catch {
    return import.meta.url === pathToFileURL(entry).href;
  }
}

if (isDirectRun()) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  }
}
