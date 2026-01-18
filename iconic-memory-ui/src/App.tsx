import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Play, Square, Clock, History, Moon, Sun, ChevronLeft, Terminal, List, Sparkles } from "lucide-react";
import { createRealtimeVision } from "./agent";

// ---------- Types ----------
type Observation = {
  ts: number;
  result: any;
};

type CompressedEvent = {
  description: string;
  startTime: number;
  endTime: number;
  durationSec: number;
  count: number;
};

type Session = {
  id: string;
  title: string;
  startedAt: number;
  endedAt: number;
  tags: string[];
  highlights: string[];
  rawObservations?: Observation[];
  compressedLog?: CompressedEvent[]; // Added for the compressed dataset
};

// ---------- Compression & AI Logic (New Additions) ----------

// 1. Jaccard Similarity Helper
function calculateJaccardSimilarity(str1: string, str2: string): number {
  const set1 = new Set(str1.toLowerCase().split(/\s+/));
  const set2 = new Set(str2.toLowerCase().split(/\s+/));
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

// 2. Compression Algorithm
function compressObservations(raw: Observation[], threshold = 0.6): CompressedEvent[] {
  if (raw.length === 0) return [];

  const compressed: CompressedEvent[] = [];
  let current: CompressedEvent | null = null;

  for (const obs of raw) {
    const text = typeof obs.result.result === 'string' ? obs.result.result : JSON.stringify(obs.result);
    
    if (!current) {
      current = { description: text, startTime: obs.ts, endTime: obs.ts, durationSec: 0, count: 1 };
      continue;
    }

    const similarity = calculateJaccardSimilarity(current.description, text);

    // If similar enough, drop it but extend the duration of the current event
    if (similarity >= threshold) {
      current.endTime = obs.ts;
      current.count += 1;
      current.durationSec = (current.endTime - current.startTime) / 1000;
    } else {
      // If different, push the completed event and start a new one
      compressed.push(current);
      current = { description: text, startTime: obs.ts, endTime: obs.ts, durationSec: 0, count: 1 };
    }
  }
  
  if (current) compressed.push(current);
  return compressed;
}

// 3. OpenRouter LLM Summarizer
async function generateSessionSummary(compressed: CompressedEvent[], apiKey: string): Promise<string[]> {
  const logString = compressed
    .map(e => `[${Math.round(e.durationSec)}s]: ${e.description}`)
    .join("\n");

  const prompt = `
    You are an expert work analyst. 
    Analyze this compressed screen-recording log.
    Generate 3 concise, high-impact bullet points summarizing what the user accomplished.
    Ignore trivial UI interactions. Focus on the work.
    
    LOG:
    ${logString}
  `;

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-4.1-mini",
        messages: [{ role: "user", content: prompt }],
      })
    });

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || "";
    
    // Simple parsing to get bullet points
    return content.split("\n")
      .map((line: string) => line.replace(/^[\*\-\•\d\.]+\s*/, "").trim())
      .filter((line: string) => line.length > 5)
      .slice(0, 3);
  } catch (e) {
    console.error("LLM Error:", e);
    return ["Failed to generate AI summary", "Check console for details", "Raw data saved"];
  }
}

// ---------- Utility helpers ----------
function classNames(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((n) => n.toString().padStart(2, "0"))
    .join(":");
}

