import { useEffect, useState } from "react";
import { fetchClaudeLimits, type ClaudeLimits } from "../../services/api/claudeUsage";

const INTERVAL_MS = 60_000;

/** The Claude limits for the overview, read once a minute; null until the first read. */
export function useClaudeLimits(): ClaudeLimits | null {
  const [limits, setLimits] = useState<ClaudeLimits | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let stopped = false;
    const pull = async () => {
      const response = await fetchClaudeLimits({ signal: controller.signal }).catch(() => null);
      if (!stopped && response?.ok) setLimits(response.result);
    };
    void pull();
    const timer = window.setInterval(() => {
      if (!document.hidden) void pull();
    }, INTERVAL_MS);
    return () => {
      stopped = true;
      controller.abort();
      window.clearInterval(timer);
    };
  }, []);
  return limits;
}
