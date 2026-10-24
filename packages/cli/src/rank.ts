import { verdictLabel } from "./analyze.js";
import type {
  DroppedFinding,
  Graph,
  RankedFinding,
  ReviewGroup,
  Severity,
} from "./types.js";

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
};

const ALIASES: Record<string, Severity | "drop"> = {
  critical: "critical",
  crit: "critical",
  blocker: "critical",
  sev0: "critical",
  p0: "critical",
  high: "high",
  major: "high",
  sev1: "high",
  p1: "high",
  medium: "medium",
  med: "medium",
  moderate: "medium",
  sev2: "medium",
  p2: "medium",
  low: "drop",
  nit: "drop",
  nits: "drop",
  info: "drop",
  suggestion: "drop",
  style: "drop",
  trivial: "drop",
  minor: "drop",
};

interface RawFinding {
  pr?: number | string;
  severity?: string;
  description?: string;
  issue?: string;
  path?: string;
  file?: string;
  line?: number;
  quote?: string;
  recommendation?: string;
  category?: string;
}

export interface RankResult {
  findings: RankedFinding[];
  dropped: DroppedFinding[];
  groups: ReviewGroup[];
}

export function rankFindings(
  graph: Graph,
  input: unknown,
  readCorpus: (path: string) => string | null,
): RankResult {
  const record =
    typeof input === "object" && input !== null
      ? (input as { findings?: unknown })
      : null;
  if (!Array.isArray(input) && !(record && Array.isArray(record.findings))) {
    throw new Error(
      "Findings JSON must be an array, or an object with a findings array.",
    );
  }
  const raw = unwrap(input);
  const dropped: DroppedFinding[] = [];
  const accepted: RankedFinding[] = [];
  const changed = new Set(graph.files.map((file) => file.path));
  const neighbors = new Set(graph.neighbors.map((neighbor) => neighbor.path));

  for (const item of raw) {
    const description = (item.description ?? item.issue ?? "").trim();
    const path = normalizePath(item.path ?? item.file ?? "");
    const recommendation = (item.recommendation ?? "").trim();
    const quote = (item.quote ?? "").trim();
    if (!description) {
      dropped.push({
        description: description || "(blank)",
        path,
        reason: "missing description",
      });
      continue;
    }
    if (!recommendation) {
      dropped.push({ description, path, reason: "missing recommendation" });
      continue;
    }
    if (!path) {
      dropped.push({ description, path, reason: "missing path" });
      continue;
    }
    if (!changed.has(path) && !neighbors.has(path)) {
      dropped.push({
        description,
        path,
        reason: "path is outside the mapped change and its one-hop neighbors",
      });
      continue;
    }
    const severity = normalizeSeverity(item.severity);
    if (severity === "drop" || !severity) {
      dropped.push({
        description,
        path,
        reason:
          "severity is a nit, suggestion, or unspecified low-priority note",
      });
      continue;
    }
    if (quote.length < 6) {
      dropped.push({
        description,
        path,
        reason:
          "quote must be an exact line from the file, at least 6 characters",
      });
      continue;
    }
    const corpus = readCorpus(path);
    if (corpus == null) {
      dropped.push({ description, path, reason: "file could not be read" });
      continue;
    }
    const found = locateQuote(corpus, quote);
    if (found == null) {
      dropped.push({
        description,
        path,
        reason: "quote was not found in that file",
      });
      continue;
    }
    accepted.push({
      id: "",
      pr: prLabel(item.pr, path, graph),
      severity,
      description,
      path,
      line: found,
      recommendation,
      category: (item.category ?? "correctness").trim() || "correctness",
    });
  }

  const deduped: RankedFinding[] = [];
  const seen = new Map<string, RankedFinding>();
  for (const finding of accepted) {
    const key = `${finding.pr}|${finding.path}|${finding.description.toLowerCase().replace(/\s+/g, " ").slice(0, 140)}`;
    const previous = seen.get(key);
    if (!previous) {
      seen.set(key, finding);
      deduped.push(finding);
      continue;
    }
    if (SEVERITY_RANK[finding.severity] < SEVERITY_RANK[previous.severity]) {
      previous.severity = finding.severity;
      previous.recommendation = finding.recommendation;
      previous.line = finding.line;
    }
    dropped.push({
      description: finding.description,
      path: finding.path,
      reason: `duplicate of ${finding.path}`,
    });
  }

  deduped.sort(
    (left, right) =>
      SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity] ||
      left.path.localeCompare(right.path) ||
      (left.line ?? 0) - (right.line ?? 0),
  );
  deduped.forEach((finding, index) => {
    finding.id = `A-${String(index + 1).padStart(3, "0")}`;
  });
  return { findings: deduped, dropped, groups: readGroups(input, graph) };
}

