<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'

import AppIcon from '@/components/common/AppIcon.vue'
import AdminAgentCard from '@/components/admin/AdminAgentCard.vue'
import AdminCapabilitiesPanel from '@/components/admin/AdminCapabilitiesPanel.vue'
import AdminInstructionCard from '@/components/admin/AdminInstructionCard.vue'
import AdminMcpCard from '@/components/admin/AdminMcpCard.vue'
import AdminPlatformInfoPanel from '@/components/admin/AdminPlatformInfoPanel.vue'
import AdminSkillCard from '@/components/admin/AdminSkillCard.vue'
import SecretPanel from '@/components/settings/SecretPanel.vue'
import { useAuthStore } from '@/stores/auth'

/**
 * M8-F8 系统设置：平台级配置统一放管理台（不混入个人设置页）。
 *
 * 七个分区：平台指令 / 系统技能 / 系统 MCP / 全局 Agent / 平台密钥 /
 * 平台信息（只读）/ 能力开关（只读）。
 * 写操作均有二次确认并写审计（后端）；配置面接口在能力总开关关闭时
 * 仍可读写（R1），页面不按 /system/info 的能力开关隐藏入口。
 * 平台运维类配置（认证策略/配额/数据保留/功能开关/危险操作）为目标形态，未排期。
 */

const auth = useAuthStore()

// 管理台由路由守卫保证管理员进入；SecretPanel 仍按真实角色渲染，兜底降级场景。
const isAdmin = computed(() => auth.isAdmin)

interface SettingsSection {
  id: string
  label: string
}

const sections: SettingsSection[] = [
  { id: 'admin-settings-instruction', label: '平台指令' },
  { id: 'admin-settings-skills', label: '系统技能' },
  { id: 'admin-settings-mcp', label: '系统 MCP' },
  { id: 'admin-settings-agents', label: '全局 Agent' },
  { id: 'admin-settings-secrets', label: '平台密钥' },
  { id: 'admin-settings-platform', label: '平台信息' },
  { id: 'admin-settings-capabilities', label: '能力开关' },
]

const activeSection = ref(sections[0]!.id)

function scrollToSection(id: string): void {
  activeSection.value = id
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
</script>

<template>
  <div class="admin-page">
    <header class="admin-page-head">
      <div>
        <h1 class="page-title">系统设置</h1>
        <p class="page-sub">
          平台默认指令、系统技能、系统 MCP、全局 Agent 与平台密钥；平台信息与能力开关为只读。
          写操作均需确认并写入审计日志。平台运维类配置（认证策略/配额/数据保留/功能开关/危险操作）为目标形态，未排期。
        </p>
      </div>
      <div class="head-actions">
        <RouterLink class="btn btn-outline" :to="{ name: 'admin-audit' }">
          <AppIcon name="audit" />
          查看审计
        </RouterLink>
      </div>
    </header>

    <div class="settings-layout">
      <nav class="settings-nav" aria-label="设置分区">
        <button
          v-for="section in sections"
          :key="section.id"
          type="button"
          :class="{ 'is-active': activeSection === section.id }"
          :aria-current="activeSection === section.id ? 'true' : undefined"
          @click="scrollToSection(section.id)"
        >
          {{ section.label }}
        </button>
      </nav>

      <div class="settings-form">
        <section :id="sections[0]!.id" class="settings-section">
          <AdminInstructionCard />
        </section>
        <section :id="sections[1]!.id" class="settings-section">
          <AdminSkillCard />
        </section>
        <section :id="sections[2]!.id" class="settings-section">
          <AdminMcpCard />
        </section>
        <section :id="sections[3]!.id" class="settings-section">
          <AdminAgentCard />
        </section>
        <section :id="sections[4]!.id" class="settings-section">
          <SecretPanel :is-admin="isAdmin" />
        </section>
        <section :id="sections[5]!.id" class="settings-section">
          <AdminPlatformInfoPanel />
        </section>
        <section :id="sections[6]!.id" class="settings-section">
          <AdminCapabilitiesPanel />
        </section>
      </div>
    </div>
  </div>
</template>
