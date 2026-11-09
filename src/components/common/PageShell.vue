<template>
  <div class="page-shell">
    <slot />
  </div>
</template>

<style scoped>
.page-shell {
  display: flex;
  flex-direction: column;
  gap: 18px;
  height: 100%;
  min-height: 0;
  padding: 26px 32px 32px;
  overflow-y: auto;
  background: var(--paper);
}

@media (max-width: 900px) {
  .page-shell {
    padding: 18px 16px 24px;
  }
}
</style>
