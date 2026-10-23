import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { changedLines } from './diff.js'
import { excerpt } from './syntax.js'
import type { BuildResult, BuiltFile, BuiltSymbol, Lead, LeadCategory } from './types.js'

const CATEGORIES: Array<{ file: string; title: string; categories: LeadCategory[]; intro: string }> = [
  {
    file: 'architecture.md',
    title: 'Architecture',
    categories: ['architecture', 'contract'],
    intro: 'Search for broken boundaries, duplicated sources of truth, and contract changes that callers cannot absorb.',
  },
  {
    file: 'security.md',
    title: 'Security',
    categories: ['security'],
    intro: 'Search for exploitable trust-boundary mistakes: authz gaps, injection, secrets, and unsafe deserialization.',
  },
  {
    file: 'performance.md',
    title: 'Performance',
    categories: ['performance'],
    intro: 'Search for concrete slow paths: queries or I/O inside loops, unbounded work, and sync blocking on hot paths.',
  },
  {
    file: 'ux.md',
    title: 'UX flow',
    categories: ['ux'],
    intro: 'Search for broken user flows: dead ends, missing error or empty states, and navigation that drops data.',
  },
  {
    file: 'correctness.md',
    title: 'Correctness',
    categories: ['logic', 'state'],
    intro: 'Search for logic and state bugs: wrong branches, swallowed errors, partial writes, races, and data loss.',
  },
]

export function writePackets(directory: string, result: BuildResult): void {
  const packetDir = join(directory, 'packets')
  mkdirSync(packetDir, { recursive: true })
  writeFileSync(join(packetDir, 'bug-map.md'), renderBugMap(result))
  for (const category of CATEGORIES) writeFileSync(join(packetDir, category.file), renderCategory(result, category))
}

function renderBugMap(result: BuildResult): string {
  const { graph, files } = result
  const impact = graph.impact
  const lines = [
    '# Bug map',
    '',
    'Leads below are search hints. They are not findings. Report a finding only when you can quote a real bug.',
    'Check every non-test added block below against all five classes before an empty result. A high impact score is not itself a finding, and it is not a reason to skip a block.',
    '',
    `Risk tier: ${graph.summary.riskTier}. Files ${graph.summary.files}, symbols ${graph.summary.symbols}, neighbors ${graph.summary.neighbors}.`,
    `Impact intensity (0-100): blast ${impact.blastRadius} (${impact.blastFiles} files), complexity ${impact.complexityDelta} (raw ${signed(impact.complexityRaw)}), security ${impact.securityExposure}, performance ${impact.performanceImpact}.`,
    '',
    '## Scope notes',
    '',
    ...graph.notes.map((note) => `- ${note}`),
    '',
    '## Search these classes',
    '',
    '- Logic and edge cases: wrong branches, off-by-one, swallowed errors, null crashes.',
    '- Data loss and state: migrations, races, partial writes, stale cache.',
    '- Broken contracts: API, types, routes, exported behavior, schema mismatch.',
    '- Security bugs: authz gaps, injection, secrets, unsafe trust boundaries.',
    '- UX flow bugs: dead ends, missing error, empty, or loading states, broken navigation.',
    '',
    '## Ignore',
    '',
    '- Formatting, naming, comments, and import order.',
    '- Theoretical risks that need unlikely preconditions.',
    '- Unchanged code this change does not affect.',
    '- Refactor suggestions without a concrete failure.',
    '',
    '## Changed files',
    '',
    ...files.map((file) => `- \`${file.path}\` ${file.status} ${file.spectral} +${file.additions} -${file.deletions} [${file.units.join(', ')}]`),
    '',
    '## Added lines',
    '',
    'These are the lines the change introduces. Review every block in a non-test source file before you report no findings. A symbol excerpt further down can be blank, or it can be only the tip of a stack.',
    '',
    ...addedSections(files, 200),
    '## Leads',
    '',
  ]
  if (graph.leads.length === 0) lines.push('No deterministic leads. Search the changed symbols anyway.')
  for (const lead of graph.leads) lines.push(`- ${lead.category} \`${lead.path}:${lead.line}\` — ${lead.detail}`)
  lines.push('', '## One-hop neighbors', '')
  if (graph.neighbors.length === 0) lines.push('No importers or callers were resolved.')
  for (const neighbor of graph.neighbors) lines.push(`- \`${neighbor.path}\` — ${neighbor.reason}`)
  lines.push('', '## Symbols', '')
  const interesting = files.flatMap((file) => file.symbols.map((symbol) => ({ file, symbol })))
    .sort((left, right) => scoreSymbol(right.file, right.symbol) - scoreSymbol(left.file, left.symbol))
  const shown = interesting.slice(0, 30)
  if (shown.length === 0) lines.push('No symbols were parsed. Read the changed files directly.')
  for (const item of shown) {
    lines.push(`### ${item.symbol.name}`, '', `\`${item.file.path}:${item.symbol.line}\` ${item.symbol.kind} complexity ${item.symbol.complexity} delta ${signed(item.symbol.complexityDelta)}`, '', fence(item.symbol.signature.startsWith('removed ') ? excerpt(item.file.oldText, item.symbol.line, item.symbol.endLine, 30) : excerpt(item.file.text, item.symbol.line, item.symbol.endLine, 30)), '')
  }
  if (interesting.length > shown.length) {
    lines.push('## Other symbols', '')
    for (const item of interesting.slice(30)) lines.push(`- \`${item.file.path}:${item.symbol.line}\` ${item.symbol.name}`)
  }
  lines.push('')
  return lines.join('\n')
}

