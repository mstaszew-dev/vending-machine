/**
 * Generates docs/test-map.puml from the test sources so the diagram lists the verbatim
 * it(...) / test(...) names and can never drift from the code. invoked by diagrams.sh.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const OUT = join(ROOT, 'docs', 'test-map.puml')

function walk(dir, suffix) {
  let found = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) found = found.concat(walk(path, suffix))
    else if (suffix.some((s) => entry.name.endsWith(s))) found.push(path)
  }
  return found
}

function unescapeName(name) {
  return name.replace(/\\(['"`])/g, '$1')
}

function namesOf(file, keyword) {
  const source = readFileSync(file, 'utf8')
  const found = []

  const plain = new RegExp(`\\b${keyword}\\(\\s*(['"\`])((?:\\\\.|(?!\\1).)*)\\1`, 'g')
  for (const match of source.matchAll(plain)) {
    found.push({ index: match.index, names: [unescapeName(match[2])] })
  }

  // it.each([...])('rejects quantity %s') is one source name but several Jest cases;
  // expand simple primitive arrays so the diagram count matches the test runner.
  const each = new RegExp(
    `\\b${keyword}\\.each\\(\\s*\\[([^\\]]*)\\]\\s*\\)\\(\\s*(['"\`])((?:\\\\.|(?!\\2).)*)\\2`,
    'g',
  )
  for (const match of source.matchAll(each)) {
    const cases = match[1]
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value !== '')
      .map((value) => value.replace(/^['"`]|['"`]$/g, ''))
    const template = unescapeName(match[3])
    found.push({
      index: match.index,
      names: cases.map((value) => template.replace(/%[sdif]/g, value)),
    })
  }

  found.sort((a, b) => a.index - b.index)
  return found.flatMap((entry) => entry.names)
}

function branch(title, roots, keyword, label) {
  const lines = []
  const files = []
  for (const root of roots) {
    const absolute = join(ROOT, root)
    files.push(...walk(absolute, ['.spec.ts', '.int-spec.ts', '.test.ts', '.test.tsx']))
  }
  files.sort()
  let total = 0
  for (const file of files) {
    const names = namesOf(file, keyword)
    if (names.length === 0) continue
    total += names.length
    const short = relative(ROOT, file)
    lines.push(`*** ${short} (${names.length})`)
    for (const name of names) {
      lines.push(`**** ${name.replace(/\*/g, '\\*')}`)
    }
  }
  return [`** ${title} - ${label} (${total})`, ...lines]
}

const lines = [
  '@startwbs',
  '* Verified behaviour - verbatim test names',
  ...branch('Unit', ['src'], 'it', 'pure logic, guards, adapters'),
  ...branch('Integration', ['test'], 'it', 'supertest + fake port'),
  ...branch('End-to-end', ['e2e'], 'test', 'real backend + InfluxDB + browser'),
  ...branch('Frontend', ['../frontend/src'], 'it', 'monitoring UI + shared contract'),
  '@endwbs',
  '',
]

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, lines.join('\n'), 'utf8')
console.log(`wrote ${relative(ROOT, OUT)} (${lines.length} lines)`)
