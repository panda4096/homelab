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
  CandlestickChart,
  ChartSpline,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleCheckBig,
  Coins,
  Columns3,
  GitCompareArrows,
  GripVertical,
  History,
  Info,
  Landmark,
  Layers,
  LayoutDashboard,
  ListChecks,
  Pencil,
  Plus,
  RefreshCw,
  Repeat,
  Repeat2,
  Scale,
  Settings,
  Sparkles,
  Table2,
  Target,
  Trash2,
  TrendingUp,
  TriangleAlert,
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
  'candlestick-chart': CandlestickChart,
  'chart-spline': ChartSpline,
  check: Check,
  'chevron-down': ChevronDown,
  'chevron-right': ChevronRight,
  'circle-alert': CircleAlert,
  'circle-check-big': CircleCheckBig,
  coins: Coins,
  'columns-3': Columns3,
  'git-compare-arrows': GitCompareArrows,
  'grip-vertical': GripVertical,
  history: History,
  info: Info,
  landmark: Landmark,
  layers: Layers,
  'layout-dashboard': LayoutDashboard,
  'list-checks': ListChecks,
  pencil: Pencil,
  plus: Plus,
  'refresh-cw': RefreshCw,
  repeat: Repeat,
  'repeat-2': Repeat2,
  scale: Scale,
  settings: Settings,
  sparkles: Sparkles,
  'table-2': Table2,
  target: Target,
  'trash-2': Trash2,
  'trending-up': TrendingUp,
  'triangle-alert': TriangleAlert,
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
