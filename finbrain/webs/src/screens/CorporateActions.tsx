import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, DateField, Field, Icon, IconButton, Input, Segmented } from '../ds'
import {
  createCorporateAction,
  deleteCorporateAction,
  listCorporateActions,
  listInstruments,
  updateCorporateAction,
  type CorporateAction,
  type CorporateActionKind,
  type CreateCorporateActionInput,
} from '../api'
import { ACCOUNT_CURRENCIES, todayISO } from '../lib/format'
import { Row, SectionHint, Td, Th } from '../lib/ui'
import { invalidatePortfolio } from '../lib/invalidate'
import { Modal } from '../shell/Modal'
import { useToast } from '../shell/Toast'
import { usePrefStore } from '../store'

const ACTION_LABEL: Record<CorporateActionKind, string> = { split: '拆股', merge: '合股', rights: '配股' }

function Page({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 22, maxWidth: 1100, margin: '0 auto' }}>{children}</div>
}

export function CorporateActions() {
  const [symbol, setSymbol] = useState('')
  const [editor, setEditor] = useState<{ item?: CorporateAction } | null>(null)
  const qc = useQueryClient()
  const toast = useToast()
  const actions = useQuery({ queryKey: ['corporate-actions', symbol], queryFn: () => listCorporateActions(symbol.trim() || undefined) })

  const remove = useMutation({
    mutationFn: deleteCorporateAction,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['corporate-actions'] })
      invalidatePortfolio(qc)
      toast.success('公司动作已删除')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '删除失败'),
  })

  return (
    <Page>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Input size="sm" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="按标的过滤" style={{ maxWidth: 200 }} />
        <Button variant="primary" size="sm" style={{ marginLeft: 'auto' }} iconLeft={<Icon name="plus" size={14} />} onClick={() => setEditor({})}>新增公司动作</Button>
      </div>
      <div className="fb-card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
          <thead><tr><Th>标的</Th><Th>类型</Th><Th>除权日</Th><Th>比例</Th><Th>备注</Th><Th w={88}></Th></tr></thead>
          <tbody>
            {(actions.data?.items ?? []).map((c) => (
              <Row key={c.id}>
                <Td mono color="var(--text-strong)">{c.symbol}</Td>
                <Td><Badge tone="neutral">{ACTION_LABEL[c.action] ?? c.action}</Badge></Td>
                <Td mono dim>{c.event_date}</Td>
                <Td mono>{c.ratio_numerator} : {c.ratio_denominator}</Td>
                <Td dim>{c.notes ?? '—'}</Td>
                <Td right>
                  <div style={{ display: 'inline-flex', gap: 4 }}>
                    <IconButton aria-label="编辑" size="sm" onClick={() => setEditor({ item: c })}><Icon name="pencil" size={13} /></IconButton>
                    <IconButton aria-label="删除" size="sm" onClick={() => { if (confirm('删除这条公司动作？')) remove.mutate(c.id) }}><Icon name="trash-2" size={13} /></IconButton>
                  </div>
                </Td>
              </Row>
            ))}
            {!actions.isLoading && !(actions.data?.items ?? []).length ? <tr><Td dim>暂无公司动作</Td></tr> : null}
          </tbody>
        </table>
      </div>
      <SectionHint>拆股 / 合股按比例调整持仓数量与加权成本、不回写已实现盈亏（§6.17）；配股按等价买入处理。删除即回滚该次调整。</SectionHint>
      {editor ? <CaModal item={editor.item} onClose={() => setEditor(null)} /> : null}
    </Page>
  )
}

