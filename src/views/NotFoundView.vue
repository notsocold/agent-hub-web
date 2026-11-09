<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <section class="not-found">
    <p class="code mono">404</p>
    <h1>页面不存在</h1>
    <p class="hint">地址可能已变更，或者你点到了一个尚未上线的入口。</p>
    <RouterLink to="/chat" class="back">返回对话</RouterLink>
  </section>
</template>

<style scoped>
.not-found {
  display: grid;
  place-content: center;
  gap: 10px;
  height: 100dvh;
  text-align: center;
  background: var(--paper);
}

.code {
  color: var(--amber-text);
  font-size: 12px;
  letter-spacing: 0.08em;
}

h1 {
  font-size: 22px;
}

.hint {
  color: var(--ink-3);
  font-size: 13px;
}

.back {
  justify-self: center;
  margin-top: 8px;
  padding: 7px 14px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--surface);
  font-size: 13px;
}
</style>
