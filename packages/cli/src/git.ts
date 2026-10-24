import { spawnSync } from "node:child_process";

export class CommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommandError";
  }
}

function run(
  command: string,
  args: string[],
  cwd: string,
  allowFailure: boolean,
  input?: string,
): string | null {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    input,
    maxBuffer: 64 * 1024 * 1024,
    env: {
      ...process.env,
      GIT_PAGER: "cat",
      PAGER: "cat",
      GH_PAGER: "cat",
      GLAB_PAGER: "cat",
    },
  });
  if (result.error) {
    if (allowFailure) return null;
    throw new CommandError(
      `${command} failed to start: ${result.error.message}`,
    );
  }
  if (result.status !== 0) {
    if (allowFailure) return null;
    const detail = (
      result.stderr ||
      result.stdout ||
      `${command} exited ${result.status}`
    ).trim();
    throw new CommandError(detail);
  }
  return result.stdout ?? "";
}

export function git(cwd: string, args: string[]): string {
  return run("git", args, cwd, false) ?? "";
}

export function tryGit(cwd: string, args: string[]): string | null {
  return run("git", args, cwd, true);
}

export function gh(cwd: string, args: string[]): string {
  return run("gh", args, cwd, false) ?? "";
}

export function ghInput(cwd: string, args: string[], input: string): string {
  return run("gh", args, cwd, false, input) ?? "";
}

export function tryGh(cwd: string, args: string[]): string | null {
  return run("gh", args, cwd, true);
}

export function ghAvailable(): boolean {
  return run("gh", ["--version"], process.cwd(), true) !== null;
}

export function glab(cwd: string, args: string[]): string {
  return run("glab", args, cwd, false) ?? "";
}

export function glabInput(cwd: string, args: string[], input: string): string {
  return run("glab", args, cwd, false, input) ?? "";
}

export function tryGlab(cwd: string, args: string[]): string | null {
  return run("glab", args, cwd, true);
}

export function glabAvailable(): boolean {
  return run("glab", ["--version"], process.cwd(), true) !== null;
}

export function repoRoot(start: string): string {
  const top = tryGit(start, ["rev-parse", "--show-toplevel"]);
  if (!top)
    throw new CommandError(
      "Astroidal needs a git repository. Run it from inside a repo.",
    );
  return top.trim();
}
