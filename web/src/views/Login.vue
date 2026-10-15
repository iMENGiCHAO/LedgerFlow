<template>
  <div class="login-page">
    <!-- 背景动效层 -->
    <div class="bg-aurora">
      <div class="aurora-blob blob-1" />
      <div class="aurora-blob blob-2" />
      <div class="aurora-blob blob-3" />
      <div class="grid-overlay" />
    </div>

    <div class="login-shell">
      <!-- ==================== 左侧品牌区 ==================== -->
      <div class="brand-panel fm-no-print">
        <div class="brand-inner">
          <div class="brand-logo">
            <div class="brand-mark">
              <span>财</span>
            </div>
            <div>
              <div class="brand-name">LedgerFlow</div>
              <div class="brand-tag">SME Finance Suite</div>
            </div>
          </div>

          <h1 class="brand-slogan">
            <span class="line line-1">让每一笔账</span>
            <span class="line line-2">都清晰可信</span>
          </h1>
          <p class="brand-desc">面向中小企业的轻量级财务中台 · 从建账到报表一站式完成 · 实时多账套 · 智能期末结转</p>

          <ul class="feature-list">
            <li class="feature-item">
              <div class="feature-icon"><el-icon :size="20"><Notebook /></el-icon></div>
              <div>
                <div class="feature-title">复式记账 · 自动结转</div>
                <div class="feature-sub">借贷平衡校验,期末损益一键结转</div>
              </div>
            </li>
            <li class="feature-item">
              <div class="feature-icon"><el-icon :size="20"><Coin /></el-icon></div>
              <div>
                <div class="feature-title">往来核销 · 账龄分析</div>
                <div class="feature-sub">应收应付全流程,逾期风险一目了然</div>
              </div>
            </li>
            <li class="feature-item">
              <div class="feature-icon"><el-icon :size="20"><TrendCharts /></el-icon></div>
              <div>
                <div class="feature-title">一键结账 · 报表输出</div>
                <div class="feature-sub">余额表 / 资产负债表 / 利润表随时打印</div>
              </div>
            </li>
          </ul>

          <div class="brand-stats">
            <div class="stat">
              <div class="stat-num">44</div>
              <div class="stat-label">E2E 断言</div>
            </div>
            <div class="stat">
              <div class="stat-num">20+</div>
              <div class="stat-label">业务模块</div>
            </div>
            <div class="stat">
              <div class="stat-num">99.9%</div>
              <div class="stat-label">数据一致</div>
            </div>
          </div>
        </div>
      </div>

      <!-- ==================== 右侧登录区 ==================== -->
      <div class="form-panel">
        <div class="form-box">
          <!-- 移动端顶部品牌 -->
          <div class="mobile-brand">
            <div class="brand-mark mobile-mark"><span>财</span></div>
            <h1 class="mobile-title">智云 · 财务</h1>
            <p class="mobile-sub">LedgerFlow · 中小企业财务管理系统</p>
          </div>

          <div class="form-head">
            <h2 class="form-title">欢迎回来 👋</h2>
            <p class="form-sub">登录到您的工作台,继续处理今天的财务事项</p>
          </div>

          <el-form ref="formRef" :model="form" :rules="rules" size="large" @keyup.enter="doLogin">
            <el-form-item prop="username">
              <el-input v-model="form.username" placeholder="用户名" :prefix-icon="User" autocomplete="username" />
            </el-form-item>
            <el-form-item prop="password">
              <el-input
                v-model="form.password"
                type="password"
                show-password
                placeholder="密码"
                :prefix-icon="Lock"
                autocomplete="current-password"
              />
            </el-form-item>
            <el-button type="primary" class="login-btn" size="large" :loading="loading" @click="doLogin">
              <span v-if="!loading">登 录</span>
              <span v-else>登录中…</span>
              <el-icon v-if="!loading" class="login-btn-arrow"><Right /></el-icon>
            </el-button>
          </el-form>

          <el-divider v-if="DEMO_ENABLED && DEMO_ACCOUNTS.length" class="divider">
            <span class="divider-text">演示账号 · 一键填充({{ DEMO_ACCOUNTS.length }} 个)</span>
          </el-divider>
          <div v-if="DEMO_ENABLED && DEMO_ACCOUNTS.length" class="demo-chips">
            <button
              v-for="acc in DEMO_ACCOUNTS"
              :key="acc.username"
              type="button"
              class="demo-chip"
              :class="`chip-${acc.tone}`"
              :title="acc.hint"
              @click="fill(acc)"
            >
              <span class="chip-role">{{ acc.label }}</span>
              <span class="chip-user">{{ acc.username }}</span>
            </button>
          </div>
          <p class="demo-hint">鼠标悬停可看权限范围;每行展示 3 个,窄屏 2 个自适应</p>

          <p class="form-foot">登录即表示同意<a href="javascript:">服务协议</a>与<a href="javascript:">隐私政策</a></p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, FormInstance, FormRules } from 'element-plus'
