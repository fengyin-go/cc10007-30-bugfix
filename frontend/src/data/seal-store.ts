import type { RecycleCandidate, SealCredential, SealLedgerEntry } from './types'

// 策略撤牌域的本地持久化：与业务条目分开存，避免污染既有模块清单。
const SEAL_STORAGE_KEY = 'data-layer-studio:seals'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/** 初始局面：GOV-0001 的首枚章已撤牌，但封存名单还挂着、异常牌未撤。 */
function buildSeed(): SealStoreData {
  const revokedAt = '2026-11-10 09:20:00'
  const seals: SealCredential[] = [
    {
      sealNo: 'GOV-0001/章-V1',
      policyCode: 'GOV-0001',
      version: 1,
      state: '已撤牌',
      issuedAt: '2026-11-01 10:00:00',
      revokedAt,
      revokeReason: '生命周期口径调整，旧保护结论失效',
    },
  ]
  const candidates: RecycleCandidate[] = [
    {
      id: 101,
      policyCode: 'GOV-0001',
      sealNo: 'GOV-0001/章-V1',
      objectName: 'dwd_order_hist_2025q3',
      reason: '冷数据超过生命周期 365 天',
      state: '未执行',
      createdAt: '2026-11-02 11:00:00',
      decidedAt: '',
      resultCode: '',
    },
    {
      id: 102,
      policyCode: 'GOV-0001',
      sealNo: 'GOV-0001/章-V1',
      objectName: 'dwd_pay_detail_2025q3',
      reason: '冷热判定字段标记为冷数据',
      state: '未执行',
      createdAt: '2026-11-02 11:05:00',
      decidedAt: '',
      resultCode: '',
    },
    {
      id: 103,
      policyCode: 'GOV-0001',
      sealNo: 'GOV-0001/章-V1',
      objectName: 'dwd_user_event_2025q2',
      reason: '回收站保留到期',
      state: '未执行',
      createdAt: '2026-11-03 08:30:00',
      decidedAt: '',
      resultCode: '',
    },
  ]
  return { seals, candidates, ledger: [], nextCandidateId: 200 }
}

export type SealStoreData = {
  seals: SealCredential[]
  candidates: RecycleCandidate[]
  ledger: SealLedgerEntry[]
  nextCandidateId: number
}

let cache: SealStoreData | null = null

/**
 * 失效章回收：任何仍「未执行」、但归属章已不是生效章的候选，
 * 一律收敛为「已失效」。旧客户端里挂着的封存名单在首次加载时自愈，
 * 不会再被当成可裁决对象借旧名单复活。
 */
function reconcile(data: SealStoreData): boolean {
  const activeSealNos = new Set(
    data.seals.filter((seal) => seal.state === '生效中').map((seal) => seal.sealNo),
  )
  let changed = false
  for (const candidate of data.candidates) {
    if (candidate.state === '未执行' && !activeSealNos.has(candidate.sealNo)) {
      const seal = data.seals.find((item) => item.sealNo === candidate.sealNo)
      candidate.state = '已失效'
      candidate.decidedAt = seal?.revokedAt || candidate.createdAt
      candidate.resultCode = 'SEAL_REVOKED'
      changed = true
    }
  }
  return changed
}

function readStorage(): SealStoreData {
  const fallback = buildSeed()
  if (typeof window === 'undefined' || !window.localStorage) {
    reconcile(fallback)
    return fallback
  }
  const raw = window.localStorage.getItem(SEAL_STORAGE_KEY)
  if (!raw) {
    reconcile(fallback)
    window.localStorage.setItem(SEAL_STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
  try {
    const parsed = JSON.parse(raw) as SealStoreData
    const data: SealStoreData = {
      seals: parsed.seals ?? clone(fallback.seals),
      candidates: parsed.candidates ?? clone(fallback.candidates),
      ledger: parsed.ledger ?? [],
      nextCandidateId: parsed.nextCandidateId ?? fallback.nextCandidateId,
    }
    if (reconcile(data)) {
      window.localStorage.setItem(SEAL_STORAGE_KEY, JSON.stringify(data))
    }
    return data
  } catch {
    reconcile(fallback)
    window.localStorage.setItem(SEAL_STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
}

export function sealState(): SealStoreData {
  if (cache === null) {
    cache = readStorage()
  }
  return cache
}

export function persistSeals(data: SealStoreData): void {
  cache = data
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(SEAL_STORAGE_KEY, JSON.stringify(data))
  }
}

export function resetSeals(): SealStoreData {
  const fresh = buildSeed()
  persistSeals(fresh)
  return fresh
}

export function sealStorageKey(): string {
  return SEAL_STORAGE_KEY
}
