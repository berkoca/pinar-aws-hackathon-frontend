"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { AnalysisReport } from "@shared/types/prediction";
import Link from "next/link";

type AnalysisResult = AnalysisReport & {
  _status: "loading" | "done" | "error";
  _error?: string;
};

type OrderStatus = "idle" | "loading" | "done" | "error" | "already_ordered";

type Toast = {
  id: number;
  message: string;
  type: "success" | "warning" | "error";
};

function demandLabel(level: string) {
  switch (level) {
    case "high": return { text: "Yüksek", color: "bg-red-100 text-red-700" };
    case "medium": return { text: "Orta", color: "bg-amber-100 text-amber-700" };
    case "low": return { text: "Düşük", color: "bg-green-100 text-green-700" };
    default: return { text: level, color: "bg-gray-100 text-gray-700" };
  }
}

function ResultsContent() {
  const searchParams = useSearchParams();
  const [results, setResults] = useState<Map<string, AnalysisResult>>(new Map());
  const [skus, setSkus] = useState<string[]>([]);
  const [orders, setOrders] = useState<Map<string, OrderStatus>>(new Map());
  const [toasts, setToasts] = useState<Toast[]>([]);

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

  const analyzeProduct = useCallback(async (sku: string) => {
    try {
      const res = await fetch(`/api/analyze/${sku}`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const report: AnalysisReport = json.data ?? json;
      setResults((prev) => {
        const next = new Map(prev);
        next.set(sku, { ...report, sku, _status: "done" });
        return next;
      });
    } catch (err) {
      setResults((prev) => {
        const next = new Map(prev);
        next.set(sku, { _status: "error", _error: String(err), sku } as AnalysisResult);
        return next;
      });
    }
  }, []);

  useEffect(() => {
    const idsParam = searchParams.get("ids");
    if (!idsParam) return;
    const ids = idsParam.split(",");
    setSkus(ids);
    // Set all as loading
    setResults(new Map(ids.map((id) => [id, { _status: "loading", sku: id } as AnalysisResult])));
    // Fire all analyses in parallel
    ids.forEach((id) => analyzeProduct(id));
  }, [searchParams, analyzeProduct]);

  const doneCount = Array.from(results.values()).filter((r) => r._status !== "loading").length;
  const totalCount = skus.length;

  if (totalCount === 0) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-[var(--pinar-gray)] gap-4">
        <p className="text-gray-500 text-lg">Gösterilecek analiz sonucu bulunamadı.</p>
        <Link href="/self-prediction" className="text-[var(--pinar-green-500)] hover:text-[var(--pinar-green-400)] font-medium transition-colors">
          ← Ürün Seçimine Dön
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--pinar-gray)]">
      <div className="max-w-7xl mx-auto p-6 md:p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-[var(--pinar-dark)]">Analiz Sonuçları</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">{doneCount}/{totalCount} tamamlandı</span>
            <Link href="/self-prediction" className="text-[var(--pinar-green-500)] hover:text-[var(--pinar-green-400)] font-medium transition-colors">
              ← Ürün Seçimi
            </Link>
          </div>
        </div>

        {/* Progress bar */}
        {doneCount < totalCount && (
          <div className="w-full bg-gray-200 rounded-full h-2 mb-6">
            <div
              className="bg-[var(--pinar-green-500)] h-2 rounded-full transition-all duration-500"
              style={{ width: `${(doneCount / totalCount) * 100}%` }}
            />
          </div>
        )}

        {/* Results Grid */}
        <div className="grid grid-cols-1 gap-6">
          {skus.map((sku) => {
            const r = results.get(sku);
            if (!r || r._status === "loading") {
              return (
                <div key={sku} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 animate-pulse">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-6 h-6 rounded-full bg-gray-200" />
                    <div className="h-5 bg-gray-200 rounded w-40" />
                  </div>
                  <div className="space-y-3">
                    <div className="h-4 bg-gray-100 rounded w-full" />
                    <div className="h-4 bg-gray-100 rounded w-3/4" />
                    <div className="h-4 bg-gray-100 rounded w-1/2" />
                  </div>
                  <p className="text-xs text-gray-400 mt-4">{sku} analiz ediliyor...</p>
                </div>
              );
            }
            if (r._status === "error") {
              return (
                <div key={sku} className="bg-white rounded-2xl p-6 shadow-sm border border-red-200">
                  <p className="font-semibold text-red-600 mb-1">{sku}</p>
                  <p className="text-sm text-red-500">Analiz başarısız: {r._error}</p>
                  <button onClick={() => { setResults((prev) => { const n = new Map(prev); n.set(sku, { _status: "loading", sku } as AnalysisResult); return n; }); analyzeProduct(sku); }}
                    className="mt-3 text-sm text-[var(--pinar-green-500)] hover:underline cursor-pointer">
                    Tekrar Dene
                  </button>
                </div>
              );
            }

            const demand = demandLabel(r.demand_level);
            return (
              <div key={sku} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                {/* SKU + Demand Badge */}
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-[var(--pinar-dark)] text-lg">{r.sku}</h3>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${demand.color}`}>
                    Talep: {demand.text}
                  </span>
                </div>

                {/* Key Metrics */}
                <div className="grid grid-cols-4 gap-3 mb-4">
                  <div className="bg-blue-50 rounded-xl p-3 text-center">
                    <p className="text-[10px] text-gray-500 uppercase">Önerilen Sipariş</p>
                    <p className="text-2xl font-bold text-blue-600">{Math.ceil(r.avg_daily_quantity * 30)}</p>
                    <p className="text-[9px] text-gray-400">adet / 30 gün</p>
                  </div>
                  <div className="bg-[var(--pinar-green-50)] rounded-xl p-3 text-center">
                    <p className="text-[10px] text-gray-500 uppercase">Kalan Gün</p>
                    <p className={`text-2xl font-bold ${r.stock_remaining_day <= 7 ? "text-red-600" : r.stock_remaining_day <= 14 ? "text-amber-600" : "text-[var(--pinar-green-500)]"}`}>
                      {r.stock_remaining_day}
                    </p>
                  </div>
                  <div className="bg-[var(--pinar-green-50)] rounded-xl p-3 text-center">
                    <p className="text-[10px] text-gray-500 uppercase">Kritik Stok</p>
                    <p className="text-2xl font-bold text-[var(--pinar-dark)]">{r.critical_stock_value}</p>
                  </div>
                  <div className="bg-[var(--pinar-green-50)] rounded-xl p-3 text-center">
                    <p className="text-[10px] text-gray-500 uppercase">Günlük Ort.</p>
                    <p className="text-2xl font-bold text-[var(--pinar-dark)]">{r.avg_daily_quantity}</p>
                  </div>
                </div>

                {/* Financial Info */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="bg-gray-50 rounded-xl p-3 text-center">
                    <p className="text-[10px] text-gray-500 uppercase">Önerilen Fiyat</p>
                    <p className="text-lg font-bold text-[var(--pinar-dark)]">₺{r.recommended_price}</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3 text-center">
                    <p className="text-[10px] text-gray-500 uppercase">İndirim</p>
                    <p className="text-lg font-bold text-amber-600">%{r.recommended_discount}</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3 text-center">
                    <p className="text-[10px] text-gray-500 uppercase">Toplam Gelir</p>
                    <p className="text-lg font-bold text-[var(--pinar-dark)]">₺{r.total_revenue?.toLocaleString("tr-TR")}</p>
                  </div>
                </div>

                {/* Trend + End Date */}
                <div className="flex items-center justify-between text-sm mb-4">
                  <span className="text-gray-500">Stok Bitiş: <span className="font-medium text-[var(--pinar-dark)]">{r.stock_end_date}</span></span>
                  <span className={`font-semibold ${r.weekly_trend_pct >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {r.weekly_trend_pct >= 0 ? "↑" : "↓"} %{Math.abs(r.weekly_trend_pct)} haftalık trend
                  </span>
                </div>

                {/* Action Plan */}
                {r.action_plan && r.action_plan.length > 0 && (
                  <div className="border-t border-gray-100 pt-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Aksiyon Planı</p>
                    <div className="flex flex-wrap gap-2">
                      {r.action_plan.map((action, i) => (
                        <span key={i} className="inline-flex items-center gap-1 px-3 py-1.5 bg-[var(--pinar-green-50)] text-[var(--pinar-green-500)] rounded-lg text-xs font-medium">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                          {action}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Needs Order Warning */}
                {r.needs_order && (
                  <div className="mt-3 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
                    <span className="text-red-500 text-lg">⚠️</span>
                    <span className="text-sm font-medium text-red-700">Sipariş verilmesi gerekiyor</span>
                  </div>
                )}

                {/* Order Button */}
                <div className="mt-4 border-t border-gray-100 pt-4 flex justify-center">
                  {(() => {
                    const os = orders.get(sku) ?? "idle";
                    if (os === "done") return (
                      <div className="flex items-center gap-2 text-[var(--pinar-green-500)]">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        <span className="text-sm font-semibold">Sipariş verildi</span>
                      </div>
                    );
                    if (os === "already_ordered") return (
                      <div className="flex items-center gap-2 text-amber-600">
                        <span className="text-sm font-medium">Bu ürün için sipariş zaten verilmiş</span>
                      </div>
                    );
                    if (os === "error") return (
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-red-500">Sipariş başarısız</span>
                        <button onClick={() => placeOrder(sku)} className="text-sm text-[var(--pinar-green-500)] hover:underline cursor-pointer">Tekrar Dene</button>
                      </div>
                    );
                    return (
                      <button
                        onClick={(e) => { e.stopPropagation(); placeOrder(sku); }}
                        disabled={os === "loading"}
                        className={`px-12 py-4 rounded-xl font-semibold text-base transition-all cursor-pointer ${
                          r.needs_order
                            ? "bg-red-500 hover:bg-red-600 text-white shadow-md"
                            : "bg-[var(--pinar-green-500)] hover:bg-[var(--pinar-green-400)] text-white shadow-md"
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        {os === "loading" ? "Sipariş veriliyor..." : r.needs_order ? `⚠️ Sipariş Ver — ${Math.ceil(r.avg_daily_quantity * 30)} adet (Acil)` : `Sipariş Ver — ${Math.ceil(r.avg_daily_quantity * 30)} adet`}
                        {os !== "loading" && (
                          <svg className="w-4 h-4 ml-1 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                          </svg>
                        )}
                      </button>
                    );
                  })()}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Toast notifications */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`px-5 py-3 rounded-xl shadow-lg text-sm font-medium animate-[slideIn_0.3s_ease-out] flex items-center gap-2 ${
              t.type === "success" ? "bg-[var(--pinar-green-500)] text-white" :
              t.type === "warning" ? "bg-amber-500 text-white" :
              "bg-red-500 text-white"
            }`}
          >
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

export default function SelfPredictionResultsPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center bg-[var(--pinar-gray)]">
          <div className="text-[var(--pinar-green-500)] text-xl">Yükleniyor...</div>
        </main>
      }
    >
      <ResultsContent />
    </Suspense>
  );
}