import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { changedLines } from "./diff.js";
import type { BuiltFile } from "./types.js";

export function writeEvidence(root: string, files: BuiltFile[]): void {
  const directory = join(root, ".astroidal", "evidence");
  mkdirSync(directory, { recursive: true });
  const manifest: Record<string, string> = {};
  for (const file of files) {
    const name = `${createHash("sha1").update(file.path).digest("hex").slice(0, 10)}.txt`;
    const body = evidenceBody(file);
    writeFileSync(join(directory, name), body.slice(0, 400_000));
    manifest[file.path] = name;
  }
  writeFileSync(
    join(directory, "index.json"),
    JSON.stringify(manifest, null, 2),
  );
}

function evidenceBody(file: BuiltFile): string {
  const added = file.variants.flatMap((variant) => {
    const lines = changedLines(variant.patch).added.filter((line) =>
      line.trim(),
    );
    if (lines.length === 0) return [];
    const label = variant.pr ? `pr ${variant.pr}` : variant.unit;
    return [`--- added ${label} ---`, ...lines];
  });
  const parts = [file.text];
  if (added.length > 0) parts.push(added.join("\n"));
  if (file.oldText && file.oldText !== file.text)
    parts.push(`--- previous ---\n${file.oldText}`);
  return parts.join("\n\n");
}

export function readEvidence(root: string, relPath: string): string | null {
  const indexPath = join(root, ".astroidal", "evidence", "index.json");
  if (!existsSync(indexPath)) return null;
  const manifest = JSON.parse(readFileSync(indexPath, "utf8")) as Record<
    string,
    string
  >;
  const name = manifest[relPath];
  if (!name || name.includes("/") || name.includes("..")) return null;
  const filePath = join(root, ".astroidal", "evidence", name);
  if (!existsSync(filePath)) return null;
  return readFileSync(filePath, "utf8");
}
