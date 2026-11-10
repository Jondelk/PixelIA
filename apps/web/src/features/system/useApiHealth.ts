import type { HealthResponse } from '@pixel/contracts';
import { useEffect, useState } from 'react';
import { fetchHealth } from '../../lib/api';

export type ApiHealthState =
  | { status: 'checking' }
  | { status: 'online' | 'degraded'; health: HealthResponse }
  | { status: 'offline' };

const POLL_INTERVAL_MS = 15_000;

/** Consulta /api/health periódicamente. */
export function useApiHealth(): ApiHealthState {
  const [state, setState] = useState<ApiHealthState>({ status: 'checking' });

  useEffect(() => {
    let controller = new AbortController();

    const check = async () => {
      controller.abort();
      controller = new AbortController();
      try {
        const health = await fetchHealth(controller.signal);
        setState({ status: health.status === 'ok' ? 'online' : 'degraded', health });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setState({ status: 'offline' });
      }
    };

    void check();
    const timer = window.setInterval(() => void check(), POLL_INTERVAL_MS);
    return () => {
      window.clearInterval(timer);
      controller.abort();
    };
  }, []);

  return state;
}
