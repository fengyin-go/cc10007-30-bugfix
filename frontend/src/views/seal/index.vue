<template>
  <section class="page" data-module="seal">
    <header class="page-head">
      <div>
        <h2>策略撤牌与释放台</h2>
        <p class="page-desc">
          治理策略以「章」为凭据：撤牌即冻结旧章，未执行候选全部失效、历史凭据只读；再次启用必须领新章，旧名单不可复活。一切交叉操作以章号裁定，同一动作重放不增副作用。
        </p>
      </div>
      <div class="page-actions">
        <label class="policy-pick">
          治理对象
          <select v-model="policyCode" @change="reload">
            <option v-for="row in governRows" :key="String(row.id)" :value="String(row['策略编号'])">
              {{ row['策略编号'] }} · {{ row['目标表名'] }}
            </option>
          </select>
        </label>
        <button class="btn ghost" type="button" @click="resetAll">重置撤牌域</button>
      </div>
    </header>

    <!-- 当前章凭据区 -->
    <div class="seal-board">
      <article class="seal-card" :class="activeSeal ? 'live' : 'frozen'">
        <div class="seal-card-head">
          <h3>当前章（治理 / 分区 / 概览唯一采信）</h3>
          <SealBadge :policy-code="policyCode" />
        </div>
        <template v-if="activeSeal">
          <dl class="seal-meta">
            <div><dt>章号</dt><dd>{{ activeSeal.sealNo }}</dd></div>
            <div><dt>版本</dt><dd>V{{ activeSeal.version }}</dd></div>
            <div><dt>签发时间</dt><dd>{{ activeSeal.issuedAt }}</dd></div>
            <div><dt>状态</dt><dd>{{ activeSeal.state }}</dd></div>
          </dl>
          <div class="seal-actions">
            <input v-model="revokeReason" class="reason-input" placeholder="撤牌原因（留痕进只读存档）" />
            <button class="btn danger" type="button" @click="onRevoke">撤牌（未执行候选全部失效）</button>
          </div>
        </template>
        <template v-else>
          <p class="frozen-note">
            无生效章：旧保护结论已全部冻结，未执行候选不得裁决。重新启用必须领取新版本章，不能借旧名单复活。
          </p>
          <div class="seal-actions">
            <button class="btn primary" type="button" @click="onIssue">领新章并重新启用</button>
            <button class="btn" type="button" :disabled="!activeSeal" @click="onGenerate">按当前章生成新封存名单</button>
          </div>
          <p v-if="hintMessage" class="hint-text">{{ hintMessage }}</p>
        </template>
      </article>

      <article class="seal-card stat-side">
        <h3>回收候选概览</h3>
        <ul class="candidate-stats">
          <li><span>未执行</span><strong>{{ countByState('未执行') }}</strong></li>
          <li><span>已封存</span><strong>{{ countByState('已封存') }}</strong></li>
          <li><span>已释放</span><strong>{{ countByState('已释放') }}</strong></li>
          <li class="dead"><span>已失效（旧章）</span><strong>{{ countByState('已失效') }}</strong></li>
        </ul>
        <p class="hint-text">以存储治理策略 {{ policyCode }} 为主对象核对回收候选。</p>
      </article>
    </div>

    <!-- 释放台 -->
    <div class="console-wrap" ref="consoleWrap">
      <div class="console-head">
        <h3>释放台 · 封存名单（支持框选 / 全选 / 批量裁决）</h3>
        <div class="console-tools">
          <label class="state-filter">
            状态
            <select v-model="stateFilter">
              <option value="">全部</option>
              <option v-for="s in stateOptions" :key="s" :value="s">{{ s }}</option>
            </select>
          </label>
          <button class="btn" type="button" @click="selectAll">全选当前范围</button>
          <button class="btn ghost" type="button" @click="clearSelection">清空选择</button>
          <button class="btn primary" type="button" :disabled="!selectedIds.length" @click="onBatch('封存')">
            批量封存（{{ selectedIds.length }}）
          </button>
          <button class="btn" type="button" :disabled="!selectedIds.length" @click="onBatch('释放')">
            批量释放（{{ selectedIds.length }}）
          </button>
        </div>
      </div>
      <p class="range-tip">在表格空白处按住左键拖拽可框选；单击勾选、Shift+单击选区间。整组只统计勾选范围内候选，范围外不参与结果。</p>

      <table class="data-table console-table">
        <thead>
          <tr>
            <th class="check-col">
              <input
                type="checkbox"
                :checked="allVisibleChecked"
                :indeterminate.prop="someVisibleChecked && !allVisibleChecked"
                @change="toggleAll"
              />
            </th>
            <th>候选ID</th>
            <th>治理策略</th>
            <th>归属章号</th>
            <th>回收对象</th>
            <th>回收原因</th>
            <th>状态</th>
            <th>裁决码</th>
            <th>详情</th>
          </tr>
        </thead>
        <tbody ref="tbodyRef">
          <tr
            v-for="row in visibleCandidates"
            :key="row.id"
            :data-id="row.id"
            :class="{ selected: selectedIds.includes(row.id), stale: !isCurrent(row) }"
            @click="onRowClick($event, row.id)"
          >
            <td class="check-col" @click.stop>
              <input type="checkbox" :value="row.id" v-model="selectedIds" />
            </td>
            <td>{{ row.id }}</td>
            <td>{{ row.policyCode }}</td>
            <td>
              <SealBadge :policy-code="row.policyCode" :referenced-seal-no="row.sealNo" />
            </td>
            <td>{{ row.objectName }}</td>
            <td>{{ row.reason }}</td>
            <td><span class="state-pill" :class="stateClass(row.state)">{{ row.state }}</span></td>
            <td><code class="result-code">{{ row.resultCode || '—' }}</code></td>
            <td><button class="link" type="button" @click.stop="openDetail(row)">查看</button></td>
          </tr>
          <tr v-if="!visibleCandidates.length">
            <td colspan="9" class="empty-state">当前筛选下没有回收候选</td>
          </tr>
        </tbody>
      </table>

      <!-- 框选浮层 -->
      <div
        v-if="dragBox.active"
        class="drag-box"
        :style="{ left: dragBox.x + 'px', top: dragBox.y + 'px', width: dragBox.w + 'px', height: dragBox.h + 'px' }"
      />
    </div>

    <!-- 批量裁决逐条结果 -->
    <div v-if="batchResults.length" class="result-panel">
      <h3>本次批量裁决结果（成功 {{ lastSummary.okCount }} / 失败 {{ lastSummary.failCount }}）</h3>
      <ul>
        <li v-for="item in batchResults" :key="item.candidateId" :class="item.ok ? 'ok' : 'fail'">
          <code>{{ item.code }}</code>
          <span>候选 {{ item.candidateId }}：{{ item.message }}</span>
        </li>
      </ul>
    </div>

    <!-- 候选详情：与列表共用同一 SealBadge 数据源，不会出现两处结果不一致 -->
    <div v-if="detail" class="modal-mask" @click.self="detail = null">
      <div class="modal">
        <h3>候选 {{ detail.id }} 详情</h3>
        <dl class="seal-meta">
          <div><dt>治理策略</dt><dd>{{ detail.policyCode }}</dd></div>
          <div><dt>归属章号</dt><dd><SealBadge :policy-code="detail.policyCode" :referenced-seal-no="detail.sealNo" /></dd></div>
          <div><dt>回收对象</dt><dd>{{ detail.objectName }}</dd></div>
          <div><dt>回收原因</dt><dd>{{ detail.reason }}</dd></div>
          <div><dt>状态</dt><dd>{{ detail.state }}</dd></div>
          <div><dt>裁决码</dt><dd>{{ detail.resultCode || '—' }}</dd></div>
          <div><dt>创建时间</dt><dd>{{ detail.createdAt }}</dd></div>
          <div><dt>裁决时间</dt><dd>{{ detail.decidedAt || '—' }}</dd></div>
        </dl>
        <p class="hint-text">详情与侧栏列表读取同一枚章的凭据，章号裁定结果一致。</p>
        <div class="modal-actions">
          <button class="btn" type="button" @click="detail = null">关闭</button>
        </div>
      </div>
    </div>

    <!-- 只读存档区 -->
    <div class="archive-zone">
      <h3>存档只读区 · 历史凭据（不可编辑、不可复活）</h3>
      <table class="data-table">
        <thead>
          <tr><th>历史章号</th><th>治理策略</th><th>版本</th><th>签发时间</th><th>撤牌时间</th><th>撤牌原因</th><th>状态</th></tr>
        </thead>
        <tbody>
          <tr v-for="seal in archived" :key="seal.sealNo">
            <td><code>{{ seal.sealNo }}</code></td>
            <td>{{ seal.policyCode }}</td>
            <td>V{{ seal.version }}</td>
            <td>{{ seal.issuedAt }}</td>
            <td>{{ seal.revokedAt }}</td>
            <td>{{ seal.revokeReason }}</td>
            <td><span class="state-pill revoked">{{ seal.state }}</span></td>
          </tr>
          <tr v-if="!archived.length">
            <td colspan="7" class="empty-state">暂无已撤牌历史章</td>
          </tr>
        </tbody>
      </table>

      <h4 class="archive-sub">旧章名下的历史候选（只读留痕）</h4>
      <table class="data-table">
        <thead>
          <tr><th>候选ID</th><th>归属章号</th><th>回收对象</th><th>终态</th><th>裁决码</th><th>裁决时间</th></tr>
        </thead>
        <tbody>
          <tr v-for="row in archivedCandidates" :key="row.id">
            <td>{{ row.id }}</td>
            <td><code>{{ row.sealNo }}</code></td>
            <td>{{ row.objectName }}</td>
            <td><span class="state-pill" :class="stateClass(row.state)">{{ row.state }}</span></td>
            <td><code class="result-code">{{ row.resultCode || '—' }}</code></td>
            <td>{{ row.decidedAt || '—' }}</td>
          </tr>
          <tr v-if="!archivedCandidates.length">
            <td colspan="6" class="empty-state">暂无历史候选</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 动作账本：重放证据 -->
    <div class="ledger-zone">
      <h3>动作账本 · 幂等留痕（同一动作重放不增副作用）</h3>
      <table class="data-table">
        <thead>
          <tr><th>时间</th><th>动作</th><th>章号</th><th>裁决码</th><th>结果</th><th>说明</th></tr>
        </thead>
        <tbody>
          <tr v-for="entry in ledger" :key="entry.actionKey + entry.at">
            <td>{{ entry.at }}</td>
            <td>{{ entry.action }}</td>
            <td><code>{{ entry.sealNo }}</code></td>
            <td><code class="result-code">{{ entry.code }}</code></td>
            <td><span :class="entry.ok ? 'ok-text' : 'error-text'">{{ entry.ok ? '成功' : '拒绝' }}</span></td>
            <td>{{ entry.message }}</td>
          </tr>
          <tr v-if="!ledger.length">
            <td colspan="6" class="empty-state">暂无动作记录</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'

