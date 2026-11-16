import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  CSV_BOM,
  buildCsv,
  csvBlob,
  csvFilename,
  downloadCsv,
  escapeCsvField,
  toCsvRow,
} from '@/views/admin/csv'

async function blobText(blob: Blob): Promise<string> {
  return blob.text()
}

/** Blob.text() 会吞掉 UTF-8 BOM，校验编码前缀必须看原始字节。 */
async function blobBytes(blob: Blob): Promise<number[]> {
  return Array.from(new Uint8Array(await blob.arrayBuffer()))
}

afterEach(() => {
  Reflect.deleteProperty(URL, 'createObjectURL')
  Reflect.deleteProperty(URL, 'revokeObjectURL')
})

describe('escapeCsvField', () => {
  it('普通文本与数字原样输出', () => {
    expect(escapeCsvField('alice@example.com')).toBe('alice@example.com')
    expect(escapeCsvField('普通用户')).toBe('普通用户')
    expect(escapeCsvField(42)).toBe('42')
  })

  it('空值输出空字符串', () => {
    expect(escapeCsvField(null)).toBe('')
    expect(escapeCsvField(undefined)).toBe('')
  })

  it('逗号、双引号、换行时加引号并转义内部引号', () => {
    expect(escapeCsvField('Doe, John')).toBe('"Doe, John"')
    expect(escapeCsvField('他说"你好"')).toBe('"他说""你好"""')
    expect(escapeCsvField('第一行\n第二行')).toBe('"第一行\n第二行"')
    expect(escapeCsvField('第一行\r\n第二行')).toBe('"第一行\r\n第二行"')
  })
})

describe('toCsvRow / buildCsv', () => {
  it('按行拼装并保留 CRLF 行分隔与末尾换行', () => {
    expect(toCsvRow(['a', 'b,c', null, 1])).toBe('a,"b,c",,1')

    const csv = buildCsv(
      ['邮箱', '展示名'],
      [
        ['alice@example.com', 'Alice'],
        ['bob@example.com', 'A, "B"'],
      ],
    )
    expect(csv).toBe('邮箱,展示名\r\nalice@example.com,Alice\r\nbob@example.com,"A, ""B"""\r\n')
  })
})

describe('csvFilename', () => {
  it('使用本地时间的 YYYYMMDD-HHmmss 后缀', () => {
    // 用本地时间构造 Date，避免测试机时区不同导致断言漂移。
    const at = new Date(2026, 10, 16, 9, 4, 5)
    expect(csvFilename('agent-hub-users', at)).toBe('agent-hub-users-20261116-090405.csv')
  })
})

describe('csvBlob / downloadCsv', () => {
  it('Blob 内容以 UTF-8 BOM 开头且 MIME 为 CSV', async () => {
    expect(CSV_BOM).toBe('\uFEFF')
    const blob = csvBlob('a,b\r\n')
    expect(blob.type).toBe('text/csv;charset=utf-8')
    expect((await blobBytes(blob)).slice(0, 3)).toEqual([0xef, 0xbb, 0xbf])
    expect(await blobText(blob)).toBe('a,b\r\n')
  })

  it('触发下载并清理 object URL', async () => {
    const createObjectURL = vi.fn(() => 'blob:users')
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: createObjectURL,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: revokeObjectURL,
    })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    const blob = downloadCsv('agent-hub-users.csv', 'a,b\r\n')

    expect((await blobBytes(blob)).slice(0, 3)).toEqual([0xef, 0xbb, 0xbf])
    expect(await blobText(blob)).toBe('a,b\r\n')
    expect(createObjectURL).toHaveBeenCalledWith(blob)
    expect(click).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:users')
    click.mockRestore()
  })
})
