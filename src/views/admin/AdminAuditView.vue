<script setup lang="ts">
import AuditPanel from '@/components/settings/AuditPanel.vue'
import PageHeader from '@/components/common/PageHeader.vue'
</script>

<template>
  <div class="admin-page">
    <PageHeader
      eyebrow="ADMIN · AUDIT"
      title="审计日志"
      description="管理端全局审计（GET /admin/audit-logs）：可查看所有用户的操作、RBAC 拒绝与系统项变更。"
    />
    <AuditPanel :can-view-all="true" />
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