function renderCategory(result: BuildResult, category: { title: string; categories: LeadCategory[]; intro: string }): string {
  const leads = result.graph.leads.filter((lead) => category.categories.includes(lead.category))
  const files = result.files.filter((file) => categoryTouches(file, leads, category.categories))
  const lines = [`# ${category.title}`, '', category.intro, '', 'Confirm or reject each lead. Leads are not findings.', '']
  if (leads.length === 0 && files.length === 0) {
    lines.push('No slice-specific signals. Use bug-map.md and still search this class before you finish.', '')
    return lines.join('\n')
  }
  for (const lead of leads) lines.push(`- \`${lead.path}:${lead.line}\` — ${lead.detail}`)
  lines.push('')
  for (const file of files.slice(0, 15)) {
    lines.push(`## ${file.path}`, '', ...addedSections([file], 80))
    const symbols = file.symbols.slice(0, 4)
    if (symbols.length === 0 && file.variants.every((variant) => changedLines(variant.patch).added.length === 0)) lines.push(fence(excerpt(file.text, 1, 24, 24)), '')
    for (const symbol of symbols) {
      lines.push(`### ${symbol.name}`, '', fence(excerpt(symbol.signature.startsWith('removed ') ? file.oldText : file.text, symbol.line, symbol.endLine, 24)), '')
    }
  }
  return lines.join('\n')
}

function categoryTouches(file: BuiltFile, leads: Lead[], categories: LeadCategory[]): boolean {
  if (leads.some((lead) => lead.path === file.path)) return true
  if (categories.includes('architecture') || categories.includes('contract')) return file.spectral === 'contract' || file.symbols.some((symbol) => symbol.exported)
  if (categories.includes('ux')) return /\.(vue|svelte|tsx|jsx|html)$|\/(pages|views|components|screens|routes)\//i.test(file.path)
  if (categories.includes('logic') || categories.includes('state')) return file.spectral === 'logic'
  if (categories.includes('performance')) return Math.abs(file.complexityDelta) >= 3
  return false
}

function addedSections(files: BuiltFile[], cap: number): string[] {
  const lines: string[] = []
  for (const file of files) {
    const blocks = file.variants.flatMap((variant) => {
      const added = changedLines(variant.patch).added.map((line) => line.trimEnd()).filter((line) => line.trim())
      if (added.length === 0) return []
      const shown = added.slice(0, cap)
      const label = variant.pr ? `PR ${variant.pr}` : variant.unit
      const body = [`### ${file.path} (${label})`, '', fence(shown.join('\n'))]
      if (shown.length < added.length) body.push('', `${added.length - shown.length} further added lines are in the evidence file.`)
      body.push('')
      return body
    })
    lines.push(...blocks)
  }
  if (lines.length === 0) lines.push('No added lines.', '')
  return lines
}

function scoreSymbol(file: BuiltFile, symbol: BuiltSymbol): number {
  return Math.abs(symbol.complexityDelta) * 4 + (symbol.exported ? 3 : 0) + (file.spectral === 'contract' ? 5 : file.spectral === 'logic' ? 2 : 0)
}

function fence(text: string): string {
  const body = text.trim() ? text.replace(/\s+$/, '') : '(empty)'
  const marker = body.includes('```') ? '````' : '```'
  return `${marker}\n${body}\n${marker}`
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value)
}
