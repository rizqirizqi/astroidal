#!/usr/bin/env node
/**
 * Release astroidal (packages/cli) to npm + GitHub.
 *
 *   npm run release -- 0.2.0
 *   npm run release -- 0.2.0 --notes-file notes.md
 *   npm run release -- --dry-run
 *
 * Uses the version in packages/cli/package.json when no version arg is given.
 */

import { spawnSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { stdin as input, stdout as output } from "node:process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CLI_PACKAGE = join(ROOT, "packages/cli/package.json");
const LOCKFILE = join(ROOT, "package-lock.json");
const PACKAGE_NAME = "astroidal";
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function usage() {
  console.log(`Usage: npm run release -- [version] [options]

Options:
  --dry-run          Print steps without changing anything
  --skip-tests       Skip npm test
  --skip-publish     Skip npm publish
  --skip-github      Skip GitHub Release
  --skip-push        Tag locally; do not push
  --notes <text>     Release notes body
  --notes-file <path>
  --yes              Skip confirmation prompt
  -h, --help         Show this help
`);
}

function parseArgs(argv) {
  const options = {
    version: null,
    dryRun: false,
    skipTests: false,
    skipPublish: false,
    skipGithub: false,
    skipPush: false,
    notes: null,
    notesFile: null,
    yes: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") options.help = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--skip-tests") options.skipTests = true;
    else if (arg === "--skip-publish") options.skipPublish = true;
    else if (arg === "--skip-github") options.skipGithub = true;
    else if (arg === "--skip-push") options.skipPush = true;
    else if (arg === "--yes" || arg === "-y") options.yes = true;
    else if (arg === "--notes") {
      options.notes = argv[++i];
      if (!options.notes) fail("--notes requires a value");
    } else if (arg === "--notes-file") {
      options.notesFile = argv[++i];
      if (!options.notesFile) fail("--notes-file requires a path");
    } else if (arg.startsWith("-")) fail(`Unknown option: ${arg}`);
    else if (!options.version) options.version = arg.replace(/^v/, "");
    else fail(`Unexpected argument: ${arg}`);
  }

  return options;
}

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

