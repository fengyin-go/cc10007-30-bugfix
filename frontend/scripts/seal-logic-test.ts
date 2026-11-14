import assert from 'node:assert/strict'

import {
  adjudicateBatch,
  archivedSeals,
  currentSeal,
  generateSealList,
  issueNewSeal,
  listCandidates,
  listLedger,
  revokeSeal,
} from '@/api/seal-service'
import { sealState } from '@/data/seal-store'

let passed = 0
function check(name, fn) {
  fn()
  passed += 1
  console.log(`  ✓ ${name}`)
}

// 1. 初始局面：V1 已撤牌，未执行候选已被收敛为已失效，当前无生效章
check('初始：GOV-0001 无生效章，V1 在只读存档', () => {
  assert.equal(currentSeal('GOV-0001'), null)
  assert.equal(archivedSeals('GOV-0001')[0].sealNo, 'GOV-0001/章-V1')
})

check('初始：失效章名下未执行候选全部自愈为已失效', () => {
  const list = listCandidates('GOV-0001')
  assert.equal(list.length, 3)
  assert.ok(list.every((c) => c.state === '已失效' && c.resultCode === 'SEAL_REVOKED'))
})

// 2. 无生效章时裁决旧候选一律被章号拒绝
check('无生效章：批量裁决旧候选全部 STALE_SEAL_REJECTED', () => {
  const ids = listCandidates('GOV-0001').map((c) => c.id)
  const r = adjudicateBatch('GOV-0001', ids, '封存')
  assert.equal(r.items.length, 3)
  assert.ok(r.items.every((i) => i.ok === false && i.code === 'STALE_SEAL_REJECTED'))
  assert.equal(r.okCount, 0)
  assert.equal(r.failCount, 3)
})

// 3. 重新启用必须领新章
const issued = issueNewSeal('GOV-0001')
check('领章：签发 V2 并成为当前章', () => {
  assert.equal(issued.ok, true)
  assert.equal(issued.sealNo, 'GOV-0001/章-V2')
  assert.equal(currentSeal('GOV-0001')?.sealNo, 'GOV-0001/章-V2')
})

check('领章幂等：已有生效章时再次领章被拒绝，不产生第二枚章', () => {
  const again = issueNewSeal('GOV-0001')
  assert.equal(again.ok, false)
  assert.equal(again.code, 'ACTIVE_SEAL_EXISTS')
  assert.equal(sealState().seals.filter((s) => s.state === '生效中').length, 1)
})

// 4. 新章生成新名单，旧名单不复活
const objects = [
  { objectName: 'new_cold_a', reason: '新章口径冷数据' },
  { objectName: 'new_cold_b', reason: '新章口径回收站到期' },
]
check('生成名单：仅当前章可签发，新候选为未执行', () => {
  const r = generateSealList('GOV-0001', objects)
  assert.equal(r.ok, true)
  const fresh = listCandidates('GOV-0001').filter((c) => c.state === '未执行')
  assert.equal(fresh.length, 2)
  assert.ok(fresh.every((c) => c.sealNo === 'GOV-0001/章-V2'))
})

check('生成名单幂等：同章同对象重放不新增候选', () => {
  const before = listCandidates('GOV-0001').length
  const r = generateSealList('GOV-0001', objects)
  assert.equal(r.ok, true)
  assert.match(r.message, /重放/)
  assert.equal(listCandidates('GOV-0001').length, before)
})

// 5. 批量裁决：逐条返回成功码，范围外候选不参与整组结果
const freshIds = listCandidates('GOV-0001').filter((c) => c.state === '未执行').map((c) => c.id)
check('批量封存：范围内逐条成功，范围外 id 不参与结果', () => {
  const r = adjudicateBatch('GOV-0001', [...freshIds, 999999], '封存')
  assert.equal(r.items.length, 2, '范围外候选不应出现在整组结果里')
  assert.ok(r.items.every((i) => i.ok && i.code === 'SEALED_OK'))
  assert.equal(r.okCount, 2)
  assert.equal(r.failCount, 0)
  assert.ok(listCandidates('GOV-0001').filter((c) => freshIds.includes(c.id)).every((c) => c.state === '已封存'))
})

