import { useState } from 'react';

/**
 * Small fixed badge showing the commit actually deployed to THIS page load — settles "is the
 * fix live yet?" confusion that came from a stale cached bundle looking identical to a fresh
 * one. __COMMIT_SHA__/__BUILD_TIME__ are injected at build time from Cloudflare Pages'
 * CF_PAGES_COMMIT_SHA env var (vite.config.ts) — no Pages project config needed.
 */
export default function DeployBadge() {
  const [expanded, setExpanded] = useState(false);
  const sha = __COMMIT_SHA__;
  const shortSha = sha === 'dev' ? 'dev' : sha.slice(0, 7);
  const buildTime = new Date(__BUILD_TIME__);
  const buildTimeLabel = isNaN(buildTime.getTime()) ? __BUILD_TIME__ : buildTime.toLocaleString();

  return (
    <button
      onClick={() => setExpanded((v) => !v)}
      className="fixed bottom-2 right-2 z-50 flex items-center gap-1.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-mono px-2.5 py-1 shadow-lg transition-colors"
      title="Click to see full deploy info"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-200" />
      {expanded ? (
        <span className="whitespace-nowrap">{sha} — built {buildTimeLabel}</span>
      ) : (
        <span>{shortSha}</span>
      )}
    </button>
  );
}
