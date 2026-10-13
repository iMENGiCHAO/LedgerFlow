<template>
  <div class="backups-page">
    <PageHeader
      :icon="Coin"
      icon-tone="info"
      title="数据备份"
      sub="数据库快照 · 一键下载 · 灾难恢复保障"
    >
      <template #actions>
        <el-button type="primary" :loading="running" :icon="Folder" @click="runBackup">立即备份</el-button>
      </template>
    </PageHeader>

    <SectionCard padless>
      <FilterBar>
        <span class="filter-tip">
          <el-icon :size="13"><InfoFilled /></el-icon>
          共 {{ list.length }} 份备份
        </span>
        <el-button :icon="Refresh" :disabled="running" @click="load">刷新</el-button>
      </FilterBar>

      <el-table v-loading="loading" :data="list" class="backup-table">
        <el-table-column label="文件名" min-width="320" show-overflow-tooltip>
          <template #default="{ row }">
            <div class="file-cell">
              <div class="file-icon"><el-icon :size="16"><Folder /></el-icon></div>
              <div>
                <div class="file-name">{{ row.fileName }}</div>
                <div class="file-meta">SQL 快照 · gzip 压缩</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="大小" width="160" align="right">
          <template #default="{ row }">
            <span class="size-cell">{{ fmtSize(row.size) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="备份时间" width="200">
          <template #default="{ row }">
            <span class="num-mono">{{ fmtDateTime(row.createdAt) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" align="right" fixed="right">
          <template #default="{ row }">
            <button class="action-btn" @click="download(row)">
              <el-icon :size="12"><Download /></el-icon>下载
            </button>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState title="暂无备份文件" description="点击右上角『立即备份』生成数据库快照" />
        </template>
      </el-table>
    </SectionCard>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh, Coin, Folder, Download, InfoFilled } from '@element-plus/icons-vue'
import { backupDownloadUrl, backupList, backupRun } from '@/api/modules'
import { downloadAuthedFile, fmtDateTime, fmtSize } from '@/utils/format'
import PageHeader from '@/components/PageHeader.vue'
import SectionCard from '@/components/SectionCard.vue'
import FilterBar from '@/components/FilterBar.vue'
import EmptyState from '@/components/EmptyState.vue'

const loading = ref(false)
const running = ref(false)
const list = ref<any[]>([])

async function load() {
  loading.value = true
  try {
    const res: any = await backupList()
    list.value = Array.isArray(res) ? res : res?.list ?? []
  } catch { /* 拦截器已提示 */ } finally { loading.value = false }
}

async function runBackup() {
  running.value = true
  try {
    const res: any = await backupRun()
    ElMessage.success(`备份完成:${res?.fileName || list.value[0]?.fileName || ''}`.trim())
    await load()
  } catch { /* 拦截器已提示 */ } finally { running.value = false }
}

async function download(row: any) {
  try {
    await downloadAuthedFile(backupDownloadUrl(row.fileName), row.fileName)
  } catch { /* 下载失败已在工具内提示 */ }
}

onMounted(load)
</script>

<style scoped>
.backups-page { display: flex; flex-direction: column; gap: 18px; }
.filter-tip { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: var(--fm-text-3); }
.num-mono { font-family: var(--fm-font-num); font-variant-numeric: tabular-nums; }

.file-cell { display: flex; align-items: center; gap: 12px; }
.file-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: linear-gradient(135deg, rgba(99,102,241,0.10) 0%, rgba(139,92,246,0.10) 100%);
  color: var(--fm-brand-600);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
html.dark .file-icon { color: var(--fm-brand-300); }
.file-name { font-family: var(--fm-font-mono); font-size: 13px; font-weight: 600; color: var(--fm-text-1); }
.file-meta { font-size: 11px; color: var(--fm-text-3); margin-top: 1px; }

.size-cell {
  display: inline-block;
  font-family: var(--fm-font-num);
  font-weight: 600;
  font-size: 13px;
  color: var(--fm-text-2);
  padding: 2px 10px;
  background: var(--fm-bg-muted);
  border-radius: var(--fm-radius-pill);
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 500;
  padding: 5px 12px;
  background: transparent;
  border: 1px solid var(--fm-border-soft);
  color: var(--fm-text-2);
  border-radius: var(--fm-radius-xs);
  cursor: pointer;
  transition: all var(--fm-dur-base) var(--fm-ease);
  font-family: inherit;
}
.action-btn:hover { color: var(--fm-brand-600); border-color: var(--fm-brand-300); background: rgba(99,102,241,0.04); }
</style>
