import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tryGit } from './git.js'

const SKILL_DIRS = [
  join('.agents', 'skills', 'astroidal'),
  join('.cursor', 'skills', 'astroidal'),
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
  const sourceDir = join(packageRoot(), 'skills', 'astroidal')
  const notes: string[] = []
  for (const destinationDir of SKILL_DIRS.map((path) => join(root, path))) {
    for (const source of filesUnder(sourceDir)) {
      const destination = join(destinationDir, relative(sourceDir, source))
      if (existsSync(destination) && !force) {
        notes.push(`Kept ${destination}`)
        continue
      }
      mkdirSync(dirname(destination), { recursive: true })
      copyFileSync(source, destination)
      notes.push(`Wrote ${destination}`)
    }
  }
  if (!global && ensureGitignore(root)) notes.push('Added .astroidal/ to .gitignore.')
  return notes
}

function filesUnder(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...filesUnder(path))
    else if (entry.isFile()) found.push(path)
  }
  return found
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
