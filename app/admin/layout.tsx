import type { Metadata } from "next";

import "./admin.css";

export const metadata: Metadata = {
  title: "Cumulus admin",
  robots: { index: false, follow: false },
};

// Admin pages always show live data and the signed-in user, so they are never cached.
export const dynamic = "force-dynamic";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="adm">{children}</div>;
}
