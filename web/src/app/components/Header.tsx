"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/monitoring", label: "Monitoring" },
  { href: "/self-prediction", label: "Analiz" },

];

export default function Header() {
  const pathname = usePathname();

  // Hide header on landing page
  if (pathname === "/") return null;

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-6 flex items-center justify-between h-20">
        <Link href="/" className="shrink-0">
          <Image src="/pinar_logo.png" alt="Pınar Logo" width={100} height={40} priority />
        </Link>
        <nav className="flex items-center gap-1">
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isActive
                    ? "bg-[var(--pinar-green-50)] text-[var(--pinar-green-500)]"
                    : "text-gray-600 hover:text-[var(--pinar-green-500)] hover:bg-gray-50"
                  }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
