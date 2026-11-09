<script setup lang="ts">
import { RouterView } from 'vue-router'
</script>

<template>
  <div class="app-shell">
    <aside class="app-sidebar" aria-label="主导航">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">A</span>
        <span>Agent Hub</span>
      </div>
      <nav class="nav">
        <RouterLink to="/chat" class="nav-item">对话</RouterLink>
        <RouterLink to="/workflows" class="nav-item">工作流</RouterLink>
        <RouterLink to="/agents" class="nav-item">智能体</RouterLink>
        <RouterLink to="/tasks" class="nav-item">任务</RouterLink>
        <RouterLink to="/knowledge" class="nav-item">知识库</RouterLink>
      </nav>
    </aside>
    <main class="app-main">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  display: grid;
  grid-template-columns: var(--sidebar-w) minmax(0, 1fr);
  height: 100dvh;
  min-height: 0;
}

.app-sidebar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: var(--paper-2);
  border-right: 1px solid var(--line);
}

.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  font-weight: 650;
}

.brand-mark {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: var(--btn-bg);
  color: var(--btn-fg);
  font-family: var(--font-mono);
  font-size: 12px;
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-item {
  padding: 7px 10px;
  border-radius: 6px;
  color: var(--ink-2);
  font-size: 13px;
}

.nav-item:hover {
  background: var(--surface-2);
  color: var(--ink);
}

.nav-item.router-link-active {
  background: var(--surface);
  color: var(--ink);
  font-weight: 600;
  box-shadow: var(--shadow-sm);
}

.app-main {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--paper);
}
</style>
