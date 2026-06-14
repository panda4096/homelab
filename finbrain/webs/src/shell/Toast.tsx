import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Icon } from '../ds'

type ToastTone = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  tone: ToastTone
  message: string
}

interface ToastApi {
  push: (message: string, tone?: ToastTone) => void
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

type ToastGlobal = typeof globalThis & {
  __finbrainToastCtx?: ReturnType<typeof createContext<ToastApi | null>>
}

const toastGlobal = globalThis as ToastGlobal
const ToastCtx = toastGlobal.__finbrainToastCtx ?? (toastGlobal.__finbrainToastCtx = createContext<ToastApi | null>(null))

export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx)
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>')
  return ctx
}

const TONE_META: Record<ToastTone, { icon: string; color: string }> = {
  success: { icon: 'circle-check-big', color: 'var(--gain)' },
  error: { icon: 'circle-alert', color: 'var(--danger)' },
  info: { icon: 'info', color: 'var(--accent)' },
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const seq = useRef(0)

  const remove = useCallback((id: number) => {
    setItems((xs) => xs.filter((x) => x.id !== id))
  }, [])

  const push = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      const id = ++seq.current
      setItems((xs) => [...xs, { id, tone, message }])
      window.setTimeout(() => remove(id), 4500)
    },
    [remove],
  )

  const api = useMemo<ToastApi>(
    () => ({
      push,
      success: (m) => push(m, 'success'),
      error: (m) => push(m, 'error'),
      info: (m) => push(m, 'info'),
    }),
    [push],
  )

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div
        style={{
          position: 'fixed',
          right: 18,
          bottom: 18,
          zIndex: 80,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          maxWidth: 'min(92vw, 420px)',
        }}
      >
        {items.map((t) => {
          const meta = TONE_META[t.tone]
          return (
            <div
              key={t.id}
              role="status"
              className="fb-card fb-fade"
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                padding: '12px 14px',
                boxShadow: 'var(--shadow-lg)',
              }}
            >
              <Icon name={meta.icon} size={16} color={meta.color} style={{ marginTop: 1 }} />
              <span style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5, flex: 1 }}>
                {t.message}
              </span>
              <button
                aria-label="关闭"
                onClick={() => remove(t.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-tertiary)',
                  padding: 0,
                  display: 'inline-flex',
                }}
              >
                <Icon name="x" size={14} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastCtx.Provider>
  )
}
