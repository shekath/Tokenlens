import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Keeps one broken tab from taking the app with it.
 *
 * React unmounts the whole tree when a render throws and nothing catches it,
 * which turned a failed chunk load into a blank page. A tab is exactly the
 * right size for a boundary: the dashboard, the header and everything the user
 * has typed stay where they are.
 */
export class TabBoundary extends Component<
  { children: ReactNode; label: string },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // The console is where this is diagnosed from a user's machine.
    console.error(`The ${this.props.label} tab failed to render`, error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="empty" role="alert">
        <p style={{ margin: 0, fontWeight: 600 }}>{this.props.label} could not be opened.</p>
        <p className="muted" style={{ fontSize: 12, margin: '6px 0 12px' }}>
          {error.message}
        </p>
        <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>
          Reload the page
        </button>
      </div>
    );
  }
}
