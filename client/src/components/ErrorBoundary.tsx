import { Component, type ErrorInfo, type ReactNode } from 'react';
import ErrorPage, { isOldVersion } from '../pages/ErrorPage.tsx';

// If a page breaks while showing (a bug, or a part of an older version of the
// site that's no longer there), the error page takes its place instead of a
// blank screen. The header and footer stay, and going to another page
// starts afresh (the layout gives each page its own boundary).
export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  override state: { error: unknown } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('A page broke:', error, info.componentStack);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return <ErrorPage code={isOldVersion(this.state.error) ? 'update' : 'crash'} />;
  }
}
