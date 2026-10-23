import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tryGit } from './git.js'

const SKILL_PATHS = [
  join('.agents', 'skills', 'astroidal', 'SKILL.md'),
  join('.cursor', 'skills', 'astroidal', 'SKILL.md'),
]

export function packageRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  for (const candidate of [join(here, '..'), join(here, '..', '..')]) {
    if (existsSync(join(candidate, 'package.json')) && existsSync(join(candidate, 'skills', 'astroidal', 'SKILL.md'))) return candidate
  }
  throw new Error('Could not find the Astroidal skill inside the package.')
}

export function installSkill(start: string, force: boolean, global = false): string[] {
  const root = global ? homedir() : tryGit(start, ['rev-parse', '--show-toplevel'])?.trim() || start
  const source = join(packageRoot(), 'skills', 'astroidal', 'SKILL.md')
  const notes: string[] = []
  for (const destination of SKILL_PATHS.map((path) => join(root, path))) {
    if (existsSync(destination) && !force) {
      notes.push(`Kept ${destination}`)
      continue
    }
    mkdirSync(dirname(destination), { recursive: true })
    copyFileSync(source, destination)
    notes.push(`Wrote ${destination}`)
  }
  if (!global && ensureGitignore(root)) notes.push('Added .astroidal/ to .gitignore.')
  return notes
}

function ensureGitignore(root: string): boolean {
  const path = join(root, '.gitignore')
  if (!existsSync(path)) return false
  const text = readFileSync(path, 'utf8')
  const present = text.split(/\r?\n/).some((line) => {
    const trimmed = line.trim()
    return trimmed === '.astroidal' || trimmed === '.astroidal/'
  })
  if (present) return false
  const suffix = text.endsWith('\n') || text.length === 0 ? '' : '\n'
  writeFileSync(path, `${text}${suffix}.astroidal/\n`)
  return true
}
