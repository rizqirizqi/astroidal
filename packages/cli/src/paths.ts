import { join, normalize, sep } from "node:path";

export function toPosix(value: string): string {
  return value.replaceAll("\\", "/");
}

export function insideRoot(root: string, relPath: string): string | null {
  if (!relPath || relPath.includes("\0")) return null;
  const posix = toPosix(relPath).replace(/^\.\//, "");
  if (!posix || posix.startsWith("/") || posix.split("/").includes(".."))
    return null;
  const resolved = normalize(join(root, posix));
  const base = normalize(root);
  const prefix = base.endsWith(sep) ? base : base + sep;
  if (resolved !== base && !resolved.startsWith(prefix)) return null;
  return resolved;
}
