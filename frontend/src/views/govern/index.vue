<template>
  <section class="page" data-module="govern">
    <header class="page-head">
      <div>
        <h2>存储治理管理</h2>
        <p class="page-desc">维护存储治理策略的输入、执行约束与结果记录。治理视角只认当前章：已撤牌策略的回收候选全部冻结，重新启用须到「策略撤牌与释放台」领新章。</p>
      </div>
      <div class="page-actions">
        <RouterLink class="btn primary" to="/seal">前往策略撤牌与释放台</RouterLink>
        <button class="btn" type="button" @click="exportRows">导出存储治理清单</button>
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
      <span class="legend-item seal-legend">当前生效章：{{ activeSealCount }} 枚 · 已撤牌冻结：{{ revokedSealCount }} 枚</span>
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
          <th>保护章状态</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)" :class="{ 'seal-frozen': !sealOf(row) }">
          <td v-for="column in columns" :key="column">{{ row[column] ?? '—' }}</td>
          <td>
            <SealBadge :policy-code="String(row['策略编号'])" />
          </td>
          <td>
            <span class="state-text">{{ row.status }}</span>
            <span v-if="row.abnormal && sealOf(row)" class="abnormal-flag" title="待释放台裁决收回">异常牌未撤</span>
            <span v-else-if="row.abnormal && !sealOf(row)" class="frozen-flag">异常牌随旧章冻结</span>
          </td>
          <td class="row-actions">
            <button
              v-for="action in actions"
              :key="action"
              class="link"
              type="button"
              @click="runAction(action, row)"
            >
              {{ action }}
            </button>
            <RouterLink class="link" :to="{ path: '/seal', query: { policy: String(row['策略编号']) } }">撤牌/领章</RouterLink>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 3" class="empty-state">暂无存储治理数据，可先登记治理策略</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条存储治理记录（统计仅采信当前章，旧章结论见释放台只读存档）</span>
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
import { currentSeal, listSeals } from '@/api/seal-service'
import type { EntryRow } from '@/data/types'
import SealBadge from '@/components/SealBadge.vue'

const meta = moduleMeta('govern')
const columns = ["策略编号", "目标表名", "治理类型", "冷热判定字段", "生命周期天数", "归档目标", "回收站保留", "执行频率"]
const actions = ["提交校验", "启用治理", "停用治理"]
const statuses = ["草稿", "待校验", "已启用", "已停用"]

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)

const stats = computed(() => [
  { label: '治理策略总数（当前章口径）', value: rows.value.filter((row) => sealOf(row)).length },
  { label: '已启用策略', value: rows.value.filter((row) => sealOf(row) && row.status === '已启用').length },
  { label: '待校验策略', value: rows.value.filter((row) => sealOf(row) && row.status === '待校验').length },
  { label: '冻结（旧章已撤牌）', value: rows.value.filter((row) => !sealOf(row)).length },
])

const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status && sealOf(row)).length,
  })),
)

const activeSealCount = computed(() => listSeals().filter((seal) => seal.state === '生效中').length)
const revokedSealCount = computed(() => listSeals().filter((seal) => seal.state === '已撤牌').length)

// 治理视角：只认当前章。没有生效章的策略视为冻结，不计入有效统计。
function sealOf(row: EntryRow) {
  return currentSeal(String(row['策略编号']))
}

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  // 已撤牌冻结的策略不允许走旧状态机改结论，必须先领新章。
  if (!sealOf(row)) {
    errorMessage.value = `${row['策略编号']} 的保护章已撤牌，旧状态动作被拒绝；请先到释放台领新章`
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
    errorMessage.value = error instanceof Error ? error.message : '存储治理列表读取失败'
  }
}

onMounted(reload)
</script>

<style scoped>
.seal-frozen { background: #fcfcfd; }
.abnormal-flag {
  display: inline-block;
  margin-left: 8px;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 12px;
  color: #b42318;
  background: #fef3f2;
  border: 1px solid #fda29b;
}
.frozen-flag {
  display: inline-block;
  margin-left: 8px;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 12px;
  color: #b54708;
  background: #fffaeb;
  border: 1px solid #fedf89;
}
.seal-legend { background: #eff8ff; color: #175cd3; }
.state-text { font-weight: 600; }
</style>
