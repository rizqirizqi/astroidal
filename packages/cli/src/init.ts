import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { tryGit } from "./git.js";

const STAMP = ".install.json";
const SKILL_DIRS = [
  join(".agents", "skills", "astroidal"),
  join(".cursor", "skills", "astroidal"),
];

interface SkillStamp {
  version: string;
  files: Record<string, string>;
}

export function packageRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const candidate of [join(here, ".."), join(here, "..", "..")]) {
    if (
      existsSync(join(candidate, "package.json")) &&
      existsSync(join(candidate, "skills", "astroidal", "SKILL.md"))
    )
      return candidate;
  }
  throw new Error("Could not find the Astroidal skill inside the package.");
}

export function installSkill(
  start: string,
  force: boolean,
  global = false,
): string[] {
  const root = global
    ? homedir()
    : tryGit(start, ["rev-parse", "--show-toplevel"])?.trim() || start;
  const sourceDir = skillSource();
  const notes: string[] = [];
  let edited = false;
  for (const destination of destinations(root)) {
    const result = installInto(destination, sourceDir, force);
    notes.push(...result.notes);
    edited = edited || result.edited;
  }
  if (edited)
    notes.push(
      "Astroidal skill was edited. Run astroidal init --force to replace it.",
    );
  if (!global && ensureGitignore(root))
    notes.push("Added .astroidal/ to .gitignore.");
  return notes;
}

export function refreshGlobalSkill(): string | null {
  const sourceDir = skillSource();
  const version = packageVersion();
  let updatedFrom: string | null = null;
  let blocked = false;
  for (const destination of destinations(homedir())) {
    if (!existsSync(join(destination, "SKILL.md"))) continue;
    const stamp = readStamp(destination);
    if (stamp && isManaged(destination, stamp)) {
      if (compareVersions(version, stamp.version) > 0) {
        publish(destination, sourceDir, stamp);
        if (
          updatedFrom == null ||
          compareVersions(stamp.version, updatedFrom) < 0
        )
          updatedFrom = stamp.version;
      }
      continue;
    }
    if (sameContent(destination, sourceDir)) {
      publish(destination, sourceDir, stamp);
      continue;
    }
    if (!stamp || compareVersions(version, stamp.version) > 0) blocked = true;
  }
  if (updatedFrom)
    return `Updated Astroidal skill ${updatedFrom} → ${version}.`;
  if (blocked)
    return "Astroidal skill was edited. Run astroidal init --force to replace it.";
  return null;
}

function installInto(
  destination: string,
  sourceDir: string,
  force: boolean,
): { notes: string[]; edited: boolean } {
  const stamp = readStamp(destination);
  const installed = existsSync(join(destination, "SKILL.md"));
  const managed = stamp != null && isManaged(destination, stamp);
  const version = packageVersion();
  const current =
    managed &&
    stamp != null &&
    stamp.version === version &&
    sameContent(destination, sourceDir);
  const installedIsNewer =
    managed && stamp != null && compareVersions(stamp.version, version) > 0;
  const refresh =
    managed &&
    !installedIsNewer &&
    stamp != null &&
    (compareVersions(version, stamp.version) > 0 ||
      (stamp.version === version && !sameContent(destination, sourceDir)));
  if (!installed || force || refresh) {
    const from = installed ? (stamp?.version ?? null) : null;
    publish(destination, sourceDir, stamp);
    const notes = listSkillFiles(sourceDir).map(
      (file) => `Wrote ${join(destination, file)}`,
    );
    if (from && from !== version)
      notes.unshift(`Updated ${destination} ${from} → ${version}.`);
    return { notes, edited: false };
  }
  if (current || installedIsNewer)
    return {
      notes: listSkillFiles(destination).map(
        (file) => `Kept ${join(destination, file)}`,
      ),
      edited: false,
    };
  let edited = false;
  const notes: string[] = [];
  for (const file of listSkillFiles(sourceDir)) {
    const target = join(destination, file);
    if (!existsSync(target)) {
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(join(sourceDir, file), target);
      notes.push(`Wrote ${target}`);
      continue;
    }
    if (hashFile(target) !== hashFile(join(sourceDir, file))) edited = true;
    notes.push(`Kept ${target}`);
  }
  if (sameContent(destination, sourceDir)) writeStamp(destination, sourceDir);
  return { notes, edited };
}