export function renderReview(graph: Graph, result: RankResult): string {
  const scope =
    graph.units.map((unit) => unit.label).join(", ") || "local changes";
  const lines = [
    "# Astroidal review",
    "",
    "The AI code review map for this change: blast radius, verified findings, and one score.",
    "",
    `Scope: ${scope}`,
    "",
    ...(graph.score
      ? [
          `Score: ${graph.score.value} · ${verdictLabel(graph.score.verdict)}. ${graph.score.reason}`,
          "",
        ]
      : []),
    "Chart: `.astroidal/constellation.html`",
    "",
    "| ID | Severity | Issue Description | File Path | Recommendation | PR |",
    "| --- | --- | --- | --- | --- | --- |",
  ];
  if (result.findings.length === 0)
    lines.push("| | | No confirmed findings. | | | |");
  for (const finding of result.findings) {
    lines.push(
      `| ${cell(finding.id)} | ${cell(finding.severity)} | ${cell(finding.description)} | ${cell(formatPath(finding))} | ${cell(finding.recommendation)} | ${cell(finding.pr)} |`,
    );
  }
  lines.push("");
  if (result.dropped.length > 0) {
    lines.push("## Dropped", "");
    for (const item of result.dropped)
      lines.push(
        `- ${item.path || "(no path)"}: ${item.reason}. ${item.description}`,
      );
    lines.push("");
  }
  return lines.join("\n");
}

function readGroups(input: unknown, graph: Graph): ReviewGroup[] {
  if (typeof input !== "object" || input === null || !("groups" in input))
    return [];
  const raw = input.groups;
  if (!Array.isArray(raw)) return [];
  const known = new Set([
    ...graph.files.map((file) => file.path),
    ...graph.neighbors.map((neighbor) => neighbor.path),
  ]);
  const groups: ReviewGroup[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as { name?: unknown; paths?: unknown };
    const name =
      typeof record.name === "string" ? record.name.trim().slice(0, 48) : "";
    const paths = Array.isArray(record.paths)
      ? [
          ...new Set(
            record.paths
              .filter((path): path is string => typeof path === "string")
              .map(normalizePath)
              .filter((path) => known.has(path)),
          ),
        ]
      : [];
    if (!name || paths.length < 2) continue;
    groups.push({ name, paths });
    if (groups.length >= 12) break;
  }
  return groups;
}

function unwrap(input: unknown): RawFinding[] {
  if (Array.isArray(input)) return input.filter(isRecord);
  if (
    typeof input === "object" &&
    input !== null &&
    "findings" in input &&
    Array.isArray(input.findings)
  ) {
    return input.findings.filter(isRecord);
  }
  return [];
}

function isRecord(value: unknown): value is RawFinding {
  return typeof value === "object" && value !== null;
}

function normalizeSeverity(
  value: string | undefined,
): Severity | "drop" | null {
  if (!value) return null;
  return ALIASES[value.trim().toLowerCase()] ?? null;
}

function normalizePath(value: string): string {
  return value.trim().replaceAll("\\", "/").replace(/^\.\//, "");
}

function locateQuote(corpus: string, quote: string): number | null {
  const marker = corpus.indexOf("\n--- previous ---");
  const current = marker >= 0 ? corpus.slice(0, marker) : corpus;
  return lineContaining(current, quote) ?? lineContaining(corpus, quote);
}

function lineContaining(text: string, quote: string): number | null {
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if ((lines[index] ?? "").includes(quote)) return index + 1;
  }
  const at = text.replace(/\r\n/g, "\n").indexOf(quote);
  if (at < 0) return null;
  return text.replace(/\r\n/g, "\n").slice(0, at).split("\n").length;
}

function prLabel(
  value: number | string | undefined,
  path: string,
  graph: Graph,
): string {
  if (typeof value === "number") return `PR ${value}`;
  if (typeof value === "string" && value.trim())
    return /^\d+$/.test(value.trim()) ? `PR ${value.trim()}` : value.trim();
  const file = graph.files.find((item) => item.path === path);
  const labels = (file?.units ?? []).map(
    (id) => graph.units.find((unit) => unit.id === id)?.label ?? id,
  );
  return labels.join(", ") || "local";
}

function formatPath(finding: RankedFinding): string {
  return finding.line ? `${finding.path}:${finding.line}` : finding.path;
}

function cell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}
