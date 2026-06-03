import "./globals.css"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Customer Jury · 让 AI 客户为你的商业决策投票",
  description: "Customer Jury: describe your situation and the decision you face, give a few options (or let AI draft them), and a panel of imagined customers votes for the smartest business move.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hans">
      <body className="font-sans antialiased">{children}</body>
    </html>
  )
}
