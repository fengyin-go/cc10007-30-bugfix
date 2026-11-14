<template>
  <section class="page">
    <header class="page-head">
      <div>
        <h2>运营概览</h2>
        <p class="page-desc">汇总各业务模块的关键指标，先看总量再看异常。</p>
      </div>
      <div class="page-actions">
        <button class="btn" type="button" @click="refresh">重新统计</button>
      </div>
    </header>
    <div class="stat-row">
      <article v-for="card in cards" :key="card.label" class="stat-card">
        <span class="stat-label">{{ card.label }}</span>
        <strong class="stat-value">{{ card.value }}</strong>
      </article>
    </div>
    <table class="data-table">
      <thead>
        <tr><th>业务模块</th><th>今日新增</th><th>待处理</th><th>异常量</th></tr>
      </thead>
      <tbody>
        <tr v-for="row in moduleRows" :key="row.name">
          <td>{{ row.name }}</td>
          <td>{{ row.created }}</td>
          <td>{{ row.pending }}</td>
          <td>{{ row.abnormal }}</td>
        </tr>
      </tbody>
    </table>

    <section class="seal-summary">
      <div class="seal-summary-head">
        <h3>治理保护章凭据（概览只认当前章）</h3>
        <RouterLink class="link" to="/seal">进入策略撤牌与释放台</RouterLink>
      </div>
      <table class="data-table">
        <thead>
          <tr><th>章号</th><th>治理策略</th><th>版本</th><th>状态</th><th>签发时间</th><th>撤牌时间</th></tr>
        </thead>
        <tbody>
          <tr v-for="seal in seals" :key="seal.sealNo" :class="{ revoked: seal.state === '已撤牌' }">
            <td><code>{{ seal.sealNo }}</code></td>
            <td>{{ seal.policyCode }}</td>
            <td>V{{ seal.version }}</td>
            <td>
              <span class="seal-state" :class="seal.state === '生效中' ? 'live' : 'dead'">{{ seal.state }}</span>
            </td>
            <td>{{ seal.issuedAt }}</td>
            <td>{{ seal.revokedAt || '—' }}</td>
          </tr>
          <tr v-if="!seals.length">
            <td colspan="6" class="empty-state">暂无保护章凭据</td>
          </tr>
        </tbody>
      </table>
      <p class="seal-note">已撤牌章及其回收候选只在释放台只读存档区展示，不计入上方待处理/异常口径。</p>
    </section>

    <footer class="page-foot">
      <span>数据保存在本机浏览器里，换浏览器或清缓存会回到示例数据</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'

import { loadOverview } from '@/api/local-service'
import { listSeals } from '@/api/seal-service'
import type { OverviewResult, SealCredential } from '@/data/types'

const cards = ref<OverviewResult['cards']>([])
const moduleRows = ref<OverviewResult['modules']>([])
const seals = ref<SealCredential[]>([])

function refresh() {
  const payload = loadOverview()
  cards.value = payload.cards
  moduleRows.value = payload.modules
  seals.value = listSeals()
}

onMounted(refresh)
</script>

<style scoped>
.seal-summary { margin-top: 18px; background: #fff; border: 1px solid var(--border); border-radius: 10px; padding: 12px 16px; }
.seal-summary-head { display: flex; justify-content: space-between; align-items: center; }
.seal-summary h3 { margin: 0 0 10px; font-size: 15px; }
.seal-state { padding: 2px 10px; border-radius: 999px; font-size: 12px; }
.seal-state.live { background: #ecfdf3; color: #067647; }
.seal-state.dead { background: #fef3f2; color: #b42318; }
tr.revoked { color: var(--muted); }
.seal-note { font-size: 12px; color: var(--muted); margin: 8px 0 0; }
</style>
