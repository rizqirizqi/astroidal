import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tryGit } from "./git.js";
import type { Graph } from "./types.js";

interface LogCusp {
  path: string;
  symbol: string;
  quote: string;
}

interface LogMatch {
  path: string;
  symbol: string;
  head: string;
}

interface LogRow {
  head: string;
  verdict: string;
  score: number;
  cusps: LogCusp[];
  matched: LogMatch[];
}

export function appendReviewLog(root: string, graph: Graph): void {
  const path = join(root, ".astroidal", "log.jsonl");
  const prior = readLog(path);
  const cusps = (graph.findings ?? []).flatMap((finding) => {
    const locations =
      finding.locations?.length > 0
        ? finding.locations
        : [
            {
              path: finding.path,
              line: finding.line,
              quote: finding.quote,
              symbol: null as string | null,
            },
          ];
    return locations.map((location) => ({
      path: location.path,
      symbol: location.symbol || symbolAt(graph, location.path, location.line),
      quote: location.quote || finding.quote,
    }));
  });
  const matched: LogMatch[] = [];
  for (const cusp of cusps) {
    if (!cusp.symbol) continue;
    for (let index = prior.length - 1; index >= 0; index -= 1) {
      const row = prior[index];
      const hit = row?.cusps.some(
        (item) => item.path === cusp.path && item.symbol === cusp.symbol,
      );
      if (!hit || !row) continue;
      matched.push({ path: cusp.path, symbol: cusp.symbol, head: row.head });
      break;
    }
  }
  const row: LogRow = {
    head: tryGit(root, ["rev-parse", "HEAD"])?.trim() ?? "",
    verdict: graph.score.verdict,
    score: graph.score.value,
    cusps,
    matched,
  };
  appendFileSync(path, `${JSON.stringify(row)}\n`);
}

function readLog(path: string): LogRow[] {
  if (!existsSync(path)) return [];
  const rows: LogRow[] = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as LogRow;
      if (!Array.isArray(parsed.cusps)) continue;
      rows.push(parsed);
    } catch {
      continue;
    }
  }
  return rows;
}

function symbolAt(graph: Graph, path: string, line: number | null): string {
  if (line == null) return "";
  const nodes = graph.nodes.filter(
    (node) => node.path === path && node.kind !== "file",
  );
  const hit = nodes.find((node) => line >= node.line && line <= node.endLine);
  return hit?.name ?? "";
}
