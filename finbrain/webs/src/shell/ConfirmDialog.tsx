import { Button, Icon } from '../ds'
import { Modal } from './Modal'

export interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'danger' | 'primary'
  pending?: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = '确认',
  cancelLabel = '取消',
  tone = 'danger',
  pending = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Modal
      title={title}
      icon={tone === 'danger' ? 'triangle-alert' : 'info'}
      width={420}
      onClose={pending ? () => undefined : onCancel}
      footer={
        <>
          <Button variant="ghost" size="sm" disabled={pending} onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            size="sm"
            disabled={pending}
            iconLeft={<Icon name="check" size={13} />}
            onClick={onConfirm}
          >
            {pending ? '处理中…' : confirmLabel}
          </Button>
        </>
      }
    >
      <div style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.7 }}>
        {message}
      </div>
    </Modal>
  )
}
