# astroidal

[![npm](https://img.shields.io/npm/v/astroidal)](https://www.npmjs.com/package/astroidal)
[![node](https://img.shields.io/node/v/astroidal)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/astroidal)](https://github.com/rizqirizqi/astroidal/blob/main/LICENSE)

CLI for [Astroidal](https://astroidal.webstor.io) — map a change, hand an agent a bug map, score the review. Product overview and agent setup live in the [repository README](https://github.com/rizqirizqi/astroidal#readme).

Requires Node.js 20+.

## Run

```bash
npx --yes astroidal <command>
```

Do not add Astroidal as a project dependency. `astroidal --help` lists every flag.

## Commands

### `init`

Install the Astroidal skill and ignore `.astroidal/`.

| Flag                                   | Effect                                          |
| -------------------------------------- | ----------------------------------------------- |
| `--agent cursor\|claude\|copilot\|all` | Also copy the skill into that agent's directory |
| `--global`                             | Install for every repository                    |
| `--force`                              | Replace a skill you edited                      |

Default skill path: `.agents/skills/astroidal/` (Codex). Agent copies go to `.cursor/skills`, `.claude/skills`, or `.github/skills`. A global Copilot copy is `~/.copilot/skills/astroidal/`. An unmodified global skill refreshes on `graph` or `rank` when Astroidal is newer.

### `graph`

Build the change map and packets under `.astroidal/`.

| Scope          | Behavior                                                       |
| -------------- | -------------------------------------------------------------- |
| Dirty worktree | Uncommitted changes, including untracked files                 |
| Clean branch   | That branch against its default base                           |
| Batch          | One merged map; each PR also gets Passed, Review, or Fix first |

```bash
npx --yes astroidal graph
npx --yes astroidal graph --pr 12,18,24
npx --yes astroidal graph --open --label risk
npx --yes astroidal graph --stack
npx --yes astroidal graph --commit HEAD
npx --yes astroidal graph --staged
npx --yes astroidal graph --unstaged
npx --yes astroidal graph --author @me
npx --yes astroidal graph --base main
npx --yes astroidal graph --repo owner/name
```

Local branches use git. `gh` lists open GitHub PRs and fetches a remote diff. `glab` does the same for GitLab MRs. Host comes from the origin remote, or from the glab config for self-hosted GitLab.

### `rank`

Score findings in `.astroidal/findings.json` against the map.

| Exit     | When                         |
| -------- | ---------------------------- |
| `0`      | Passed or Review             |
| `1`      | Fix first                    |
| non-zero | Missing map or findings file |

Keeps critical, high, and medium findings that quote a real line in the change or a direct neighbor. Appends one row to `.astroidal/log.jsonl` (head, verdict, score, cusps). A later row records a cusp that matches an earlier one on the same path and symbol. `.astroidal/` is gitignored, so the log stays local to the clone. The score reason compares blast radius with the median blast of recent merge commits on the default branch.

### `comment`

Write one pull-request comment with the score, verdict, and cusp paths. Re-running updates that same comment. Does not approve, merge, or request reviewers.

```bash
npx --yes astroidal comment
npx --yes astroidal comment --pr 12
```

Pass `--pr` when the map has no pull request, or when it covers more than one. A batch lists one verdict per PR; the merged map stays one score.

## Output

| File                            | Contents                     |
| ------------------------------- | ---------------------------- |
| `.astroidal/constellation.html` | Map and score                |
| `.astroidal/packets/bug-map.md` | Agent search packet          |
| `.astroidal/review.md`          | Ranked findings after `rank` |
| `.astroidal/log.jsonl`          | Head, verdict, score, cusps  |
| `.astroidal/graph.json`         | Same map for tools           |

## License

MIT.
