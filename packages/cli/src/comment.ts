import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { verdictLabel } from "./analyze.js";
import {
  detectForge,
  forgeAvailable,
  githubSlug,
  gitlabSlug,
} from "./forge.js";
import { CommandError, gh, ghInput, glab, glabInput, tryGit } from "./git.js";
import type { Graph } from "./types.js";

const MARKER = "<!-- astroidal -->";

interface ExistingComment {
  id?: number;
  body?: string;
}

export function postComment(
  root: string,
  requested: string | undefined,
): string {
  const graphPath = join(root, ".astroidal", "graph.json");
  if (!existsSync(graphPath))
    throw new CommandError("Run astroidal graph before comment.");
  const graph = JSON.parse(readFileSync(graphPath, "utf8")) as Graph;
  if (graph.score == null)
    throw new CommandError("Run astroidal graph before comment.");
  const number = resolvePull(graph, requested);
  const forge = detectForge(root);
  if (!forgeAvailable(forge)) {
    const cli = forge === "gitlab" ? "glab" : "gh";
    throw new CommandError(
      `comment needs ${cli} to post one comment. It does not approve or request reviewers.`,
    );
  }
  const origin = tryGit(root, ["remote", "get-url", "origin"])?.trim();
  if (!origin)
    throw new CommandError(
      "comment needs an origin remote to post the verdict.",
    );
  const body = commentBody(graph);
  if (forge === "gitlab") {
    const slug = gitlabSlug(origin);
    if (!slug)
      throw new CommandError(
        "Could not read the GitLab project from the origin remote.",
      );
    return publishGitlab(root, slug, number, body);
  }
  const slug = githubSlug(origin);
  if (!slug)
    throw new CommandError(
      "Could not read the GitHub repository from the origin remote.",
    );
  return publishGithub(root, slug, number, body);
}

export function commentBody(graph: Graph): string {
  const score = graph.score;
  const verdict = verdictLabel(score.verdict);
  const findings = graph.findings ?? [];
  const cusps =
    findings.length === 0
      ? "Cusps: none."
      : [
          "Cusps:",
          ...findings.map((finding) => {
            const locations =
              finding.locations?.length > 0
                ? finding.locations
                : [
                    {
                      path: finding.path,
                      line: finding.line,
                      quote: finding.quote,
                      symbol: null,
                    },
                  ];
            const where = locations
              .map((location) => {
                const line = location.line == null ? "" : `:${location.line}`;
                const symbol = location.symbol ? ` (${location.symbol})` : "";
                return `\`${location.path}${line}\`${symbol}`;
              })
              .join(", ");
            return `- ${where} ${finding.id}`;
          }),
        ].join("\n");
  const units = (graph.units ?? []).flatMap((unit) => {
    if (!unit.score || (graph.units ?? []).length < 2) return [];
    return [
      `${unit.label}: ${unit.score.value} · ${verdictLabel(unit.score.verdict)}`,
    ];
  });
  return [
    MARKER,
    `Astroidal ${score.value} · ${verdict}`,
    "",
    score.reason,
    "",
    ...(units.length > 0 ? [...units, ""] : []),
    cusps,
    "",
    "Map: `.astroidal/constellation.html`",
  ].join("\n");
}

function resolvePull(graph: Graph, requested: string | undefined): number {
  if (requested != null && requested !== "true") {
    const number = Number(requested);
    if (!Number.isInteger(number) || number <= 0)
      throw new CommandError("Pass a pull request number to comment --pr.");
    return number;
  }
  const numbers = [
    ...new Set(
      (graph.units ?? [])
        .map((unit) => unit.pr)
        .filter((pr): pr is number => pr != null && pr > 0),
    ),
  ];
  if (numbers.length === 1) return numbers[0] ?? 0;
  if (numbers.length === 0)
    throw new CommandError(
      "This map has no pull request. Pass --pr <number> to post the verdict.",
    );
  throw new CommandError(
    "This map covers more than one pull request. Pass --pr <number> to post one comment.",
  );
}

function publishGithub(
  root: string,
  slug: string,
  number: number,
  body: string,
): string {
  const listed = gh(root, [
    "api",
    "--paginate",
    `repos/${slug}/issues/${number}/comments`,
  ]);
  const existing = findComment(listed);
  const endpoint =
    existing?.id == null
      ? `repos/${slug}/issues/${number}/comments`
      : `repos/${slug}/issues/comments/${existing.id}`;
  ghInput(
    root,
    [
      "api",
      "--method",
      existing?.id == null ? "POST" : "PATCH",
      "--input",
      "-",
      endpoint,
    ],
    JSON.stringify({ body }),
  );
  const action = existing?.id == null ? "Posted" : "Updated";
  return `${action} one Astroidal comment on pull request ${number}.`;
}

function publishGitlab(
  root: string,
  slug: string,
  number: number,
  body: string,
): string {
  const project = encodeURIComponent(slug);
  const listed = glab(root, [
    "api",
    "--paginate",
    `projects/${project}/merge_requests/${number}/notes`,
  ]);
  const existing = findComment(listed);
  const endpoint =
    existing?.id == null
      ? `projects/${project}/merge_requests/${number}/notes`
      : `projects/${project}/merge_requests/${number}/notes/${existing.id}`;
  glabInput(
    root,
    [
      "api",
      "--method",
      existing?.id == null ? "POST" : "PUT",
      "--input",
      "-",
      endpoint,
    ],
    JSON.stringify({ body }),
  );
  const action = existing?.id == null ? "Posted" : "Updated";
  return `${action} one Astroidal comment on merge request ${number}.`;
}

function findComment(text: string): ExistingComment | null {
  let parsed: unknown;
  try {
    parsed = text.trim() ? (JSON.parse(text) as unknown) : [];
  } catch {
    throw new CommandError("Could not read the existing review comments.");
  }
  if (!Array.isArray(parsed))
    throw new CommandError("Could not read the existing review comments.");
  for (const item of parsed) {
    if (typeof item !== "object" || item === null) continue;
    const comment = item as ExistingComment;
    if ((comment.body ?? "").includes(MARKER)) return comment;
  }
  return null;
}