function formatTime(ms: number) {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ---------- Hook: Overshoot Logic ----------
function useOvershootSession() {
  const previewStreamRef = useRef<MediaStream | null>(null);
  const visionRef = useRef<any>(null);
  const originalGetUserMediaRef = useRef<any>(null);
  const patchedRef = useRef(false);
  const observationsRef = useRef<Observation[]>([]);
  const retryCount = useRef(0);

  const [status, setStatus] = useState("Ready");
  const [latestObservation, setLatestObservation] = useState<string>("");

  async function ensureScreenStream() {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new Error("Screen capture not supported.");
    }
    if (previewStreamRef.current) return previewStreamRef.current;

    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 30, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    });

    previewStreamRef.current = stream;
    stream.getVideoTracks()[0].onended = () => { /* optional external stop handling */ };

    return stream;
  }

  function patchGetUserMediaToReturn(stream: MediaStream) {
    if (patchedRef.current) return;
    originalGetUserMediaRef.current = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    // @ts-ignore
    navigator.mediaDevices.getUserMedia = async () => stream;
    patchedRef.current = true;
  }

  function restoreGetUserMedia() {
    if (!patchedRef.current) return;
    if (originalGetUserMediaRef.current) {
      navigator.mediaDevices.getUserMedia = originalGetUserMediaRef.current;
    }
    originalGetUserMediaRef.current = null;
    patchedRef.current = false;
  }

  const startSession = async () => {
    try {
      if (status === "Recording") return true; 
      
      setStatus(retryCount.current > 0 ? "Reconnecting..." : "Initializing...");
      
      if (retryCount.current === 0) {
        observationsRef.current = [];
      }

      const stream = await ensureScreenStream();
      patchGetUserMediaToReturn(stream);

      const vision = createRealtimeVision({
        prompt: "Describe what is happening on screen in one short sentence.",
        onResult: (result: any) => {
          retryCount.current = 0; 
          const obs = { ts: Date.now(), result };
          observationsRef.current.push(obs);
          if (result && typeof result === "object" && result.result) {
             setLatestObservation(String(result.result));
          }
        },
        onError: async (err: any) => {
          console.error("Overshoot connection dropped:", err);
          const isStreamError = JSON.stringify(err).includes("stream_not_found") || JSON.stringify(err).includes("404");
          
          if (isStreamError && retryCount.current < 3) {
            console.log(`Attempting auto-recovery (Attempt ${retryCount.current + 1}/3)...`);
            retryCount.current += 1;
            setTimeout(() => {
                if (visionRef.current) visionRef.current.stop().catch(() => {});
                startSession(); 
            }, 1000);
          } else {
            setStatus("Connection Lost");
            setLatestObservation("⚠️ Connection to Vision Model lost.");
          }
        }
      });

      visionRef.current = vision;
      await vision.start();
      setStatus("Recording");
      return true;
    } catch (err) {
      console.error("Failed to start Overshoot:", err);
      restoreGetUserMedia();
      setStatus("Error");
      return false;
    }
  };

  const stopSession = async () => {
    retryCount.current = 0;
    setStatus("Stopping...");
    if (visionRef.current) {
      await visionRef.current.stop().catch(() => {});
      visionRef.current = null;
    }
    if (previewStreamRef.current) {
      previewStreamRef.current.getTracks().forEach((t) => t.stop());
      previewStreamRef.current = null;
    }
    restoreGetUserMedia();
    setStatus("Ready");
    setLatestObservation("");
    return [...observationsRef.current];
  };

  return { startSession, stopSession, status, latestObservation };
}

// ---------- Faux data ----------
const seedSessions: Session[] = [
  {
    id: "s-104",
    title: "Deep work: sprint planning notes",
    startedAt: Date.now() - 1000 * 60 * 60 * 4 - 1000 * 60 * 10,
    endedAt: Date.now() - 1000 * 60 * 60 * 2 - 1000 * 60 * 37,
    tags: ["docs", "planning"],
    highlights: ["Summarized stakeholder inputs", "Auto-captured edits in Spec_v3.md", "Generated task list"],
  },
  {
    id: "s-103",
    title: "Code focus: vector search POC",
    startedAt: Date.now() - 1000 * 60 * 60 * 26,
    endedAt: Date.now() - 1000 * 60 * 60 * 23 - 1000 * 60 * 12,
    tags: ["coding", "prototype"],
    highlights: ["Benchmarked kNN top-k=50", "Flagged memory spike in worker", "Saved log snapshot"],
  },
  {
    id: "s-102",
    title: "Design review prep",
    startedAt: Date.now() - 1000 * 60 * 60 * 48 - 1000 * 60 * 34,
    endedAt: Date.now() - 1000 * 60 * 60 * 46 - 1000 * 60 * 2,
    tags: ["design", "slides"],
    highlights: ["Drafted outline in slides", "Pulled latest metrics", "Generated talking points"],
  },
];

