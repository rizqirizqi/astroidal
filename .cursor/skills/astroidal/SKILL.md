---
name: astroidal
description: >-
  Reviews code with Astroidal, the AI code review map, scorer, and helper.
  Use when the user asks for a code review, pull request review, bug hunt,
  security review, architecture review, UX-flow review, or to run Astroidal.
  Works on one change, a commit, staged or unstaged edits, and a batch of
  pull requests.
---

# Astroidal

Astroidal is the AI code review map, scorer, and helper. It draws the blast radius and scores what you can prove. Map the change, search it for real bugs, then rank the findings. The chart and the table live in files. The chat reply is a short prose summary a person can paste.

The bug catalog is [references/review-lenses.md](references/review-lenses.md), next to this file. Read it before judging a finding. It is not in `.astroidal/`.

Do not add Astroidal as a dependency. Do not edit `package.json`, lockfiles, `pyproject.toml`, `go.mod`, or `Cargo.toml` to install it.

## Run it

Resolve the command in this order:

1. `astroidal` if it is already on `PATH`
2. `npx --yes astroidal`

If the package name cannot be downloaded, and the user pointed at a local checkout, run `npx --yes <path-to-the-astroidal-package>` or `node <path>/dist/cli.js`.

Install the skill once per repository. This writes `.agents/skills/astroidal`, which Codex and other agents read:

```bash
npx --yes astroidal init
```

Pass `--agent` to copy that same skill into one agent's own directory. Repeat it, or pass `all`.

```bash
npx --yes astroidal init --agent cursor
npx --yes astroidal init --agent claude
npx --yes astroidal init --agent copilot
```

`--agent cursor` writes `.cursor/skills/astroidal`. `--agent claude` writes `.claude/skills/astroidal`. `--agent copilot` writes `.github/skills/astroidal`. `--agent codex` is the default `.agents/skills/astroidal` directory.

Pass `--global` to install it once for every repository on this machine. A global Copilot copy is `~/.copilot/skills/astroidal`.

```bash
npx --yes astroidal init --global
```

A global install updates when a newer Astroidal runs `graph` or `rank`, as long as those skill files are still the ones Astroidal wrote. An edited skill stays in place until `init --force`. Run `init` again to refresh a project install.

## Choose the scope

Run `graph` once. Read the scope note it prints. If that scope is wrong, rerun once with the flag below. Do not rerun after that.

| Ask                                                         | Command                                                                     |
| ----------------------------------------------------------- | --------------------------------------------------------------------------- |
| Current edits, including untracked files                    | `npx --yes astroidal graph`                                                 |
| This branch or its pull request, when the worktree is dirty | `npx --yes astroidal graph --base <default-branch>`                         |
| A clean feature branch                                      | `npx --yes astroidal graph`                                                 |
| Pull request numbers or URLs                                | `npx --yes astroidal graph --pr 12,18,24`                                   |
| All open pull requests                                      | `npx --yes astroidal graph --open`                                          |
| Open pull requests by author, label, or base                | `npx --yes astroidal graph --open --author NAME --label NAME --base BRANCH` |
| The current pull request and the stack under it             | `npx --yes astroidal graph --stack`                                         |
| One commit                                                  | `npx --yes astroidal graph --commit SHA`                                    |
| Staged changes only                                         | `npx --yes astroidal graph --staged`                                        |
| Unstaged changes and untracked files                        | `npx --yes astroidal graph --unstaged`                                      |

A batch is one merged map. Do not review the pull requests as separate reports.

## GitHub

Call `gh` for what this review still needs. The map already did the local-first reads, so do not list the same files again, refetch a diff it already stored, or poll checks. A few targeted calls are fine, such as `gh pr view` when a title, base, or body is missing. Do not spam `gh`, and do not comment on a pull request, approve it, or request reviewers. Do not run `astroidal comment`. That command writes one comment with the score, the verdict, and the cusp paths. A person or a workflow runs it.

## GitLab

Call `glab` for what this review still needs. The map already did the local-first reads, so do not list the same files again, refetch a diff it already stored, or poll pipelines. A few targeted calls are fine, such as `glab mr view` when a title, base, or body is missing. Do not spam `glab`, and do not comment on a merge request, approve it, or request reviewers. Do not run `astroidal comment`.

## Search for bugs

Read, in order:

1. `.astroidal/packets/bug-map.md`
2. `.astroidal/packets/architecture.md`
3. `.astroidal/packets/security.md`
4. `.astroidal/packets/performance.md`
5. `.astroidal/packets/ux.md`
6. `.astroidal/packets/correctness.md`
7. `references/review-lenses.md` next to this skill