check('批量裁决幂等：同一动作重放返回原成功码且无新增副作用', () => {
  const ledgerBefore = listLedger().length
  const r = adjudicateBatch('GOV-0001', freshIds, '封存')
  assert.ok(r.items.every((i) => i.ok && i.code === 'SEALED_OK'))
  assert.match(r.items[0].message, /重放/)
  assert.equal(listLedger().length, ledgerBefore, '重放不应写入新账本条目')
})

// 6. 新旧章交叉：同批里旧章候选失败、新章候选成功，逐条互不影响
const more = generateSealList('GOV-0001', [{ objectName: 'new_cold_c', reason: '补充冷数据' }])
assert.equal(more.ok, true)
const newId = listCandidates('GOV-0001').find((c) => c.objectName === 'new_cold_c').id
const staleId = listCandidates('GOV-0001').find((c) => c.sealNo === 'GOV-0001/章-V1').id
check('交叉裁决：旧章候选拒绝、新章候选成功，逐条返回', () => {
  const r = adjudicateBatch('GOV-0001', [staleId, newId], '释放')
  assert.equal(r.items.length, 2)
  const staleItem = r.items.find((i) => i.candidateId === staleId)
  const newItem = r.items.find((i) => i.candidateId === newId)
  assert.equal(staleItem.ok, false)
  assert.equal(staleItem.code, 'STALE_SEAL_REJECTED')
  assert.equal(newItem.ok, true)
  assert.equal(newItem.code, 'RELEASED_OK')
  assert.equal(r.okCount, 1)
  assert.equal(r.failCount, 1)
})

// 7. 撤牌：剩余未执行候选全部失效
const revoke = revokeSeal('GOV-0001/章-V2', '口径再次调整')
check('撤牌：V2 转只读存档，未执行候选全部失效', () => {
  assert.equal(revoke.ok, true)
  assert.equal(currentSeal('GOV-0001'), null)
  assert.equal(archivedSeals('GOV-0001').length, 2)
  assert.ok(listCandidates('GOV-0001').filter((c) => c.sealNo === 'GOV-0001/章-V2' && c.state === '未执行').length === 0)
})

check('撤牌幂等：重复撤牌重放原成功裁决，不重复失效候选', () => {
  const ledgerBefore = listLedger().length
  const r = revokeSeal('GOV-0001/章-V2', '口径再次调整')
  assert.equal(r.ok, true, '重放应回放原始成功结果')
  assert.equal(r.code, 'SEAL_REVOKED')
  assert.match(r.message, /重放/)
  assert.equal(listLedger().length, ledgerBefore, '重放不应写入新账本条目')
  assert.equal(sealState().seals.filter((s) => s.state === '已撤牌').length, 2)
})

check('撤牌后：任何裁决都被章号拒绝', () => {
  const r = adjudicateBatch('GOV-0001', [newId], '封存')
  assert.equal(r.items[0].ok, false)
  assert.equal(r.items[0].code, 'STALE_SEAL_REJECTED')
})

// 8. 再领 V3：旧名单保持失效，不可复活
check('再启用领 V3：V1/V2 候选保持已失效，不借旧名单复活', () => {
  const r = issueNewSeal('GOV-0001')
  assert.equal(r.sealNo, 'GOV-0001/章-V3')
  const old = listCandidates('GOV-0001').filter((c) => c.sealNo !== 'GOV-0001/章-V3')
  assert.ok(old.every((c) => c.state === '已失效' || c.state === '已封存' || c.state === '已释放'))
  assert.ok(!old.some((c) => c.state === '未执行'))
})

check('空范围批量：无候选参与，结果为空组', () => {
  const r = adjudicateBatch('GOV-0001', [], '封存')
  assert.equal(r.items.length, 0)
  assert.equal(r.okCount, 0)
  assert.equal(r.failCount, 0)
})

console.log(`\n全部 ${passed} 项撤牌域规则校验通过`)
