# Astroidal ✦

AI code review map, scorer, and helper. Astroidal draws the change. Your agent looks for bugs. Astroidal scores what survives: **Passed**, **Review**, or **Fix first**.

## How a review goes

```mermaid
flowchart LR
  map["Astroidal maps the change"] --> hunt["Your agent looks for bugs"]
  hunt --> score["Astroidal scores the review"]
  classDef tool fill:#0C111C,stroke:#00F2FE,color:#E8EEF8
  classDef agent fill:#0C111C,stroke:#D2B4FF,color:#E8EEF8
  class map,score tool
  class hunt agent
```

## Start

Copy setup prompt for your agent:

```text
Set up Astroidal and review this change. Do not add it as a dependency. Run:

npx --yes astroidal init
npx --yes astroidal graph

Follow the installed Astroidal skill: search the bug map and write .astroidal/findings.json. Then run:

npx --yes astroidal rank

Reply with the score, Passed, Review, or Fix first, and the paths to .astroidal/review.md and .astroidal/constellation.html.
```

`init` installs the skill into `.agents/skills/astroidal/` and ignores `.astroidal/`. Codex reads that directory. Pass `--agent cursor`, `--agent claude`, or `--agent copilot` to copy the same skill into that agent's directory (`.cursor/skills`, `.claude/skills`, or `.github/skills`). `--agent all` installs each of them. `init --global` installs for every repository; a global Copilot copy is `~/.copilot/skills/astroidal/`. `init --force` replaces a skill you edited. A newer Astroidal refreshes an unmodified global skill on `graph` or `rank`.

`rank` exits 1 on Fix first. Passed and Review exit 0. A missing map or findings file still errors.

`rank` appends one row to `.astroidal/log.jsonl`: the head, the verdict, the score, and each cusp's path, symbol, and quote. A later row records a cusp that matches an earlier one on the same path and symbol. `.astroidal/` stays gitignored, so the log belongs to this clone.

`comment` writes one comment on the pull request: the score, the verdict, and the cusp paths. It updates that same comment when it runs again. It does not approve, merge, or request reviewers. Pass `--pr` when the map has no pull request, or when it covers more than one. A batch lists one verdict for each pull request. The merged map stays one score.

## Output

| File                            | What it is                      |
| ------------------------------- | ------------------------------- |
| `.astroidal/constellation.html` | The map and the score           |
| `.astroidal/packets/bug-map.md` | What the agent searches         |
| `.astroidal/review.md`          | Ranked findings, after `rank`   |
| `.astroidal/log.jsonl`          | Head, verdict, score, and cusps |
| `.astroidal/graph.json`         | The same map for tools          |

Rank keeps critical, high, and medium findings that quote a real line in the change or a direct neighbor. Those findings show on the map.

## Scope

A dirty worktree maps uncommitted changes, including untracked files. A clean branch maps that branch against its default base. A batch stays one map, and each pull request also gets Passed, Review, or Fix first.

```bash
npx --yes astroidal graph --pr 12,18,24
npx --yes astroidal graph --open --label risk
npx --yes astroidal graph --stack
npx --yes astroidal graph --commit HEAD
npx --yes astroidal graph --staged
```

Local branches are read with git. `gh` lists open GitHub pull requests and fetches a diff whose branch is not local. `glab` does the same for GitLab merge requests. The host comes from the origin remote, or from the glab config for a self-hosted GitLab. `astroidal --help` covers the rest, including `--author`, `--base`, `--unstaged`, and `--repo`.

## Repository

| Path           | What it is                         |
| -------------- | ---------------------------------- |
| `packages/cli` | The published `astroidal` package  |
| `apps/site`    | The landing page, a Webstorio site |

```bash
npm test
npm run lint
npm run dev:site
```

## License

MIT.