import {
  adjudicateBatch,
  archivedSeals,
  currentSeal,
  generateSealList,
  issueNewSeal,
  listCandidates,
  listLedger,
  listSeals,
  resetSealDomain,
  revokeSeal,
} from '@/api/seal-service'
import { listRows } from '@/data/local-store'
import type { BatchDecisionItem, RecycleCandidate, SealCredential, SealLedgerEntry } from '@/data/types'
import SealBadge from '@/components/SealBadge.vue'

const stateOptions = ['未执行', '已封存', '已释放', '已失效']

const route = useRoute()
const governRows = computed(() => listRows('govern'))
const policyCode = ref('GOV-0001')

const activeSeal = ref<SealCredential | null>(null)
const archived = ref<SealCredential[]>([])
const candidates = ref<RecycleCandidate[]>([])
const ledger = ref<SealLedgerEntry[]>([])
const allSeals = ref<SealCredential[]>([])

const revokeReason = ref('')
const stateFilter = ref('')
const selectedIds = ref<number[]>([])
const detail = ref<RecycleCandidate | null>(null)
const hintMessage = ref('')

const batchResults = ref<BatchDecisionItem[]>([])
const lastSummary = ref({ okCount: 0, failCount: 0 })

const consoleWrap = ref<HTMLElement | null>(null)
const tbodyRef = ref<HTMLElement | null>(null)

