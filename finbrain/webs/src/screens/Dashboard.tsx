import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Badge, Button, Card, Icon } from '../ds'
import { listAccountTemplates, listAccounts, type AccountTemplate } from '../api'
import { KIND_LABEL } from '../lib/format'
import { useUiStore } from '../uiStore'

export function Dashboard() {
  const navigate = useNavigate()
  const openBuild = useUiStore((s) => s.openBuild)

  const { data: accounts = [], isLoading: accountsLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: listAccounts,
  })
  const hasAccounts = accounts.length > 0

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        padding: 22,
        maxWidth: 1320,
        margin: '0 auto',
      }}
    >
      <Card padded={false}>
        <div style={{ display: 'flex', gap: 18, padding: '28px 26px', alignItems: 'flex-start' }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              background: 'var(--gradient-gold)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-text)',
              flex: 'none',
            }}
          >
            <Icon name="sparkles" size={26} color="var(--accent-text)" />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="fb-card__eyebrow">WELCOME</div>
            <h2
              style={{
                fontSize: 22,
                fontWeight: 500,
                color: 'var(--text-strong)',
                margin: '2px 0 8px',
              }}
            >
              欢迎使用 finbrain
            </h2>
            {hasAccounts ? (
              <>
                <p
                  style={{
                    fontSize: 13.5,
                    color: 'var(--text-secondary)',
                    lineHeight: 1.7,
                    margin: 0,
                    maxWidth: 640,
                  }}
                >
                  已记录 {accounts.length} 个账户。可在「账户列表」更新余额 / 持仓。
                  净资产、配置图表等仪表盘数据将在 P2 点亮。
                </p>
                <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                  <Button
                    variant="primary"
                    size="sm"
                    iconLeft={<Icon name="landmark" size={14} />}
                    onClick={() => navigate('/accounts')}
                  >
                    查看账户列表
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    iconLeft={<Icon name="plus" size={14} />}
                    onClick={openBuild}
                  >
                    新增账户
                  </Button>
                  <Badge tone="neutral">P2 将点亮净资产 / 图表</Badge>
                </div>
              </>
            ) : (
              <>
                <p
                  style={{
                    fontSize: 13.5,
                    color: 'var(--text-secondary)',
                    lineHeight: 1.7,
                    margin: 0,
                    maxWidth: 640,
                  }}
                >
                  一个自托管的个人资产管理控制台 —— 多机构、多币种、单用户。
                  {accountsLoading ? ' 正在检查账户…' : ' 当前还没有任何账户。'}
                  可以从内置模板快速建账，或手动添加单个账户，然后开始更新余额 / 持仓。
                </p>
                <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                  <Button
                    variant="primary"
                    size="sm"
                    iconLeft={<Icon name="plus" size={14} />}
                    onClick={openBuild}
                  >
                    新增账户
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </Card>

      {!hasAccounts ? <TemplatesPreview onBuild={openBuild} /> : null}
    </div>
  )
}

function TemplatesPreview({ onBuild }: { onBuild: () => void }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['account-templates'],
    queryFn: listAccountTemplates,
  })

  return (
    <Card
      eyebrow="QUICK START"
      title="内置建账模板"
      subtitle="一键创建一组关联账户"
      actions={
        <Button variant="secondary" size="sm" iconLeft={<Icon name="plus" size={13} />} onClick={onBuild}>
          新增账户
        </Button>
      }
    >
      {isLoading ? (
        <div style={{ fontSize: 13, color: 'var(--text-tertiary)', padding: '8px 0' }}>
          加载模板中…
        </div>
      ) : isError ? (
        <div style={{ fontSize: 13, color: 'var(--text-tertiary)', padding: '8px 0' }}>
          无法加载模板（后端未连接）。启动后端服务后可见内置模板。
        </div>
      ) : (
        <div className="fb-grid kpi-4" style={{ display: 'grid', gap: 14 }}>
          {(data ?? []).map((tpl: AccountTemplate) => (
            <div
              key={tpl.id}
              style={{
                background: 'var(--surface-inset)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                padding: 14,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="layers" size={15} color="var(--accent)" />
                <span style={{ fontSize: 13.5, color: 'var(--text-strong)', fontWeight: 500 }}>
                  {tpl.name}
                </span>
                {tpl.is_builtin ? <Badge tone="gold">内置</Badge> : null}
              </div>
              {tpl.description ? (
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
                  {tpl.description}
                </div>
              ) : null}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 'auto' }}>
                {tpl.account_blueprints.map((bp, i) => (
                  <span key={i} className="fb-tag" style={{ fontSize: 11 }}>
                    {bp.name_suffix}
                    <span style={{ color: 'var(--text-tertiary)', marginLeft: 4 }}>
                      {KIND_LABEL[bp.kind] ?? bp.kind} · {bp.currency}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
