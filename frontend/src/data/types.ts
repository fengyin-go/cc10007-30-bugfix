/** 纯前端数据层的公共类型：与全栈版后端返回的结构保持一致，换回后端时页面不用改。 */

export type EntryRow = {
  id: number
  status: string
  pending: boolean
  abnormal: boolean
  [field: string]: string | number | boolean
}

export type ModuleMeta = {
  key: string
  name: string
  entity: string
  desc: string
  fields: string[]
  statuses: string[]
  actions: string[]
  actionTargets: Record<string, string>
  metrics: string[]
}

export type PageResult = {
  items: EntryRow[]
  total: number
  page: number
  size: number
}

export type ActionResult = {
  ok: boolean
  message: string
}

export type OverviewResult = {
  cards: { label: string; value: number }[]
  modules: { name: string; created: number; pending: number; abnormal: number }[]
}

/** 凭据章状态：生效中才是「当前章」，撤牌后一律进存档只读区。 */
export type SealState = '生效中' | '已撤牌'

/** 回收候选的处置状态：未执行可裁决；已裁决或因章失效而失效的，都不能再借旧名单复活。 */
export type CandidateState = '未执行' | '已封存' | '已释放' | '已失效'

/** 治理策略保护章：每个版本一枚章，章号即版本凭据。 */
export type SealCredential = {
  sealNo: string
  policyCode: string
  version: number
  state: SealState
  issuedAt: string
  revokedAt: string
  /** 撤牌原因（历史凭据只读留痕）。 */
  revokeReason: string
}

/** 存储治理策略下挂的回收候选（封存名单的一行）。 */
export type RecycleCandidate = {
  id: number
  policyCode: string
  /** 名单由哪一枚章签发：交叉操作一律以章号裁定。 */
  sealNo: string
  objectName: string
  reason: string
  state: CandidateState
  createdAt: string
  decidedAt: string
  /** 最近一次裁决码，逐条返回。 */
  resultCode: string
}

/** 动作账本：同一动作重放直接回放原结果，不产生新的副作用。 */
export type SealLedgerEntry = {
  actionKey: string
  action: string
  sealNo: string
  ok: boolean
  code: string
  message: string
  at: string
}

export type BatchDecisionItem = {
  candidateId: number
  ok: boolean
  code: string
  message: string
}

export type BatchDecisionResult = {
  /** 只覆盖本次多选范围内的候选，范围外候选不参与整组结果。 */
  items: BatchDecisionItem[]
  okCount: number
  failCount: number
  sealNo: string
}
