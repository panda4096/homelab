import { icons, type LucideProps } from 'lucide-react'

// kebab-case -> PascalCase, matching lucide-react's `icons` export keys.
// e.g. "layout-dashboard" -> "LayoutDashboard"
function toPascal(name: string): string {
  return name
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('')
}

export interface IconProps {
  name: string
  size?: number
  stroke?: number
  color?: string
  className?: string
  style?: React.CSSProperties
}

/**
 * Thin wrapper over lucide-react. Accepts a kebab-case `name` (as the design's
 * window.FBIcon did) and renders the matching Lucide component. Falls back to a
 * blank box of the requested size when a name is unknown.
 */
export function Icon({ name, size = 16, stroke = 1.7, color, className, style }: IconProps) {
  const LucideIcon = (icons as Record<string, React.ComponentType<LucideProps>>)[toPascal(name)]
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
