import { Component, type ReactNode } from 'react'

interface State {
  error: Error | null
}

// Route-level error boundary so one screen throwing doesn't white-screen the app.
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error) {
    // eslint-disable-next-line no-console
    console.error('screen error', error)
  }

  reset = () => this.setState({ error: null })

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, maxWidth: 640, margin: '0 auto' }}>
          <div className="fb-card" style={{ padding: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-strong)', marginBottom: 8 }}>这个页面出错了</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)', marginBottom: 16, whiteSpace: 'pre-wrap' }}>{this.state.error.message}</div>
            <button className="fb-btn fb-btn--secondary fb-btn--sm" onClick={this.reset}>重试</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
