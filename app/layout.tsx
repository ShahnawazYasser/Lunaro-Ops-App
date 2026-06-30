import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lunaro Ops",
  description: "Internal operations tool for Lunaro photobooth team",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
