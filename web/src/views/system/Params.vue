<template>
  <div class="params-page">
    <PageHeader title="系统参数" subtitle="当前账套的业务参数,所有金额单位为元,税率 0-1 之间" icon="Setting">
      <template #actions>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
      </template>
    </PageHeader>

    <SectionCard title="报销审批阈值" icon="Money">
      <el-form :model="form" label-width="180px" class="param-form">
        <el-form-item label="总经理审批阈值">
          <el-input-number
            v-model="form.gmExpenseThreshold"
            :min="0"
            :max="10000000"
            :step="100"
            :precision="2"
            style="width: 240px"
          />
          <span class="hint">元 · 报销金额 ≥ 此值需总经理审批,低于此值走简化流程(财务直接复核)</span>
        </el-form-item>
        <el-form-item label="默认增值税率">
          <el-input-number
            v-model="form.defaultTaxRate"
            :min="0"
            :max="1"
            :step="0.01"
            :precision="2"
            style="width: 240px"
          />
          <span class="hint">0-1 之间,如 0.13 表示 13%</span>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="saving" @click="save">保存参数</el-button>
          <el-button @click="load">取消</el-button>
        </el-form-item>
      </el-form>
    </SectionCard>

    <SectionCard title="参数说明" icon="InfoFilled">
      <div class="info-block">
        <p>• <b>报销审批阈值</b>:决定走总经理审批的金额门槛。改完后立即对未提交/驳回重提的报销单生效。</p>
        <p>• <b>默认增值税率</b>:发票导入 CSV 时的默认税率,实际录入仍可逐张调整。</p>
        <p>• 参数存于 <code>Tenant.params</code>(JSON 字段),每个账套独立。</p>
        <p>• 涉及财务规则变更前,请确保所有在途单据已完结,避免审批中出现"规则不一致"。</p>
      </div>
    </SectionCard>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh, Money, InfoFilled, Setting } from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import SectionCard from '@/components/SectionCard.vue'
import { getCurrentParams, updateCurrentParams } from '@/api/modules'

const form = reactive({
  gmExpenseThreshold: 5000,
  defaultTaxRate: 0.13,
})
const saving = ref(false)
const original = ref<any>({})

async function load() {
  try {
    const d: any = await getCurrentParams()
    Object.assign(form, d)
    original.value = { ...form }
  } catch {
    /* 拦截器已提示 */
  }
}

async function save() {
  saving.value = true
  try {
    await updateCurrentParams({
      gmExpenseThreshold: Number(form.gmExpenseThreshold),
      defaultTaxRate: Number(form.defaultTaxRate),
    })
    ElMessage.success('参数已保存,新单据立即生效')
  } catch {
    /* 拦截器已提示 */
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.params-page { display: flex; flex-direction: column; gap: 16px; }
.param-form { max-width: 720px; }
.hint { margin-left: 12px; font-size: 12px; color: var(--fm-text-3); }
.info-block { font-size: 13px; line-height: 2; color: var(--fm-text-2); }
.info-block code { background: var(--fm-bg-muted); padding: 1px 6px; border-radius: 4px; font-size: 12px; }
</style>
