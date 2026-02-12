"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ProductPrediction } from "@/types/prediction";
import Link from "next/link";
import Image from "next/image";

function ResultsContent() {
  const searchParams = useSearchParams();
  const [predictions, setPredictions] = useState<ProductPrediction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const idsParam = searchParams.get("ids");
    if (!idsParam) {
      setLoading(false);
      return;
    }

    async function fetchPredictions() {
      try {
        const res = await fetch("/api/predict", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ product_ids: idsParam!.split(",") }),
        });
        const data = await res.json();
        setPredictions(data);
      } catch (err) {
        console.error("Prediction fetch failed:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchPredictions();
  }, [searchParams]);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[var(--pinar-gray)]">
        <div className="flex items-center gap-3 text-[var(--pinar-green-500)] text-xl">
          <svg className="animate-spin h-6 w-6" fill="none" viewBox="0 0 24 24" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Tahminler hesaplanıyor...
        </div>
      </main>
    );
  }

  if (predictions.length === 0) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-[var(--pinar-gray)] gap-4">
        <p className="text-gray-500 text-lg">Gösterilecek tahmin sonucu bulunamadı.</p>
        <Link
          href="/self-prediction"
          className="text-[var(--pinar-green-500)] hover:text-[var(--pinar-green-400)] font-medium transition-colors"
        >
          ← Ürün Seçimine Dön
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--pinar-gray)] p-6 md:p-8">
      <div className="max-w-7xl mx-auto">
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
              Tahmin Sonuçları
            </h1>
          </div>
          <Link
            href="/self-prediction"
            className="text-[var(--pinar-green-500)] hover:text-[var(--pinar-green-400)] font-medium transition-colors"
          >
            ← Ürün Seçimi
          </Link>
        </div>

        {/* Results Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-[var(--pinar-green-500)] text-white text-sm uppercase tracking-wide">
                <th className="px-5 py-4">Ürün</th>
                <th className="px-5 py-4">Mevcut Stok</th>
                <th className="px-5 py-4">Fiyat</th>
                <th className="px-5 py-4">Tahmini Toplam</th>
                <th className="px-5 py-4">Hafta 1</th>
                <th className="px-5 py-4">Hafta 2</th>
                <th className="px-5 py-4">Hafta 3</th>
                <th className="px-5 py-4">Hafta 4</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {predictions.map((p) => (
                <tr
                  key={p.product_id}
                  className="text-gray-700 hover:bg-[var(--pinar-green-50)] transition-colors"
                >
                  <td className="px-5 py-4 flex items-center gap-3">
                    <img
                      src={p.image}
                      alt={p.title}
                      width={40}
                      height={40}
                      className="rounded-lg"
                    />
                    <div>
                      <div className="font-semibold text-[var(--pinar-dark)]">
                        {p.title}
                      </div>
                      <div className="text-xs text-gray-400">
                        {p.product_id}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">{p.stock}</td>
                  <td className="px-5 py-4">₺{p.price}</td>
                  <td className="px-5 py-4 font-bold text-[var(--pinar-green-500)]">
                    {p.predited_total_stock}
                  </td>
                  <td className="px-5 py-4">{p.predict_periods.week1}</td>
                  <td className="px-5 py-4">{p.predict_periods.week2}</td>
                  <td className="px-5 py-4">{p.predict_periods.week3}</td>
                  <td className="px-5 py-4">{p.predict_periods.week4}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