// ---------- Re-usable UI bits ----------
const GlassCard: React.FC<React.PropsWithChildren<{ className?: string; interactive?: boolean; onClick?: () => void }>> = ({ className, interactive, onClick, children }) => (
  <div
    onClick={onClick}
    style={{
      backdropFilter: "blur(24px) saturate(200%)",
      WebkitBackdropFilter: "blur(24px) saturate(200%)",
    }}
    className={classNames(
      "relative overflow-hidden rounded-2xl p-4 sm:p-6 lg:p-8",
      "transform-gpu will-change-[transform,backdrop-filter]",
      "bg-white/18 dark:bg-white/[0.06]",
      "backdrop-blur-2xl backdrop-saturate-200",
      "ring-1 ring-white/35 dark:ring-white/10",
      "shadow-[0_14px_40px_rgba(0,0,0,0.10)] dark:shadow-[0_18px_55px_rgba(0,0,0,0.35)]",
      interactive && "cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_55px_rgba(0,0,0,0.14)] dark:hover:shadow-[0_22px_70px_rgba(0,0,0,0.45)]",
      className
    )}
  >
    {/* specular / liquid highlight */}
    <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-white/80 via-white/22 to-white/5 opacity-60 dark:from-white/18 dark:via-white/8 dark:to-transparent" />
    {/* curved liquid sheen */}
    <div className="pointer-events-none absolute -top-10 left-10 h-28 w-72 rounded-full bg-white/60 blur-3xl opacity-30 dark:bg-white/18 dark:opacity-22" style={{ transform: "rotate(-10deg)" }} />
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
      "bg-white/18 dark:bg-white/[0.06]",
      "backdrop-blur-2xl backdrop-saturate-200",
      "ring-1 ring-white/35 dark:ring-white/10",
      "shadow-[0_14px_40px_rgba(0,0,0,0.10)] dark:shadow-[0_18px_55px_rgba(0,0,0,0.35)]",
      className
    )}
  >
    <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-white/80 via-white/22 to-white/5 opacity-60 dark:from-white/18 dark:via-white/8 dark:to-transparent" />
    <div className="pointer-events-none absolute inset-0 rounded-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.65),inset_0_-1px_0_rgba(255,255,255,0.14)]" />
    <div className="relative">{children}</div>
  </div>
);

