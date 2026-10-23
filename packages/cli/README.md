# Astroidal

AI code review map, scorer, and helper. Astroidal draws the change. Your agent looks for bugs. Astroidal scores what survives: **Passed** or **Fix first**.

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

Reply with the score, Passed or Fix first, and the paths to .astroidal/review.md and .astroidal/constellation.html.
```

`init` installs the skill into `.agents/skills/astroidal/` and `.cursor/skills/astroidal/`, and ignores `.astroidal/`. `init --global` installs it for every repository. `init --force` replaces a skill you edited. A newer Astroidal refreshes an unmodified global skill on `graph` or `rank`.

## Output

| File | What it is |
| --- | --- |
| `.astroidal/constellation.html` | The map and the score |
| `.astroidal/packets/bug-map.md` | What the agent searches |
| `.astroidal/review.md` | Ranked findings, after `rank` |
| `.astroidal/graph.json` | The same map for tools |

Rank keeps critical, high, and medium findings that quote a real line in the change or a direct neighbor. Those findings show on the map.

## Scope

A dirty worktree maps uncommitted changes, including untracked files. A clean branch maps that branch against its default base.

```bash
npx --yes astroidal graph --pr 12,18,24
npx --yes astroidal graph --open --label risk
npx --yes astroidal graph --stack
npx --yes astroidal graph --commit HEAD
npx --yes astroidal graph --staged
```

Local branches are read with git. `gh` lists open pull requests and fetches a diff whose branch is not local. `astroidal --help` covers the rest, including `--author`, `--base`, `--unstaged`, and `--repo`.

## License

MIT.