// 框选状态
const dragBox = reactive({ active: false, x: 0, y: 0, w: 0, h: 0, startX: 0, startY: 0, additive: false })
let dragStartIndex = -1

const visibleCandidates = computed(() =>
  stateFilter.value ? candidates.value.filter((item) => item.state === stateFilter.value) : candidates.value,
)

const archivedCandidates = computed(() =>
  candidates.value.filter((item) => !activeSeal.value || item.sealNo !== activeSeal.value.sealNo),
)

const allVisibleChecked = computed(
  () => visibleCandidates.value.length > 0 && visibleCandidates.value.every((row) => selectedIds.value.includes(row.id)),
)
const someVisibleChecked = computed(() => visibleCandidates.value.some((row) => selectedIds.value.includes(row.id)))

function isCurrent(row: RecycleCandidate): boolean {
  return !!activeSeal.value && row.sealNo === activeSeal.value.sealNo
}

function countByState(state: string): number {
  return candidates.value.filter((item) => item.state === state).length
}

function stateClass(state: string): string {
  return {
    未执行: 'pending',
    已封存: 'sealed',
    已释放: 'released',
    已失效: 'dead',
  }[state] ?? ''
}

function reload() {
  activeSeal.value = currentSeal(policyCode.value)
  archived.value = archivedSeals(policyCode.value)
  candidates.value = listCandidates(policyCode.value)
  ledger.value = listLedger()
  allSeals.value = listSeals()
  // 选中项里剔除已不在当前列表的候选
  const liveIds = new Set(candidates.value.map((item) => item.id))
  selectedIds.value = selectedIds.value.filter((id) => liveIds.has(id))
}

