"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { AnalysisReport } from "@shared/types/prediction";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type OrderStatus = "idle" | "loading" | "done" | "error" | "already_ordered";
type Toast = { id: number; message: string; type: "success" | "warning" | "error" };
type StatusEvent = { id: string; status: string; message: string; tool?: string; timestamp: number };
type WsState = "connecting" | "connected" | "disconnected";
type SkuLiveStatus = "pending" | "fetching" | "analyzing" | "done" | "error";
type ToolActivity = { name: string; startedAt: number; endedAt?: number };

const WS_URL = "ws://10.214.214.82:8000/ws";

function demandBadge(level: string | undefined | null) {
  const l = (level ?? "").toLowerCase();
  if (l === "high" || l === "yüksek") return { text: "Yüksek", cls: "bg-red-100 text-red-700" };
  if (l === "medium" || l === "orta") return { text: "Orta", cls: "bg-amber-100 text-amber-700" };
  return { text: "Düşük", cls: "bg-green-100 text-green-700" };
}

function remainingColor(days: number | undefined | null) {
  if (days == null) return "text-gray-400";
  if (days <= 7) return "text-red-600";
  if (days <= 14) return "text-amber-600";
  return "text-[var(--pinar-green-500)]";
}

function elapsed(ms: number) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

/* ── Spinner SVG ── */
function Spinner({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export default function MonitoringPage() {
  const [reports, setReports] = useState<AnalysisReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Map<string, OrderStatus>>(new Map());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [expandedSku, setExpandedSku] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<string>("remaining");

  // WebSocket
  const [wsState, setWsState] = useState<WsState>("disconnected");
  const [statusEvents, setStatusEvents] = useState<StatusEvent[]>([]);
  const [activeTools, setActiveTools] = useState<ToolActivity[]>([]);
  const [completedTools, setCompletedTools] = useState<ToolActivity[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [agentReply, setAgentReply] = useState("");
  const [isAgentLoading, setIsAgentLoading] = useState(false);
  const [skuStatuses, setSkuStatuses] = useState<Map<string, { status: SkuLiveStatus; message: string; detail?: string }>>(new Map());
  const [totalSkuCount, setTotalSkuCount] = useState(0);
  const [activeTab, setActiveTab] = useState<"table" | "live">("table");
  const wsRef = useRef<WebSocket | null>(null);
  const sessionRef = useRef<string | null>(null);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const replyRef = useRef("");
  const eventsEndRef = useRef<HTMLDivElement | null>(null);
  const retryCountRef = useRef(0);

  const addToast = useCallback((message: string, type: Toast["type"]) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const placeOrder = useCallback(async (sku: string) => {
    setOrders((prev) => new Map(prev).set(sku, "loading"));
    try {
      const res = await fetch(`/api/order/${sku}`, { method: "POST" });
      const json = await res.json();
      if (res.status === 409) {
        setOrders((prev) => new Map(prev).set(sku, "already_ordered"));
        addToast(json.message || `${sku} için sipariş zaten verilmiş`, "warning");
        return;
      }
      if (!res.ok) throw new Error(json.message || `HTTP ${res.status}`);
      setOrders((prev) => new Map(prev).set(sku, "done"));
      addToast(json.message || `${sku} için sipariş verildi`, "success");
    } catch (err) {
      setOrders((prev) => new Map(prev).set(sku, "error"));
      addToast(`${sku}: Sipariş başarısız — ${err}`, "error");
    }
  }, [addToast]);

  /* ── Parse SKU info from status messages ── */
  const parseSkuFromMessage = useCallback((message: string, status: string) => {
    // Parse total count from info/processing messages like "📋 3 SKU analiz edilecek"
    const countMatch = message.match(/(\d+)\s+SKU\s+analiz/);
    if (countMatch) setTotalSkuCount(parseInt(countMatch[1]));

    // Match patterns like [1/3] SKU 152903427
    const skuMatch = message.match(/SKU\s+(\d+)/i);
    if (!skuMatch) return;
    const sku = skuMatch[1];

    if (status === "processing" && message.includes("verisi çekiliyor")) {
      setSkuStatuses((prev) => new Map(prev).set(sku, { status: "fetching", message: "Veri çekiliyor..." }));
    } else if (status === "processing" && message.includes("analiz ediliyor")) {
      setSkuStatuses((prev) => new Map(prev).set(sku, { status: "analyzing", message: "Analiz ediliyor..." }));
    } else if (status === "success" && message.includes("tamamlandı")) {
      const detailMatch = message.match(/—\s*(.+)$/);
      setSkuStatuses((prev) => new Map(prev).set(sku, { status: "done", message: "Tamamlandı", detail: detailMatch?.[1] }));
    } else if (status === "error") {
      setSkuStatuses((prev) => new Map(prev).set(sku, { status: "error", message: message }));
    }
  }, []);

  /* ── WebSocket connection ── */
  const connectWs = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState <= 1) return;
    setWsState("connecting");
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[WS] Connected to", WS_URL);
      setWsState("connected");
      retryCountRef.current = 0;
      pingRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }));
      }, 25000);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === "status") {
          const { status, message, tool } = msg.payload;
          setStatusEvents((prev) => [
            ...prev,
            { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), status, message, tool, timestamp: Date.now() },
          ]);

          // Track tools
          if (status === "tool_start" && tool) {
            setActiveTools((prev) => [...prev, { name: tool, startedAt: Date.now() }]);
          } else if (status === "tool_end" && tool) {
            setActiveTools((prev) => {
              const idx = prev.findIndex((t) => t.name === tool);
              if (idx >= 0) {
                const finished = { ...prev[idx], endedAt: Date.now() };
                setCompletedTools((c) => [...c, finished]);
                return prev.filter((_, i) => i !== idx);
              }
              return prev;
            });
          }

          // Track per-SKU status
          parseSkuFromMessage(message, status);

          // Auto-switch to live tab when events start
          if (status === "tool_start" || status === "processing" || status === "info") {
            setActiveTab("live");
          }
        } else if (msg.type === "stream_start") {
          replyRef.current = "";
          setAgentReply("");
          setIsAgentLoading(true);
        } else if (msg.type === "stream_chunk") {
          replyRef.current += msg.payload?.text ?? "";
          setAgentReply(replyRef.current);
        } else if (msg.type === "stream_end") {
          setIsAgentLoading(false);
          fetchReports();
          // 3 saniye sonra live state'i temizle ve table'a dön
          setTimeout(() => {
            setStatusEvents([]);
            setActiveTools([]);
            setCompletedTools([]);
            setActiveTab("table");
          }, 3000);
        } else if (msg.type === "pong") {
          // keep-alive response, no action needed
        } else if (msg.type === "error") {
          addToast(msg.payload?.message || "WebSocket hatası", "error");
          setIsAgentLoading(false);
        }
        if (msg.session_id) sessionRef.current = msg.session_id;
      } catch { /* ignore */ }
    };

    ws.onclose = (e) => {
      console.log("[WS] Closed:", e.code, e.reason);
      setWsState("disconnected");
      if (pingRef.current) clearInterval(pingRef.current);
      retryCountRef.current += 1;
      // Exponential backoff: 3s, 6s, 12s, max 30s — stop after 10 retries
      if (retryCountRef.current <= 10) {
        const delay = Math.min(3000 * Math.pow(2, retryCountRef.current - 1), 30000);
        console.log(`[WS] Reconnecting in ${delay / 1000}s (attempt ${retryCountRef.current})`);
        setTimeout(connectWs, delay);
      }
    };
    ws.onerror = (e) => {
      console.error("[WS] Error:", e);
    };
  }, [addToast, parseSkuFromMessage]);

  const sendMessage = useCallback((text: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !text.trim()) return;
    // Reset live state
    setStatusEvents([]);
    setActiveTools([]);
    setCompletedTools([]);
    setSkuStatuses(new Map());
    setTotalSkuCount(0);
    setAgentReply("");
    replyRef.current = "";
    wsRef.current.send(JSON.stringify({
      type: "message",
      payload: { text, profile: "demand_prediction" },
      session_id: sessionRef.current,
    }));
    setIsAgentLoading(true);
  }, []);

  /* ── Fetch reports (REST) ── */
  const fetchReports = useCallback(async () => {
    try {
      const res = await fetch("/api/reports");
      const data = await res.json();
      setReports(Array.isArray(data) ? data : []);
    } catch { setReports([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchReports();
    const interval = setInterval(fetchReports, 30000);
    return () => clearInterval(interval);
  }, [fetchReports]);

  useEffect(() => {
    connectWs();
    return () => { if (pingRef.current) clearInterval(pingRef.current); wsRef.current?.close(); };
  }, [connectWs]);

  // Auto-scroll event feed
  useEffect(() => {
    eventsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [statusEvents]);

  const sorted = useMemo(() => [...reports].sort((a, b) => {
    if (sortKey === "remaining") return (a.stock_remaining_day ?? 999) - (b.stock_remaining_day ?? 999);
    if (sortKey === "critical") return (a.critical_stock_value ?? 999) - (b.critical_stock_value ?? 999);
    if (sortKey === "demand") return (b.avg_daily_quantity ?? 0) - (a.avg_daily_quantity ?? 0);
    if (sortKey === "revenue") return (b.total_revenue ?? 0) - (a.total_revenue ?? 0);
    return 0;
  }), [reports, sortKey]);

  const needsOrderCount = reports.filter((r) => r.needs_order || (r.stock_remaining_day ?? 999) <= 7).length;
  const warningCount = reports.filter((r) => (r.stock_remaining_day ?? 999) > 7 && (r.stock_remaining_day ?? 999) <= 15).length;
  const healthyCount = reports.filter((r) => (r.stock_remaining_day ?? 999) > 15).length;

  const doneSkuCount = Array.from(skuStatuses.values()).filter((s) => s.status === "done" || s.status === "error").length;

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[var(--pinar-gray)]">
        <div className="flex items-center gap-3 text-[var(--pinar-green-500)] text-xl">
          <Spinner className="h-6 w-6" />
          Raporlar yükleniyor...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--pinar-gray)]">
      <div className="max-w-7xl mx-auto p-6 md:p-8">
        {/* Title + WS indicator */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-[var(--pinar-dark)]">Canlı Monitoring</h1>
          <div className="flex items-center gap-3">
            {isAgentLoading && (
              <span className="flex items-center gap-1.5 text-xs text-[var(--pinar-green-500)] font-medium">
                <Spinner className="w-3.5 h-3.5" /> Agent çalışıyor
              </span>
            )}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-gray-200">
              <span className={`w-2 h-2 rounded-full ${wsState === "connected" ? "bg-green-500" : wsState === "connecting" ? "bg-amber-400 animate-pulse" : "bg-red-400"}`} />
              <span className="text-xs text-gray-600">{wsState === "connected" ? "WebSocket Bağlı" : wsState === "connecting" ? "Bağlanıyor..." : "Bağlantı Kesildi"}</span>
              {wsState === "disconnected" && (
                <button onClick={() => { retryCountRef.current = 0; connectWs(); }} className="text-xs text-[var(--pinar-green-500)] font-medium hover:underline cursor-pointer ml-1">
                  Tekrar Bağlan
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Agent Chat Input */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(chatInput); setChatInput(""); } }}
                placeholder="SKU'ları analiz ettir... (ör: 152903427,153107186 analiz et)"
                disabled={wsState !== "connected" || isAgentLoading}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-[var(--pinar-gray)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pinar-green-400)] focus:border-transparent disabled:opacity-50 transition"
              />
            </div>
            <button
              onClick={() => { sendMessage(chatInput); setChatInput(""); }}
              disabled={wsState !== "connected" || isAgentLoading || !chatInput.trim()}
              className="px-5 py-3 rounded-xl bg-[var(--pinar-green-500)] hover:bg-[var(--pinar-green-400)] text-white text-sm font-semibold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {isAgentLoading ? <Spinner className="w-5 h-5" /> : "Gönder"}
            </button>
          </div>
          {agentReply && (
            <div className="mt-3 p-4 bg-[var(--pinar-green-50)] rounded-xl text-sm text-[var(--pinar-dark)] max-h-96 overflow-y-auto prose prose-sm prose-green max-w-none
              prose-headings:text-[var(--pinar-dark)] prose-headings:font-bold prose-headings:mt-3 prose-headings:mb-2
              prose-p:my-1.5 prose-p:leading-relaxed
              prose-strong:text-[var(--pinar-dark)]
              prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5
              prose-table:my-3 prose-th:bg-[var(--pinar-green-500)] prose-th:text-white prose-th:px-3 prose-th:py-1.5 prose-th:text-xs
              prose-td:px-3 prose-td:py-1.5 prose-td:border-b prose-td:border-gray-200 prose-td:text-xs
              prose-code:bg-gray-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-mono
              prose-pre:bg-[var(--pinar-dark)] prose-pre:text-green-300 prose-pre:rounded-lg prose-pre:p-3
              prose-hr:my-3 prose-hr:border-gray-200
              prose-blockquote:border-l-[var(--pinar-green-500)] prose-blockquote:bg-white prose-blockquote:rounded-r-lg prose-blockquote:py-1 prose-blockquote:px-3
            ">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{agentReply}</ReactMarkdown>
              {isAgentLoading && <span className="inline-block w-1.5 h-4 bg-[var(--pinar-green-500)] ml-0.5 animate-pulse" />}
            </div>
          )}
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-center">
            <p className="text-[10px] text-gray-500 uppercase mb-1">Toplam SKU</p>
            <p className="text-2xl font-bold text-[var(--pinar-dark)]">{reports.length}</p>
          </div>
          <div className="bg-red-50 rounded-xl p-4 shadow-sm border border-red-100 text-center">
            <p className="text-[10px] text-red-500 uppercase mb-1">Acil Sipariş</p>
            <p className="text-2xl font-bold text-red-600">{needsOrderCount}</p>
          </div>
          <div className="bg-amber-50 rounded-xl p-4 shadow-sm border border-amber-100 text-center">
            <p className="text-[10px] text-amber-600 uppercase mb-1">Uyarı</p>
            <p className="text-2xl font-bold text-amber-600">{warningCount}</p>
          </div>
          <div className="bg-green-50 rounded-xl p-4 shadow-sm border border-green-100 text-center">
            <p className="text-[10px] text-green-600 uppercase mb-1">Sağlıklı</p>
            <p className="text-2xl font-bold text-green-600">{healthyCount}</p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 mb-4 bg-white rounded-xl p-1 border border-gray-200 w-fit">
          <button onClick={() => setActiveTab("table")} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${activeTab === "table" ? "bg-[var(--pinar-green-500)] text-white" : "text-gray-600 hover:bg-gray-50"}`}>
            Raporlar
          </button>
          <button onClick={() => setActiveTab("live")} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer flex items-center gap-2 ${activeTab === "live" ? "bg-[var(--pinar-green-500)] text-white" : "text-gray-600 hover:bg-gray-50"}`}>
            Canlı İzleme
            {isAgentLoading && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
            {statusEvents.length > 0 && <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${activeTab === "live" ? "bg-white/20 text-white" : "bg-[var(--pinar-green-100)] text-[var(--pinar-green-500)]"}`}>{statusEvents.length}</span>}
          </button>
        </div>

        {/* ═══ LIVE TAB ═══ */}
        {activeTab === "live" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Active Tools + SKU Progress */}
            <div className="lg:col-span-2 space-y-6">
              {/* Active Tools */}
              {activeTools.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                  <h3 className="text-sm font-semibold text-[var(--pinar-dark)] mb-3 flex items-center gap-2">
                    <Spinner className="w-4 h-4 text-[var(--pinar-green-500)]" />
                    Aktif Tool&apos;lar
                  </h3>
                  <div className="space-y-2">
                    {activeTools.map((t, i) => (
                      <div key={i} className="flex items-center justify-between bg-[var(--pinar-green-50)] rounded-lg px-4 py-3 animate-[fadeInLeft_0.3s_ease-out]">
                        <div className="flex items-center gap-3">
                          <span className="text-lg">🔧</span>
                          <div>
                            <p className="text-sm font-semibold text-[var(--pinar-dark)] font-mono">{t.name}</p>
                            <p className="text-[10px] text-gray-500">Çalışıyor...</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 font-mono">{elapsed(Date.now() - t.startedAt)}</span>
                          <span className="w-2 h-2 rounded-full bg-[var(--pinar-green-500)] animate-pulse" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Completed Tools */}
              {completedTools.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                  <h3 className="text-sm font-semibold text-[var(--pinar-dark)] mb-3">✅ Tamamlanan Tool&apos;lar</h3>
                  <div className="space-y-1.5">
                    {completedTools.map((t, i) => (
                      <div key={i} className="flex items-center justify-between bg-green-50 rounded-lg px-4 py-2.5">
                        <span className="text-sm font-mono text-gray-700">{t.name}</span>
                        <span className="text-xs text-green-600 font-medium">{t.endedAt ? elapsed(t.endedAt - t.startedAt) : "—"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Per-SKU Live Progress */}
              {skuStatuses.size > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-[var(--pinar-dark)]">SKU Analiz Durumu</h3>
                    {totalSkuCount > 0 && (
                      <span className="text-xs text-gray-500">{doneSkuCount}/{totalSkuCount} tamamlandı</span>
                    )}
                  </div>
                  {/* Progress bar */}
                  {totalSkuCount > 0 && (
                    <div className="w-full bg-gray-100 rounded-full h-2 mb-4">
                      <div className="bg-[var(--pinar-green-500)] h-2 rounded-full transition-all duration-500" style={{ width: `${(doneSkuCount / totalSkuCount) * 100}%` }} />
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {Array.from(skuStatuses.entries()).map(([sku, info]) => (
                      <div key={sku} className={`rounded-xl px-4 py-3 border transition-all animate-[fadeInLeft_0.2s_ease-out] ${
                        info.status === "done" ? "bg-green-50 border-green-200" :
                        info.status === "error" ? "bg-red-50 border-red-200" :
                        "bg-[var(--pinar-green-50)] border-[var(--pinar-green-200)]"
                      }`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono font-semibold text-sm text-[var(--pinar-dark)]">{sku}</span>
                          {info.status === "done" ? <span className="text-green-600 text-sm">✅</span> :
                           info.status === "error" ? <span className="text-red-500 text-sm">❌</span> :
                           <Spinner className="w-3.5 h-3.5 text-[var(--pinar-green-500)]" />}
                        </div>
                        <p className="text-xs text-gray-600">{info.message}</p>
                        {info.detail && <p className="text-[10px] text-gray-500 mt-0.5">{info.detail}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {statusEvents.length === 0 && !isAgentLoading && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
                  <p className="text-4xl mb-3">📡</p>
                  <p className="text-gray-500 text-sm">Henüz canlı veri yok</p>
                  <p className="text-gray-400 text-xs mt-1">Yukarıdaki chat alanından SKU analizi başlatın</p>
                </div>
              )}
            </div>

            {/* Right: Live Event Feed */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col" style={{ maxHeight: "calc(100vh - 380px)" }}>
              <div className="px-4 py-3 bg-[var(--pinar-dark)] text-white flex items-center justify-between shrink-0">
                <span className="text-sm font-semibold flex items-center gap-2">
                  📋 Event Akışı
                  {isAgentLoading && <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />}
                </span>
                <span className="text-[10px] text-gray-400">{statusEvents.length} event</span>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-1 font-mono text-[11px]">
                {statusEvents.length === 0 ? (
                  <p className="text-gray-400 text-center py-8 text-xs font-sans">Bekleniyor...</p>
                ) : statusEvents.map((e) => (
                  <div key={e.id} className={`px-2.5 py-1.5 rounded-md animate-[fadeInLeft_0.15s_ease-out] ${
                    e.status === "success" || e.status === "tool_end" ? "bg-green-50 text-green-800" :
                    e.status === "error" ? "bg-red-50 text-red-700" :
                    e.status === "tool_start" ? "bg-blue-50 text-blue-700" :
                    e.status === "info" ? "bg-indigo-50 text-indigo-700" :
                    "bg-gray-50 text-gray-700"
                  }`}>
                    <span className="text-gray-400 mr-1.5">{new Date(e.timestamp).toLocaleTimeString("tr-TR")}</span>
                    {e.message}
                  </div>
                ))}
                <div ref={eventsEndRef} />
              </div>
            </div>
          </div>
        )}

        {/* ═══ TABLE TAB ═══ */}
        {activeTab === "table" && (
          <>
            {/* Sort Controls */}
            <div className="flex items-center gap-2 mb-4">
              <span className="text-sm text-gray-500">Sırala:</span>
              {([["remaining", "Kalan Gün"], ["demand", "Talep"], ["revenue", "Gelir"], ["critical", "Kritik Stok"]] as const).map(([key, label]) => (
                <button key={key} onClick={() => setSortKey(key)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${sortKey === key ? "bg-[var(--pinar-green-500)] text-white" : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"}`}>
                  {label}
                </button>
              ))}
            </div>

            {/* Reports Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-[var(--pinar-green-500)] text-white text-xs uppercase tracking-wide">
                      <th className="px-4 py-3">SKU</th>
                      <th className="px-4 py-3">Talep</th>
                      <th className="px-4 py-3">Kalan Gün</th>
                      <th className="px-4 py-3">Stok Bitiş</th>
                      <th className="px-4 py-3">Kritik Stok</th>
                      <th className="px-4 py-3">Günlük Ort.</th>
                      <th className="px-4 py-3">Önerilen Fiyat</th>
                      <th className="px-4 py-3">İndirim</th>
                      <th className="px-4 py-3">Gelir</th>
                      <th className="px-4 py-3">Trend</th>
                      <th className="px-4 py-3">Aksiyon</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {sorted.map((r) => {
                      const demand = demandBadge(r.demand_level);
                      const os = orders.get(r.sku) ?? "idle";
                      const isExpanded = expandedSku === r.sku;
                      return (
                        <tr key={r.sku} className={`hover:bg-[var(--pinar-green-50)] transition-colors cursor-pointer ${(r.stock_remaining_day ?? 999) <= 7 ? "bg-red-50/50" : ""}`} onClick={() => setExpandedSku(isExpanded ? null : r.sku)}>
                          <td className="px-4 py-3 font-mono font-semibold text-[var(--pinar-dark)]">{r.sku}</td>
                          <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${demand.cls}`}>{demand.text}</span></td>
                          <td className={`px-4 py-3 font-bold ${remainingColor(r.stock_remaining_day)}`}>{r.stock_remaining_day ?? "—"}</td>
                          <td className="px-4 py-3 text-gray-600">{r.stock_end_date ?? "—"}</td>
                          <td className="px-4 py-3">{r.critical_stock_value ?? "—"}</td>
                          <td className="px-4 py-3">{r.avg_daily_quantity ?? "—"}</td>
                          <td className="px-4 py-3">{r.recommended_price != null ? `₺${r.recommended_price}` : "—"}</td>
                          <td className="px-4 py-3 text-amber-600 font-medium">{r.recommended_discount != null ? `%${r.recommended_discount}` : "—"}</td>
                          <td className="px-4 py-3">{r.total_revenue != null ? `₺${r.total_revenue.toLocaleString("tr-TR")}` : "—"}</td>
                          <td className="px-4 py-3">
                            {r.weekly_trend_pct != null ? (
                              <span className={`font-semibold ${r.weekly_trend_pct >= 0 ? "text-green-600" : "text-red-600"}`}>
                                {r.weekly_trend_pct >= 0 ? "↑" : "↓"}{Math.abs(r.weekly_trend_pct)}%
                              </span>
                            ) : "—"}
                          </td>
                          <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                            {os === "done" ? (
                              <span className="text-[var(--pinar-green-500)] text-xs font-semibold">✓ Verildi</span>
                            ) : os === "already_ordered" ? (
                              <span className="text-amber-500 text-xs">Zaten verilmiş</span>
                            ) : os === "error" ? (
                              <button onClick={() => placeOrder(r.sku)} className="text-xs text-red-500 hover:underline cursor-pointer">Tekrar Dene</button>
                            ) : (r.stock_remaining_day ?? 999) <= 15 ? (
                              <button onClick={() => placeOrder(r.sku)} disabled={os === "loading"} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer disabled:opacity-50 ${(r.stock_remaining_day ?? 999) <= 7 ? "bg-red-500 hover:bg-red-600 text-white" : "bg-[var(--pinar-green-500)] hover:bg-[var(--pinar-green-400)] text-white"}`}>
                                {os === "loading" ? "..." : (r.stock_remaining_day ?? 999) <= 7 ? "Acil Sipariş" : "Sipariş Ver"}
                              </button>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            {reports.length === 0 && (
              <div className="text-center text-gray-400 py-16">Henüz analiz raporu bulunmuyor.</div>
            )}
          </>
        )}
      </div>

      {/* Toast notifications */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3">
        {toasts.map((t) => (
          <div key={t.id} className={`px-5 py-3 rounded-xl shadow-lg text-sm font-medium animate-[slideIn_0.3s_ease-out] flex items-center gap-2 ${t.type === "success" ? "bg-[var(--pinar-green-500)] text-white" : t.type === "warning" ? "bg-amber-500 text-white" : "bg-red-500 text-white"}`}>
            {t.type === "success" && <span>✓</span>}
            {t.type === "warning" && <span>⚠️</span>}
            {t.type === "error" && <span>✕</span>}
            {t.message}
          </div>
        ))}
      </div>
    </main>
  );
}
