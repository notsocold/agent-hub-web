<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

import { authApi } from '@/api/auth'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

interface FieldErrors {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

const submitting = ref(false)
const errorText = ref('')
const errors = reactive<FieldErrors>({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
})

const form = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
})

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    errorText.value = ''
    clearErrors()
  },
)

function clearErrors(): void {
  errors.currentPassword = ''
  errors.newPassword = ''
  errors.confirmPassword = ''
}

function clearFieldError(field: keyof FieldErrors): void {
  errors[field] = ''
  errorText.value = ''
}

/** 手动校验便于行内即时提示；规则与真实后端一致。 */
function validate(): boolean {
  clearErrors()
  let valid = true

  if (!form.currentPassword) {
    errors.currentPassword = '请输入旧密码'
    valid = false
  }

  if (!form.newPassword) {
    errors.newPassword = '请输入新密码'
    valid = false
  } else if (form.newPassword.length < 8) {
    errors.newPassword = '新密码至少 8 位'
    valid = false
  } else if (form.newPassword === form.currentPassword) {
    errors.newPassword = '新密码不能与旧密码相同'
    valid = false
  }

  if (!form.confirmPassword) {
    errors.confirmPassword = '请再次输入新密码'
    valid = false
  } else if (form.confirmPassword !== form.newPassword) {
    errors.confirmPassword = '两次输入的新密码不一致'
    valid = false
  }

  return valid
}

function resetForm(): void {
  form.currentPassword = ''
  form.newPassword = ''
  form.confirmPassword = ''
  errorText.value = ''
  clearErrors()
}

function close(): void {
  if (submitting.value) return
  visible.value = false
}

async function submit(): Promise<void> {
  if (submitting.value || !validate()) return

  submitting.value = true
  errorText.value = ''
  try {
    await authApi.changePassword({
      current_password: form.currentPassword,
      new_password: form.newPassword,
    })
    ElMessage.success('密码已修改')
    visible.value = false
  } catch (cause) {
    errorText.value = cause instanceof Error ? cause.message : '修改密码失败，请稍后重试'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <el-dialog
    v-model="visible"
    title="修改密码"
    width="min(440px, 92vw)"
    :close-on-click-modal="false"
    :close-on-press-escape="!submitting"
    :show-close="!submitting"
    @closed="resetForm"
  >
    <el-form :model="form" label-position="top" @submit.prevent="submit">
      <el-form-item
        label="旧密码"
        prop="currentPassword"
        :validate-status="errors.currentPassword ? 'error' : undefined"
        :show-message="false"
      >
        <el-input
          v-model="form.currentPassword"
          type="password"
          name="current_password"
          autocomplete="current-password"
          placeholder="输入当前使用的密码"
          show-password
          @input="clearFieldError('currentPassword')"
        />
        <p v-if="errors.currentPassword" class="field-error" role="alert">
          {{ errors.currentPassword }}
        </p>
      </el-form-item>

      <el-form-item
        label="新密码"
        prop="newPassword"
        :validate-status="errors.newPassword ? 'error' : undefined"
        :show-message="false"
      >
        <el-input
          v-model="form.newPassword"
          type="password"
          name="new_password"
          autocomplete="new-password"
          placeholder="至少 8 位，且不能与旧密码相同"
          show-password
          @input="clearFieldError('newPassword')"
        />
        <p v-if="errors.newPassword" class="field-error" role="alert">
          {{ errors.newPassword }}
        </p>
      </el-form-item>

      <el-form-item
        label="确认新密码"
        prop="confirmPassword"
        :validate-status="errors.confirmPassword ? 'error' : undefined"
        :show-message="false"
      >
        <el-input
          v-model="form.confirmPassword"
          type="password"
          name="confirm_password"
          autocomplete="new-password"
          placeholder="再次输入新密码"
          show-password
          @input="clearFieldError('confirmPassword')"
        />
        <p v-if="errors.confirmPassword" class="field-error" role="alert">
          {{ errors.confirmPassword }}
        </p>
      </el-form-item>

      <p v-if="errorText" class="form-error" role="alert">{{ errorText }}</p>

      <div class="dialog-actions">
        <button type="button" class="btn btn-outline" :disabled="submitting" @click="close">
          取消
        </button>
        <button
          type="button"
          class="btn btn-primary"
          data-testid="submit-password"
          :disabled="submitting"
          @click="submit"
        >
          {{ submitting ? '提交中…' : '确认修改' }}
        </button>
      </div>
    </el-form>
  </el-dialog>
</template>

<style scoped>
.form-error {
  margin-bottom: 12px;
  padding: 8px 10px;
  border: 1px solid var(--red-soft, #f3c9c4);
  border-radius: 6px;
  background: var(--red-bg, #fdf1ef);
  color: var(--red, #b3261e);
  font-size: 11.5px;
  line-height: 1.6;
}

.field-error {
  margin-top: 4px;
  color: var(--red);
  font-size: 10.5px;
  line-height: 1.5;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}
</style>
