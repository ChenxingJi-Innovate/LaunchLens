import "./globals.css"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Quorum — 让市场与用户共同为你的产品想法投票",
  description: "Product idea validation for PMs: grounded market intelligence (supply) fused with a synthetic customer panel (demand).",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hans">
      <body className="font-sans antialiased">{children}</body>
    </html>
  )
}
