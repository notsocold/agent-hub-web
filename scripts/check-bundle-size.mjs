#!/usr/bin/env node
/**
 * 产物体积门禁：逐文件 gzip 后求和（与 Vite 构建报告口径一致），
 * 任一超限 exit 1，供 CI 在 build 之后串联执行。
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const DIST_ASSETS = 'dist/assets'
const MAX_CHUNK_KB = Number(process.env.BUNDLE_MAX_CHUNK_KB ?? 110)
const MAX_JS_TOTAL_KB = Number(process.env.BUNDLE_MAX_TOTAL_JS_KB ?? 420)
const MAX_CSS_TOTAL_KB = Number(process.env.BUNDLE_MAX_TOTAL_CSS_KB ?? 60)

function gzipKb(file) {
  return gzipSync(readFileSync(file), { level: 9 }).length / 1024
}

function format(value) {
  return `${value.toFixed(1)} KB`
}

let entries
try {
  entries = readdirSync(DIST_ASSETS)
} catch {
  console.error(`✗ 找不到 ${DIST_ASSETS}，请先执行 pnpm build`)
  process.exit(1)
}

const files = entries
  .filter((name) => name.endsWith('.js') || name.endsWith('.css'))
  .map((name) => {
    const file = join(DIST_ASSETS, name)
    const raw = readFileSync(file).length / 1024
    return { name, rawKb: raw, gzipKb: gzipKb(file) }
  })
  .sort((a, b) => b.gzipKb - a.gzipKb)

const jsFiles = files.filter((file) => file.name.endsWith('.js'))
const cssFiles = files.filter((file) => file.name.endsWith('.css'))
const jsTotal = jsFiles.reduce((sum, file) => sum + file.gzipKb, 0)
const cssTotal = cssFiles.reduce((sum, file) => sum + file.gzipKb, 0)

console.log(`产物体积（gzip，${files.length} 个文件）`)
console.log('  ' + ['chunk', 'raw', 'gzip'].map((h) => h.padEnd(38)).join(''))
for (const file of files.slice(0, 10)) {
  console.log(`  ${file.name.padEnd(38)} ${format(file.rawKb).padEnd(10)} ${format(file.gzipKb)}`)
}
console.log(`  JS 总 gzip: ${format(jsTotal)}（上限 ${MAX_JS_TOTAL_KB} KB）`)
console.log(`  CSS 总 gzip: ${format(cssTotal)}（上限 ${MAX_CSS_TOTAL_KB} KB）`)

const failures = []
for (const file of files) {
  if (file.gzipKb > MAX_CHUNK_KB) {
    failures.push(`${file.name} gzip ${format(file.gzipKb)} 超过单 chunk 上限 ${MAX_CHUNK_KB} KB`)
  }
}
if (jsTotal > MAX_JS_TOTAL_KB) {
  failures.push(`JS 总 gzip ${format(jsTotal)} 超过上限 ${MAX_JS_TOTAL_KB} KB`)
}
if (cssTotal > MAX_CSS_TOTAL_KB) {
  failures.push(`CSS 总 gzip ${format(cssTotal)} 超过上限 ${MAX_CSS_TOTAL_KB} KB`)
}

if (failures.length) {
  for (const message of failures) console.error(`✗ ${message}`)
  process.exit(1)
}

console.log('✓ bundle size ok')
