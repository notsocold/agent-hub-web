<script setup lang="ts">
import { useRouter } from 'vue-router'

import AppIcon from '@/components/common/AppIcon.vue'
import IconSprite from '@/components/common/IconSprite.vue'

const router = useRouter()

function backToWorkbench(): void {
  void router.push({ name: 'chat' })
}
</script>

<template>
  <main class="admin-shell admin-forbidden">
    <IconSprite />
    <section class="forbidden-card" role="alert">
      <div class="forbidden-brand">
        <span class="brand-mark" aria-hidden="true"><AppIcon name="brand" /></span>
        <span>Agent Hub · 管理控制台</span>
      </div>
      <p class="eyebrow mono">ADMIN · 403</p>
      <h1>需要管理员权限</h1>
      <p class="hint">
        当前账号不是管理员，无法打开管理控制台。如需使用用户管理、系统配置与审计功能，请联系管理员开通。
      </p>
      <button type="button" class="btn btn-primary" @click="backToWorkbench">
        <AppIcon name="back" />
        返回工作台
      </button>
    </section>
  </main>
</template>
