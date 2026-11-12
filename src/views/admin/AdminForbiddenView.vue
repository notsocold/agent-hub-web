<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

function backToWorkbench(): void {
  void router.push({ name: 'chat' })
}
</script>

<template>
  <main class="forbidden">
    <section class="forbidden-card" role="alert">
      <p class="eyebrow mono">ADMIN · 403</p>
      <h1>需要管理员权限</h1>
      <p class="hint">
        当前账号不是管理员，无法打开管理控制台。如需使用用户管理、系统配置与审计功能，请联系管理员开通。
      </p>
      <button type="button" class="btn primary" @click="backToWorkbench">返回工作台</button>
    </section>
  </main>
</template>

<style scoped>
.forbidden {
  display: grid;
  place-items: center;
  min-height: 100vh;
  padding: 24px;
  background: var(--paper);
  color: var(--ink);
}

.forbidden-card {
  width: min(460px, 100%);
  padding: 28px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
  box-shadow: var(--shadow-md);
}

.eyebrow {
  margin: 0 0 8px;
  color: var(--ink-3);
  font-size: 10px;
  letter-spacing: 0.12em;
}

h1 {
  margin: 0 0 10px;
  font-size: 22px;
}

.hint {
  margin: 0 0 20px;
  color: var(--ink-2);
  font-size: 13px;
  line-height: 1.7;
}

.btn {
  height: 34px;
  padding: 0 14px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--surface);
  color: var(--ink-2);
  font-size: 12.5px;
}

.btn.primary {
  border-color: var(--prussian);
  background: var(--prussian);
  color: var(--surface);
}
</style>
