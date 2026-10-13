<template>
  <div class="logs-page">
    <PageHeader
      :icon="Document"
      icon-tone="info"
      title="操作日志"
      sub="全量变更审计记录 · before/after 留痕 · 责任追溯"
    />

    <SectionCard padless>
      <FilterBar>
        <el-input
          v-model="query.username"
          placeholder="操作人用户名"
          clearable
          :prefix-icon="User"
          style="width: 200px"
          @keyup.enter="search"
        />
        <el-input
          v-model="query.keyword"
          placeholder="操作 / 路径 / 详情"
          clearable
          :prefix-icon="Search"
          style="width: 260px"
          @keyup.enter="search"
        />
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          value-format="YYYY-MM-DD"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          style="width: 320px"
        />
        <el-button type="primary" :icon="Search" @click="search">查询</el-button>
        <el-button :icon="RefreshLeft" @click="reset">重置</el-button>
        <template #extra>
          <span class="filter-meta">
            <el-icon :size="13"><InfoFilled /></el-icon>
            共 {{ total }} 条记录
          </span>
        </template>
      </FilterBar>

      <el-table v-loading="loading" :data="list" class="log-table">
        <el-table-column label="时间" width="180">
          <template #default="{ row }">
            <span class="num-mono">{{ fmtDateTime(row.createdAt) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="username" label="用户" width="140">
          <template #default="{ row }">
            <div class="user-cell">
              <div class="user-avatar">{{ (row.username || '?').slice(0, 1).toUpperCase() }}</div>
              <span class="user-name">{{ row.username || '-' }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="action" label="操作" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="action-pill">{{ row.action }}</span>
          </template>
        </el-table-column>
        <el-table-column label="方法" width="100">
          <template #default="{ row }">
            <span v-if="row.method" class="method-pill" :class="`method-${row.method.toLowerCase()}`">{{ row.method }}</span>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="path" label="路径" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="path-cell">{{ row.path || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="目标 ID" width="110" align="right">
          <template #default="{ row }">
            <span :class="row.targetId ? 'num-mono' : 'muted'">{{ row.targetId ?? '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="IP" width="140">
          <template #default="{ row }">
            <span :class="row.ip ? 'num-mono' : 'muted'">{{ row.ip || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="详情" min-width="280">
          <template #default="{ row }">
            <el-tooltip v-if="row.detail" placement="top" effect="dark" :show-after="150" popper-class="log-detail-popper">
              <template #content>
                <div style="max-width: 440px; line-height: 1.7; word-break: break-all">{{ row.detail }}</div>
              </template>
              <span class="detail-cell">{{ trunc(row.detail) }}</span>
            </el-tooltip>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState title="暂无日志记录" description="调整筛选条件后再试" />
        </template>
      </el-table>

      <div class="pager">
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.pageSize"
          :total="total"
          :page-sizes="[20, 50, 100, 200]"
          layout="total, sizes, prev, pager, next, jumper"
          background
          @current-change="load"
          @size-change="onSizeChange"
        />
      </div>
    </SectionCard>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { Refresh, RefreshLeft, Search, Document, User, InfoFilled } from '@element-plus/icons-vue'
import { logList } from '@/api/modules'
import { fmtDateTime } from '@/utils/format'
import PageHeader from '@/components/PageHeader.vue'
import SectionCard from '@/components/SectionCard.vue'
import FilterBar from '@/components/FilterBar.vue'
import EmptyState from '@/components/EmptyState.vue'

const loading = ref(false)
const list = ref<any[]>([])
const total = ref(0)

const query = reactive({ page: 1, pageSize: 20, username: '', keyword: '' })
const dateRange = ref<[string, string] | null>(null)

async function load() {
  loading.value = true
  try {
    const [from, to] = dateRange.value ?? ['', '']
    const res: any = await logList({
      page: query.page,
      pageSize: query.pageSize,
      username: query.username.trim() || undefined,
      keyword: query.keyword.trim() || undefined,
      from: from || undefined,
      to: to || undefined,
    })
    list.value = res?.list ?? []
    total.value = Number(res?.total ?? 0)
  } catch { /* 拦截器已提示 */ } finally { loading.value = false }
}

function search() { query.page = 1; load() }
function reset() { query.username = ''; query.keyword = ''; dateRange.value = null; search() }
function onSizeChange(size: number) { query.pageSize = size; query.page = 1; load() }

function trunc(v: unknown, n = 60): string {
  const s = v == null ? '' : String(v)
  return s.length > n ? s.slice(0, n) + '…' : s
}

onMounted(load)
</script>

<style scoped>
.logs-page { display: flex; flex-direction: column; gap: 18px; }
.filter-meta { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: var(--fm-text-3); }
.muted { color: var(--fm-text-3); }
.num-mono { font-family: var(--fm-font-num); font-variant-numeric: tabular-nums; }

.user-cell { display: flex; align-items: center; gap: 8px; }
.user-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--fm-gradient-hero);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 6px -2px rgba(79,70,229,0.4);
  flex-shrink: 0;
}
.user-name { font-size: 13px; font-weight: 500; }

.action-pill {
  display: inline-block;
  font-size: 12px;
  font-weight: 500;
  padding: 2px 10px;
  border-radius: var(--fm-radius-pill);
  background: var(--fm-bg-muted);
  color: var(--fm-text-1);
}

.method-pill {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: var(--fm-radius-xs);
  letter-spacing: 0.04em;
}
.method-get    { background: rgba(16,185,129,0.10); color: var(--fm-success-ink); }
.method-post   { background: rgba(99,102,241,0.10); color: var(--fm-brand-600); }
.method-put    { background: rgba(245,158,11,0.10); color: var(--fm-warning-ink); }
.method-delete { background: rgba(239,68,68,0.10); color: var(--fm-danger-ink); }
.method-patch  { background: rgba(139,92,246,0.10); color: var(--fm-violet-600); }
html.dark .method-get    { color: #34d399; }
html.dark .method-post   { color: var(--fm-brand-300); }
html.dark .method-put    { color: #fbbf24; }
html.dark .method-delete { color: #f87171; }
html.dark .method-patch  { color: var(--fm-violet-300); }

.path-cell {
  font-family: var(--fm-font-mono);
  font-size: 12px;
  color: var(--fm-text-2);
}
.detail-cell { cursor: default; word-break: break-all; }

.pager { padding: 14px 20px; display: flex; justify-content: flex-end; border-top: 1px solid var(--fm-border-soft); }
</style>

<style>
.log-detail-popper { max-width: 480px !important; }
</style>
