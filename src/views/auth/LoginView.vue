<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'

import { ApiRequestError } from '@/api/client'
import AuthLayout from '@/layouts/AuthLayout.vue'
import { useAuthStore } from '@/stores/auth'

/** 后端未返回 retry_after_seconds 时的兜底等待秒数。 */
const RATE_LIMIT_FALLBACK_SECONDS = 60

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const formRef = ref<FormInstance>()
const loading = ref(false)
const errorText = ref('')
const countdown = ref(0)
let countdownTimer: number | null = null
const isMock = import.meta.env.VITE_USE_MOCK === 'true'

const rateLimitText = computed(() =>
  countdown.value > 0 ? `尝试过于频繁，请 ${countdown.value} 秒后重试` : '',
)
const alertText = computed(() => rateLimitText.value || errorText.value)

function clearCountdown(): void {
  if (countdownTimer !== null) {
    window.clearInterval(countdownTimer)
    countdownTimer = null
  }
}

function startCountdown(seconds: number): void {
  clearCountdown()
  countdown.value = seconds
  countdownTimer = window.setInterval(() => {
    countdown.value = Math.max(0, countdown.value - 1)
    if (countdown.value === 0) clearCountdown()
  }, 1000)
}

/** 仅识别 429 限流；其余错误继续走原有提示。 */
function rateLimitSeconds(error: unknown): number | null {
  if (!(error instanceof ApiRequestError) || error.code !== 'rate_limited') return null
  const raw = error.details.retry_after_seconds
  const parsed = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : Number.NaN
  if (!Number.isFinite(parsed) || parsed < 1) return RATE_LIMIT_FALLBACK_SECONDS
  return Math.ceil(parsed)
}

onMounted(() => {
  if (route.query.expired !== '1') return
  ElMessage.warning('登录已过期，请重新登录')
  const query = { ...route.query }
  delete query.expired
  // 去掉 expired 避免刷新后重复提示，同时保留 redirect。
  void router.replace({ name: 'login', query })
})

onUnmounted(clearCountdown)

const form = reactive({
  email: isMock ? 'you@example.com' : '',
  password: isMock ? 'password123' : '',
})

const rules: FormRules = {
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '邮箱格式不正确', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 8, message: '密码至少 8 位', trigger: 'blur' },
  ],
}

async function submit(): Promise<void> {
  if (!formRef.value || countdown.value > 0) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  loading.value = true
  errorText.value = ''
  try {
    await auth.login(form.email.trim(), form.password)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/chat'
    await router.replace(redirect)
  } catch (error) {
    const seconds = rateLimitSeconds(error)
    if (seconds !== null) {
      startCountdown(seconds)
      return
    }
    errorText.value = error instanceof Error ? error.message : '登录失败，请稍后重试'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <AuthLayout>
    <header class="form-head">
      <p class="eyebrow mono">SIGN IN</p>
      <h2>登录 Agent Hub</h2>
      <p class="sub">使用工作邮箱继续你的对话与任务。</p>
    </header>

    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-position="top"
      size="large"
      @submit.prevent="submit"
    >
      <el-form-item label="邮箱" prop="email">
        <el-input
          v-model="form.email"
          placeholder="you@example.com"
          autocomplete="username"
          name="email"
        />
      </el-form-item>

      <el-form-item label="密码" prop="password">
        <el-input
          v-model="form.password"
          type="password"
          placeholder="至少 8 位"
          autocomplete="current-password"
          name="password"
          show-password
        />
      </el-form-item>

      <p v-if="alertText" class="error" role="alert">{{ alertText }}</p>

      <el-button
        type="primary"
        native-type="submit"
        :loading="loading"
        :disabled="countdown > 0"
        class="submit"
      >
        登录
      </el-button>
    </el-form>

    <p v-if="isMock" class="mock-hint">当前为本地 mock：任意邮箱 + 8 位以上密码即可登录。</p>

    <p class="switch">
      还没有账号？
      <RouterLink :to="{ name: 'register', query: route.query }">创建账号</RouterLink>
    </p>
  </AuthLayout>
</template>

<style scoped>
.form-head {
  margin-bottom: 26px;
}

.eyebrow {
  margin-bottom: 10px;
  color: var(--amber-text);
  font-size: 10.5px;
  letter-spacing: 0.14em;
}

h2 {
  font-size: 24px;
  font-weight: 650;
  letter-spacing: -0.02em;
}

.sub {
  margin-top: 8px;
  color: var(--ink-3);
  font-size: 13px;
}

.submit {
  width: 100%;
  margin-top: 4px;
}

.error {
  margin: 2px 0 12px;
  color: var(--red);
  font-size: 12px;
}

.mock-hint {
  margin-top: 16px;
  padding: 9px 11px;
  border: 1px dashed var(--line);
  border-radius: 6px;
  color: var(--ink-3);
  font-size: 11.5px;
  line-height: 1.6;
  background: var(--surface-2);
}

.switch {
  margin-top: 20px;
  color: var(--ink-3);
  font-size: 12.5px;
  text-align: center;
}

.switch a {
  color: var(--prussian);
  font-weight: 600;
}

.switch a:hover {
  text-decoration: underline;
}

:deep(.el-form-item__label) {
  padding-bottom: 4px;
  color: var(--ink-2);
  font-size: 12px;
  font-weight: 550;
}
</style>