function CaModal({ item, onClose }: { item?: CorporateAction; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const timezone = usePrefStore((s) => s.timezone)
  const instruments = useQuery({ queryKey: ['instruments'], queryFn: listInstruments })
  const [symbol, setSymbol] = useState(item?.symbol ?? '')
  const [action, setAction] = useState<CorporateActionKind>(item?.action ?? 'split')
  const [date, setDate] = useState(item?.event_date ?? todayISO(timezone))
  const [num, setNum] = useState(item?.ratio_numerator ?? '2')
  const [den, setDen] = useState(item?.ratio_denominator ?? '1')
  const extra = (item?.extra ?? {}) as Record<string, string>
  const [rightsPrice, setRightsPrice] = useState(extra.rights_price ?? '')
  const [baseRatio, setBaseRatio] = useState(extra.base_share_ratio ?? '')
  const [rightsCcy, setRightsCcy] = useState(extra.rights_currency ?? 'USD')
  const [notes, setNotes] = useState(item?.notes ?? '')
  const [touched, setTouched] = useState(false)

  const isRights = action === 'rights'

  const save = useMutation({
    mutationFn: () => {
      const body: CreateCorporateActionInput = isRights
        ? { symbol: symbol.trim().toUpperCase(), action, event_date: date, ratio_numerator: '1', ratio_denominator: '1', extra: { rights_price: rightsPrice.trim(), base_share_ratio: baseRatio.trim(), rights_currency: rightsCcy }, notes: notes.trim() || null }
        : { symbol: symbol.trim().toUpperCase(), action, event_date: date, ratio_numerator: num.trim(), ratio_denominator: den.trim(), notes: notes.trim() || null }
      return item ? updateCorporateAction(item.id, body) : createCorporateAction(body)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['corporate-actions'] })
      invalidatePortfolio(qc)
      toast.success(item ? '已更新' : '已记录')
      onClose()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '保存失败'),
  })

  const invalid = touched && (!symbol.trim() || (isRights ? (!rightsPrice.trim() || !baseRatio.trim()) : (!num.trim() || !den.trim())))

  return (
    <Modal
      title={item ? '编辑公司动作' : '新增公司动作'}
      icon="git-fork"
      onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>取消</Button><Button variant="primary" disabled={save.isPending} onClick={() => { setTouched(true); if (symbol.trim() && (isRights ? rightsPrice.trim() && baseRatio.trim() : num.trim() && den.trim())) save.mutate() }}>保存</Button></>}
    >
      <div style={{ marginBottom: 12 }}>
        <Segmented size="sm" value={action} onChange={(v) => setAction(v as CorporateActionKind)}
          options={[{ value: 'split', label: '拆股' }, { value: 'merge', label: '合股' }, { value: 'rights', label: '配股' }]} />
      </div>
      <div className="fb-form form-4">
        <Field label="标的" error={invalid && !symbol.trim() ? '必填' : undefined}>
          <Input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} disabled={!!item} list="fb-ca-instruments" placeholder="GOOG" />
          <datalist id="fb-ca-instruments">{(instruments.data ?? []).map((i) => <option key={i.symbol} value={i.symbol} />)}</datalist>
        </Field>
        <Field label="除权日"><DateField value={date} onChange={setDate} /></Field>
        {!isRights ? (
          <>
            <Field label={action === 'split' ? '拆为 (N)' : '合为 (1)'} error={invalid && !num.trim() ? '必填' : undefined}><Input numeric value={num} onChange={(e) => setNum(e.target.value)} /></Field>
            <Field label={action === 'split' ? '原 (1)' : '原 (N)'} error={invalid && !den.trim() ? '必填' : undefined}><Input numeric value={den} onChange={(e) => setDen(e.target.value)} /></Field>
          </>
        ) : (
          <>
            <Field label="配股价" error={invalid && !rightsPrice.trim() ? '必填' : undefined}><Input numeric value={rightsPrice} onChange={(e) => setRightsPrice(e.target.value)} placeholder="10.00" /></Field>
            <Field label="每股配股比例" error={invalid && !baseRatio.trim() ? '必填' : undefined}><Input numeric value={baseRatio} onChange={(e) => setBaseRatio(e.target.value)} placeholder="0.3" /></Field>
          </>
        )}
      </div>
      {isRights ? (
        <div className="fb-form form-4" style={{ marginTop: 12 }}>
          <Field label="配股币种"><Segmented size="sm" value={rightsCcy} onChange={setRightsCcy} options={ACCOUNT_CURRENCIES.map((c) => ({ value: c, label: c }))} /></Field>
        </div>
      ) : null}
      <div style={{ marginTop: 12 }}>
        <Field label="备注"><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="可留空" /></Field>
      </div>
    </Modal>
  )
}