function onRevoke() {
  const result = revokeSeal(activeSeal.value?.sealNo ?? '', revokeReason.value)
  hintMessage.value = result.message
  revokeReason.value = ''
  reload()
}

function onIssue() {
  const result = issueNewSeal(policyCode.value)
  hintMessage.value = result.message
  reload()
}

function onGenerate() {
  const stamp = Date.now()
  const objects = [
    { objectName: `${policyCode.value}_auto_${stamp}_a`, reason: '新章口径下重新识别的冷数据' },
    { objectName: `${policyCode.value}_auto_${stamp}_b`, reason: '新章口径下回收站保留到期' },
  ]
  const result = generateSealList(policyCode.value, objects)
  hintMessage.value = result.message
  reload()
}

function selectAll() {
  selectedIds.value = visibleCandidates.value.map((row) => row.id)
}

function clearSelection() {
  selectedIds.value = []
}

function toggleAll(event: Event) {
  const checked = (event.target as HTMLInputElement).checked
  if (checked) {
    selectAll()
  } else {
    clearSelection()
  }
}

// 单击/Shift 区间选择
function onRowClick(event: MouseEvent, id: number) {
  if ((event.target as HTMLElement).closest('input, button, a')) {
    return
  }
  const ids = visibleCandidates.value.map((row) => row.id)
  const index = ids.indexOf(id)
  if (event.shiftKey && dragStartIndex >= 0 && dragStartIndex !== index) {
    const [from, to] = [dragStartIndex, index].sort((a, b) => a - b)
    const range = ids.slice(from, to + 1)
    const merged = new Set(selectedIds.value)
    range.forEach((rid) => merged.add(rid))
    selectedIds.value = [...merged]
  } else {
    const set = new Set(selectedIds.value)
    set.has(id) ? set.delete(id) : set.add(id)
    selectedIds.value = [...set]
    dragStartIndex = index
  }
}

