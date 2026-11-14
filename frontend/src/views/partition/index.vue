<template>
  <section class="page" data-module="partition">
    <header class="page-head">
      <div>
        <h2>分区策略管理</h2>
        <p class="page-desc">维护分区治理方案的输入、执行约束与结果记录。分区方案引用的存储治理保护结论以章号核验：旧章撤牌后引用立即标红，只认当前章。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记分区方案</button>
        <button class="btn" type="button" @click="exportRows">导出分区策略清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
      <span class="legend-item stale-legend">引用旧章（不采信）：{{ staleRefCount }}</span>
    </p>

    <form class="filter-bar" @submit.prevent="reload">
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>保护结论核验</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)" :class="{ 'stale-row': isStale(row) }">
          <td v-for="column in columns" :key="column">{{ row[column] ?? '—' }}</td>
          <td>
            <SealBadge :policy-code="policyOf(row)" :referenced-seal-no="String(row['保护章号'] ?? '')" />
          </td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
            <button
              v-for="action in actions"
              :key="action"
              class="link"
              type="button"
              :disabled="isStale(row)"
              @click="runAction(action, row)"
            >
              {{ action }}
            </button>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 3" class="empty-state">暂无分区策略数据，可先登记分区方案</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条分区策略记录（只采信当前章保护结论，旧章引用见红色标记）</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  downloadEntries,
  listEntries,
  moduleMeta,
  runAction as applyAction,
} from '@/api/local-service'
import { archivedSeals, currentSeal } from '@/api/seal-service'
import type { EntryRow } from '@/data/types'
import SealBadge from '@/components/SealBadge.vue'

const meta = moduleMeta('partition')
const columns = ["方案编号", "目标表名", "分区字段", "分区粒度", "保留天数", "冷热阈值", "预建天数", "归档路径", "保护章号"]
const actions = ["提交校验", "启用方案", "停用方案"]
const statuses = ["草稿", "待校验", "已启用", "已停用"]

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)

// 分区方案通过目标表挂到存储治理策略；PART-0001 引用 GOV-0001 的旧保护结论。
function policyOf(row: EntryRow): string {
  const table = String(row['目标表名'] ?? '')
  const govern = listEntries('govern').items.find((item) => String(item['目标表名']) === table)
  return govern ? String(govern['策略编号']) : 'GOV-0001'
}

function isStale(row: EntryRow): boolean {
  const refSeal = String(row['保护章号'] ?? '')
  if (!refSeal) {
    return false
  }
  const policy = policyOf(row)
  const active = currentSeal(policy)
  if (active && active.sealNo === refSeal) {
    return false
  }
  return archivedSeals(policy).some((seal) => seal.sealNo === refSeal) || !active
}

const staleRefCount = computed(() => rows.value.filter((row) => isStale(row)).length)

const stats = computed(() => [
  { label: '分区方案总数', value: rows.value.length },
  { label: '采信当前章', value: rows.value.filter((row) => !isStale(row)).length },
  { label: '引用旧章冻结', value: staleRefCount.value },
])

const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function openCreate() {
  errorMessage.value = '分区方案登记入口尚未接入审批流'
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  if (isStale(row)) {
    errorMessage.value = `${row['方案编号']} 引用的保护章已撤牌，动作被拒绝；请待治理策略领新章后更新引用`
    return
  }
  const result = applyAction(meta.key, Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  reload()
}

function reload() {
  errorMessage.value = ''
  try {
    const payload = listEntries(meta.key, filters.value)
    rows.value = payload.items
    total.value = payload.total
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '分区策略列表读取失败'
  }
}

onMounted(reload)
</script>

<style scoped>
.stale-row { background: #fff8f7; }
.stale-row :deep(td) { color: #b42318; }
.stale-legend { background: #fef3f2; color: #b42318; }
.link:disabled { color: #98a2b3; cursor: not-allowed; }
</style>