import { User, Lock, Notebook, Coin, TrendCharts, Right } from '@element-plus/icons-vue'
import { login } from '@/api/modules'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
import { DEMO_ACCOUNTS, DEMO_ENABLED } from '@/config/demo'

const formRef = ref<FormInstance>()
const loading = ref(false)
const form = reactive({ username: '', password: '' })
const rules: FormRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

function fill(acc: { username: string; password: string }) {
  form.username = acc.username
  form.password = acc.password
}

async function doLogin() {
  await formRef.value?.validate().catch(() => Promise.reject())
  loading.value = true
  try {
    const res: any = await login({ username: form.username.trim(), password: form.password })
    if (!res?.accessToken) {
      ElMessage.error('登录响应异常')
      return
    }
    if (!res.currentTenantId && res.tenants?.length) {
      res.currentTenantId = res.tenants[0].id
    }
    auth.setAuth(res)
    ElMessage.success(`欢迎回来,${res.user?.realName || form.username}`)
    const redirect = (route.query.redirect as string) || '/'
    router.push(redirect)
  } catch {
    /* 拦截器已提示 */
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  position: relative;
  overflow: hidden;
  background: var(--fm-bg-page);
}

/* ==================== 背景动效 ==================== */
.bg-aurora {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
}
.aurora-blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(120px);
  opacity: 0.55;
  animation: blobFloat 18s ease-in-out infinite;
}
.blob-1 {
  width: 540px; height: 540px;
  background: radial-gradient(circle, #6366f1, transparent 70%);
  top: -180px; left: -120px;
  animation-delay: 0s;
}
.blob-2 {
  width: 480px; height: 480px;
  background: radial-gradient(circle, #8b5cf6, transparent 70%);
  bottom: -160px; right: -100px;
  animation-delay: -6s;
}
.blob-3 {
  width: 360px; height: 360px;
  background: radial-gradient(circle, #3b82f6, transparent 70%);
  top: 40%; right: 30%;
  animation-delay: -12s;
  opacity: 0.3;
}
@keyframes blobFloat {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33%      { transform: translate(40px, -30px) scale(1.08); }
  66%      { transform: translate(-30px, 40px) scale(0.95); }
}
html.dark .aurora-blob { opacity: 0.45; }

.grid-overlay {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(99,102,241,0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(99,102,241,0.04) 1px, transparent 1px);
  background-size: 32px 32px;
  mask-image: radial-gradient(ellipse at center, black 30%, transparent 80%);
}
html.dark .grid-overlay {
  background-image:
    linear-gradient(rgba(148,163,184,0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(148,163,184,0.04) 1px, transparent 1px);
}

.login-shell {
  position: relative;
  z-index: 1;
  display: flex;
  width: 100%;
  min-height: 100vh;
}

/* ==================== 品牌区(深色玻璃感) ==================== */
.brand-panel {
  flex: 1 1 48%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  position: relative;
}
.brand-inner {
  max-width: 480px;
  width: 100%;
  color: var(--fm-text-1);
}

.brand-logo {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 64px;
}
.brand-mark {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  background: var(--fm-gradient-hero);
  color: #fff;
  font-size: 22px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 12px 32px -8px rgba(79,70,229,0.6);
  position: relative;
  overflow: hidden;
}
.brand-mark::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 30% 30%, rgba(255,255,255,0.3), transparent 50%);
}
.brand-name {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.5px;
  background: linear-gradient(135deg, var(--fm-text-1) 0%, var(--fm-brand-600) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
.brand-tag {
  margin-top: 2px;
  font-size: 11px;
  letter-spacing: 0.18em;
  color: var(--fm-text-3);
  text-transform: uppercase;
}

.brand-slogan {
  margin: 0;
  font-size: 44px;
  line-height: 1.15;
  font-weight: 800;
  letter-spacing: -0.025em;
}
.brand-slogan .line {
  display: block;
  background: linear-gradient(135deg, var(--fm-text-1) 0%, var(--fm-brand-600) 50%, var(--fm-violet-500) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
.brand-slogan .line-2 { padding-left: 0.5em; }
.brand-desc {
  margin-top: 18px;
  font-size: 15px;
  color: var(--fm-text-2);
  line-height: 1.7;
  max-width: 420px;
}

.feature-list {
  list-style: none;
  margin: 40px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.feature-item {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  padding: 16px;
  background: var(--fm-bg-elevated);
  border: 1px solid var(--fm-border-soft);
  border-radius: var(--fm-radius-md);
  transition: all var(--fm-dur-base) var(--fm-ease);
  box-shadow: var(--fm-shadow-xs);
}
.feature-item:hover {
  transform: translateX(4px);
  border-color: rgba(99,102,241,0.3);
  box-shadow: var(--fm-shadow-sm);
}
.feature-icon {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: var(--fm-gradient-brand-soft);
  color: var(--fm-brand-600);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 4px 10px -2px rgba(99,102,241,0.3);
}
html.dark .feature-icon { color: var(--fm-brand-300); }
.feature-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--fm-text-1);
}
.feature-sub {
  margin-top: 3px;
  font-size: 12px;
  color: var(--fm-text-3);
}

.brand-stats {
  display: flex;
  gap: 32px;
  margin-top: 48px;
  padding-top: 24px;
  border-top: 1px solid var(--fm-border-soft);
}
.brand-stats .stat {
  display: flex;
  flex-direction: column;
}
.brand-stats .stat-num {
  font-size: 24px;
  font-weight: 700;
  font-family: var(--fm-font-num);
  color: var(--fm-text-1);
  background: linear-gradient(135deg, var(--fm-text-1) 0%, var(--fm-brand-600) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
.brand-stats .stat-label {
  margin-top: 2px;
  font-size: 11px;
  color: var(--fm-text-3);
  letter-spacing: 0.04em;
}

/* ==================== 表单区 ==================== */
.form-panel {
  flex: 1 1 52%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
}
.form-box {
  width: min(100%, 420px);
  position: relative;
}

.mobile-brand {
  display: none;
}
.brand-mark.mobile-mark { width: 56px; height: 56px; font-size: 26px; border-radius: 16px; margin: 0 auto 16px; }

.form-head { margin-bottom: 28px; }
.form-title {
  margin: 0;
  font-size: 30px;
  font-weight: 800;
  color: var(--fm-text-1);
  letter-spacing: -0.025em;
  line-height: 1.2;
}
.form-sub {
  margin: 8px 0 0;
  font-size: 14px;
  color: var(--fm-text-2);
  line-height: 1.6;
}

.login-btn {
  width: 100%;
  margin-top: 8px;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 4px;
  position: relative;
  background: var(--fm-gradient-hero) !important;
  border: none !important;
  box-shadow: 0 8px 24px -8px rgba(79,70,229,0.55) !important;
}
.login-btn:hover { transform: translateY(-1px); }
.login-btn-arrow { margin-left: 4px; vertical-align: -1px; }

.divider {
  margin: 28px 0 16px;
}
.divider :deep(.el-divider__text) {
  background: transparent;
  padding: 0 12px;
}
.divider-text {
  font-size: 11px;
  color: var(--fm-text-3);
  letter-spacing: 0.08em;
  font-weight: 500;
}

.demo-chips {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.demo-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid var(--fm-border-soft);
  background: var(--fm-bg-elevated);
  border-radius: var(--fm-radius-md);
  padding: 8px 10px;
  cursor: pointer;
  transition: all var(--fm-dur-base) var(--fm-ease);
  font-family: inherit;
  box-shadow: var(--fm-shadow-xs);
  min-width: 0;
}
.demo-chip:hover {
  transform: translateY(-1px);
  box-shadow: var(--fm-shadow-sm);
}
.chip-role {
  border-radius: var(--fm-radius-pill);
  font-size: 11px;
  padding: 3px 9px;
  font-weight: 600;
  letter-spacing: 0.02em;
  flex-shrink: 0;
}
.chip-user {
  font-size: 11px;
  color: var(--fm-text-1);
  font-family: 'SF Mono', Menlo, monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.chip-brand   .chip-role { background: rgba(99,102,241,0.10);  color: var(--fm-brand-600); }
.chip-violet  .chip-role { background: rgba(139,92,246,0.10); color: var(--fm-violet-600); }
.chip-blue    .chip-role { background: rgba(59,130,246,0.10);  color: var(--fm-blue-500); }
.chip-success .chip-role { background: var(--fm-success-soft);  color: var(--fm-success-ink); }
.chip-warning .chip-role { background: var(--fm-warning-soft);  color: var(--fm-warning-ink); }
.chip-danger  .chip-role { background: var(--fm-danger-soft);   color: var(--fm-danger-ink); }

.demo-hint {
  margin: 10px 0 0;
  font-size: 11px;
  color: var(--fm-text-3);
  text-align: center;
}
.form-foot {
  margin-top: 28px;
  font-size: 12px;
  color: var(--fm-text-3);
  text-align: center;
}
.form-foot a { color: var(--fm-brand-600); font-weight: 500; }

/* ==================== 响应式 ==================== */
@media (max-width: 1023px) {
  .brand-panel { display: none; }
  .form-panel {
    align-items: center;
    padding: 24px;
  }
  .form-title { font-size: 24px; }
  .mobile-brand { display: flex; flex-direction: column; align-items: center; margin-bottom: 24px; }
  .mobile-title { margin: 0; font-size: 20px; font-weight: 700; color: var(--fm-text-1); }
  .mobile-sub { margin: 4px 0 0; font-size: 12px; color: var(--fm-text-3); }
}
@media (max-width: 480px) {
  .form-panel { padding: 20px; }
  .form-title { font-size: 22px; }
  .demo-chips { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
  .demo-chip { padding: 7px 8px; }
}
</style>
