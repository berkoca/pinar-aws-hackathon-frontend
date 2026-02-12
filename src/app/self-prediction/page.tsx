"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Product } from "@/types/product";
import Link from "next/link";
import Image from "next/image";

export default function SelfPredictionPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const router = useRouter();

  useEffect(() => {
    async function fetchProducts() {
      try {
        const res = await fetch("/api/products");
        const data = await res.json();
        setProducts(data);
      } catch (err) {
        console.error("Products fetch failed:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchProducts();
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return products;
    const q = search.toLowerCase();
    return products.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.product_id.toLowerCase().includes(q)
    );
  }, [products, search]);

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
    <main className="min-h-screen bg-[var(--pinar-gray)] p-6 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Image
                src="/pinar_logo.png"
                alt="Pınar Logo"
                width={120}
                height={50}
                className="cursor-pointer"
              />
            </Link>
            <h1 className="text-2xl md:text-3xl font-bold text-[var(--pinar-dark)]">
              Ürün Seçimi
            </h1>
          </div>
          <Link
            href="/"
            className="text-[var(--pinar-green-500)] hover:text-[var(--pinar-green-400)] font-medium transition-colors"
          >
            ← Ana Sayfa
          </Link>
        </div>

        {/* Search + Select All + Analyze */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-6">
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
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-[var(--pinar-green-400)] focus:border-transparent transition"
            />
          </div>

          <button
            onClick={toggleSelectAll}
            className="px-4 py-2.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-sm font-medium text-gray-700 transition-colors cursor-pointer whitespace-nowrap"
          >
            {allFilteredSelected ? "Seçimi Kaldır" : "Tümünü Seç"}
          </button>

          {selected.size > 0 && (
            <button
              onClick={handleAnalyze}
              className="px-6 py-2.5 rounded-lg bg-[var(--pinar-green-500)] hover:bg-[var(--pinar-green-400)] text-white font-semibold transition-all cursor-pointer shadow-md hover:shadow-lg whitespace-nowrap"
            >
              Analiz Et ({selected.size})
            </button>
          )}
        </div>

        {/* Product Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((p) => {
            const isSelected = selected.has(p.product_id);
            return (
              <div
                key={p.product_id}
                onClick={() => toggleSelect(p.product_id)}
                className={`relative bg-white rounded-xl p-4 cursor-pointer transition-all border-2 hover:shadow-md ${
                  isSelected
                    ? "border-[var(--pinar-green-500)] shadow-md"
                    : "border-transparent shadow-sm hover:border-gray-200"
                }`}
              >
                {/* Checkbox */}
                <div
                  className={`absolute top-3 right-3 w-5 h-5 rounded flex items-center justify-center transition-colors ${
                    isSelected
                      ? "bg-[var(--pinar-green-500)]"
                      : "border-2 border-gray-300"
                  }`}
                >
                  {isSelected && (
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>

                <img
                  src={p.image}
                  alt={p.title}
                  width={64}
                  height={64}
                  className="rounded-lg mb-3"
                />
                <h3 className="font-semibold text-[var(--pinar-dark)] text-sm mb-1">
                  {p.title}
                </h3>
                <p className="text-xs text-gray-400 mb-2">{p.product_id}</p>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Stok: {p.stock}</span>
                  <span className="font-semibold text-[var(--pinar-green-500)]">
                    ₺{p.price}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <div className="text-center text-gray-400 py-16">
            Aramanızla eşleşen ürün bulunamadı.
          </div>
        )}
      </div>
    </main>
  );
}
