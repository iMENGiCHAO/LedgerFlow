<template>
  <div class="payroll-page">
    <PageHeader :icon="Coin" icon-tone="brand" title="工资核算" sub="月度工资批次 · 计提/发放自动生成凭证 · 与凭证引擎同源校验">
      <template #actions>
        <el-select v-model="year" style="width:100px" @change="load">
          <el-option v-for="y in [2024, 2025, 2026, 2027]" :key="y" :value="y" :label="`${y} 年`" />
        </el-select>
        <el-select v-model="month" style="width:90px" @change="load">
          <el-option v-for="m in 12" :key="m" :value="m" :label="`${m} 月`" />
        </el-select>
        <el-button :icon="Refresh" @click="load" :loading="loading">加载/初始化</el-button>
        <el-button v-if="batch && batch.status === 1" type="primary" :icon="Check" :loading="saving" @click="onSave">保存工资单</el-button>
        <el-button v-if="batch && batch.status === 1" type="warning" :icon="Plus" :disabled="!saved" @click="onAccrue">计提工资</el-button>
        <el-button v-if="batch && batch.status === 2" type="success" :icon="Wallet" @click="onPay">发放工资</el-button>
      </template>
    </PageHeader>

    <SectionCard :padless="true">
      <template #title>
        <span>{{ year }} 年 {{ month }} 月工资单</span>
        <el-tag v-if="batch" :type="batch.status === 1 ? 'info' : batch.status === 2 ? 'warning' : 'success'" effect="plain" style="margin-left:12px">
          {{ batch.status === 1 ? '编辑中' : batch.status === 2 ? '已计提' : '已发放' }}
        </el-tag>
      </template>
      <template #actions>
        <span v-if="batch?.accrueVoucherId" class="v-link" @click="gotoVoucher(batch.accrueVoucherId)">计提凭证 #{{ batch.accrueVoucherId }}</span>
        <span v-if="batch?.payVoucherId" class="v-link" style="margin-left:14px" @click="gotoVoucher(batch.payVoucherId)">发放凭证 #{{ batch.payVoucherId }}</span>
      </template>

      <el-alert
        v-if="batch && batch.status === 1 && !saved"
        class="payroll-tip"
        type="info"
        :closable="false"
        show-icon
        title="计提分录:借 管理费用-工资(560204) / 贷 应付职工薪酬(2211);发放分录:借 2211 / 贷 银行存款 实发 + 其他应付款 代扣(未缴暂挂)"
      />

      <el-table v-loading="loading" :data="rows" class="payroll-table" show-summary :summary-method="sumRow">
        <el-table-column label="员工" min-width="140">
          <template #default="{ row }">{{ row.employee?.name }} <span class="emp-code">{{ row.employee?.code }}</span></template>
        </el-table-column>
        <el-table-column label="应发合计" min-width="130">
          <template #default="{ row }">
            <el-input-number v-if="editable" v-model="row.gross" :min="0" :precision="2" :controls="false" size="small" class="num" @change="calcNet(row)" />
            <span v-else class="num-cell">{{ fmtMoney(row.gross) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="代扣社保" min-width="120">
          <template #default="{ row }">
            <el-input-number v-if="editable" v-model="row.socialIns" :min="0" :precision="2" :controls="false" size="small" class="num" @change="calcNet(row)" />
            <span v-else class="num-cell">{{ fmtMoney(row.socialIns) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="代扣个税" min-width="120">
          <template #default="{ row }">
            <el-input-number v-if="editable" v-model="row.tax" :min="0" :precision="2" :controls="false" size="small" class="num" @change="calcNet(row)" />
            <span v-else class="num-cell">{{ fmtMoney(row.tax) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="其他扣款" min-width="120">
          <template #default="{ row }">
            <el-input-number v-if="editable" v-model="row.otherDed" :min="0" :precision="2" :controls="false" size="small" class="num" @change="calcNet(row)" />
            <span v-else class="num-cell">{{ fmtMoney(row.otherDed) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="实发" min-width="120" align="right">
          <template #default="{ row }">
            <span class="num-cell net">{{ fmtMoney(row.net) }}</span>
          </template>
        </el-table-column>
      </el-table>
      <template #empty>
        <EmptyState title="暂无工资批次" description="选择年月后点击「加载/初始化」按在册员工生成工资单" />
      </template>
    </SectionCard>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Coin, Refresh, Check, Plus, Wallet } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import { payrollBatch, payrollSaveItems, payrollAccrue, payrollPay } from '@/api/modules'
import { fmtMoney } from '@/utils/format'
import PageHeader from '@/components/PageHeader.vue'
import SectionCard from '@/components/SectionCard.vue'
import EmptyState from '@/components/EmptyState.vue'

const router = useRouter()
const now = new Date()
const year = ref(2026)
const month = ref(1)
const loading = ref(false)
const saving = ref(false)
const batch = ref<any>(null)
const rows = ref<any[]>([])
/** 页面从未保存过(刚初始化 0 值)时禁用计提 */
const saved = ref(false)

const editable = computed(() => batch.value?.status === 1)

function calcNet(row: any) {
  row.net = Math.round(((row.gross || 0) - (row.socialIns || 0) - (row.tax || 0) - (row.otherDed || 0)) * 100) / 100
}

function sumRow({ columns, data }: any) {
  return columns.map((col: any, i: number) => {
    if (i === 0) return '合计'
    const key = ['employee', 'gross', 'socialIns', 'tax', 'otherDed', 'net'][i]
    if (key === 'employee') return ''
    const total = (data as any[]).reduce((s, r) => s + Number(r[key] || 0), 0)
    return fmtMoney(total)
  })
}

async function load() {
  loading.value = true
  try {
    const res: any = await payrollBatch(year.value, month.value)
    batch.value = res
    rows.value = (res?.items || []).map((it: any) => ({
      employeeId: it.employeeId,
      employee: it.employee,
      gross: Number(it.gross),
      socialIns: Number(it.socialIns),
      tax: Number(it.tax),
      otherDed: Number(it.otherDed),
      net: Number(it.net),
    }))
    saved.value = rows.value.some((r) => r.gross > 0)
  } catch {
    /* 拦截器已提示 */
  } finally {
    loading.value = false
  }
}

async function onSave() {
  saving.value = true
  try {
    await payrollSaveItems(batch.value.id, rows.value.map((r) => ({
      employeeId: r.employeeId,
      gross: r.gross || 0,
      socialIns: r.socialIns || 0,
      tax: r.tax || 0,
      otherDed: r.otherDed || 0,
    })))
    ElMessage.success('工资单已保存')
    saved.value = true
    await load()
  } catch {
    /* 拦截器已提示 */
  } finally {
    saving.value = false
  }
}

async function onAccrue() {
  try {
    await ElMessageBox.confirm('将生成计提凭证(借 管理费用-工资 / 贷 应付职工薪酬)并提交审核,确认计提?', '工资计提', { type: 'warning' })
  } catch { return }
  try {
    const res: any = await payrollAccrue(batch.value.id)
    ElMessage.success(`计提完成,凭证已提交审核(单号 ${res?.voucher?.no ?? ''})`)
    await load()
  } catch { /* 拦截器已提示 */ }
}

async function onPay() {
  try {
    await ElMessageBox.confirm('将生成发放凭证(借 应付职工薪酬 / 贷 银行存款+其他应付款)并提交审核,确认发放?', '工资发放', { type: 'warning' })
  } catch { return }
  try {
    const res: any = await payrollPay(batch.value.id)
    ElMessage.success(`发放完成,凭证已提交审核(单号 ${res?.voucher?.no ?? ''})`)
    await load()
  } catch { /* 拦截器已提示 */ }
}

function gotoVoucher(id: number) {
  router.push(`/vouchers/${id}/edit`)
}

onMounted(load)
</script>

<style scoped>
.payroll-tip { margin: 0 24px 12px; }
.emp-code { color: var(--fm-text-3); font-size: 12px; margin-left: 6px; }
.num { width: 100%; }
.num-cell { font-variant-numeric: tabular-nums; }
.num-cell.net { font-weight: 700; color: var(--fm-text-1); }
.v-link { color: var(--el-color-primary); cursor: pointer; font-size: 12px; }
.v-link:hover { text-decoration: underline; }
</style>
