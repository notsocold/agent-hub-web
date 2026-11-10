<script setup lang="ts">
import { computed, ref } from 'vue'

import { containsSensitiveKey, redactValue } from '@/utils/redact'

const props = withDefaults(
  defineProps<{
    value: unknown
    /** 默认折叠；为 true 时直接展开。 */
    defaultOpen?: boolean
    maxHeight?: string
  }>(),
  { defaultOpen: true, maxHeight: '320px' },
)

const open = ref(props.defaultOpen)
const revealed = ref(false)
const copied = ref(false)

const hasSensitive = computed(() => containsSensitiveKey(props.value))
const displayValue = computed(() => (revealed.value ? props.value : redactValue(props.value)))
const json = computed(() => {
  try {
    return JSON.stringify(displayValue.value, null, 2)
  } catch {
    return String(displayValue.value)
  }
})

async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(json.value)
    copied.value = true
    window.setTimeout(() => {
      copied.value = false
    }, 1500)
  } catch {
    // 剪贴板不可用时静默失败，用户仍可手动选中。
  }
}
</script>

<template>
  <div class="redacted-json">
    <div class="rj-head">
      <button type="button" class="rj-toggle" :aria-expanded="open" @click="open = !open">
        <svg class="chevron" :class="{ 'is-open': open }" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
        <span>Payload</span>
      </button>
      <span v-if="hasSensitive" class="rj-note">
        {{ revealed ? '已显示原始值' : '敏感字段已遮罩' }}
      </span>
      <div class="rj-actions">
        <button
          v-if="hasSensitive"
          type="button"
          class="rj-btn"
          :aria-pressed="revealed"
          @click="revealed = !revealed"
        >
          {{ revealed ? '遮罩' : '显示原始值' }}
        </button>
        <button type="button" class="rj-btn" @click="copy">{{ copied ? '已复制' : '复制' }}</button>
      </div>
    </div>
    <pre v-if="open" class="rj-body mono" :style="{ maxHeight }">{{ json }}</pre>
  </div>
</template>

<style scoped>
.redacted-json {
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--surface-2);
  overflow: hidden;
}

.rj-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 7px 9px;
}

.rj-toggle {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--ink-2);
  font-size: 11.5px;
  font-weight: 600;
}

.chevron {
  width: 12px;
  height: 12px;
  color: var(--ink-3);
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform 0.15s;
}

.chevron.is-open {
  transform: rotate(180deg);
}

.rj-note {
  color: var(--amber-text);
  font-size: 10.5px;
}

.rj-actions {
  display: flex;
  gap: 5px;
  margin-left: auto;
}

.rj-btn {
  height: 24px;
  padding: 0 8px;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: var(--surface);
  color: var(--ink-2);
  font-size: 10.5px;
}

.rj-btn:hover {
  border-color: var(--ink-3);
  color: var(--ink);
}

.rj-body {
  margin: 0;
  padding: 9px 10px;
  overflow: auto;
  border-top: 1px solid var(--line);
  color: var(--ink-2);
  font-size: 10.5px;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