// ---------- Main component ----------
export default function AgentWorkSessionUI() {
  const [isActive, setIsActive] = useState(false);
  const [startAt, setStartAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const { startSession, stopSession, latestObservation } = useOvershootSession();

  const [sessions, setSessions] = useState<Session[]>(seedSessions);
  const [page, setPage] = useState<"about" | "workflows" | "flow">("flow");
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);

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

  const handleStart = async () => {
    if (isActive) return;
    const success = await startSession();
    if (!success) return; 
    setIsActive(true);
    const now = Date.now();
    setStartAt(now);
    setElapsed(0);
    setPage("flow");
    setSelectedSession(null); 
  };

  const handleStop = async () => {
    if (!isActive || !startAt) return;
    const endedAt = Date.now();
    
    // 1. Get Raw Data
    const capturedObservations = await stopSession();

    // 2. Compress Data (New Algorithm)
    const compressedData = compressObservations(capturedObservations, 0.6);

    // 3. UI Updates
    setIsActive(false);
    setStartAt(null);
    setElapsed(0);
    setPage("workflows"); 

    // 4. Summarize with LLM (via OpenRouter)
    let generatedHighlights = ["Waiting for AI summary..."];
    
    // Simple prompt to get key
    const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY as string | undefined;
    if (apiKey) {
      generatedHighlights = await generateSessionSummary(compressedData, apiKey);
    } else {
      generatedHighlights = ["No summary generated (no key provided)"];
    }

    const newSession: Session = {
      id: `s-${Math.random().toString(36).slice(2, 7)}`,
      title: "Recorded Session",
      startedAt: startAt,
      endedAt,
      tags: ["screen-capture", "compressed"],
      // Use AI-generated highlights here
      highlights: generatedHighlights,
      rawObservations: capturedObservations,
      compressedLog: compressedData,
    };

    setSessions((prev) => [newSession, ...prev]);
  };

  const elapsedText = useMemo(() => formatDuration(elapsed), [elapsed]);

  return (
    <div className="min-h-[100vh] w-full overflow-x-hidden text-slate-900 dark:text-white">
      {/* Backgrounds */}
      <div className="pointer-events-none fixed inset-0 -z-20">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 via-sky-50 to-white dark:from-[#070A17] dark:via-[#081B2E] dark:to-[#050611]" />
        <div className="absolute inset-0 opacity-80 dark:opacity-70" style={{ backgroundImage: "radial-gradient(900px 520px at 15% 12%, rgba(99,102,241,0.22), transparent 60%)," + "radial-gradient(700px 460px at 82% 18%, rgba(56,189,248,0.18), transparent 55%)," + "radial-gradient(820px 520px at 50% 92%, rgba(129,140,248,0.18), transparent 58%)," + "radial-gradient(520px 380px at 8% 85%, rgba(37,99,235,0.12), transparent 55%)" }} />
      </div>
      <div className="pointer-events-none fixed inset-0 -z-10 opacity-[0.16] dark:opacity-[0.18] mix-blend-overlay" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)' opacity='0.45'/%3E%3C/svg%3E\")", backgroundRepeat: "repeat" }} />

      {/* Top Navigation */}
      <header className="sticky top-0 z-10 bg-transparent">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-gradient-to-b from-white/25 via-white/10 to-transparent dark:from-black/10 dark:via-black/5" />
          <div className="absolute inset-0 backdrop-blur-lg" />
        </div>
        <div className="relative mx-auto flex max-w-7xl items-center justify-between gap-3 px-8 py-5">
          <div className="flex items-center">
            <GlassIsland className="px-3 py-2">
              <button className="flex items-center gap-3 text-slate-900 dark:text-slate-100 transition-all duration-200 hover:brightness-110" onClick={() => setPage("flow")} aria-label="Iconic Memory Home">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-900/5 ring-1 ring-slate-200 dark:bg-white/10 dark:ring-white/15 overflow-hidden">
                  <img src="/logo.png" alt="Iconic Memory logo" className="h-9 w-9 object-contain dark:invert" />
                </span>
                <span className="text-lg font-semibold">Iconic Memory</span>
              </button>
            </GlassIsland>
          </div>

          <nav className="hidden md:flex items-center text-sm">
            <GlassIsland className="px-2 py-2 flex items-center gap-2">
              <button onClick={() => { setPage("about"); setSelectedSession(null); }} className={classNames("rounded-md px-3 py-2 transition-all duration-200 hover:scale-[1.03] hover:brightness-110", page === "about" ? "bg-indigo-500/10 text-indigo-700 ring-1 ring-inset ring-indigo-300/40 dark:bg-indigo-400/15 dark:text-indigo-200 dark:ring-indigo-400/40" : "text-slate-700 hover:text-slate-900 hover:bg-slate-900/5 dark:text-white/80 dark:hover:text-white dark:hover:bg-white/5")}>About</button>
              <button onClick={() => { setPage("workflows"); setSelectedSession(null); }} className={classNames("rounded-md px-3 py-2 transition-all duration-200 hover:scale-[1.03] hover:brightness-110", page === "workflows" ? "bg-indigo-500/10 text-indigo-700 ring-1 ring-inset ring-indigo-300/40 dark:bg-indigo-400/15 dark:text-indigo-200 dark:ring-indigo-400/40" : "text-slate-700 hover:text-slate-900 hover:bg-slate-900/5 dark:text-white/80 dark:hover:text-white dark:hover:bg-white/5")}>Past workflows</button>
              <button onClick={() => { setPage("flow"); setSelectedSession(null); }} className={classNames("rounded-md px-3 py-2 transition-all duration-200 hover:scale-[1.03] hover:brightness-110", page === "flow" ? "bg-indigo-500/10 text-indigo-700 ring-1 ring-inset ring-indigo-300/40 dark:bg-indigo-400/15 dark:text-indigo-200 dark:ring-indigo-400/40" : "text-slate-700 hover:text-slate-900 hover:bg-slate-900/5 dark:text-white/80 dark:hover:text-white dark:hover:bg-white/5")}>Flow</button>
            </GlassIsland>
          </nav>

          <div className="flex items-center gap-2">
            <button onClick={() => setIsDark((v) => !v)} className="relative inline-flex items-center justify-center rounded-md p-2 ring-1 ring-white/35 bg-white/18 backdrop-blur-2xl backdrop-saturate-200 text-slate-900 hover:bg-white/25 dark:ring-white/12 dark:bg-white/[0.06] dark:text-white/90 dark:hover:bg-white/[0.09] transition-all duration-200 hover:scale-[1.05] hover:brightness-110 shadow-[0_10px_28px_rgba(0,0,0,0.08)]">
              {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>
            <motion.button
              onClick={isActive ? handleStop : handleStart}
              whileTap={{ scale: 0.98 }}
              className={classNames("inline-flex items-center justify-center gap-3 rounded-lg px-5 py-2.5 font-semibold", "ring-1 focus:outline-none focus:ring-2 focus:ring-offset-0", isActive ? "bg-gradient-to-b from-rose-600 to-rose-700 ring-rose-300/40 focus:ring-rose-300/60" : "bg-gradient-to-b from-indigo-500 to-indigo-600 ring-indigo-400/50 focus:ring-indigo-400", "text-white shadow-lg hover:brightness-110 transition-all duration-200 hover:scale-[1.04]")}
            >
              {isActive ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              <span className="text-sm">{isActive ? "Stop" : "Start"}</span>
              <span className="tabular-nums text-sm font-mono w-[8ch] text-center">{isActive ? elapsedText : "00:00:00"}</span>
            </motion.button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-8 pb-28 pt-4">
        <AnimatePresence mode="wait">
          {page === "about" && (
            <motion.section key="about" initial={{ y: 10 }} animate={{ y: 0 }} exit={{ y: 10 }} transition={{ type: "spring", stiffness: 320, damping: 28 }}>
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
            <motion.section key="workflows" className="space-y-6" initial={{ y: 10 }} animate={{ y: 0 }} exit={{ y: 10 }} transition={{ type: "spring", stiffness: 320, damping: 28 }}>
              {/* Conditional: List View or Detail View */}
              {!selectedSession ? (
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
                          onClick={() => setSelectedSession(s)}
                          whileHover={{ y: -2 }}
                          whileTap={{ scale: 0.985 }}
                          transition={{ type: "spring", stiffness: 520, damping: 32 }}
                          className="py-3 flex items-center justify-between gap-3 cursor-pointer rounded-xl -mx-5 px-5 sm:-mx-7 sm:px-7 lg:-mx-9 lg:px-9 hover:bg-slate-900/5 dark:hover:bg-white/5 transition-colors group"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="grid place-items-center rounded-lg bg-slate-900/5 p-2 ring-1 ring-slate-200 dark:bg-white/8 dark:ring-white/10 group-hover:ring-indigo-400 transition-all">
                              <Clock className="h-5 w-5 text-slate-800 dark:text-white/90" />
                            </div>
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">{s.title}</div>
                              <div className="mt-0.5 text-xs text-slate-600 dark:text-white/60">{started} → {ended}</div>
                              {s.highlights && s.highlights.length > 0 && (
                                <div className="mt-1 flex gap-1">
                                  {s.highlights.slice(0, 2).map((h, i) => (
                                    <span key={i} className="text-[10px] bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 px-1 rounded truncate max-w-[120px]">{h}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                             <Pill>{formatDuration(duration)}</Pill>
                             <ChevronLeft className="h-4 w-4 rotate-180 opacity-0 group-hover:opacity-50 transition-opacity" />
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </GlassCard>
              ) : (
                // DETAIL VIEW
                <GlassCard>
                    <div className="flex items-center gap-4 mb-6">
                        <button 
                            onClick={() => setSelectedSession(null)}
                            className="p-2 rounded-full hover:bg-white/10 transition-colors"
                        >
                            <ChevronLeft className="h-5 w-5" />
                        </button>
                        <div>
                            <h2 className="text-xl font-bold">{selectedSession.title}</h2>
                            <div className="text-sm opacity-50 flex gap-2">
                                <span>{new Date(selectedSession.startedAt).toLocaleString()}</span>
                                <span>•</span>
                                <span>{formatDuration(selectedSession.endedAt - selectedSession.startedAt)}</span>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-6">
                        {/* Highlights Section */}
                        <div>
                            <h3 className="text-sm font-semibold uppercase tracking-wider opacity-60 mb-3 flex items-center gap-2">
                                <Sparkles className="h-4 w-4 text-indigo-400" /> AI Highlights
                            </h3>
                            <div className="grid gap-2">
                                {selectedSession.highlights.map((h, i) => (
                                    <div key={i} className="p-3 rounded-lg bg-indigo-500/5 border border-indigo-500/10 text-sm">
                                        {h}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* NEW: Compressed Event Log */}
                        {selectedSession.compressedLog && (
                            <div>
                                <h3 className="text-sm font-semibold uppercase tracking-wider opacity-60 mb-3 flex items-center gap-2">
                                    <Terminal className="h-4 w-4" /> Compressed Event Log
                                </h3>
                                <div className="rounded-xl bg-black/30 border border-white/5 p-4 font-mono text-xs max-h-[300px] overflow-y-auto space-y-1">
                                    {selectedSession.compressedLog.map((e, i) => (
                                        <div key={i} className="flex gap-3 py-1 border-b border-white/5 last:border-0 hover:bg-white/5">
                                            <span className="text-indigo-400 w-[6ch] text-right shrink-0">{Math.round(e.durationSec)}s</span>
                                            <span className="opacity-90 break-words flex-1 text-slate-300">{e.description}</span>
                                            <span className="opacity-30 text-[10px] self-center shrink-0">x{e.count}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Full Log Section (Only if rawObservations exist) */}
                        {selectedSession.rawObservations && (
                            <div>
                                <h3 className="text-sm font-semibold uppercase tracking-wider opacity-60 mb-3 flex items-center gap-2">
                                    <List className="h-4 w-4" /> Raw Events
                                </h3>
                                <div className="rounded-xl bg-black/30 border border-white/5 p-4 font-mono text-xs max-h-[200px] overflow-y-auto space-y-2 opacity-60">
                                    {selectedSession.rawObservations.map((obs, i) => (
                                        <div key={i} className="flex gap-3">
                                            <span className="opacity-40 select-none shrink-0 w-[8ch]">{formatTime(obs.ts)}</span>
                                            <span className="text-indigo-200">
                                                {typeof obs.result.result === 'string' 
                                                    ? obs.result.result 
                                                    : JSON.stringify(obs.result)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </GlassCard>
              )}
            </motion.section>
          )}

          {page === "flow" && (
            <motion.section key="flow" className="grid grid-cols-1 gap-6 lg:grid-cols-3" initial={{ y: 10 }} animate={{ y: 0 }} exit={{ y: 10 }} transition={{ type: "spring", stiffness: 320, damping: 28 }}>
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
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white/90 text-indigo-700 dark:text-indigo-200">Live Model Insight</h3>
                  {!isActive && !latestObservation ? (
                      <p className="mt-2 text-sm text-slate-700 dark:text-white/70">Jot down anything relevant to your current flow here (optional). Once you hit Start, the vision model's observations will appear here.</p>
                  ) : (
                      <div className="mt-2 h-24 rounded-lg bg-black/5 dark:bg-black/20 p-3 font-mono text-sm overflow-y-auto border border-black/5 dark:border-white/10">
                        {latestObservation ? <span className="text-slate-800 dark:text-white">{latestObservation}</span> : <span className="text-slate-400 dark:text-white/30 italic">Waiting for model output...</span>}
                      </div>
                  )}
                </GlassCard>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}