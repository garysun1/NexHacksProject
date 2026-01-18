import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Play, Square, Clock, History, Brain, Sun, Moon } from "lucide-react";

// ---------- Utility helpers ----------
function classNames(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const hh = hours.toString().padStart(2, "0");
  const mm = minutes.toString().padStart(2, "0");
  const ss = seconds.toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

// ---------- Faux data ----------
const seedSessions = [
  {
    id: "s-104",
    title: "Deep work: sprint planning notes",
    startedAt: Date.now() - 1000 * 60 * 60 * 4 - 1000 * 60 * 10,
    endedAt: Date.now() - 1000 * 60 * 60 * 2 - 1000 * 60 * 37,
    tags: ["docs", "planning"],
    highlights: [
      "Summarized stakeholder inputs",
      "Auto-captured edits in Spec_v3.md",
      "Generated task list",
    ],
  },
  {
    id: "s-103",
    title: "Code focus: vector search POC",
    startedAt: Date.now() - 1000 * 60 * 60 * 26,
    endedAt: Date.now() - 1000 * 60 * 60 * 23 - 1000 * 60 * 12,
    tags: ["coding", "prototype"],
    highlights: [
      "Benchmarked kNN top-k=50",
      "Flagged memory spike in worker",
      "Saved log snapshot",
    ],
  },
  {
    id: "s-102",
    title: "Design review prep",
    startedAt: Date.now() - 1000 * 60 * 60 * 48 - 1000 * 60 * 34,
    endedAt: Date.now() - 1000 * 60 * 60 * 46 - 1000 * 60 * 2,
    tags: ["design", "slides"],
    highlights: [
      "Drafted outline in slides",
      "Pulled latest metrics",
      "Generated talking points",
    ],
  },
];

// ---------- Re-usable UI bits ----------
const GlassCard: React.FC<React.PropsWithChildren<{ className?: string; interactive?: boolean }>> = ({ className, interactive, children }) => (
  <div
    style={{
      backdropFilter: "blur(24px) saturate(200%)",
      WebkitBackdropFilter: "blur(24px) saturate(200%)",
    }}
    className={classNames(
      "relative overflow-hidden rounded-2xl p-4 sm:p-6 lg:p-8",
      "transform-gpu will-change-[transform,backdrop-filter]",
      // same liquid-glass base as menu islands
      "bg-white/18 dark:bg-white/[0.06]",
      "backdrop-blur-2xl backdrop-saturate-200",
      "ring-1 ring-white/35 dark:ring-white/10",
      "shadow-[0_14px_40px_rgba(0,0,0,0.10)] dark:shadow-[0_18px_55px_rgba(0,0,0,0.35)]",
      interactive && "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_55px_rgba(0,0,0,0.14)] dark:hover:shadow-[0_22px_70px_rgba(0,0,0,0.45)]",
      className
    )}
  >
    {/* specular / liquid highlight */}
    <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-white/80 via-white/22 to-white/5 opacity-60 dark:from-white/18 dark:via-white/8 dark:to-transparent" />
    {/* curved liquid sheen */}
    <div
      className="pointer-events-none absolute -top-10 left-10 h-28 w-72 rounded-full bg-white/60 blur-3xl opacity-30 dark:bg-white/18 dark:opacity-22"
      style={{ transform: "rotate(-10deg)" }}
    />
    {/* inner rim shine */}
    <div className="pointer-events-none absolute inset-0 rounded-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.65),inset_0_-1px_0_rgba(255,255,255,0.14)]" />
    <div className="relative">{children}</div>
  </div>
);
const Pill: React.FC<React.PropsWithChildren<{ glow?: boolean; className?: string }>> = ({ glow, className, children }) => (
  <span
    className={classNames(
      "inline-flex items-center justify-center gap-1 rounded-full px-3 py-1 text-xs font-semibold",
      "bg-slate-100 text-slate-800 ring-1 ring-slate-300",
      // Dark mode: make pill darker than the card (no washed-out gray)
      "dark:bg-slate-900/60 dark:text-white dark:ring-white/20",
      className
    )}
  >
    {children}
  </span>
);

const GlassIsland: React.FC<React.PropsWithChildren<{ className?: string }>> = ({ className, children }) => (
  <div
    style={{
      backdropFilter: "blur(24px) saturate(200%)",
      WebkitBackdropFilter: "blur(24px) saturate(200%)",
    }}
    className={classNames(
      "relative rounded-2xl",
      "transform-gpu will-change-[transform,backdrop-filter]",
      // true translucency + blur
      "bg-white/18 dark:bg-white/[0.06]",
      "backdrop-blur-2xl backdrop-saturate-200",
      // soft outer edge + depth
      "ring-1 ring-white/35 dark:ring-white/10",
      "shadow-[0_14px_40px_rgba(0,0,0,0.10)] dark:shadow-[0_18px_55px_rgba(0,0,0,0.35)]",
      className
    )}
  >
    {/* specular / liquid highlight */}
    <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-white/80 via-white/22 to-white/5 opacity-60 dark:from-white/18 dark:via-white/8 dark:to-transparent" />
    {/* curved "liquid" sheen */}
    <div
      className="pointer-events-none absolute -top-6 left-6 h-20 w-44 rounded-full bg-white/60 blur-2xl opacity-35 dark:bg-white/20 dark:opacity-25"
      style={{ transform: "rotate(-12deg)" }}
    />
    {/* inner rim shine */}
    <div className="pointer-events-none absolute inset-0 rounded-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.65),inset_0_-1px_0_rgba(255,255,255,0.14)]" />
    <div className="relative">{children}</div>
  </div>
);

// ---------- Main component ----------
export default function AgentWorkSessionUI() {
  const [isActive, setIsActive] = useState(false);
  const [startAt, setStartAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const [sessions, setSessions] = useState(seedSessions);
  const [page, setPage] = useState<"about" | "workflows" | "flow">("flow");

  const [isDark, setIsDark] = useState(() => {
    if (typeof window === "undefined") return true;
    const saved = window.localStorage.getItem("wm-theme");
    if (saved) return saved === "dark";
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  });


  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add("dark");
      window.localStorage.setItem("wm-theme", "dark");
    } else {
      root.classList.remove("dark");
      window.localStorage.setItem("wm-theme", "light");
    }
  }, [isDark]);

  useEffect(() => {
    if (!isActive || !startAt) return;
    const id = setInterval(() => setElapsed(Date.now() - startAt), 250);
    return () => clearInterval(id);
  }, [isActive, startAt]);

  const canStart = !isActive;
  const canStop = isActive;

  const handleStart = () => {
    if (isActive) return;
    setIsActive(true);
    const now = Date.now();
    setStartAt(now);
    setElapsed(0);
  };

  const handleStop = () => {
    if (!isActive || !startAt) return;
    const endedAt = Date.now();
    const newSession = {
      id: `s-${Math.random().toString(36).slice(2, 7)}`,
      title: "Focused session",
      startedAt: startAt,
      endedAt,
      tags: [],
      highlights: [],
    };
    setSessions((prev) => [newSession, ...prev]);
    setIsActive(false);
    setStartAt(null);
    setElapsed(0);
  };

  const elapsedText = useMemo(() => formatDuration(elapsed), [elapsed]);

  return (
    <div className="min-h-[100vh] w-full overflow-x-hidden text-slate-900 dark:text-white">
      {/* Grainy gradient background (Arc-like) */}
      <div className="pointer-events-none fixed inset-0 -z-20">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 via-sky-50 to-white dark:from-[#070A17] dark:via-[#081B2E] dark:to-[#050611]" />
        <div
          className="absolute inset-0 opacity-80 dark:opacity-70"
          style={{
            backgroundImage:
              "radial-gradient(900px 520px at 15% 12%, rgba(99,102,241,0.22), transparent 60%)," +
              "radial-gradient(700px 460px at 82% 18%, rgba(56,189,248,0.18), transparent 55%)," +
              "radial-gradient(820px 520px at 50% 92%, rgba(129,140,248,0.18), transparent 58%)," +
              "radial-gradient(520px 380px at 8% 85%, rgba(37,99,235,0.12), transparent 55%)",
          }}
        />
      </div>
      {/* Noise overlay */}
      <div
        className="pointer-events-none fixed inset-0 -z-10 opacity-[0.16] dark:opacity-[0.18] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)' opacity='0.45'/%3E%3C/svg%3E\")",
          backgroundRepeat: "repeat",
        }}
      />

      {/* Top Navigation */}
      <header className="sticky top-0 z-10 bg-transparent">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-gradient-to-b from-white/25 via-white/10 to-transparent dark:from-black/10 dark:via-black/5" />
          <div className="absolute inset-0 backdrop-blur-lg" />
        </div>
        <div className="relative mx-auto flex max-w-7xl items-center justify-between gap-3 px-8 py-5">
          {/* Left: Logo */}
          <div className="flex items-center">
            <GlassIsland className="px-3 py-2">
              <button
                className="flex items-center gap-3 text-slate-900 dark:text-slate-100 transition-all duration-200 hover:brightness-110"
                onClick={() => setPage("flow")}
                aria-label="Iconic Memory Home"
              >
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-900/5 ring-1 ring-slate-200 dark:bg-white/10 dark:ring-white/15 overflow-hidden">
                  <img
                    src="/logo.png"
                    alt="Iconic Memory logo"
                    className="h-9 w-9 object-contain dark:invert"
                  />
                </span>
                <span className="text-lg font-semibold">Iconic Memory</span>
              </button>
            </GlassIsland>
          </div>

          {/* Center: Nav items */}
          <nav className="hidden md:flex items-center text-sm">
            <GlassIsland className="px-2 py-2 flex items-center gap-2">
              <button
                onClick={() => setPage("about")}
                className={classNames(
                  "rounded-md px-3 py-2 transition-all duration-200 hover:scale-[1.03] hover:brightness-110",
                  page === "about"
                    ? "bg-indigo-500/10 text-indigo-700 ring-1 ring-inset ring-indigo-300/40 dark:bg-indigo-400/15 dark:text-indigo-200 dark:ring-indigo-400/40"
                    : "text-slate-700 hover:text-slate-900 hover:bg-slate-900/5 dark:text-white/80 dark:hover:text-white dark:hover:bg-white/5"
                )}
              >
                About
              </button>
              <button
                onClick={() => setPage("workflows")}
                className={classNames(
                  "rounded-md px-3 py-2 transition-all duration-200 hover:scale-[1.03] hover:brightness-110",
                  page === "workflows"
                    ? "bg-indigo-500/10 text-indigo-700 ring-1 ring-inset ring-indigo-300/40 dark:bg-indigo-400/15 dark:text-indigo-200 dark:ring-indigo-400/40"
                    : "text-slate-700 hover:text-slate-900 hover:bg-slate-900/5 dark:text-white/80 dark:hover:text-white dark:hover:bg-white/5"
                )}
              >
                Past workflows
              </button>
              <button
                onClick={() => setPage("flow")}
                className={classNames(
                  "rounded-md px-3 py-2 transition-all duration-200 hover:scale-[1.03] hover:brightness-110",
                  page === "flow"
                    ? "bg-indigo-500/10 text-indigo-700 ring-1 ring-inset ring-indigo-300/40 dark:bg-indigo-400/15 dark:text-indigo-200 dark:ring-indigo-400/40"
                    : "text-slate-700 hover:text-slate-900 hover:bg-slate-900/5 dark:text-white/80 dark:hover:text-white dark:hover:bg-white/5"
                )}
              >
                Flow
              </button>
            </GlassIsland>
          </nav>

          {/* Right: Theme toggle + Start/Stop */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsDark((v) => !v)}
              className="relative inline-flex items-center justify-center rounded-md p-2 ring-1 ring-white/35 bg-white/18 backdrop-blur-2xl backdrop-saturate-200 text-slate-900 hover:bg-white/25 dark:ring-white/12 dark:bg-white/[0.06] dark:text-white/90 dark:hover:bg-white/[0.09] transition-all duration-200 hover:scale-[1.05] hover:brightness-110 shadow-[0_10px_28px_rgba(0,0,0,0.08)]"
              aria-label="Toggle theme"
              title="Toggle light/dark"
            >
              {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>
            <motion.button
              onClick={isActive ? handleStop : handleStart}
              whileTap={{ scale: 0.98 }}
              className={
                classNames(
                  "inline-flex items-center justify-center gap-3 rounded-lg px-5 py-2.5 font-semibold",
                  "ring-1 focus:outline-none focus:ring-2 focus:ring-offset-0",
                  isActive
                    ? "bg-gradient-to-b from-rose-600 to-rose-700 ring-rose-300/40 focus:ring-rose-300/60"
                    : "bg-gradient-to-b from-indigo-500 to-indigo-600 ring-indigo-400/50 focus:ring-indigo-400",
                  "text-white shadow-lg hover:brightness-110 transition-all duration-200 hover:scale-[1.04]"
                )
              }
              aria-label={isActive ? "Stop session" : "Start session"}
            >
              {isActive ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              <span className="text-sm">{isActive ? "Stop" : "Start"}</span>
              <span className="tabular-nums text-sm font-mono w-[8ch] text-center">
                {isActive ? elapsedText : "00:00:00"}
              </span>
            </motion.button>
          </div>
        </div>

        {/* Mobile nav (optional minimal) */}
        <div className="mx-auto flex max-w-7xl items-center justify-center gap-2 px-8 pb-4 md:hidden">
          <button
            onClick={() => setPage("about")}
            className={classNames(
              "rounded-md px-3 py-1.5 text-sm transition-all duration-200 hover:scale-[1.03] hover:brightness-110",
              page === "about"
                ? "bg-indigo-500/10 text-indigo-700 ring-1 ring-inset ring-indigo-300/40 dark:bg-indigo-400/15 dark:text-indigo-200 dark:ring-indigo-400/40"
                : "text-slate-700 hover:text-slate-900 hover:bg-slate-900/5 dark:text-white/80 dark:hover:text-white dark:hover:bg-white/5"
            )}
          >
            About
          </button>
          <button
            onClick={() => setPage("workflows")}
            className={classNames(
              "rounded-md px-3 py-1.5 text-sm transition-all duration-200 hover:scale-[1.03] hover:brightness-110",
              page === "workflows"
                ? "bg-indigo-500/10 text-indigo-700 ring-1 ring-inset ring-indigo-300/40 dark:bg-indigo-400/15 dark:text-indigo-200 dark:ring-indigo-400/40"
                : "text-slate-700 hover:text-slate-900 hover:bg-slate-900/5 dark:text-white/80 dark:hover:text-white dark:hover:bg-white/5"
            )}
          >
            Past workflows
          </button>
          <button
            onClick={() => setPage("flow")}
            className={classNames(
              "rounded-md px-3 py-1.5 text-sm transition-all duration-200 hover:scale-[1.03] hover:brightness-110",
              page === "flow"
                ? "bg-indigo-500/10 text-indigo-700 ring-1 ring-inset ring-indigo-300/40 dark:bg-indigo-400/15 dark:text-indigo-200 dark:ring-indigo-400/40"
                : "text-slate-700 hover:text-slate-900 hover:bg-slate-900/5 dark:text-white/80 dark:hover:text-white dark:hover:bg-white/5"
            )}
          >
            Flow
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-8 pb-28 pt-4">
        <AnimatePresence mode="wait">
          {page === "about" && (
            <motion.section
              key="about"
              initial={{ y: 10 }}
              animate={{ y: 0 }}
              exit={{ y: 10 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
            >
              <GlassCard interactive>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white/90 text-indigo-700 dark:text-indigo-200">About Iconic Memory</h2>
                <p className="mt-3 text-sm text-slate-700 dark:text-white/85">
                  <span className="font-semibold">Iconic Memory</span> is inspired by a previous hackathon project, and uses a <span className="font-semibold">video-based AI agent</span> to keep track of your workflows across all your apps.
                </p>

                <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-slate-700 dark:text-white/85">
                  <li>Click <span className="font-semibold">Start</span> to begin a focus session.</li>
                  <li>Add an optional <span className="font-semibold">Description</span> to capture intent and context.</li>
                  <li>Work normally across your apps. When you click <span className="font-semibold">Stop</span>, Iconic Memory can auto-generate <span className="font-semibold">Notes</span> for the session.</li>
                  <li>Browse and search your history in <span className="font-semibold">Past workflows</span>, and open any session to review details.</li>
                </ol>

                <p className="mt-4 text-sm text-slate-600 dark:text-white/70">
                  Tip: Keep the Start/Stop button visible while navigating—Iconic Memory is designed to stay out of the way while still capturing what you did.
                </p>
              </GlassCard>
            </motion.section>
          )}

          {page === "workflows" && (
            <motion.section
              key="workflows"
              className="space-y-6"
              initial={{ y: 10 }}
              animate={{ y: 0 }}
              exit={{ y: 10 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
            >
              <GlassCard interactive>
                <div className="mb-4 flex items-center gap-2">
                  <History className="h-5 w-5" />
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white/90 text-indigo-700 dark:text-indigo-200">Past workflows</h3>
                </div>

                <div className="divide-y divide-white/10">
                  {sessions.map((s) => {
                    const duration = s.endedAt - s.startedAt;
                    const started = new Date(s.startedAt).toLocaleString();
                    const ended = new Date(s.endedAt).toLocaleString();
                    return (
                      <motion.div
                        key={s.id}
                        whileHover={{ y: -2 }}
                        whileTap={{ scale: 0.985 }}
                        transition={{ type: "spring", stiffness: 520, damping: 32 }}
                        className="py-3 flex items-center justify-between gap-3 cursor-pointer rounded-xl -mx-5 px-5 sm:-mx-7 sm:px-7 lg:-mx-9 lg:px-9 hover:bg-slate-900/5 dark:hover:bg-white/5 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="grid place-items-center rounded-lg bg-slate-900/5 p-2 ring-1 ring-slate-200 dark:bg-white/8 dark:ring-white/10">
                            <Clock className="h-5 w-5 text-slate-800 dark:text-white/90" />
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">{s.title}</div>
                            <div className="mt-0.5 text-xs text-slate-600 dark:text-white/60">{started} → {ended}</div>
                          </div>
                        </div>
                        <Pill>{formatDuration(duration)}</Pill>
                      </motion.div>
                    );
                  })}
                </div>
              </GlassCard>
            </motion.section>
          )}

          {page === "flow" && (
            <motion.section
              key="flow"
              className="grid grid-cols-1 gap-6 lg:grid-cols-3"
              initial={{ y: 10 }}
              animate={{ y: 0 }}
              exit={{ y: 10 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
            >
              <div className="lg:col-span-1">
                <GlassCard interactive>
                  <div>
                    <div className="text-sm uppercase tracking-widest text-slate-600 dark:text-white/60">Current session</div>
                    <div className="mt-2 text-4xl font-bold tabular-nums">{isActive ? elapsedText : "00:00:00"}</div>
                    <div className="mt-1 text-slate-600 dark:text-white/60">Use the Start/Stop button in the top-right.</div>
                  </div>
                </GlassCard>
              </div>
              <div className="lg:col-span-2">
                <GlassCard interactive>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white/90 text-indigo-700 dark:text-indigo-200">Notes</h3>
                  <p className="mt-2 text-sm text-slate-700 dark:text-white/70">Jot down anything relevant to your current flow here (optional). This is a placeholder—wire to your backend if needed.</p>
                </GlassCard>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
