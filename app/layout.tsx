// PATH: C:\\Users\\prome\\anaconda_projects\\capstone_stockPredict\\web\\app\\layout.tsx
import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Stock Prediction Dashboard",
  description: "Saved-model stock prediction dashboard with Step 18B style display."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