// 拖拽框选：在释放台区域按下左键拉框，命中行纳入选择
function onMouseDown(event: MouseEvent) {
  if (event.button !== 0 || !consoleWrap.value || (event.target as HTMLElement).closest('input, button, a, select')) {
    return
  }
  const rect = consoleWrap.value.getBoundingClientRect()
  dragBox.active = true
  dragBox.startX = event.clientX - rect.left
  dragBox.startY = event.clientY - rect.top
  dragBox.x = dragBox.startX
  dragBox.y = dragBox.startY
  dragBox.w = 0
  dragBox.h = 0
  dragBox.additive = event.ctrlKey || event.metaKey
  if (!dragBox.additive) {
    selectedIds.value = []
  }
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

function onMouseMove(event: MouseEvent) {
  if (!consoleWrap.value) {
    return
  }
  const rect = consoleWrap.value.getBoundingClientRect()
  const cx = event.clientX - rect.left
  const cy = event.clientY - rect.top
  dragBox.x = Math.min(dragBox.startX, cx)
  dragBox.y = Math.min(dragBox.startY, cy)
  dragBox.w = Math.abs(cx - dragBox.startX)
  dragBox.h = Math.abs(cy - dragBox.startY)
}

function onMouseUp() {
  dragBox.active = false
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
  if (!tbodyRef.value || dragBox.w < 4 || dragBox.h < 4) {
    return
  }
  const boxRect = {
    left: dragBox.x,
    top: dragBox.y,
    right: dragBox.x + dragBox.w,
    bottom: dragBox.y + dragBox.h,
  }
  const wrapRect = consoleWrap.value!.getBoundingClientRect()
  const picked: number[] = []
  tbodyRef.value.querySelectorAll('tr').forEach((tr) => {
    const r = tr.getBoundingClientRect()
    const rel = {
      left: r.left - wrapRect.left,
      top: r.top - wrapRect.top,
      right: r.right - wrapRect.left,
      bottom: r.bottom - wrapRect.top,
    }
    const hit = !(rel.right < boxRect.left || rel.left > boxRect.right || rel.bottom < boxRect.top || rel.top > boxRect.bottom)
    if (hit) {
      const id = Number((tr as HTMLElement).dataset.id)
      if (id) {
        picked.push(id)
      }
    }
  })
  if (picked.length) {
    const merged = new Set(dragBox.additive ? selectedIds.value : [])
    picked.forEach((id) => merged.add(id))
    selectedIds.value = [...merged]
  }
}

function onBatch(decision: '封存' | '释放') {
  const ids = [...selectedIds.value]
  if (!ids.length) {
    return
  }
  const result = adjudicateBatch(policyCode.value, ids, decision)
  batchResults.value = result.items
  lastSummary.value = { okCount: result.okCount, failCount: result.failCount }
  reload()
  // 保留本次范围的勾选，便于看到逐条裁决码
  selectedIds.value = ids.filter((id) => candidates.value.some((row) => row.id === id))
}

function openDetail(row: RecycleCandidate) {
  detail.value = row
}

function resetAll() {
  resetSealDomain()
  batchResults.value = []
  hintMessage.value = '撤牌域已恢复到初始示例局面'
  reload()
}

onMounted(() => {
  const q = route.query.policy
  if (typeof q === 'string' && governRows.value.some((row) => String(row['策略编号']) === q)) {
    policyCode.value = q
  }
  reload()
  if (consoleWrap.value) {
    consoleWrap.value.addEventListener('mousedown', onMouseDown)
  }
})

onUnmounted(() => {
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
  if (consoleWrap.value) {
    consoleWrap.value.removeEventListener('mousedown', onMouseDown)
  }
})

// 避免未使用告警：allSeals 供调试/扩展保留
void allSeals
</script>

<style scoped>
.policy-pick { display: flex; flex-direction: column; font-size: 12px; color: var(--muted); gap: 4px; }
.policy-pick select { padding: 6px 8px; border-radius: 6px; border: 1px solid var(--border); }
.seal-board { display: flex; gap: 12px; margin-bottom: 14px; }
.seal-card { flex: 1; background: #fff; border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; }
.seal-card.live { border-left: 4px solid #12b76a; }
.seal-card.frozen { border-left: 4px solid #f79009; }
.seal-card-head { display: flex; justify-content: space-between; align-items: center; }
.seal-card h3 { margin: 0 0 10px; font-size: 15px; }
.seal-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; margin: 0 0 12px; }
.seal-meta dt { font-size: 12px; color: var(--muted); }
.seal-meta dd { margin: 2px 0 0; font-size: 13px; }
.seal-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.reason-input { flex: 1; min-width: 220px; padding: 6px 10px; border: 1px solid var(--border); border-radius: 6px; }
.btn.danger { background: #d92d20; border-color: #d92d20; color: #fff; }
.frozen-note { font-size: 13px; color: #b54708; background: #fffaeb; border: 1px solid #fedf89; padding: 8px 10px; border-radius: 8px; }
.stat-side { flex: 0 0 280px; }
.candidate-stats { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.candidate-stats li { background: #f6f8fb; border-radius: 8px; padding: 8px 10px; display: flex; justify-content: space-between; }
.candidate-stats li.dead strong { color: #b42318; }
.hint-text { font-size: 12px; color: var(--muted); margin: 8px 0 0; }
.console-wrap { position: relative; background: #fff; border: 1px solid var(--border); border-radius: 10px; padding: 12px; user-select: none; }
.console-head { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; }
.console-head h3 { margin: 0; font-size: 15px; }
.console-tools { display: flex; gap: 8px; align-items: flex-end; flex-wrap: wrap; }
.state-filter { display: flex; flex-direction: column; font-size: 12px; color: var(--muted); gap: 4px; }
.state-filter select { padding: 6px 8px; border-radius: 6px; border: 1px solid var(--border); }
.range-tip { font-size: 12px; color: var(--muted); margin: 6px 0 8px; }
.check-col { width: 40px; text-align: center; }
.console-table tbody tr { cursor: pointer; }
.console-table tbody tr.selected { background: #eff8ff; }
.console-table tbody tr.stale { color: var(--muted); }
.drag-box { position: absolute; border: 1px solid var(--brand); background: rgba(31, 111, 235, 0.12); pointer-events: none; z-index: 5; }
.state-pill { padding: 2px 9px; border-radius: 999px; font-size: 12px; }
.state-pill.pending { background: #fffaeb; color: #b54708; }
.state-pill.sealed { background: #eff8ff; color: #175cd3; }
.state-pill.released { background: #ecfdf3; color: #067647; }
.state-pill.dead, .state-pill.revoked { background: #fef3f2; color: #b42318; }
.result-code { font-size: 12px; color: #344054; background: #f2f4f7; padding: 1px 6px; border-radius: 4px; }
.result-panel { background: #fff; border: 1px solid var(--border); border-radius: 10px; padding: 12px 16px; margin-top: 14px; }
.result-panel h3 { margin: 0 0 8px; font-size: 14px; }
.result-panel ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.result-panel li { font-size: 13px; display: flex; gap: 8px; align-items: center; }
.result-panel li.ok code { color: #067647; }
.result-panel li.fail code { color: #b42318; }
.modal-mask { position: fixed; inset: 0; background: rgba(16, 24, 40, 0.45); display: flex; align-items: center; justify-content: center; z-index: 50; }
.modal { background: #fff; border-radius: 12px; padding: 20px 24px; width: 560px; max-width: 92vw; }
.modal h3 { margin: 0 0 12px; }
.modal-actions { display: flex; justify-content: flex-end; margin-top: 12px; }
.archive-zone, .ledger-zone { background: #fff; border: 1px solid var(--border); border-radius: 10px; padding: 12px 16px; margin-top: 16px; }
.archive-zone h3, .ledger-zone h3 { margin: 0 0 10px; font-size: 15px; }
.archive-sub { margin: 16px 0 8px; font-size: 14px; color: #344054; }
.ok-text { color: #067647; }
</style>
