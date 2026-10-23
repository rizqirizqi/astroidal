import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  CommandError,
  gh,
  ghAvailable,
  glab,
  glabAvailable,
  tryGh,
  tryGit,
  tryGlab,
} from "./git.js";

export type Forge = "github" | "gitlab";

export interface PullMeta {
  number: number;
  title?: string;
  headRefName: string;
  baseRefName: string;
  url?: string;
  author?: string;
  labels: string[];
}

interface GhPull {
  number: number;
  title?: string;
  headRefName: string;
  baseRefName: string;
  url?: string;
  author?: { login?: string };
  labels?: Array<{ name?: string }>;
}

interface GlabMr {
  iid?: number;
  title?: string;
  source_branch?: string;
  target_branch?: string;
  web_url?: string;
  author?: { username?: string } | string;
  labels?: Array<string | { name?: string }> | null;
}

const GH_FIELDS = "number,title,headRefName,baseRefName,url,author,labels";

export function detectForge(root: string): Forge {
  const host = originHost(root);
  const named = classifyHost(host);
  if (named) return named;
  if (host && configuredGlabHosts().has(host)) return "gitlab";
  if (glabAvailable() && !ghAvailable()) return "gitlab";
  return "github";
}

export function cliName(forge: Forge): "gh" | "glab" {
  return forge === "gitlab" ? "glab" : "gh";
}

export function forgeAvailable(forge: Forge): boolean {
  return forge === "gitlab" ? glabAvailable() : ghAvailable();
}

export function runForge(cwd: string, forge: Forge, args: string[]): string {
  return forge === "gitlab" ? glab(cwd, args) : gh(cwd, args);
}

export function tryForge(
  cwd: string,
  forge: Forge,
  args: string[],
): string | null {
  return forge === "gitlab" ? tryGlab(cwd, args) : tryGh(cwd, args);
}

export function listArgs(
  forge: Forge,
  fetchLimit: number,
  author: string | undefined,
  base: string | undefined,
): string[] {
  if (forge === "gitlab") {
    const args = [
      "mr",
      "list",
      "--output",
      "json",
      "--per-page",
      String(fetchLimit),
    ];
    if (author) args.push("--author", author);
    if (base) args.push("--target-branch", base);
    return args;
  }
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
  if (author) args.push("--author", author);
  if (base) args.push("--base", base);
  return args;
}

export function viewArgs(forge: Forge, number: number): string[] {
  return forge === "gitlab"
    ? ["mr", "view", String(number), "--output", "json"]
    : ["pr", "view", String(number), "--json", GH_FIELDS];
}

export function headArgs(forge: Forge, head: string): string[] {
  return forge === "gitlab"
    ? [
        "mr",
        "list",
        "--source-branch",
        head,
        "--output",
        "json",
        "--per-page",
        "1",
      ]
    : [
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
}

export function diffArgs(forge: Forge, number: number): string[] {
  return forge === "gitlab"
    ? ["mr", "diff", String(number), "--raw", "--color=never"]
    : ["pr", "diff", String(number)];
}

export function readPull(text: string, forge: Forge, label: string): PullMeta {
  return forge === "gitlab"
    ? normalizeGlab(parseCli<GlabMr>(text, label, forge))
    : normalizeGh(parseCli<GhPull>(text, label, forge));
}

export function readPullList(
  text: string,
  forge: Forge,
  label: string,
): PullMeta[] {
  if (!text.trim()) return [];
  if (forge === "gitlab") {
    const parsed = parseCli<GlabMr[] | GlabMr>(text, label, forge);
    const pulls = Array.isArray(parsed) ? parsed : [parsed];
    return pulls.map((pull) => normalizeGlab(pull));
  }
  const parsed = parseCli<GhPull[] | GhPull>(text, label, forge);
  const pulls = Array.isArray(parsed) ? parsed : [parsed];
  return pulls.map((pull) => normalizeGh(pull));
}

function originHost(root: string): string {
  const origin = tryGit(root, ["remote", "get-url", "origin"])?.trim();
  if (origin) return remoteHost(origin);
  const listed = tryGit(root, ["remote", "-v"]) ?? "";
  for (const line of listed.split("\n")) {
    const url = line.split(/\s+/)[1];
    if (url) return remoteHost(url);
  }
  return "";
}

function remoteHost(url: string): string {
  const trimmed = url.trim();
  if (!trimmed.includes("://")) {
    const scp = /^(?:[^@/\s]+@)?([^:/\s]+):/.exec(trimmed);
    if (scp?.[1]) return scp[1].toLowerCase();
  }
  try {
    return new URL(trimmed).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function classifyHost(host: string): Forge | null {
  if (!host) return null;
  if (
    host === "gitlab.com" ||
    host.endsWith(".gitlab.com") ||
    host.includes("gitlab")
  )
    return "gitlab";
  if (
    host === "github.com" ||
    host.endsWith(".github.com") ||
    host.includes("github")
  )
    return "github";
  return null;
}

function configuredGlabHosts(): Set<string> {
  const hosts = new Set<string>();
  const path = glabConfigPath();
  if (!path) return hosts;
  let text = "";
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return hosts;
  }
  let inHosts = false;
  let hostIndent: number | null = null;
  for (const line of text.split(/\r?\n/)) {
    if (!inHosts) {
      if (/^hosts:\s*(?:#.*)?$/.test(line)) inHosts = true;
      continue;
    }
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const indent = /^[ \t]*/.exec(line)?.[0].length ?? 0;
    if (indent === 0) break;
    if (hostIndent == null) hostIndent = indent;
    if (indent !== hostIndent) continue;
    const name = /^[ \t]*([^:#\s][^:]*?)\s*:/
      .exec(line)?.[1]
      ?.trim()
      .toLowerCase();
    if (name) hosts.add(name);
  }
  return hosts;
}

function glabConfigPath(): string | null {
  const configDir = process.env.GLAB_CONFIG_DIR
    ? process.env.GLAB_CONFIG_DIR
    : join(
        process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"),
        "glab-cli",
      );
  const path = join(configDir, "config.yml");
  return existsSync(path) ? path : null;
}

function normalizeGh(pull: GhPull): PullMeta {
  return {
    number: pull.number,
    title: pull.title,
    headRefName: pull.headRefName,
    baseRefName: pull.baseRefName,
    url: pull.url,
    author: pull.author?.login,
    labels: (pull.labels ?? [])
      .map((label) => label.name)
      .filter((name): name is string => Boolean(name)),
  };
}

function normalizeGlab(pull: GlabMr): PullMeta {
  if (!pull.iid)
    throw new CommandError(
      "The GitLab CLI response did not include a merge request number.",
    );
  const author =
    typeof pull.author === "string" ? pull.author : pull.author?.username;
  return {
    number: pull.iid,
    title: pull.title,
    headRefName: pull.source_branch ?? "",
    baseRefName: pull.target_branch ?? "",
    url: pull.web_url,
    author,
    labels: (pull.labels ?? [])
      .map((label) => (typeof label === "string" ? label : label.name))
      .filter((name): name is string => Boolean(name)),
  };
}

function parseCli<T>(text: string, label: string, forge: Forge): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    const cli = forge === "gitlab" ? "GitLab" : "GitHub";
    throw new CommandError(
      `Could not parse the ${cli} CLI response for ${label}.`,
    );
  }
}
