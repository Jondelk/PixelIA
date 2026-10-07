import { Component, type ErrorInfo, type ReactNode } from 'react';

/** Muestra `fallback` si un hijo falla al renderizar (p. ej. WebGL no disponible). */
export class ErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('Fallo en un componente; se muestra la alternativa.', error, info.componentStack);
  }

  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