function publish(
  destination: string,
  sourceDir: string,
  previous: SkillStamp | null,
): void {
  if (previous) {
    for (const file of Object.keys(previous.files)) {
      if (existsSync(join(sourceDir, file))) continue;
      const target = join(destination, file);
      if (existsSync(target)) rmSync(target);
    }
  }
  for (const file of listSkillFiles(sourceDir)) {
    const target = join(destination, file);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(sourceDir, file), target);
  }
  writeStamp(destination, sourceDir);
}

function destinations(root: string): string[] {
  return SKILL_DIRS.map((path) => join(root, path));
}

function skillSource(): string {
  return join(packageRoot(), "skills", "astroidal");
}

function packageVersion(): string {
  const pkg = JSON.parse(
    readFileSync(join(packageRoot(), "package.json"), "utf8"),
  ) as { version?: string };
  return pkg.version ?? "0.0.0";
}

function writeStamp(destination: string, sourceDir: string): void {
  const files: Record<string, string> = {};
  for (const file of listSkillFiles(sourceDir))
    files[file] = hashFile(join(sourceDir, file));
  const stamp: SkillStamp = { version: packageVersion(), files };
  writeFileSync(
    join(destination, STAMP),
    `${JSON.stringify(stamp, null, 2)}\n`,
  );
}

function readStamp(dir: string): SkillStamp | null {
  const path = join(dir, STAMP);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as SkillStamp;
    if (
      typeof parsed.version !== "string" ||
      parsed.files == null ||
      typeof parsed.files !== "object"
    )
      return null;
    return parsed;
  } catch {
    return null;
  }
}

function isManaged(dir: string, stamp: SkillStamp): boolean {
  const present = listSkillFiles(dir);
  const recorded = Object.keys(stamp.files).sort();
  if (present.length !== recorded.length) return false;
  return present.every(
    (file, index) =>
      file === recorded[index] &&
      hashFile(join(dir, file)) === stamp.files[file],
  );
}

function sameContent(dir: string, sourceDir: string): boolean {
  const present = listSkillFiles(dir);
  const source = listSkillFiles(sourceDir);
  if (present.length !== source.length) return false;
  return present.every(
    (file, index) =>
      file === source[index] &&
      hashFile(join(dir, file)) === hashFile(join(sourceDir, file)),
  );
}

function listSkillFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return filesUnder(dir)
    .map((path) => relative(dir, path).split(sep).join("/"))
    .filter((file) => file !== STAMP && file.length > 0)
    .sort();
}

function filesUnder(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...filesUnder(path));
    else if (entry.isFile()) found.push(path);
  }
  return found;
}

function hashFile(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function compareVersions(left: string, right: string): number {
  const parse = (value: string) =>
    value.split(".").map((part) => {
      const match = /^(\d+)/.exec(part);
      return match ? Number(match[1]) : 0;
    });
  const a = parse(left);
  const b = parse(right);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function ensureGitignore(root: string): boolean {
  const path = join(root, ".gitignore");
  if (!existsSync(path)) return false;
  const text = readFileSync(path, "utf8");
  const present = text.split(/\r?\n/).some((line) => {
    const trimmed = line.trim();
    return trimmed === ".astroidal" || trimmed === ".astroidal/";
  });
  if (present) return false;
  const suffix = text.endsWith("\n") || text.length === 0 ? "" : "\n";
  writeFileSync(path, `${text}${suffix}.astroidal/\n`);
  return true;
}
