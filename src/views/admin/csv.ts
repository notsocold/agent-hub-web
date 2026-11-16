import dayjs from 'dayjs'

/**
 * 管理台轻量 CSV 导出工具（M3 用户导出）。
 *
 * - 纯前端实现，不引第三方依赖；
 * - 字段含逗号 / 双引号 / 换行（LF/CRLF）时按 RFC 4180 加引号并转义内部引号；
 * - Excel 打开中文 CSV 依赖 UTF-8 BOM，`csvBlob` / `downloadCsv` 统一补 BOM。
 */

/** UTF-8 BOM：缺了它 Excel 会把中文按本地编码解读成乱码。 */
export const CSV_BOM = '\uFEFF'

/** CSV 行分隔符：CRLF 兼容 Excel 与主流表格软件。 */
export const CSV_LINE_BREAK = '\r\n'

export type CsvField = string | number | null | undefined

/** 转义单个字段；仅在必要时加引号，避免整表引号噪点。 */
export function escapeCsvField(value: CsvField): string {
  const text = value === null || value === undefined ? '' : String(value)
  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`
  }
  return text
}

/** 把一行字段拼成 CSV 行（不含换行）。 */
export function toCsvRow(fields: readonly CsvField[]): string {
  return fields.map(escapeCsvField).join(',')
}

/** 生成 CSV 文本（不含 BOM），末尾保留一个换行。 */
export function buildCsv(
  header: readonly CsvField[],
  rows: ReadonlyArray<readonly CsvField[]>,
): string {
  return (
    [toCsvRow(header), ...rows.map((row) => toCsvRow(row))].join(CSV_LINE_BREAK) + CSV_LINE_BREAK
  )
}

/** 带 UTF-8 BOM 的 CSV Blob；抽出来便于单测校验编码前缀。 */
export function csvBlob(content: string): Blob {
  return new Blob([`${CSV_BOM}${content}`], { type: 'text/csv;charset=utf-8' })
}

/** 导出文件名：`<prefix>-YYYYMMDD-HHmmss.csv`，`at` 可注入便于单测。 */
export function csvFilename(prefix: string, at: Date | number | string = new Date()): string {
  return `${prefix}-${dayjs(at).format('YYYYMMDD-HHmmss')}.csv`
}

/** 触发浏览器下载；返回 Blob 仅供测试/调试读取实际内容。 */
export function downloadCsv(filename: string, content: string): Blob {
  const blob = csvBlob(content)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
  return blob
}
