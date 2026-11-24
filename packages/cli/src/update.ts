import { spawnSync } from "node:child_process";
import { sep } from "node:path";
import { compareVersions, packageRoot, packageVersion } from "./init.js";

const SKIP_ENV = "ASTROIDAL_SKIP_UPDATE";

export function shouldReexecToLatest(options: {
  skip: boolean;
  npmInstall: boolean;
  current: string;
  latest: string | null;
}): boolean {
  if (options.skip || !options.npmInstall || options.latest == null)
    return false;
  return compareVersions(options.latest, options.current) > 0;
}

export function isNpmInstall(root = packageRoot()): boolean {
  const marker = `${sep}node_modules${sep}`;
  return root.includes(marker) || root.endsWith(`${sep}node_modules`);
}

export function fetchLatestVersion(): string | null {
  const result = spawnSync(
    "npm",
    ["view", "astroidal", "version", "--prefer-online"],
    {
      encoding: "utf8",
      timeout: 8_000,
      stdio: ["ignore", "pipe", "ignore"],
    },
  );
  if (result.status !== 0) return null;
  const version = (result.stdout ?? "").trim();
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version) ? version : null;
}

/** Re-run via npx @latest when this install is an outdated npm copy. */
export function reexecIfOutdated(argv: string[]): number | null {
  const skip =
    process.env[SKIP_ENV] === "1" || process.env[SKIP_ENV] === "true";
  const current = packageVersion();
  const latest = skip || !isNpmInstall() ? null : fetchLatestVersion();
  if (
    !shouldReexecToLatest({
      skip,
      npmInstall: isNpmInstall(),
      current,
      latest,
    })
  )
    return null;

  console.log(
    `Astroidal ${current} is behind ${latest}. Re-running with npx astroidal@${latest}.`,
  );
  const result = spawnSync("npx", ["--yes", `astroidal@${latest}`, ...argv], {
    stdio: "inherit",
    env: { ...process.env, [SKIP_ENV]: "1" },
  });
  return result.status ?? 1;
}