function run(command, args, { allowFail = false, silent = false } = {}) {
  if (!silent) console.log(`$ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: silent ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.status !== 0 && !allowFail) {
    if (silent && result.stderr) process.stderr.write(result.stderr);
    fail(`${command} ${args.join(" ")} failed`);
  }
  return result;
}

function capture(command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (result.status !== 0)
    fail(result.stderr.trim() || `${command} ${args.join(" ")} failed`);
  return result.stdout.trim();
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function currentCliVersion() {
  return readJson(CLI_PACKAGE).version;
}

function setCliVersion(version) {
  const pkg = readJson(CLI_PACKAGE);
  pkg.version = version;
  writeJson(CLI_PACKAGE, pkg);

  const lock = readJson(LOCKFILE);
  if (lock.packages?.["packages/cli"])
    lock.packages["packages/cli"].version = version;
  writeJson(LOCKFILE, lock);
}

function requireCleanTree(options) {
  const status = capture("git", ["status", "--porcelain"]);
  if (!status) return;

  const lines = status.split("\n").filter(Boolean);
  const allowed = new Set([
    "packages/cli/package.json",
    "package-lock.json",
  ]);
  const unexpected = lines.filter((line) => {
    const path = line.slice(3).trim().split(" -> ").at(-1);
    return !allowed.has(path);
  });

  if (unexpected.length > 0 && !options.dryRun)
    fail(
      `Working tree has unrelated changes:\n${unexpected.join("\n")}\nCommit or stash them first.`,
    );
}

function requireMainBranch() {
  const branch = capture("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (branch !== "main") fail(`Release from main (current branch: ${branch})`);
}

function requireTools(options) {
  for (const tool of ["git", "npm", "gh"]) {
    const result = spawnSync(tool, ["--version"], { encoding: "utf8" });
    if (result.status !== 0) fail(`Missing required tool: ${tool}`);
  }

  if (!options.skipPublish && !options.dryRun) {
    const whoami = spawnSync("npm", ["whoami"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    if (whoami.status !== 0)
      fail("Not logged in to npm. Run: npm login");
  }

  if (!options.skipGithub && !options.dryRun) {
    const auth = spawnSync("gh", ["auth", "status"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: "ignore",
    });
    if (auth.status !== 0) fail("GitHub CLI is not authenticated. Run: gh auth login");
  }
}

function previousTag() {
  const result = spawnSync(
    "git",
    ["describe", "--tags", "--abbrev=0"],
    { cwd: ROOT, encoding: "utf8" },
  );
  if (result.status !== 0) return null;
  return result.stdout.trim() || null;
}

function publishedNpmVersion() {
  const result = spawnSync(
    "npm",
    ["view", PACKAGE_NAME, "version", "--silent"],
    { cwd: ROOT, encoding: "utf8" },
  );
  if (result.status !== 0) return null;
  const version = result.stdout.trim();
  return SEMVER.test(version) ? version : null;
}

function commitRangeForNotes(version) {
  const tag = previousTag();
  if (tag) return `${tag}..HEAD`;

  const published = publishedNpmVersion();
  if (published && published !== version) {
    const bump = spawnSync(
      "git",
      [
        "log",
        "-1",
        "--format=%H",
        "-S",
        `"version": "${published}"`,
        "--",
        "packages/cli/package.json",
      ],
      { cwd: ROOT, encoding: "utf8" },
    );
    if (bump.status === 0 && bump.stdout.trim())
      return `${bump.stdout.trim()}..HEAD`;
  }

  return "HEAD";
}

function defaultNotes(version) {
  const range = commitRangeForNotes(version);
  const log = capture("git", [
    "log",
    range,
    "--no-merges",
    "--pretty=format:- %s",
  ]);
  const body = log || "- Initial release.";
  return `# Astroidal ${version}\n\n${body}\n`;
}

function resolveNotes(options, version) {
  if (options.notesFile) {
    const path = resolve(ROOT, options.notesFile);
    if (!existsSync(path)) fail(`Notes file not found: ${path}`);
    return readFileSync(path, "utf8");
  }
  if (options.notes != null) return options.notes;
  return defaultNotes(version);
}

async function confirm(options, message) {
  if (options.yes || options.dryRun) return;
  const rl = createInterface({ input, output });
  try {
    const answer = (await rl.question(`${message} [y/N] `)).trim().toLowerCase();
    if (answer !== "y" && answer !== "yes") fail("Aborted.");
  } finally {
    rl.close();
  }
}

function createGithubRelease(tag, notes, dryRun) {
  const dir = mkdtempSync(join(tmpdir(), "astroidal-release-"));
  const notesPath = join(dir, "notes.md");
  try {
    writeFileSync(notesPath, notes);
    const args = [
      "release",
      "create",
      tag,
      "--title",
      tag,
      "--notes-file",
      notesPath,
    ];
    if (dryRun) {
      console.log(`$ gh ${args.join(" ")}`);
      console.log("--- notes ---");
      console.log(notes.trimEnd());
      console.log("-------------");
      return;
    }
    run("gh", args);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }

  requireMainBranch();
  requireTools(options);
  requireCleanTree(options);

  const current = currentCliVersion();
  const version = options.version ?? current;
  if (!SEMVER.test(version)) fail(`Invalid version: ${version}`);

  const tag = `v${version}`;
  const existingTag = spawnSync("git", ["rev-parse", `refs/tags/${tag}`], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: "ignore",
  });
  if (existingTag.status === 0) fail(`Tag already exists: ${tag}`);

  const notes = resolveNotes(options, version);
  const needsBump = version !== current;

  console.log(`Package: ${PACKAGE_NAME}`);
  console.log(`Version: ${current}${needsBump ? ` → ${version}` : ""}`);
  console.log(`Tag:     ${tag}`);
  console.log(
    `Steps:   test${!options.skipTests ? "" : " (skip)"} → commit → tag → push${!options.skipPush ? "" : " (skip)"} → GitHub Release${!options.skipGithub ? "" : " (skip)"} → npm publish${!options.skipPublish ? "" : " (skip)"}`,
  );
  if (options.dryRun) console.log("Mode:    dry-run");

  await confirm(options, `Release ${PACKAGE_NAME}@${version}?`);

  if (!options.skipTests) {
    if (options.dryRun) console.log("$ npm test");
    else run("npm", ["test"]);
  }

  if (needsBump) {
    if (options.dryRun) console.log(`$ set packages/cli version to ${version}`);
    else setCliVersion(version);
  } else {
    // Keep lockfile aligned even when package.json was bumped by hand.
    const lock = readJson(LOCKFILE);
    const locked = lock.packages?.["packages/cli"]?.version;
    if (locked !== version) {
      if (options.dryRun)
        console.log(`$ sync package-lock.json packages/cli version → ${version}`);
      else setCliVersion(version);
    }
  }

  const releasePaths = ["packages/cli/package.json", "package-lock.json"];
  const dirty = capture("git", ["status", "--porcelain", ...releasePaths]);
  const shouldCommit = Boolean(dirty) || (options.dryRun && needsBump);
  if (shouldCommit) {
    if (options.dryRun) {
      console.log(`$ git add ${releasePaths.join(" ")}`);
      console.log(`$ git commit -m "chore: release ${tag}"`);
    } else {
      run("git", ["add", ...releasePaths]);
      run("git", ["commit", "-m", `chore: release ${tag}`]);
    }
  }

  if (options.dryRun) console.log(`$ git tag ${tag}`);
  else run("git", ["tag", tag]);

  if (!options.skipPush) {
    if (options.dryRun) {
      console.log("$ git push origin HEAD");
      console.log(`$ git push origin ${tag}`);
    } else {
      run("git", ["push", "origin", "HEAD"]);
      run("git", ["push", "origin", tag]);
    }
  }

  if (!options.skipGithub) createGithubRelease(tag, notes, options.dryRun);

  if (!options.skipPublish) {
    const publishArgs = ["publish", "-w", PACKAGE_NAME, "--access", "public"];
    if (options.dryRun) console.log(`$ npm ${publishArgs.join(" ")}`);
    else run("npm", publishArgs);
  }

  console.log(`\nReleased ${PACKAGE_NAME}@${version}`);
  if (!options.skipGithub && !options.dryRun)
    console.log(`GitHub: https://github.com/rizqirizqi/astroidal/releases/tag/${tag}`);
  if (!options.skipPublish && !options.dryRun)
    console.log(`npm: https://www.npmjs.com/package/${PACKAGE_NAME}/v/${version}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
