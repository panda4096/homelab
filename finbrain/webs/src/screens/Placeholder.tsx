import { Badge, Card, Icon } from '../ds'
import { NAV_BY_ID, TITLES } from '../nav'

// Ported from the Placeholder component in 「finbrain 控制台.html」.
export function Placeholder({ id }: { id: string }) {
  const icon = NAV_BY_ID[id]?.icon ?? 'layout-dashboard'
  return (
    <div style={{ padding: 22, maxWidth: 1320, margin: '0 auto' }}>
      <Card>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '80px 24px',
            textAlign: 'center',
            gap: 14,
          }}
        >
          <div
            style={{
              width: 60,
              height: 60,
              borderRadius: '50%',
              background: 'var(--surface-inset)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name={icon} size={28} color="var(--text-secondary)" />
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 500, color: 'var(--text-strong)', margin: 0 }}>
            {TITLES[id]}
          </h2>
          <Badge tone="neutral">PRD §7</Badge>
        </div>
      </Card>
    </div>
  )
}
