<template>
  <span class="seal-badge" :class="badgeClass" :title="tip">
    <span class="seal-dot" />
    {{ label }}
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

import { currentSeal, archivedSeals } from '@/api/seal-service'

// 全应用统一的章状态展示：列表、详情、侧栏都走这一个组件，
// 底层只认 seal-service 的当前章/存档，杜绝「侧栏残留旧章、详情显示另一结果」。
const props = defineProps<{
  policyCode: string
  /** 某条记录实际引用的章号（如分区方案引用的保护结论）。 */
  referencedSealNo?: string
}>()

const active = computed(() => currentSeal(props.policyCode))
const archived = computed(() =>
  archivedSeals(props.policyCode).some((seal) => seal.sealNo === props.referencedSealNo),
)

const label = computed(() => {
  if (props.referencedSealNo) {
    if (active.value && active.value.sealNo === props.referencedSealNo) {
      return `当前章 ${props.referencedSealNo}`
    }
    if (archived.value) {
      return `旧章已撤 ${props.referencedSealNo}`
    }
    return `章号失效 ${props.referencedSealNo}`
  }
  return active.value ? `当前章 ${active.value.sealNo}` : '无生效章'
})

const badgeClass = computed(() => {
  if (props.referencedSealNo) {
    if (active.value && active.value.sealNo === props.referencedSealNo) {
      return 'is-active'
    }
    return 'is-revoked'
  }
  return active.value ? 'is-active' : 'is-none'
})

const tip = computed(() => {
  if (badgeClass.value === 'is-revoked') {
    return '该结论来自已撤牌的旧章，当前治理/分区/概览不予采信，重新启用需领新章'
  }
  if (badgeClass.value === 'is-active') {
    return '当前生效章，治理与分区只认此章'
  }
  return '当前没有生效章，旧保护结论已全部冻结'
})
</script>

<style scoped>
.seal-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 12px;
  white-space: nowrap;
  border: 1px solid transparent;
}
.seal-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
}
.seal-badge.is-active {
  color: #067647;
  background: #ecfdf3;
  border-color: #abefc6;
}
.seal-badge.is-revoked {
  color: #b42318;
  background: #fef3f2;
  border-color: #fda29b;
}
.seal-badge.is-none {
  color: #b54708;
  background: #fffaeb;
  border-color: #fedf89;
}
</style>
