/**
 * A2A 授权链接前端校验（M7）。
 *
 * 后端 M7 对 `authorization_url` 做白名单：只允许 https，dev/test 额外允许
 * `http://localhost`、`http://127.0.0.1`，非法协议/内网/超长一律置 `null`。
 * 前端不重复实现「内网判定」策略，只保留与之一致的最小防线：
 * 协议白名单 + 本地回环 http，非法链接不渲染成可点击按钮。
 */
export function isSafeAuthorizationUrl(url: string | null | undefined): boolean {
  if (!url) return false
  if (url.length > 2000) return false
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'https:') return true
    if (parsed.protocol === 'http:') {
      return parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost'
    }
    return false
  } catch {
    return false
  }
}
