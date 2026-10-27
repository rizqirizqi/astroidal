import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scoreReview, verdictLabel } from "./analyze.js";
import type {
  Graph,
  GraphNode,
  GraphUnit,
  RankedFinding,
  ReviewScore,
} from "./types.js";

export function renderConstellation(graph: Graph): string {
  const payload = JSON.stringify(graph).replaceAll("<", "\\u003c");
  const script = loadSky();
  const impact = graph.impact;
  const review = reviewOf(graph);
  const units = graph.units
    .map((unit) => batchUnitButton(graph, unit))
    .join("");
  const allTab = batchFilterButton({
    id: "all",
    label: "All",
    score: review,
    findings: graph.findings.length,
    pressed: true,
  });
  const changed = graph.nodes
    .map((node, index) => ({ node, index }))
    .filter((entry) => entry.node.role === "changed")
    .slice(0, 80);
  const index = changed.map((entry) => symbolButton(entry, false)).join("");
  const tree = symbolTree(changed);
  const alerts = alertsMarkup(graph.findings);
  const unitScores =
    graph.impact.byUnit.length > 1
      ? `<details class="unit-fold" id="unit-fold"><summary>${graph.impact.byUnit.length} pull requests</summary><ul class="units">${graph.impact.byUnit
          .map((unit) => {
            const score = graph.units.find(
              (item) => item.id === unit.unitId,
            )?.score;
            const verdict = score ? ` · ${verdictLabel(score.verdict)}` : "";
            const findings = graph.findings.filter(
              (finding) => finding.pr === unit.label,
            ).length;
            return `<li><span>${escapeHtml(unit.label)}${verdict}${score ? ` · ${score.value}` : ""}</span><em>blast ${unit.blastRadius} · complexity ${signed(unit.complexityRaw)} · security ${unit.securityExposure} · perf ${unit.performanceImpact} · ${findings} finding${findings === 1 ? "" : "s"}</em></li>`;
          })
          .join("")}</ul></details>`
      : "";
  const batchCount = graph.units.length;
  const batchLabel =
    batchCount > 1
      ? `${batchCount} pull requests`
      : escapeHtml(
          graph.units.map((unit) => unit.label).join(", ") || "local changes",
        );
  const verdictText = verdictLabel(review.verdict);
  const shareLine = `Astroidal ${review.value} · ${verdictText} on ${graph.repoName}. The AI code review map — blast radius, bug map, and a score. npx --yes astroidal graph`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Astroidal · ${escapeHtml(graph.repoName)} · ${review.value} ${verdictText}</title>
  <meta name="description" content="${escapeHtml(shareLine)}">
  <meta property="og:title" content="Astroidal · ${escapeHtml(graph.repoName)} · ${review.value} ${verdictText}">
  <meta property="og:description" content="${escapeHtml(shareLine)}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="Astroidal · ${escapeHtml(graph.repoName)} · ${review.value} ${verdictText}">
  <meta name="twitter:description" content="${escapeHtml(shareLine)}">
  <style>
    :root {
      color-scheme: dark;
      --bg: #0B0F19;
      --ink: #E8EEF8;
      --muted: #A8B3C7;
      --cyan: #00F2FE;
      --violet: #7F00FF;
      --violet-ink: #D2B4FF;
      --amber: #FFB020;
      --line: rgba(232, 238, 248, 0.14);
      --panel: #0C111C;
    }
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    html, body { height: 100%; }
    body {
      margin: 0;
      display: grid;
      grid-template-rows: auto auto minmax(0, 1fr);
      background:
        radial-gradient(900px 420px at 18% -10%, rgba(127, 0, 255, 0.22), transparent 55%),
        radial-gradient(700px 380px at 100% 0%, rgba(0, 242, 254, 0.08), transparent 50%),
        var(--bg);
      color: var(--ink);
      font-family: "IBM Plex Sans", "Avenir Next", "Segoe UI", sans-serif;
    }
    button, summary, input { font: inherit; color: inherit; }
    button { cursor: pointer; }
    :focus-visible { outline: 2px solid var(--cyan); outline-offset: 2px; }
    .sr { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
    header { display: flex; justify-content: space-between; gap: 24px; align-items: center; padding: 16px 24px 12px; }
    .brand { display: flex; gap: 14px; align-items: center; min-width: 0; }
    .mark { flex: 0 0 auto; filter: drop-shadow(0 0 10px rgba(0, 242, 254, 0.35)); }
    .eyebrow, .mono, small, .hint, .compass b, .tier { font-family: "JetBrains Mono", ui-monospace, monospace; }
    .eyebrow { margin: 0; color: var(--cyan); letter-spacing: 0.18em; text-transform: uppercase; font-size: 11px; }
    .brand h1 { margin: 0; font-size: 28px; line-height: 1; letter-spacing: -0.045em; }
    .tagline { margin: 4px 0 0; color: var(--muted); font-size: 14px; max-width: 42ch; }
    .roles { margin: 6px 0 0; display: flex; flex-wrap: wrap; gap: 6px; }
    .roles span { border: 1px solid var(--line); border-radius: 999px; padding: 2px 8px; color: var(--violet-ink); font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; }
    .meta { display: grid; justify-items: end; gap: 4px; }
    .tier { margin: 0; border: 1px solid var(--line); border-radius: 999px; padding: 4px 10px; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; }
    .tier-full { border-color: rgba(255, 176, 32, 0.7); color: var(--amber); }
    .tier-lite { border-color: rgba(0, 242, 254, 0.7); color: var(--cyan); }
    .tier-trivial { color: var(--muted); }
    .scope { margin: 0; color: var(--muted); font-size: 13px; }
    .batch { display: flex; gap: 8px; overflow-x: auto; padding: 0 24px 12px; scrollbar-width: thin; align-items: stretch; }
    .batch button, .lens-controls button, .view-toggle button, .symbols button, summary {
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.02);
      border-radius: 999px;
      padding: 6px 12px;
      transition: border-color 160ms ease, background-color 160ms ease, color 160ms ease;
    }
    .batch button { flex: 0 0 auto; }
    .batch .batch-unit {
      display: grid;
      gap: 2px;
      justify-items: start;
      border-radius: 14px;
      padding: 8px 12px;
      min-width: 148px;
      text-align: left;
      line-height: 1.25;
    }
    .batch .batch-label { font-weight: 560; }
    .batch .batch-score { font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 12px; font-variant-numeric: tabular-nums; }
    .batch .batch-findings { color: var(--muted); font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 11px; }
    .batch .verdict-fix .batch-score { color: var(--amber); }
    .batch .verdict-passed .batch-score { color: var(--cyan); }
    .batch .verdict-review .batch-score { color: var(--violet-ink); }
    .batch button:hover, .lens-controls button:hover, .view-toggle button:hover, .symbols button:hover, summary:hover { border-color: rgba(0, 242, 254, 0.55); }
    .batch button.is-on { border-color: var(--cyan); color: var(--cyan); background: rgba(0, 242, 254, 0.08); }
    .batch .batch-unit.is-on .batch-findings { color: rgba(0, 242, 254, 0.78); }
    main { display: grid; grid-template-columns: minmax(0, 1fr) minmax(440px, 560px); min-height: 0; }
    .sky, aside { min-height: 0; }
    .sky { position: relative; min-width: 0; outline: none; display: flex; flex-direction: column; }
    .sky:focus-visible { outline: 2px solid var(--cyan); outline-offset: -2px; }
    canvas { width: 100%; flex: 1; min-height: 0; display: block; cursor: grab; }
    #tip { position: absolute; z-index: 3; max-width: 360px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 10px; background: rgba(11, 15, 25, 0.94); color: var(--ink); font: 12px/1.45 "JetBrains Mono", ui-monospace, monospace; pointer-events: none; }
    .compass { position: absolute; inset: 16px 16px 64px; display: grid; grid-template-columns: 1fr auto 1fr; grid-template-rows: auto 1fr auto; pointer-events: none; }
    .compass p { margin: 0; display: grid; gap: 2px; }
    .compass span { color: var(--muted); font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; }
    .compass b { font-size: 22px; font-weight: 500; letter-spacing: -0.04em; }
    .c-n { grid-column: 2; grid-row: 1; text-align: center; }
    .c-e { grid-column: 3; grid-row: 2; align-self: center; justify-self: end; text-align: right; }
    .c-s { grid-column: 2; grid-row: 3; text-align: center; }
    .c-w { grid-column: 1; grid-row: 2; align-self: center; }
    .lens-bar { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 16px; border-top: 1px solid var(--line); }
    .hint { margin: 0; max-width: 56ch; color: var(--muted); font-size: 11px; letter-spacing: 0.04em; line-height: 1.45; text-align: right; }
    .lens-controls { display: flex; gap: 8px; }
    .lens-controls button { border-radius: 10px; min-height: 36px; }
    aside { overflow: hidden; border-left: 1px solid var(--line); padding: 0; background: var(--panel); display: flex; min-height: 0; }
    .aside-shell { display: grid; grid-template-columns: minmax(0, 1fr) 56px; flex: 1; min-height: 0; width: 100%; }
    .aside-tabs { display: flex; flex-direction: column; gap: 6px; padding: 12px 8px; border-left: 1px solid var(--line); background: rgba(0, 0, 0, 0.18); }
    .aside-tabs button {
      position: relative;
      border: 1px solid transparent;
      background: transparent;
      border-radius: 12px;
      width: 40px;
      height: 40px;
      padding: 0;
      color: var(--muted);
      display: grid;
      place-items: center;
      transition: border-color 160ms ease, background-color 160ms ease, color 160ms ease;
    }
    .aside-tabs button svg { width: 18px; height: 18px; display: block; }
    .aside-tabs button:hover { border-color: rgba(0, 242, 254, 0.4); color: var(--ink); }
    .aside-tabs button.is-on { border-color: var(--cyan); color: var(--cyan); background: rgba(0, 242, 254, 0.08); }
    .aside-tabs .tab-count {
      position: absolute;
      top: -2px;
      right: -2px;
      min-width: 1.15em;
      padding: 0 4px;
      border-radius: 999px;
      border: 1px solid var(--line);
      background: var(--panel);
      font-family: "JetBrains Mono", ui-monospace, monospace;
      font-size: 9px;
      line-height: 1.4;
      color: var(--ink);
    }
    .aside-tabs button.is-on .tab-count { border-color: rgba(0, 242, 254, 0.45); color: var(--cyan); }
    .aside-panels { min-height: 0; overflow: auto; padding: 16px 18px 24px; scroll-padding-top: 16px; }
    .aside-panels > [role="tabpanel"][hidden] { display: none !important; }
    .panel-stack { display: grid; gap: 4px; }
    h2 { margin: 0 0 12px; font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted); font-weight: 600; }
    .verdict { border: 1px solid var(--line); border-radius: 16px; padding: 14px; margin: 0 0 18px; }
    .verdict-fix { border-color: rgba(255, 176, 32, 0.7); }
    .verdict-passed { border-color: rgba(0, 242, 254, 0.7); }
    .verdict-review { border-color: rgba(210, 180, 255, 0.7); }
    .verdict-row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin: 2px 0 8px; }
    .verdict-row b { font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 40px; line-height: 1; font-weight: 500; letter-spacing: -0.05em; }
    .verdict-label { font-size: 13px; letter-spacing: 0.12em; text-transform: uppercase; }
    .verdict-fix .verdict-row b, .verdict-fix .verdict-label { color: var(--amber); }
    .verdict-passed .verdict-row b, .verdict-passed .verdict-label { color: var(--cyan); }
    .verdict-review .verdict-row b, .verdict-review .verdict-label { color: var(--violet-ink); }
    .agent-score { color: var(--violet-ink); font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 12px; }
    .verdict .quiet { margin: 0; font-size: 13px; }
    .legend, .units, .alerts { list-style: none; padding: 0; margin: 0 0 16px; }
    .surface { width: 100%; height: auto; display: block; margin: 0 0 4px; }
    .surface .guide { fill: none; stroke: rgba(232, 238, 248, 0.2); stroke-width: 1; }
    .surface .axis { stroke: rgba(232, 238, 248, 0.16); stroke-width: 1; }
    .surface .value { stroke: #00F2FE; stroke-width: 1.75; }
    .surface .axis-name { font-family: "IBM Plex Sans", "Segoe UI", sans-serif; font-size: 11px; fill: #A8B3C7; letter-spacing: 0.06em; }
    .surface .axis-value { font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 13px; font-weight: 500; }
    .legend { display: flex; flex-wrap: wrap; gap: 10px 14px; }
    .legend li { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 12px; }
    .legend b { color: var(--ink); font-weight: 500; }
    .shape { width: 9px; height: 9px; display: inline-block; background: currentColor; }
    .shape.logic { color: var(--cyan); border-radius: 50%; }
    .shape.contract { color: var(--violet-ink); transform: rotate(45deg); }
    .shape.text { color: #C5D0E2; border-radius: 2px; }
    .shape.orbit { color: #7E8BA3; border-radius: 50%; background: transparent; box-shadow: inset 0 0 0 1.5px currentColor; }
    .shape.finding { color: var(--amber); border-radius: 50%; }
    .unit-fold { margin: 0 0 18px; }
    summary { display: inline-flex; border-radius: 10px; }
    .units { margin-top: 10px; display: grid; gap: 8px; }
    .units li { display: grid; gap: 2px; font-size: 13px; }
    .units em, .quiet, .symbols small, .tree-file-name { color: var(--muted); font-style: normal; }
    .units em, .tree-file-name { font-size: 12px; }
    .symbol-meta { display: inline-flex; gap: 8px; align-items: baseline; flex: 0 0 auto; margin-left: auto; font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 11px; font-variant-numeric: tabular-nums; }
    .symbol-meta .add { color: #7ee787; }
    .symbol-meta .del { color: #ff9b94; }
    .symbol-meta .cx, .symbol-meta em { color: var(--violet-ink); font-style: normal; }
    #detail { border: 1px solid var(--line); border-radius: 16px; padding: 14px; margin: 0; background: rgba(255, 255, 255, 0.03); }
    #detail h2 { color: var(--ink); letter-spacing: -0.03em; text-transform: none; font-size: 22px; margin: 4px 0; }
    #detail .eyebrow { margin-bottom: 4px; }
    #detail pre { white-space: pre-wrap; margin: 10px 0 0; font: 12px/1.5 "JetBrains Mono", ui-monospace, monospace; background: rgba(0, 0, 0, 0.28); padding: 10px; border-radius: 10px; }
    .diff-review { margin-top: 12px; border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
    .diff-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 10px; border-bottom: 1px solid var(--line); background: rgba(255, 255, 255, 0.03); }
    .diff-head strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; font-weight: 560; }
    .diff-note, .diff-empty { margin: 0; padding: 8px 10px; color: var(--muted); font-size: 12px; }
    .diff-body { max-height: min(62vh, 720px); overflow: auto; background: #070b12; }
    .diff-table { width: max-content; min-width: 100%; border-collapse: collapse; font: 12px/1.55 "JetBrains Mono", ui-monospace, monospace; }
    .diff-table td { padding: 0; vertical-align: top; }
    .diff-table .ln, .diff-table .sign { color: #6d7c93; background: rgba(0, 0, 0, 0.28); user-select: none; text-align: right; }
    .diff-table .ln { min-width: 2.4em; padding: 0 8px; }
    .diff-table .sign { width: 1.2em; padding: 0 4px 0 6px; text-align: center; }
    .diff-table .code { padding: 0 12px 0 8px; white-space: pre; color: #d5deec; }
    .diff-table tr.add { background: rgba(46, 160, 67, 0.22); }
    .diff-table tr.add .sign, .diff-table tr.add .code { color: #7ee787; }
    .diff-table tr.del { background: rgba(248, 81, 73, 0.2); }
    .diff-table tr.del .sign, .diff-table tr.del .code { color: #ffb1ab; }
    .diff-table tr.hunk td { padding: 8px 10px; color: #c5b6e0; background: rgba(127, 0, 255, 0.16); }
    .diff-table tr.is-mark { box-shadow: inset 3px 0 0 var(--cyan); }
    .alert { color: var(--amber); }
    .alerts { display: grid; gap: 8px; }
    .alerts li { padding: 10px 10px 10px 12px; border-left: 3px solid var(--cyan); border-radius: 0 10px 10px 0; background: rgba(255, 255, 255, 0.03); }
    .alerts em { font-style: normal; text-transform: uppercase; letter-spacing: 0.08em; font-size: 11px; color: var(--muted); }
    .sev-critical { border-color: var(--amber); }
    .sev-high { border-color: var(--violet-ink); }
    .alerts .alert-path { display: block; width: 100%; margin-top: 6px; padding: 0; border: 0; background: transparent; color: var(--cyan); font: 12px/1.4 "JetBrains Mono", ui-monospace, monospace; text-align: left; text-decoration: underline; text-underline-offset: 3px; }
    .alerts .alert-path:hover { color: var(--ink); }
    .symbol-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 0 0 12px; }
    .symbol-head h2 { margin: 0; }
    .view-toggle { display: flex; gap: 6px; }
    .view-toggle button { border-radius: 999px; padding: 4px 10px; font-size: 12px; }
    .view-toggle button.is-on { border-color: var(--cyan); color: var(--cyan); background: rgba(0, 242, 254, 0.08); }
    .finder { width: 100%; margin: 0 0 8px; padding: 8px 10px; border-radius: 10px; border: 1px solid var(--line); background: rgba(0, 0, 0, 0.25); }
    .index { display: grid; gap: 6px; margin: 0; }
    .symbols button { border-radius: 12px; display: flex; align-items: center; gap: 8px; text-align: left; padding: 7px 10px; width: 100%; }
    .symbols button.is-on { border-color: var(--cyan); }
    .symbols i { width: 8px; height: 8px; flex: 0 0 auto; }
    .symbols .spec-logic i { background: var(--cyan); border-radius: 50%; }
    .symbols .spec-contract i { background: var(--violet-ink); transform: rotate(45deg); }
    .symbols .spec-text i { background: #C5D0E2; border-radius: 2px; }
    .symbol-copy { display: grid; flex: 1 1 auto; min-width: 0; }
    .symbols strong { font-weight: 560; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .symbols small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); }
    .tree { margin: 0; }
    .tree ul { list-style: none; margin: 0; padding: 0 0 0 12px; border-left: 1px solid var(--line); }
    .tree > ul { padding-left: 0; border-left: 0; }
    .tree li { margin: 0; }
    .tree summary { border: 0; background: transparent; padding: 4px 0; color: var(--cyan); font-size: 12px; }
    .tree summary:hover { border-color: transparent; }
    .tree-file-name { display: block; margin: 10px 0 4px; font-family: "JetBrains Mono", ui-monospace, monospace; }
    @media (max-width: 860px) {
      html, body { height: auto; }
      body { display: block; }
      header, .meta { align-items: flex-start; flex-direction: column; justify-items: start; }
      main { grid-template-columns: 1fr; }
      .sky { height: 72vh; }
      aside { border-left: 0; border-top: 1px solid var(--line); min-height: 70vh; }
      .aside-shell { grid-template-columns: 1fr; grid-template-rows: minmax(0, 1fr) auto; }
      .aside-tabs { flex-direction: row; justify-content: center; overflow-x: auto; border-left: 0; border-top: 1px solid var(--line); padding: 8px; }
      .aside-tabs button { flex: 0 0 auto; }
      .hint { display: none; }
    }
    @media (prefers-reduced-motion: reduce) {
      .batch button, .aside-tabs button, .lens-controls button, .view-toggle button, .symbols button, summary { transition: none; }
      .mark { filter: none; }
    }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <svg class="mark" width="42" height="42" viewBox="0 0 36 36" aria-hidden="true">${astroidMarkup(18, 18, 14, 1.4)}</svg>
      <div>
        <p class="eyebrow">AI code review map</p>
        <h1>Astroidal</h1>
        <p class="tagline">Map the blast radius. Score the change. Hand your agent a bug map.</p>
        <p class="roles"><span>Helper</span><span>Map</span><span>Scorer</span></p>
      </div>
    </div>
    <div class="meta">
      <p class="tier tier-${escapeHtml(graph.summary.riskTier)}">${escapeHtml(tierLabel(graph.summary.riskTier))}</p>
      <p class="scope">${escapeHtml(graph.repoName)}</p>
      <p class="scope">${batchLabel} · ${graph.summary.files} files · +${graph.summary.additions} −${graph.summary.deletions}</p>
    </div>
  </header>
  <div class="batch" role="toolbar" aria-label="Batch">
    ${allTab}${units}
  </div>
  <main>
    <section class="sky" tabindex="0" aria-label="Change map. Arrow keys move the map. Plus and minus lens in and out.">
      <p class="sr">${graph.summary.symbols} changed symbols and ${graph.summary.neighbors} neighbors. A cyan cloud is one directory. A violet dashed cloud is a group named in the review. A line is an import or a call. Logic is a circle, contract is a diamond, text is a square, and orbit neighbors are rings. An orange shape marks a finding on that symbol; one finding can cover several files or symbols.</p>
      <canvas id="sky"></canvas>
      <div id="tip" hidden></div>
      <div class="lens-bar">
        <div class="lens-controls">
          <button type="button" id="lens-in">Lens in</button>
          <button type="button" id="lens-out">Lens out</button>
          <button type="button" id="lens-fit">Fit</button>
        </div>
        <p class="hint">A cloud is a directory. Violet is a named group. A line is an import or a call. Orange marks a finding.</p>
      </div>
    </section>
    <aside aria-label="Review panels">
      <div class="aside-shell">
        <div class="aside-panels">
          <section id="panel-score" class="panel-stack" role="tabpanel" aria-labelledby="tab-score">
            <div id="review-panel">${scoreCard(review)}</div>
            <h2>Impact surface</h2>
            <div id="impact-panel">${impactSurface(impact)}</div>
            <ul class="legend">
              <li><i class="shape logic" aria-hidden="true"></i> Logic <b>${countSpectral(graph.nodes, "logic")}</b></li>
              <li><i class="shape contract" aria-hidden="true"></i> Contract <b>${countSpectral(graph.nodes, "contract")}</b></li>
              <li><i class="shape text" aria-hidden="true"></i> Text <b>${countSpectral(graph.nodes, "text")}</b></li>
              <li><i class="shape orbit" aria-hidden="true"></i> Orbit</li>
              <li><i class="shape finding" aria-hidden="true"></i> Finding <b>${graph.findings.length}</b></li>
            </ul>
            ${unitScores}
          </section>
          <section id="panel-findings" class="panel-stack" role="tabpanel" aria-labelledby="tab-findings" hidden>
            <h2>Cusp alerts</h2>
            <div id="alerts-panel">${alerts}</div>
          </section>
          <section id="panel-lens" class="panel-stack" role="tabpanel" aria-labelledby="tab-lens" hidden>
            <div id="detail"><p class="eyebrow">Lens</p><p>Select a star. Click it again, or the empty sky, to clear it.</p></div>
          </section>
          <section id="panel-symbols" class="panel-stack" role="tabpanel" aria-labelledby="tab-symbols" hidden>
            <div class="symbol-head">
              <h2>Changed symbols</h2>
              <div class="view-toggle" role="group" aria-label="Changed symbols view">
                <button type="button" id="view-tree" class="is-on" aria-pressed="true">Tree</button>
                <button type="button" id="view-list" aria-pressed="false">List</button>
              </div>
            </div>
            <input id="symbol-filter" class="finder" type="search" placeholder="Filter symbols" aria-label="Filter symbols">
            <div class="index symbols" id="symbol-list" hidden>${index || '<p class="quiet">No symbols in this map.</p>'}</div>
            ${tree}
            <p id="index-empty" class="quiet" hidden>No symbol matches.</p>
          </section>
        </div>
        <nav class="aside-tabs" role="tablist" aria-orientation="vertical" aria-label="Review sections">
          <button type="button" role="tab" id="tab-score" class="is-on" data-panel="score" aria-controls="panel-score" aria-selected="true" aria-label="Score" title="Score">${tabIcon("score")}</button>
          <button type="button" role="tab" id="tab-findings" data-panel="findings" aria-controls="panel-findings" aria-selected="false" aria-label="Findings" title="Findings">${tabIcon("findings")}${graph.findings.length > 0 ? `<span class="tab-count" id="findings-count">${graph.findings.length}</span>` : `<span class="tab-count" id="findings-count" hidden>0</span>`}</button>
          <button type="button" role="tab" id="tab-lens" data-panel="lens" aria-controls="panel-lens" aria-selected="false" aria-label="Lens" title="Lens">${tabIcon("lens")}</button>
          <button type="button" role="tab" id="tab-symbols" data-panel="symbols" aria-controls="panel-symbols" aria-selected="false" aria-label="Symbols" title="Symbols">${tabIcon("symbols")}</button>
        </nav>
      </div>
    </aside>
  </main>
  <script type="application/json" id="astroidal-data">${payload}</script>
  <script>${script}</script>
</body>
</html>`;
}

function reviewOf(graph: Graph): ReviewScore {
  if (graph.score) return graph.score;
  return scoreReview({
    impact: graph.impact,
    findings: graph.findings ?? [],
    reviewed: graph.summary.reviewed === true,
    partial: graph.files.some((file) => file.partial),
    additions: graph.summary.additions,
    deletions: graph.summary.deletions,
    files: graph.summary.files,
    symbols: graph.summary.symbols,
  });
}

function tabIcon(kind: "score" | "findings" | "lens" | "symbols"): string {
  if (kind === "score")
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M12 3 14.8 9.2 21.5 10 16.6 14.6 18 21.3 12 18 6 21.3 7.4 14.6 2.5 10l6.7-.8L12 3Z"/></svg>';
  if (kind === "findings")
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M12 3 22 20H2L12 3Z"/><path d="M12 10v5"/><circle cx="12" cy="17.5" r="0.8" fill="currentColor" stroke="none"/></svg>';
  if (kind === "lens")
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16.2 16.2 4.3 4.3"/><circle cx="11" cy="11" r="2.2"/></svg>';
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M8 5h11M8 12h11M8 19h11"/><circle cx="4.5" cy="5" r="1.2" fill="currentColor" stroke="none"/><circle cx="4.5" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="4.5" cy="19" r="1.2" fill="currentColor" stroke="none"/></svg>';
}

function batchUnitButton(graph: Graph, unit: GraphUnit): string {
  const findings = graph.findings.filter(
    (finding) => finding.pr === unit.label,
  ).length;
  return batchFilterButton({
    id: unit.id,
    label: unit.label,
    score: unit.score,
    findings,
    pressed: false,
  });
}

function batchFilterButton(input: {
  id: string;
  label: string;
  score?: ReviewScore;
  findings: number;
  pressed: boolean;
}): string {
  const score = input.score;
  const verdict = score ? verdictLabel(score.verdict) : "";
  const scoreLine = score
    ? `<span class="batch-score">${score.value} · ${escapeHtml(verdict)}</span>`
    : "";
  const findingLine = `<span class="batch-findings">${input.findings} finding${input.findings === 1 ? "" : "s"}</span>`;
  const verdictClass = score ? ` verdict-${score.verdict}` : "";
  const on = input.pressed ? " is-on" : "";
  const aria = score
    ? `${input.label}, score ${score.value}, ${verdict}, ${input.findings} findings`
    : input.label;
  return `<button type="button" class="batch-unit${verdictClass}${on}" data-filter="${escapeHtml(input.id)}" aria-pressed="${input.pressed ? "true" : "false"}" aria-label="${escapeHtml(aria)}"><span class="batch-label">${escapeHtml(input.label)}</span>${scoreLine}${findingLine}</button>`;
}

function alertsMarkup(findings: RankedFinding[]): string {
  if (findings.length === 0)
    return '<p class="quiet">No cusp alerts on this map.</p>';
  return `<ol class="alerts">${findings
    .map((finding) => {
      const locations =
        finding.locations?.length > 0
          ? finding.locations
          : [
              {
                path: finding.path,
                line: finding.line,
                quote: finding.quote,
                symbol: null as string | null,
              },
            ];
      const buttons = locations
        .map((location) => {
          const line = location.line == null ? "" : `:${location.line}`;
          const symbol = location.symbol
            ? ` (${escapeHtml(location.symbol)})`
            : "";
          return `<button type="button" class="alert-path" data-alert-path="${escapeHtml(location.path)}" data-alert-line="${location.line ?? ""}" data-alert-id="${escapeHtml(finding.id)}" aria-label="Open ${escapeHtml(location.path)} in the lens">${escapeHtml(location.path)}${line}${symbol}</button>`;
        })
        .join("");
      return `<li class="sev-${finding.severity}"><strong>${escapeHtml(finding.id)}</strong> <em>${escapeHtml(finding.severity)}</em>${finding.agentScore == null ? "" : ` <span class="agent-score">agent ${finding.agentScore}</span>`} ${escapeHtml(finding.description)}${buttons}</li>`;
    })
    .join("")}</ol>`;
}

function symbolButton(
  entry: { node: GraphNode; index: number },
  showPath: boolean,
): string {
  const { node, index } = entry;
  const meta = showPath
    ? `<small>${escapeHtml(node.path)}:${node.line}</small>`
    : "";
  const search = escapeHtml(`${node.name} ${node.path}`);
  return `<button type="button" class="spec-${node.spectral}" data-index="${index}" data-search="${search}"><i aria-hidden="true"></i><span class="symbol-copy"><strong>${escapeHtml(node.name)}</strong>${meta}</span>${symbolStats(node)}</button>`;
}

function symbolStats(node: GraphNode): string {
  const additions = node.additions ?? 0;
  const deletions = node.deletions ?? 0;
  const complexity = node.complexity ?? 0;
  const delta = node.complexityDelta ?? 0;
  const lines =
    additions === 0 && deletions === 0
      ? ""
      : `<span class="add">+${additions}</span><span class="del">−${deletions}</span>`;
  const change = delta === 0 ? "" : ` <em>${signed(delta)}</em>`;
  const label = `${additions} added, ${deletions} deleted, complexity ${complexity}${delta === 0 ? "" : `, delta ${signed(delta)}`}`;
  return `<span class="symbol-meta" title="${escapeHtml(label)}">${lines}<span class="cx">complexity ${complexity}${change}</span></span>`;
}

function symbolTree(
  entries: Array<{ node: GraphNode; index: number }>,
): string {
  if (entries.length === 0)
    return '<div class="tree symbols" id="symbol-tree"><p class="quiet">No symbols in this map.</p></div>';
  const root = treeBranch();
  for (const entry of entries) {
    const parts = entry.node.path.split("/").filter(Boolean);
    const file = parts.pop() ?? entry.node.path;
    let branch = root;
    for (const part of parts) {
      const next = branch.dirs.get(part) ?? treeBranch();
      branch.dirs.set(part, next);
      branch = next;
    }
    const list = branch.files.get(file) ?? [];
    list.push(entry);
    branch.files.set(file, list);
  }
  return `<div class="tree symbols" id="symbol-tree">${renderTree(root)}</div>`;
}

function treeBranch(): {
  dirs: Map<string, ReturnType<typeof treeBranch>>;
  files: Map<string, Array<{ node: GraphNode; index: number }>>;
} {
  return { dirs: new Map(), files: new Map() };
}

function renderTree(branch: {
  dirs: Map<string, ReturnType<typeof treeBranch>>;
  files: Map<string, Array<{ node: GraphNode; index: number }>>;
}): string {
  const dirs = [...branch.dirs.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );
  const files = [...branch.files.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );
  const items = [
    ...dirs.map(
      ([name, child]) =>
        `<li><details open><summary>${escapeHtml(name)}</summary>${renderTree(child)}</details></li>`,
    ),
    ...files.map(
      ([name, group]) =>
        `<li class="tree-file"><span class="tree-file-name">${escapeHtml(name)}</span>${group.map((entry) => symbolButton(entry, false)).join("")}</li>`,
    ),
  ];
  return `<ul>${items.join("")}</ul>`;
}

function scoreCard(score: ReviewScore): string {
  const label = verdictLabel(score.verdict);
  const agent =
    score.agentScore == null
      ? ""
      : `<p class="quiet">Agent score ${score.agentScore}</p>`;
  return `<section class="verdict verdict-${score.verdict}" aria-label="Astroidal score ${score.value}, ${label}"><p class="eyebrow">Astroidal score</p><p class="verdict-row"><b>${score.value}</b><span class="verdict-label">${label}</span></p><p class="quiet">${escapeHtml(score.reason)}</p>${agent}</section>`;
}

function impactSurface(impact: Graph["impact"]): string {
  const blast = clampScore(impact.blastRadius);
  const complexity = clampScore(impact.complexityDelta);
  const security = clampScore(impact.securityExposure);
  const performance = clampScore(impact.performanceImpact);
  const guide = astroidPath(160, 156, 108, 100, 100, 100, 100);
  const value = astroidPath(
    160,
    156,
    108,
    blast,
    complexity,
    security,
    performance,
  );
  return `<svg class="surface" viewBox="0 0 320 312" role="img" aria-label="Impact surface. Blast ${blast}. Complexity ${signed(impact.complexityRaw)}. Security ${security}. Performance ${performance}.">
    <defs><radialGradient id="astroid-fill" cx="50%" cy="50%" r="65%"><stop offset="0%" stop-color="#7F00FF" stop-opacity="0.45" /><stop offset="78%" stop-color="#00F2FE" stop-opacity="0.16" /></radialGradient></defs>
    <path class="guide" d="${guide}" />
    <line class="axis" x1="160" y1="48" x2="160" y2="264" />
    <line class="axis" x1="52" y1="156" x2="268" y2="156" />
    <path class="value" d="${value}" fill="url(#astroid-fill)" />
    ${cuspMark(160 + (blast / 100) * 108, 156, "#00F2FE")}
    ${cuspMark(160, 156 - (complexity / 100) * 108, "#D2B4FF")}
    ${cuspMark(160 - (security / 100) * 108, 156, "#FFB020")}
    ${cuspMark(160, 156 + (performance / 100) * 108, "#9AF7FF")}
    <text class="axis-name" x="160" y="22" text-anchor="middle">Complexity</text>
    <text class="axis-value" x="160" y="40" text-anchor="middle" fill="#D2B4FF">${signed(impact.complexityRaw)}</text>
    <text class="axis-name" x="276" y="150" text-anchor="start">Blast</text>
    <text class="axis-value" x="276" y="168" text-anchor="start" fill="#00F2FE">${blast}</text>
    <text class="axis-name" x="44" y="150" text-anchor="end">Security</text>
    <text class="axis-value" x="44" y="168" text-anchor="end" fill="#FFB020">${security}</text>
    <text class="axis-name" x="160" y="286" text-anchor="middle">Performance</text>
    <text class="axis-value" x="160" y="304" text-anchor="middle" fill="#9AF7FF">${performance}</text>
  </svg>`;
}

function cuspMark(x: number, y: number, color: string): string {
  return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="${color}" />`;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function astroidPath(
  cx: number,
  cy: number,
  maxR: number,
  right: number,
  top: number,
  left: number,
  bottom: number,
): string {
  const commands: string[] = [];
  const steps = 128;
  for (let index = 0; index <= steps; index += 1) {
    const turn = (index / steps) * Math.PI * 2;
    const cosine = Math.cos(turn);
    const sine = Math.sin(turn);
    const horizontal = (cosine >= 0 ? right : left) / 100;
    const vertical = (sine >= 0 ? bottom : top) / 100;
    const x =
      cx + Math.sign(cosine) * Math.abs(cosine) ** 3 * horizontal * maxR;
    const y = cy + Math.sign(sine) * Math.abs(sine) ** 3 * vertical * maxR;
    commands.push(`${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return `${commands.join(" ")} Z`;
}

function tierLabel(tier: string): string {
  if (tier === "full") return "Full review";
  if (tier === "lite") return "Lite review";
  return "Light pass";
}

function astroidMarkup(
  cx: number,
  cy: number,
  radius: number,
  stroke: number,
): string {
  const commands: string[] = [];
  for (let index = 0; index <= 96; index += 1) {
    const turn = (index / 96) * Math.PI * 2;
    const x = cx + radius * Math.cos(turn) ** 3;
    const y = cy + radius * Math.sin(turn) ** 3;
    commands.push(`${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return `<path d="${commands.join(" ")} Z" fill="none" stroke="#00F2FE" stroke-width="${stroke}" />`;
}

function countSpectral(
  nodes: GraphNode[],
  spectral: GraphNode["spectral"],
): number {
  return nodes.filter(
    (node) => node.role === "changed" && node.spectral === spectral,
  ).length;
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function loadSky(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const candidate of [
    join(here, "sky-script.js"),
    join(here, "..", "src", "sky-script.js"),
  ]) {
    try {
      return readFileSync(candidate, "utf8");
    } catch {
      continue;
    }
  }
  throw new Error(
    "Astroidal could not find sky-script.js next to the compiled CLI.",
  );
}
