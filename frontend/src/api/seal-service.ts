import { persistSeals, resetSeals, sealState } from '@/data/seal-store'
import type {
  BatchDecisionItem,
  BatchDecisionResult,
  RecycleCandidate,
  SealCredential,
  SealLedgerEntry,
} from '@/data/types'

// 策略撤牌域服务：章号是唯一凭据，一切交叉操作以章号裁定；同一动作重放不增副作用。

function now(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}:${pad(d.getSeconds())}`
}

/** 动作幂等键：同章、同动作、同对象，重放只回放账本里的原结果。 */
function actionKey(action: string, sealNo: string, subject: string): string {
  return `${sealNo}｜${action}｜${subject}`
}

function replay(entry: SealLedgerEntry): { ok: boolean; code: string; message: string } {
  return { ok: entry.ok, code: entry.code, message: `${entry.message}（重放，无新增副作用）` }
}

export function listSeals(): SealCredential[] {
  return sealState().seals
}

export function listCandidates(policyCode?: string): RecycleCandidate[] {
  const all = sealState().candidates
  return policyCode ? all.filter((item) => item.policyCode === policyCode) : all
}

export function listLedger(): SealLedgerEntry[] {
  return sealState().ledger
}

/** 当前章：治理、分区、概览只认这一枚；没有生效章时返回 null（旧结论一律不采信）。 */
export function currentSeal(policyCode: string): SealCredential | null {
  return (
    sealState().seals.find(
      (seal) => seal.policyCode === policyCode && seal.state === '生效中',
    ) ?? null
  )
}

/** 存档只读区：所有已撤牌的历史章。 */
export function archivedSeals(policyCode?: string): SealCredential[] {
  return sealState().seals.filter(
    (seal) => seal.state === '已撤牌' && (!policyCode || seal.policyCode === policyCode),
  )
}

function record(
  data: ReturnType<typeof sealState>,
  entry: Omit<SealLedgerEntry, 'at'>,
): SealLedgerEntry {
  const full: SealLedgerEntry = { ...entry, at: now() }
  data.ledger.unshift(full)
  return full
}

/**
 * 撤牌：未执行候选全部失效、异常牌收回、历史凭据转只读。
 * 已撤牌再撤是同一动作重放，返回原裁决、不再产生副作用。
 */
export function revokeSeal(sealNo: string, reason: string): {
  ok: boolean
  code: string
  message: string
} {
  const data = sealState()
  const key = actionKey('撤牌', sealNo, '*')
  const existed = data.ledger.find((entry) => entry.actionKey === key)
  if (existed) {
    return replay(existed)
  }

  const seal = data.seals.find((item) => item.sealNo === sealNo)
  if (!seal) {
    const entry = record(data, { actionKey: key, action: '撤牌', sealNo, ok: false, code: 'SEAL_NOT_FOUND', message: `章 ${sealNo} 不存在` })
    persistSeals(data)
    return replay(entry)
  }
  if (seal.state === '已撤牌') {
    const entry = record(data, { actionKey: key, action: '撤牌', sealNo, ok: false, code: 'SEAL_ALREADY_REVOKED', message: `章 ${sealNo} 已撤牌，不能重复撤牌` })
    persistSeals(data)
    return replay(entry)
  }

  seal.state = '已撤牌'
  seal.revokedAt = now()
  seal.revokeReason = reason.trim() || '治理策略撤牌'

  // 未执行候选随章一起失效；已经裁决过的历史结果保留只读，不被改写。
  let invalidated = 0
  for (const candidate of data.candidates) {
    if (candidate.sealNo === sealNo && candidate.state === '未执行') {
      candidate.state = '已失效'
      candidate.decidedAt = now()
      candidate.resultCode = 'SEAL_REVOKED'
      invalidated += 1
    }
  }

  const entry = record(data, {
    actionKey: key,
    action: '撤牌',
    sealNo,
    ok: true,
    code: 'SEAL_REVOKED',
    message: `章 ${sealNo} 已撤牌，${invalidated} 条未执行候选全部失效，历史凭据转只读`,
  })
  persistSeals(data)
  return replay(entry)
}

/**
 * 再次启用：必须领新章，按版本递增签发；旧章保持已撤牌，旧名单不会被复活。
 */
export function issueNewSeal(policyCode: string): {
  ok: boolean
  code: string
  message: string
  sealNo?: string
} {
  const data = sealState()
  const versions = data.seals
    .filter((seal) => seal.policyCode === policyCode)
    .map((seal) => seal.version)
  const nextVersion = (versions.length ? Math.max(...versions) : 0) + 1
  const sealNo = `${policyCode}/章-V${nextVersion}`
  const key = actionKey('领章', sealNo, '*')

  const existed = data.ledger.find((entry) => entry.actionKey === key)
  if (existed) {
    return { ...replay(existed), sealNo }
  }

  // 同一策略只允许一枚生效章：已有生效章时拒绝，避免双章并行。
  const active = data.seals.find(
    (seal) => seal.policyCode === policyCode && seal.state === '生效中',
  )
  if (active) {
    const entry = record(data, { actionKey: key, action: '领章', sealNo, ok: false, code: 'ACTIVE_SEAL_EXISTS', message: `${policyCode} 已有生效章 ${active.sealNo}，不能重复领章` })
    persistSeals(data)
    return { ...replay(entry), sealNo: undefined }
  }

  const credential: SealCredential = {
    sealNo,
    policyCode,
    version: nextVersion,
    state: '生效中',
    issuedAt: now(),
    revokedAt: '',
    revokeReason: '',
  }
  data.seals.push(credential)
  const entry = record(data, { actionKey: key, action: '领章', sealNo, ok: true, code: 'SEAL_ISSUED', message: `${policyCode} 重新启用，已领新章 ${sealNo}，旧名单不可复活` })
  persistSeals(data)
  return { ...replay(entry), sealNo }
}

/**
 * 生成新封存名单：只允许当前生效章签发。持旧章/已撤牌章生成一律拒绝（以章号裁定）。
 */
export function generateSealList(
  policyCode: string,
  objects: { objectName: string; reason: string }[],
): { ok: boolean; code: string; message: string } {
  const data = sealState()
  const seal = currentSeal(policyCode)
  if (!seal) {
    const key = actionKey('生成名单', policyCode, '无生效章')
    const entry = record(data, { actionKey: key, action: '生成名单', sealNo: policyCode, ok: false, code: 'NO_ACTIVE_SEAL', message: `${policyCode} 没有生效章，不能生成名单，请先领新章` })
    persistSeals(data)
    return replay(entry)
  }

  const subject = objects.map((item) => item.objectName).sort().join(',')
  const key = actionKey('生成名单', seal.sealNo, subject)
  const existed = data.ledger.find((entry) => entry.actionKey === key)
  if (existed) {
    return replay(existed)
  }

  for (const item of objects) {
    data.candidates.push({
      id: data.nextCandidateId,
      policyCode,
      sealNo: seal.sealNo,
      objectName: item.objectName,
      reason: item.reason,
      state: '未执行',
      createdAt: now(),
      decidedAt: '',
      resultCode: '',
    })
    data.nextCandidateId += 1
  }

  const entry = record(data, { actionKey: key, action: '生成名单', sealNo: seal.sealNo, ok: true, code: 'LIST_GENERATED', message: `当前章 ${seal.sealNo} 生成 ${objects.length} 条回收候选` })
  persistSeals(data)
  return replay(entry)
}

/**
 * 释放台批量裁决：框选/全选后逐条返回成功码。
 * 只处理传入 id 范围内且仍「未执行」、且归属当前生效章的候选；范围外候选不参与整组结果。
 */
export function adjudicateBatch(
  policyCode: string,
  ids: number[],
  decision: '封存' | '释放',
): BatchDecisionResult {
  const data = sealState()
  const seal = currentSeal(policyCode)
  const scope = new Set(ids)
  const items: BatchDecisionItem[] = []
  let okCount = 0
  let failCount = 0

  // 以传入范围为整组边界，逐条裁定，互不影响。
  for (const candidate of data.candidates) {
    if (!scope.has(candidate.id)) {
      continue
    }
    const key = actionKey(decision, candidate.sealNo, String(candidate.id))
    const existed = data.ledger.find((entry) => entry.actionKey === key)
    if (existed) {
      items.push({ candidateId: candidate.id, ok: existed.ok, code: existed.code, message: replay(existed).message })
      existed.ok ? (okCount += 1) : (failCount += 1)
      continue
    }

    if (!seal || candidate.sealNo !== seal.sealNo) {
      const entry = record(data, { actionKey: key, action: decision, sealNo: candidate.sealNo, ok: false, code: 'STALE_SEAL_REJECTED', message: `候选 ${candidate.id} 归属旧章 ${candidate.sealNo}，当前章不采信，禁止借旧名单裁决` })
      items.push({ candidateId: candidate.id, ok: false, code: entry.code, message: replay(entry).message })
      failCount += 1
      continue
    }
    if (candidate.state !== '未执行') {
      const entry = record(data, { actionKey: key, action: decision, sealNo: candidate.sealNo, ok: false, code: 'CANDIDATE_NOT_PENDING', message: `候选 ${candidate.id} 已处于「${candidate.state}」，不能重复裁决` })
      items.push({ candidateId: candidate.id, ok: false, code: entry.code, message: replay(entry).message })
      failCount += 1
      continue
    }

    const targetState = decision === '封存' ? '已封存' : '已释放'
    const okCode = decision === '封存' ? 'SEALED_OK' : 'RELEASED_OK'
    candidate.state = targetState
    candidate.decidedAt = now()
    candidate.resultCode = okCode
    const entry = record(data, { actionKey: key, action: decision, sealNo: candidate.sealNo, ok: true, code: okCode, message: `候选 ${candidate.id}（${candidate.objectName}）已${decision}，章号 ${candidate.sealNo}` })
    items.push({ candidateId: candidate.id, ok: true, code: entry.code, message: replay(entry).message })
    okCount += 1
  }

  persistSeals(data)
  return { items, okCount, failCount, sealNo: seal?.sealNo ?? '' }
}

export function resetSealDomain(): void {
  resetSeals()
}
