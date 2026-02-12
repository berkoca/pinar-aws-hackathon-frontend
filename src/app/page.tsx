"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";

export default function Home() {
  const router = useRouter();

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-b from-white via-white to-[#a8dda8] relative overflow-hidden">
      {/* Decorative blurred circles */}
      <div className="absolute top-[-10%] left-[-5%] w-[500px] h-[500px] bg-[#47A141]/20 rounded-full blur-3xl" />
      <div className="absolute bottom-[-15%] right-[-10%] w-[600px] h-[600px] bg-[#2d6e2a]/25 rounded-full blur-3xl" />

      <div className="relative z-10 max-w-xl text-center px-6">
        <div className="mb-8">
          <Image
            src="/pinar_logo.png"
            alt="Pınar Logo"
            width={280}
            height={120}
            className="mx-auto drop-shadow-lg"
            priority
          />
        </div>

        <h1 className="text-4xl font-bold text-[var(--pinar-dark)] mb-4">
          Demand Prediction System
        </h1>
        <p className="text-gray-600 text-lg mb-10 leading-relaxed">
          Gelecek haftalardaki satış taleplerini öngörün, depo stoklarınızı
          optimize edin. Yapay zeka destekli tahmin sistemiyle hangi üründen ne
          kadar stok çekmeniz gerektiğini önceden planlayın.
        </p>
        <button
          onClick={() => router.push("/self-prediction")}
          className="group bg-[var(--pinar-green-500)] text-white hover:bg-[var(--pinar-green-400)] font-semibold py-3 px-10 rounded-lg text-lg transition-all cursor-pointer shadow-lg hover:shadow-xl hover:scale-105 inline-flex items-center gap-2"
        >
          Başla
          <svg
            className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M13 7l5 5m0 0l-5 5m5-5H6"
            />
          </svg>
        </button>
      </div>
    </main>
  );
}