Apply the gate, the spec pass, and the standards pass in the catalog. Then apply each language section that matches a file in Added lines. Skip the other language sections.

Cover every changed path in the bug map. Start with the **Added lines** section. That section is the change, one block per pull request. A symbol excerpt can be blank when the diff was fetched remotely, and on a stack it is only the tip. A blank excerpt is missing context, not an empty change.

Do not stop after the first likely file. For every non-test source block in Added lines:

- Read the whole block, including the lines under it when the block says further lines are in the evidence file.
- Check that block against the catalog, not only the class that matches the filename. The five classes below are the minimum.
- When one file lists more than one pull request, review each block. The mapped body is only the stack tip.
- Open the file when the block is not enough to confirm or reject a bug.
- For each changed symbol, inspect the one-hop callers and callees the map lists when the change could break them.

Look especially for a wrong branch, a falsy or empty value treated as missing, an off-by-one or timezone mismatch, a lock or status that blocks a retry after a failure, a URL or query built by concatenation, an authz check that uses the wrong identity, and a contract the one-hop callers still use the old way. A high impact score is not a finding, and it does not excuse skipping a block.

Search all of these classes:

- Logic and edge cases: wrong branches, off-by-one, swallowed errors, null crashes
- Data loss and state: migrations, races, partial writes, stale cache
- Broken contracts: API, types, routes, exported behavior, schema mismatch
- Security bugs: authz gaps, injection, secrets, unsafe trust boundaries
- UX flow bugs: dead ends, missing error, empty, or loading states, broken navigation

Look for important issues. Leads in the packets are hints, not findings. A code smell, a long file, a missing test, or a dependency bump is a finding only when the catalog's gate passes. Ignore formatting, naming, comments, praise, questions, and refactors that do not name a concrete failure.

## Write findings

Write `.astroidal/findings.json`:

```json
{
  "agentScore": 88,
  "checked": ["src/auth.ts"],
  "findings": [
    {
      "pr": 12,
      "severity": "high",
      "agentScore": 90,
      "description": "What breaks, in one or two sentences.",
      "path": "src/auth.ts",
      "line": 12,
      "quote": "the exact line copied from the file",
      "recommendation": "The specific change that removes the bug.",
      "category": "security"
    }
  ]
}
```

`severity` is `critical`, `high`, or `medium`, using the gate in the catalog. `critical` is a crash, data loss, authz bypass, injection, or secret exposure on a path users hit. `high` is a realistic wrong result, lost write, race, or broken contract. `medium` is a realistic edge that fails. `quote` is one exact line copied from an added-lines block, the mapped file, or its one-hop neighbor. Set `pr` to the pull request that introduced that line, or omit it for a local change.

`agentScore` on a finding is 0 to 100: how sure you are that the quoted line breaks. `agentScore` beside the findings is 0 to 100 and points the other way: 100 means you would pass the change. `checked` lists every non-test source file in Added lines that you read. Rank withholds Passed until that list is complete. Omit a finding's `agentScore` only when you are fully sure; rank then treats it as 100.

Say what breaks, name the symbol, and give the change that removes the bug. For security and architecture, say why that change holds. Do not hedge, restate the quoted line, or file a question. An empty `findings` array is valid only after the added lines of every non-test source file have been checked against the catalog and none of them contain an important bug.

When changed files belong together for a reason the directory does not already show, name that group. The chart draws a directory on its own, and it draws an import as a line. A group is for a flow, a feature, or a shared contract that crosses those.

```json
{
  "findings": [],
  "groups": [
    {
      "name": "Payment links",
      "paths": ["apps/admin/lib/whatsapp.ts", "apps/admin/lib/proxied-link.ts"]
    }
  ]
}
```

Use a short name and at least two mapped paths. Omit `groups` when nothing extra belongs together.

Then run:

```bash
npx --yes astroidal rank
```

Rank appends one row to `.astroidal/log.jsonl`: the head, the verdict, the score, and each cusp's path, symbol, and quote. Leave that log in place.

If rank drops a finding because the quote or path is wrong, fix that finding once and rank again. Do not invent a replacement bug to keep the count up. Do not rank a third time.

## Reply

Write a short prose summary in chat. Open with a line the person can paste: `Astroidal {score} · Passed`, `Astroidal {score} · Review`, or `Astroidal {score} · Fix first`. Passed means a person can skip the detail. Review means a person still reads the change. Then name the highest-severity issues and the two output paths: `.astroidal/review.md` and `.astroidal/constellation.html`. Do not paste the findings table. Do not recreate the chart. The human still decides whether to merge.
