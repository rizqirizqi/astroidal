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

Run every review in five phases, in order: **Recon → Review → Re-review → Verification → Report**. Do not skip ahead to Report after the first `rank`. `Review` from rank is a cue to go deeper in Re-review, not a pasteable end state. The final paste line should be `Passed` or `Fix first`.

The bug catalog is [references/review-lenses.md](references/review-lenses.md), next to this file. Read it before judging a finding. It is not in `.astroidal/`. That file is the only required reference under `references/`.

## Companion skills

Load companion skills only when the change warrants them. You decide from the bug map, the packets, and the Added lines — do not load every skill on the Sources list.

Suggested companions:

- Security-heavy change (authz, trust boundary, injection sink, secrets, crypto, tenant isolation): [cloudflare/security-audit-skill](https://github.com/cloudflare/security-audit-skill) in **guidance mode**. Prefer an installed `security-audit` skill on this machine; otherwise fetch or skim only the attack-class docs that match the stack. Do not run its full six-phase audit or write its report artifacts. Astroidal still owns `.astroidal/findings.json`, `rank`, and the chat reply.
- Other Sources in the catalog are credit for patterns already folded into `review-lenses.md`. Reach for one only when that skill is installed and the change clearly needs a lens the catalog does not cover.

Skip companions for a small, non-security diff when the catalog is enough.

## Sub-agents

Stay on one agent when the map is small: a single PR or local change, roughly under ~15 non-test Added-lines files, and one coherent area.

Delegate with the platform Task / sub-agent tool when any of these hold:

- The map covers **two or more pull requests** (batch, `--open`, or `--stack` with multiple PRs)
- **~15 or more** non-test source files in Added lines, or the added lines span several unrelated areas
- A security companion is in play **and** the security surface is large enough that one pass would skip files
- Re-review or Verification needs a second pair of eyes on blast radius, architecture, or finding checks (optional even on a small map)

How to split:

- One sub-agent per pull request in a multi-PR map, or per coherent area (auth, API, UI) when a single PR is large
- In Re-review, one sub-agent may own blast-radius / callers, another architecture / contracts, another bug hunting — or keep it on one agent when the map is small
- Give each sub-agent the bug-map paths it owns, the matching packet leads, the catalog gate, and any companion skill it should use
- Sub-agents return candidate findings only (severity, description, path, line, quote, recommendation, category, `pr` when known). They do not write `.astroidal/findings.json`, do not run `rank`, and do not comment on the PR

The parent merges candidates, drops duplicates and anything that fails the gate, writes one `.astroidal/findings.json`, runs `rank`, and owns the chat reply. A batch is still one merged map and one report — sub-agents parallelize the search, they do not produce separate reviews.

Do not add Astroidal as a dependency. Do not edit `package.json`, lockfiles, `pyproject.toml`, `go.mod`, or `Cargo.toml` to install it.

## Run it

Resolve the command in this order:

1. `astroidal` if it is already on `PATH`
2. `npx --yes astroidal`

If the package name cannot be downloaded, and the user pointed at a local checkout, run `npx --yes <path-to-the-astroidal-package>` or `node <path>/dist/cli.js`.

### Repo setup (do this before the first `graph`)

People may install this skill with `npx skills add` or with `astroidal init`. Either way, before the first review in a repository, run init once so the repo is ready:

```bash
npx --yes astroidal init
```

That adds `.astroidal/` to `.gitignore` when a `.gitignore` exists, and writes the install stamp used for refresh. Skip init when `.astroidal/` is already ignored and the skill is already present for the agents you need. Do not pass `--force` just because the skill was installed via `npx skills` — keep that copy unless the user asked to replace it.

Pass `--agent` to copy the skill into one agent's own directory. Repeat it, or pass `all`.

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

---

## Phase 1 — Recon

Set up the repo if needed, choose the scope, build the map once, and gather only the forge context the packets still miss.

### Choose the scope

Run `graph` once (after repo setup above). Read the scope note it prints. If that scope is wrong, rerun once with the flag below. Do not rerun after that.

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

A batch is one merged map. Do not review the pull requests as separate reports. When the batch is large enough, use sub-agents for the search as above, then merge into one findings file.

### GitHub

Call `gh` for what this review still needs. The map already did the local-first reads, so do not list the same files again, refetch a diff it already stored, or poll checks. A few targeted calls are fine, such as `gh pr view` when a title, base, or body is missing. Do not spam `gh`, and do not comment on a pull request, approve it, or request reviewers. Do not run `astroidal comment`. That command writes one comment with the score, the verdict, and the cusp paths. A person or a workflow runs it.

### GitLab

Call `glab` for what this review still needs. The map already did the local-first reads, so do not list the same files again, refetch a diff it already stored, or poll pipelines. A few targeted calls are fine, such as `glab mr view` when a title, base, or body is missing. Do not spam `glab`, and do not comment on a merge request, approve it, or request reviewers. Do not run `astroidal comment`.

---

## Phase 2 — Review

Read the map, hunt for bugs, write findings, and run the first `rank`.

### Read, in order

1. `.astroidal/packets/bug-map.md`
2. `.astroidal/packets/architecture.md`
3. `.astroidal/packets/security.md`
4. `.astroidal/packets/performance.md`
5. `.astroidal/packets/ux.md`
6. `.astroidal/packets/correctness.md`
7. `references/review-lenses.md` next to this skill

Apply the gate, the spec pass, and the standards pass in the catalog. Then apply each language section that matches a file in Added lines. Skip the other language sections. Load a companion skill only when the change warrants it. Split the search across sub-agents when the Sub-agents rules above say to.

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

### Write findings

Write `.astroidal/findings.json`:

```json
{
  "agentScore": 88,
  "checked": ["src/auth.ts", "src/session.ts"],
  "findings": [
    {
      "pr": 12,
      "severity": "high",
      "agentScore": 90,
      "description": "What breaks, in one or two sentences.",
      "path": "src/auth.ts",
      "quote": "the exact line copied from the file",
      "recommendation": "The specific change that removes the bug.",
      "category": "security",
      "locations": [
        {
          "path": "src/auth.ts",
          "quote": "the exact line copied from the file",
          "symbol": "login"
        },
        {
          "path": "src/session.ts",
          "quote": "return trust(user.id)",
          "symbol": "resume"
        }
      ]
    }
  ]
}
```

`severity` is `critical`, `high`, or `medium`, using the gate in the catalog. `critical` is a crash, data loss, authz bypass, injection, or secret exposure on a path users hit. `high` is a realistic wrong result, lost write, race, or broken contract. `medium` is a realistic edge that fails. `quote` is one exact line copied from an added-lines block, the mapped file, or its one-hop neighbor. Set `pr` to the pull request that introduced that line, or omit it for a local change.

One finding can cover several files or symbols. Prefer `locations` when the bug spans more than one place: each entry needs a mapped `path`, and at least one entry needs a verifiable `quote`. Optional `symbol` names the mapped symbol. You can also pass related `paths` or `symbols` beside a primary `path` + `quote`. The constellation keeps each symbol's shape and paints the finding's member stars orange.

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

Then run the first rank:

```bash
npx --yes astroidal rank
```

Rank appends one row to `.astroidal/log.jsonl`: the head, the verdict, the score, and each cusp's path, symbol, and quote. Leave that log in place.

Read the verdict line rank prints. **`Review` is not done** — continue to Phase 3. `Fix first` and a clear small `Passed` still continue to Re-review (lighter) and Verification before Report.

---

## Phase 3 — Re-review

Go deeper than the first pass. This phase exists so a soft `Review` becomes either real findings (`Fix first`) or a covered, high-confidence clear (`Passed`).

**Always run Re-review when the first rank says `Review`.** Also run it when impact, blast radius, architecture, or security packets look hot even if the first verdict was `Passed` or `Fix first` — deepen the hunt or stress-test the cusps. On a tiny calm `Passed` with full `checked`, a short confirmation pass is enough.

Focus on:

1. **Blast radius** — walk one-hop and two-hop callers/callees the map lists for every changed symbol that can break a contract, authz path, write path, or shared type. Open neighbor files when the packet excerpt is thin.
2. **Architecture** — cross-module contracts, layering, shared state, schema/API drift, feature groups that span directories. Re-read `architecture.md` and any groups you named.
3. **Bug hunting** — a second catalog pass on every non-test Added-lines block, including classes you under-weighted the first time. Prefer concrete failures over impact scores.

A sub-agent is optional here. Use one when the map is large, multi-PR, or the first pass left `Review` because coverage or confidence was thin.

Update `.astroidal/findings.json`:

- Add any new gate-passing findings with exact quotes
- Drop candidates that fail the gate on a second look
- Complete `checked` for every non-test source file in Added lines
- Set top-level `agentScore` honestly after the deeper pass (high only when you would pass the change; low when impact or doubt remains and you found no cusp yet)

Then rank again:

```bash
npx --yes astroidal rank
```

If this second rank is still `Review`, do not stop: finish any missing `checked` paths, raise or lower `agentScore` to match the deeper pass, and keep hunting until you either file a real finding or can clear with high confidence. Rank allows a covered, high-confidence clear to become `Passed` even when impact is high. Do not invent a bug to escape `Review`. Do not rank more than once more after Verification fixes quote/path drops.

---

## Phase 4 — Verification

Prove the findings (or the clear) before the reply. A sub-agent is optional.

For each finding still in `.astroidal/findings.json`:

- Confirm the quote exists at the path (added-lines block, mapped file, or one-hop neighbor)
- Confirm the gate, severity, and recommendation still hold
- Confirm `pr` when the map is a batch

For a clear (`findings: []`):

- Confirm `checked` lists every required non-test Added-lines file
- Confirm top-level `agentScore` matches how sure you are after Re-review

If rank dropped a finding because the quote or path is wrong, fix that finding once and rank again. Do not invent a replacement bug to keep the count up. After that fix-up rank, do not rank again.

---

## Phase 5 — Report

Write a short prose summary in chat. Open with a line the person can paste: `Astroidal {score} · Passed` or `Astroidal {score} · Fix first`.

- **Passed** — no important findings after Review + Re-review + Verification; a person can skip the detail.
- **Fix first** — cusp alerts remain; name the highest-severity issues.

Do not paste `Review` as the final line. If rank somehow still says `Review` after Re-review and Verification, keep hunting or adjust `checked` / `agentScore` and rank once more until the verdict is `Passed` or `Fix first`. Then name the two output paths: `.astroidal/review.md` and `.astroidal/constellation.html`. Do not paste the findings table. Do not recreate the chart. The human still decides whether to merge.
