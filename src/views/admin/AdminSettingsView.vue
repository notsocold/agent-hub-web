<script setup lang="ts">
import { computed } from 'vue'

import PageHeader from '@/components/common/PageHeader.vue'
import AdminAgentCard from '@/components/admin/AdminAgentCard.vue'
import AdminInstructionCard from '@/components/admin/AdminInstructionCard.vue'
import AdminMcpCard from '@/components/admin/AdminMcpCard.vue'
import AdminSkillCard from '@/components/admin/AdminSkillCard.vue'
import SecretPanel from '@/components/settings/SecretPanel.vue'
import { useAuthStore } from '@/stores/auth'

/**
 * M8-F8 系统设置：平台级配置统一放管理台（不混入个人设置页）。
 *
 * 五个分区：平台指令 / 系统技能 / 系统 MCP / 全局 Agent / 平台密钥。
 * 写操作均有二次确认并写审计（后端）；配置面接口在能力总开关关闭时
 * 仍可读写（R1），页面不按 /system/info 的能力开关隐藏入口。
 */

const auth = useAuthStore()

// 管理台由路由守卫保证管理员进入；SecretPanel 仍按真实角色渲染，兜底降级场景。
const isAdmin = computed(() => auth.isAdmin)
</script>

<template>
  <div class="admin-page">
    <PageHeader
      eyebrow="ADMIN · SETTINGS"
      title="系统设置"
      description="平台默认指令、系统技能、系统 MCP、全局 Agent 与平台密钥。写操作均需确认并写入审计日志。"
    />

    <AdminInstructionCard />
    <AdminSkillCard />
    <AdminMcpCard />
    <AdminAgentCard />
    <SecretPanel :is-admin="isAdmin" />
  </div>
</template>

<style scoped>
.admin-page {
  display: flex;
  flex-direction: column;
  gap: 18px;
  max-width: 1120px;
}
</style>
