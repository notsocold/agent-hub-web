# src 目录规划

当前只有 `main.ts`、`App.vue`、`router/index.ts`（create-vue bare 脚手架）以及空目录占位。

规划约定（需求细化后再创建文件）：

| 目录           | 职责                                                                   |
| -------------- | ---------------------------------------------------------------------- |
| `api/`         | 接口函数、Axios 实例、SSE 封装；页面不直接拼 URL                       |
| `components/`  | 展示组件，按域分子目录（chat / agents / common）                       |
| `composables/` | 可复用逻辑：`useSSE`、`useChatStream`、`useAuth`、Markdown 渲染        |
| `layouts/`     | 应用外壳：侧边栏、顶栏、内容区                                         |
| `router/`      | 路由表与守卫                                                           |
| `stores/`      | Pinia：auth / chat / conversations / agents / tasks                    |
| `styles/`      | 全局样式、CSS 变量、主题                                               |
| `types/`       | 与后端契约对应的 TypeScript 类型                                       |
| `views/`       | 路由页面：Chat / Conversations / Agents / Tasks / Knowledge / Settings |

分层规则：

- 页面通过 store 或 `api/` 访问数据，不直接使用 fetch/axios；
- 展示组件通过 props/emits 通信，不依赖路由；
- 类型只放 `types/`，api 模块不重复定义。
