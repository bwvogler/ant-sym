import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Whatever throws while the page renders (a bad save, a bug) shows what broke and a way back, rather than a blank page
 * (PR #42 review, B3). Saved games are kept: reloading starts at the start screen, where Continue offers the newest
 * save this version can read.
 */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div role="alert" className="mx-auto mt-16 max-w-lg px-4 text-sm text-fg">
        <h1 className="text-lg font-semibold">Something broke</h1>
        <p className="mt-2 text-fg-2">The game stopped with an error. Your saved games are kept.</p>
        <pre className="mt-3 overflow-x-auto rounded-md border border-line bg-raised p-2 text-xs text-fg-3">{error.message}</pre>
        <button type="button" className="mt-4 rounded-md bg-accent px-4 py-2 font-medium text-accent-ink hover:bg-accent-hover" onClick={() => location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}
