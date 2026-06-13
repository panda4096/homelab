// Navigation config — ported verbatim from design/project/app/Shell.jsx (NAV)
// and the TITLES map in 「finbrain 控制台.html」.

export interface NavItem {
  id: string
  label: string
  icon: string
  accent?: boolean
}

export interface NavGroup {
  section: string
  items: NavItem[]
}

export const NAV: NavGroup[] = [
  {
    section: '概览',
    items: [
      { id: 'dashboard', label: '仪表盘', icon: 'layout-dashboard' },
      { id: 'holdings', label: '持仓总览', icon: 'trending-up' },
      { id: 'trend', label: '趋势分析', icon: 'chart-spline' },
      { id: 'compare', label: '期间对比', icon: 'git-compare-arrows' },
      { id: 'pivot', label: '多维聚合', icon: 'table-2' },
    ],
  },
  {
    section: '录入',
    items: [
      { id: 'review', label: '月度盘点', icon: 'list-checks', accent: true },
      { id: 'transactions', label: '持仓交易', icon: 'arrow-left-right' },
      { id: 'income', label: '收益事件', icon: 'coins' },
      { id: 'transfers', label: '账户转账', icon: 'repeat' },
      { id: 'corporate-actions', label: '公司动作', icon: 'git-fork' },
    ],
  },
  {
    section: '管理',
    items: [
      { id: 'accounts', label: '账户列表', icon: 'landmark' },
      { id: 'targets', label: '目标配置', icon: 'target' },
      { id: 'recon', label: '现金对账', icon: 'scale' },
      { id: 'market', label: '价格 / 汇率 / 基准', icon: 'candlestick-chart' },
      { id: 'settings', label: '设置', icon: 'settings' },
    ],
  },
]

export const TITLES: Record<string, string> = {
  dashboard: '仪表盘',
  holdings: '持仓总览',
  trend: '趋势分析',
  review: '月度盘点',
  compare: '期间对比',
  pivot: '多维聚合',
  transactions: '持仓交易',
  income: '收益事件',
  transfers: '账户转账',
  'corporate-actions': '公司动作',
  accounts: '账户列表',
  targets: '目标配置',
  recon: '现金对账',
  market: '价格 / 汇率 / 基准',
  settings: '设置',
}

// Flat lookup for the Placeholder icon (mirrors NAV.flatMap(...).find(...))
export const NAV_BY_ID: Record<string, NavItem> = Object.fromEntries(
  NAV.flatMap((g) => g.items).map((it) => [it.id, it]),
)
