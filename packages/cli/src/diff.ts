import type { ParsedFile } from "./types.js";

function parseDiffGitPaths(
  line: string,
): { oldPath: string; newPath: string } | null {
  const marker = "diff --git ";
  if (!line.startsWith(marker)) return null;
  const rest = line.slice(marker.length).trim();
  const paths: string[] = [];
  let index = 0;
  while (index < rest.length) {
    if (rest[index] === '"') {
      let value = "";
      index += 1;
      while (index < rest.length && rest[index] !== '"') {
        if (rest[index] === "\\" && index + 1 < rest.length) {
          value += rest[index + 1];
          index += 2;
          continue;
        }
        value += rest[index];
        index += 1;
      }
      index += 1;
      paths.push(value);
      continue;
    }
    const start = index;
    while (index < rest.length && rest[index] !== " ") index += 1;
    paths.push(rest.slice(start, index));
    while (rest[index] === " ") index += 1;
  }
  if (paths.length < 2) return null;
  return { oldPath: stripPrefix(paths[0]), newPath: stripPrefix(paths[1]) };
}

function stripPrefix(path: string): string {
  const value = unquote(path);
  if (value === "/dev/null") return value;
  if (value.startsWith("a/") || value.startsWith("b/")) return value.slice(2);
  return value;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"'))
    return trimmed.slice(1, -1).replace(/\\"/g, '"');
  return trimmed;
}

export function parseUnifiedDiff(diff: string): ParsedFile[] {
  if (!diff.trim()) return [];
  const lines = diff.split(/\r?\n/);
  const files: ParsedFile[] = [];
  let current: ParsedFile | null = null;
  let patch: string[] = [];

  function flush(): void {
    if (!current) return;
    current.patch = patch.join("\n");
    if (
      current.path === "/dev/null" &&
      current.oldPath &&
      current.oldPath !== "/dev/null"
    ) {
      current.path = current.oldPath;
      current.status = "deleted";
    }
    if (current.path !== "/dev/null") files.push(current);
    current = null;
    patch = [];
  }

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      flush();
      const paths = parseDiffGitPaths(line);
      current = {
        path:
          paths?.newPath && paths.newPath !== "/dev/null"
            ? paths.newPath
            : (paths?.oldPath ?? "unknown"),
        oldPath: paths?.oldPath,
        status: "modified",
        patch: "",
        additions: 0,
        deletions: 0,
        binary: false,
      };
      patch = [line];
      continue;
    }
    if (!current) continue;
    patch.push(line);
    if (line.startsWith("new file mode")) current.status = "added";
    if (line.startsWith("deleted file mode")) current.status = "deleted";
    if (line.startsWith("rename from ")) {
      current.status = "renamed";
      current.oldPath = line.slice("rename from ".length).trim();
    }
    if (line.startsWith("rename to "))
      current.path = line.slice("rename to ".length).trim();
    if (line.startsWith("--- ")) {
      const oldPath = stripPrefix(unquote(line.slice(4).trim()));
      current.oldPath = oldPath;
      if (oldPath === "/dev/null") current.status = "added";
    }
    if (line.startsWith("+++ ")) {
      const nextPath = stripPrefix(unquote(line.slice(4).trim()));
      if (nextPath === "/dev/null") current.status = "deleted";
      else current.path = nextPath;
    }
    if (line.startsWith("Binary files ") || line.startsWith("GIT binary patch"))
      current.binary = true;
    if (line.startsWith("+") && !line.startsWith("+++")) current.additions += 1;
    if (line.startsWith("-") && !line.startsWith("---")) current.deletions += 1;
  }
  flush();
  return files.filter((file) => file.path && file.path !== "unknown");
}

export function countChangedSpan(
  patch: string,
  side: "new" | "old",
  start: number,
  end: number,
): number {
  if (!patch || end < start) return 0;
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;
  let count = 0;
  for (const line of patch.split(/\r?\n/)) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      inHunk = true;
      continue;
    }
    if (!inHunk || line.startsWith("\\")) continue;
    if (
      line.startsWith("diff --git ") ||
      line.startsWith("index ") ||
      line.startsWith("--- ") ||
      line.startsWith("+++ ") ||
      line.startsWith("new file ") ||
      line.startsWith("deleted file ") ||
      line.startsWith("rename ") ||
      line.startsWith("similarity ") ||
      line.startsWith("old mode ") ||
      line.startsWith("new mode ")
    ) {
      inHunk = false;
      continue;
    }
    if (line.startsWith("+")) {
      if (side === "new" && newLine >= start && newLine <= end) count += 1;
      newLine += 1;
      continue;
    }
    if (line.startsWith("-")) {
      if (side === "old" && oldLine >= start && oldLine <= end) count += 1;
      oldLine += 1;
      continue;
    }
    if (line.startsWith(" ")) {
      oldLine += 1;
      newLine += 1;
    }
  }
  return count;
}

export function changedLines(patch: string): {
  added: string[];
  removed: string[];
} {
  const added: string[] = [];
  const removed: string[] = [];
  for (const line of patch.split(/\r?\n/)) {
    if (line.startsWith("+") && !line.startsWith("+++"))
      added.push(line.slice(1));
    else if (line.startsWith("-") && !line.startsWith("---"))
      removed.push(line.slice(1));
  }
  return { added, removed };
}

export function reconstructSide(patch: string, side: "new" | "old"): string {
  const output: string[] = [];
  let cursor = 1;
  let started = false;
  for (const line of patch.split(/\r?\n/)) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) {
      const start = Number(side === "new" ? hunk[2] : hunk[1]);
      started = true;
      cursor = start;
      while (output.length < start - 1) output.push("");
      continue;
    }
    if (!started || line.startsWith("\\")) continue;
    if (side === "new" && line.startsWith("-")) continue;
    if (side === "old" && line.startsWith("+")) continue;
    if (line.startsWith("+") || line.startsWith("-") || line.startsWith(" ")) {
      output[cursor - 1] = line.slice(1);
      cursor += 1;
    }
  }
  return output.map((line) => line ?? "").join("\n");
}

export function synthesizeAddition(path: string, text: string): ParsedFile {
  const body = text.split(/\r?\n/);
  if (text.endsWith("\n")) body.pop();
  const quoted = (prefix: string) => {
    const value = `${prefix}${path}`;
    return /[\s"]/.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value;
  };
  const patch = [
    `diff --git ${quoted("a/")} ${quoted("b/")}`,
    "new file mode 100644",
    "--- /dev/null",
    `+++ ${quoted("b/")}`,
    `@@ -0,0 +1,${Math.max(body.length, 1)} @@`,
    ...body.map((line) => `+${line}`),
  ].join("\n");
  return {
    path,
    status: "added",
    patch,
    additions: body.length,
    deletions: 0,
    binary: text.includes("\0"),
  };
}
