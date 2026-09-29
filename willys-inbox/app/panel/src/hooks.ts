import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import type { AppStateData } from "./types";

export function useAppData(pollMs = 10000): {
  state: AppStateData | null;
  error: string | null;
  reload: () => void;
} {
  const [state, setState] = useState<AppStateData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback((): void => {
    api
      .state()
      .then((s) => {
        setState(s as AppStateData);
        setError(null);
      })
      .catch((e: Error) =>
        setError(`${String(e.message ?? e)} [sida=${window.location.pathname}]`),
      );
  }, []);
  useEffect(() => {
    reload();
    const t = setInterval(reload, pollMs);
    return () => clearInterval(t);
  }, [reload, pollMs]);
  return { state, error, reload };
}

export type Notify = (msg: string) => void;

export function useToast(): { toast: string | null; notify: Notify } {
  const [toast, setToast] = useState<string | null>(null);
  const notify = useCallback((msg: string): void => {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2600);
  }, []);
  return { toast, notify };
}
