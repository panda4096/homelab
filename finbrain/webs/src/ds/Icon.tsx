import type { CSSProperties } from 'react'
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Archive,
  ArchiveRestore,
  Badge as BadgeIcon,
  BadgeAlert,
  BadgeCheck,
  Bell,
  Building2,
  Calendar,
  CandlestickChart,
  ChartSpline,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleCheckBig,
  ClipboardCheck,
  Coins,
  Columns3,
  Copy,
  Download,
  GitCompareArrows,
  GitBranch,
  GripVertical,
  History,
  Info,
  Landmark,
  Layers,
  LayoutDashboard,
  ListChecks,
  LogIn,
  LogOut,
  Minus,
  Pencil,
  Plus,
  RefreshCw,
  Repeat,
  Repeat2,
  Receipt,
  Scale,
  SendHorizontal,
  Settings,
  Share2,
  Sparkles,
  Table2,
  Target,
  Trash2,
  TrendingUp,
  TriangleAlert,
  UserPlus,
  Wallet,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react'

const ICONS: Record<string, LucideIcon> = {
  'arrow-left': ArrowLeft,
  'arrow-left-right': ArrowLeftRight,
  'arrow-right': ArrowRight,
  archive: Archive,
  'archive-restore': ArchiveRestore,
  badge: BadgeIcon,
  'badge-alert': BadgeAlert,
  'badge-check': BadgeCheck,
  bell: Bell,
  'building-2': Building2,
  calendar: Calendar,
  'candlestick-chart': CandlestickChart,
  'chart-spline': ChartSpline,
  check: Check,
  'chevron-down': ChevronDown,
  'chevron-right': ChevronRight,
  'circle-alert': CircleAlert,
  'circle-check-big': CircleCheckBig,
  'clipboard-check': ClipboardCheck,
  coins: Coins,
  'columns-3': Columns3,
  copy: Copy,
  download: Download,
  'git-compare-arrows': GitCompareArrows,
  split: GitBranch,
  'grip-vertical': GripVertical,
  history: History,
  info: Info,
  landmark: Landmark,
  layers: Layers,
  'layout-dashboard': LayoutDashboard,
  'list-checks': ListChecks,
  'log-in': LogIn,
  'log-out': LogOut,
  minus: Minus,
  pencil: Pencil,
  plus: Plus,
  'refresh-cw': RefreshCw,
  repeat: Repeat,
  'repeat-2': Repeat2,
  receipt: Receipt,
  scale: Scale,
  'send-horizontal': SendHorizontal,
  send: SendHorizontal,
  settings: Settings,
  'share-2': Share2,
  sparkles: Sparkles,
  'table-2': Table2,
  target: Target,
  'trash-2': Trash2,
  'trending-up': TrendingUp,
  'triangle-alert': TriangleAlert,
  'user-plus': UserPlus,
  wallet: Wallet,
  x: X,
  zap: Zap,
}

export interface IconProps {
  name: string
  size?: number
  stroke?: number
  color?: string
  className?: string
  style?: CSSProperties
}

/**
 * Thin wrapper over lucide-react. Accepts the design's kebab-case icon names and
 * renders from an explicit allow-list so bundling stays tree-shakeable.
 */
export function Icon({ name, size = 16, stroke = 1.7, color, className, style }: IconProps) {
  const LucideIcon = ICONS[name]
  if (!LucideIcon) {
    return <span style={{ display: 'inline-block', width: size, height: size, ...style }} />
  }
  return (
    <LucideIcon
      width={size}
      height={size}
      strokeWidth={stroke}
      color={color}
      className={className}
      style={{ display: 'block', flex: 'none', ...style }}
    />
  )
}
