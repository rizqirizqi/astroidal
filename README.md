# Astroidal

Structural code review for the change in front of you. Astroidal maps the syntax of a diff, draws the blast radius, and gives an AI agent a bug map it can verify. The agent searches for bugs. Astroidal checks the quotes, drops duplicates, and ranks what remains.

Run it with `npx`.

```bash
npx --yes astroidal init
npx --yes astroidal graph
```

`init` copies the agent skill, including its review catalog, into `.agents/skills/astroidal/` and `.cursor/skills/astroidal/`. `init --global` copies those same paths under the home directory, so the skill is available in every repository. It does not edit package manifests. `graph` writes:

- `.astroidal/constellation.html` — constellation, four-cusp impact surface
- `.astroidal/packets/bug-map.md` — changed symbols, one-hop neighbors, and search leads
- `.astroidal/graph.json` — the same map for tools

A clean feature branch is mapped against the default base. A dirty worktree maps uncommitted changes, including untracked files. Pass a scope when you want something else:

```bash
npx --yes astroidal graph --pr 12,18,24
npx --yes astroidal graph --open --label risk
npx --yes astroidal graph --stack
npx --yes astroidal graph --commit HEAD
npx --yes astroidal graph --staged
```

Local branches are read with git. `gh` is used for open-pull-request lists and for diffs whose branches are not available locally. Astroidal does not comment or approve.

After the review, write `.astroidal/findings.json` and rank it:

```bash
npx --yes astroidal rank
```

Rank keeps critical, high, and medium findings that quote a real line in the mapped change or its one-hop neighbors. The merged table is `.astroidal/review.md`. Columns are ID, Severity, Issue Description, File Path, Recommendation, and PR. The same findings light up on the constellation.

Node 20 or newer is required on the machine running the command. The repository under review can be any language.

MIT licensed.
