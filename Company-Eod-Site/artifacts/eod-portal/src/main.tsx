import { Component, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";

// Configure API base URL to point to backend server
setBaseUrl("http://localhost:8080");
setAuthTokenGetter(() => localStorage.getItem("auth_token"));

class PortalErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Portal rendering error", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <section className="w-full max-w-lg rounded-lg border border-red-200 bg-white p-6 shadow-sm">
            <h1 className="text-xl font-semibold text-slate-900">Portal could not load</h1>
            <p className="mt-2 text-sm text-slate-600">Please refresh the page. If the issue continues, the technical details below will help us fix it.</p>
            <pre className="mt-4 overflow-auto rounded bg-red-50 p-3 text-xs text-red-700">{this.state.error.message}</pre>
            <button className="mt-5 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white" onClick={() => window.location.reload()}>Refresh portal</button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <PortalErrorBoundary>
    <App />
  </PortalErrorBoundary>,
);

