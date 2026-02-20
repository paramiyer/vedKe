import { Component, type ErrorInfo, type ReactNode } from "react";

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  hasError: boolean;
  message: string;
};

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false,
    message: ""
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      hasError: true,
      message: error.message
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Keep a console trail for local debugging.
    console.error("Unhandled app error:", error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <main style={{ padding: 20 }}>
          <h1>Frontend runtime error</h1>
          <pre style={{ whiteSpace: "pre-wrap" }}>{this.state.message}</pre>
          <p>Open browser DevTools Console for stack trace.</p>
        </main>
      );
    }
    return this.props.children;
  }
}
