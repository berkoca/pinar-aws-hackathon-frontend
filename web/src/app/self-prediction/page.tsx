"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Product } from "@shared/types/product";

export default function SelfPredictionPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [reportMap, setReportMap] = useState<Map<string, Pick<Product, "critical_stock_value" | "stock_end_date" | "stock_remaining_day">>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<string>("default");
  const [showScrollTop, setShowScrollTop] = useState(false);
  const reportAbortRef = useRef<AbortController | null>(null);
  const router = useRouter();

  useEffect(() => {
    function onScroll() {
      setShowScrollTop(window.scrollY > 400);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const fetchReport = useCallback(async (sku: string, signal: AbortSignal) => {
    try {
      const res = await fetch(`/api/report/${sku}`, { signal });
      if (!res.ok) return;
      const report = await res.json();
      if (!report) return;
      setReportMap((prev) => {
        const next = new Map(prev);
        next.set(sku, { critical_stock_value: report.critical_stock_value, stock_end_date: report.stock_end_date, stock_remaining_day: report.stock_remaining_day });
        return next;
      });
    } catch {
      // aborted or failed — skip
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    reportAbortRef.current = controller;

    async function fetchProducts() {
      try {
        const res = await fetch("/api/products");
        const data: Product[] = await res.json();
        setProducts(data);
        setLoading(false);

        // Fetch reports with max 2 concurrent to keep connection pool free
        const queue = [...data];
        async function worker() {
          while (queue.length > 0 && !controller.signal.aborted) {
            const product = queue.shift();
            if (product) await fetchReport(product.product_id, controller.signal);
          }
        }
        // Start 2 workers
        worker();
        worker();
      } catch (err) {
        console.error("Products fetch failed:", err);
        setLoading(false);
      }
    }
    fetchProducts();

    return () => controller.abort();
  }, [fetchReport]);

  // Merge products with report data
  const enrichedProducts = useMemo(() => {
    return products.map((p) => {
      const report = reportMap.get(p.product_id);
      return report ? { ...p, ...report } : p;
    });
  }, [products, reportMap]);

  function isCritical(p: Product) {
    if (p.critical_stock_value != null) return p.stock <= p.critical_stock_value;
    return p.stock < 20;
  }

  function stockSeverity(p: Product): "critical" | "warning" | "healthy" {
    if (isCritical(p)) return "critical";
    if (p.stock_remaining_day != null && p.stock_remaining_day <= 14) return "warning";
    if (p.critical_stock_value != null && p.stock <= p.critical_stock_value * 2) return "warning";
    if (p.stock < 100) return "warning";
    return "healthy";
  }

  const filtered = useMemo(() => {
    let list = enrichedProducts;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.product_id.toLowerCase().includes(q)
      );
    }
    if (sort === "critical") {
      const severityOrder = { critical: 0, warning: 1, healthy: 2 };
      list = [...list].sort((a, b) => severityOrder[stockSeverity(a)] - severityOrder[stockSeverity(b)] || a.stock - b.stock);
    }
    else if (sort === "name-asc") list = [...list].sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === "name-desc") list = [...list].sort((a, b) => b.title.localeCompare(a.title));
    else if (sort === "stock-asc") list = [...list].sort((a, b) => a.stock - b.stock);
    else if (sort === "stock-desc") list = [...list].sort((a, b) => b.stock - a.stock);
    // Default: report data loaded first
    if (sort === "default") {
      list = [...list].sort((a, b) => {
        const aHas = a.critical_stock_value != null ? 0 : 1;
        const bHas = b.critical_stock_value != null ? 0 : 1;
        return aHas - bHas;
      });
    }
    return list;
  }, [enrichedProducts, search, sort]);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((p) => selected.has(p.product_id));

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allFilteredSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        filtered.forEach((p) => next.delete(p.product_id));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        filtered.forEach((p) => next.add(p.product_id));
        return next;
      });
    }
  }

  function handleAnalyze() {
    // Abort pending report fetches so they don't block navigation
    reportAbortRef.current?.abort();
    const ids = Array.from(selected);
    const params = new URLSearchParams({ ids: ids.join(",") });
    router.push(`/self-prediction-results?${params.toString()}`);
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[var(--pinar-gray)]">
        <div className="flex items-center gap-3 text-[var(--pinar-green-500)] text-xl">
          <svg className="animate-spin h-6 w-6" fill="none" viewBox="0 0 24 24" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Ürünler yükleniyor...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--pinar-gray)]">
      <div className="max-w-6xl mx-auto">
        {/* Sticky Header Group */}
        <div className="sticky top-20 z-20 bg-[var(--pinar-gray)] pt-4 px-6 md:px-8 pb-4">
          {/* Page Title */}
          <h1 className="text-2xl md:text-3xl font-bold text-[var(--pinar-green-500)] mb-4">
            Ürün Seçimi
          </h1>

          {/* Search + Select All + Analyze */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4">
            <div className="relative flex-1">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
                fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Ürün adı veya ID ile ara..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-12 pr-4 py-4 rounded-xl border border-gray-200 bg-white text-base focus:outline-none focus:ring-2 focus:ring-[var(--pinar-green-400)] focus:border-transparent transition"
              />
            </div>

            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="px-4 py-4 rounded-xl border border-gray-200 bg-white text-base text-gray-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--pinar-green-400)]"
            >
              <option value="default">Sıralama</option>
              <option value="critical">Kritik Stok</option>
              <option value="name-asc">İsim (A-Z)</option>
              <option value="name-desc">İsim (Z-A)</option>
              <option value="stock-asc">Stok (Artan)</option>
              <option value="stock-desc">Stok (Azalan)</option>
            </select>

            <button
              onClick={toggleSelectAll}
              className="px-6 py-4 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-base font-medium text-gray-700 transition-colors cursor-pointer whitespace-nowrap"
            >
              {allFilteredSelected ? "Seçimi Kaldır" : "Tümünü Seç"}
            </button>

            <button
              onClick={() => {
                const criticalIds = enrichedProducts.filter((p) => isCritical(p)).map((p) => p.product_id);
                setSelected((prev) => {
                  const next = new Set(prev);
                  const allSelected = criticalIds.every((id) => next.has(id));
                  criticalIds.forEach((id) => allSelected ? next.delete(id) : next.add(id));
                  return next;
                });
              }}
              className="px-6 py-4 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-base font-medium text-red-600 transition-colors cursor-pointer whitespace-nowrap"
            >
              🔴 Kritik Stok
            </button>

            {selected.size > 0 && (
              <button
                onClick={handleAnalyze}
                className="px-8 py-4 rounded-xl bg-[var(--pinar-green-500)] hover:bg-[var(--pinar-green-400)] text-white text-base font-semibold transition-all cursor-pointer shadow-md hover:shadow-lg whitespace-nowrap"
              >
                Analiz Et ({selected.size})
              </button>
            )}
          </div>
        </div>

        {/* Product Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 px-6 md:px-8 pb-6 md:pb-8">
          {filtered.map((p) => {
            const isSelected = selected.has(p.product_id);
            const severity = stockSeverity(p);
            const badgeColor = severity === "critical" ? "bg-red-500 stock-critical" : severity === "warning" ? "bg-amber-500" : "bg-[var(--pinar-green-500)]";
            return (
              <div
                key={p.product_id}
                onClick={() => toggleSelect(p.product_id)}
                className={`relative bg-white rounded-2xl cursor-pointer transition-all border-2 hover:shadow-lg overflow-hidden flex flex-row ${isSelected
                    ? "border-[var(--pinar-green-500)] shadow-lg"
                    : "border-transparent shadow-sm hover:border-gray-200"
                  }`}
              >
                {/* Checkbox - sol üst */}
                <div
                  className={`absolute top-3 left-3 z-10 w-7 h-7 rounded-full flex items-center justify-center transition-colors ${isSelected
                      ? "bg-[var(--pinar-green-500)]"
                      : "bg-white/80 border-2 border-gray-300"
                    }`}
                >
                  {isSelected && (
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>

                {/* Stock Badge - sağ üst */}
                <div className={`absolute top-3 right-3 z-10 w-16 h-16 rounded-full shadow-sm flex flex-col items-center justify-center ${badgeColor}`}>
                  <span className="text-[9px] font-medium text-white/80 uppercase leading-none">Stok</span>
                  <span className="text-xl font-bold text-white leading-tight">{p.stock}</span>
                </div>

                {/* Product Image */}
                <div className="bg-white flex items-center justify-center p-8 pt-20 w-56 shrink-0">
                  <img
                    src={p.image}
                    alt={p.title}
                    className="w-full h-48 object-contain"
                  />
                </div>

                {/* Product Info */}
                <div className="p-5 mt-3 flex flex-col justify-center flex-1 border-l border-gray-100">
                  <h3 className="font-semibold text-[var(--pinar-dark)] text-base leading-snug mb-1">
                    {p.title}
                  </h3>
                  <p className="text-xs text-gray-400 mb-3">{p.product_id}</p>

                  {/* Report info */}
                  {p.stock_remaining_day != null && (
                    <div className="flex flex-col gap-1.5 mb-3">
                      <div className="flex items-center gap-1.5">
                        <span className={`inline-block w-2 h-2 rounded-full ${severity === "critical" ? "bg-red-500" : severity === "warning" ? "bg-amber-400" : "bg-green-500"}`} />
                        <span className={`text-sm font-medium ${severity === "critical" ? "text-red-600" : severity === "warning" ? "text-amber-600" : "text-green-600"}`}>
                          {p.stock_remaining_day} gün kaldı
                        </span>
                      </div>
                      {p.stock_end_date && (
                        <span className="text-xs text-gray-400">
                          Bitiş: {p.stock_end_date}
                        </span>
                      )}
                      {p.critical_stock_value != null && (
                        <span className="text-xs text-gray-400">
                          Kritik seviye: {p.critical_stock_value}
                        </span>
                      )}
                    </div>
                  )}

                  <span className="text-2xl font-bold text-[var(--pinar-dark)]">
                    ₺{p.price}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <div className="text-center text-gray-400 py-16 px-6">
            Aramanızla eşleşen ürün bulunamadı.
          </div>
        )}
      </div>

      {/* Scroll to top */}
      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-6 right-6 z-30 w-12 h-12 rounded-full bg-[var(--pinar-green-500)] text-white shadow-lg hover:bg-[var(--pinar-green-400)] transition-all cursor-pointer flex items-center justify-center hover:scale-110"
          aria-label="Yukarı çık"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
          </svg>
        </button>
      )}
    </main>
  );
}
