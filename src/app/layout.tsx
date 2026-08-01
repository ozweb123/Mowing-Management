import type { Metadata, Viewport } from "next";
import { Bebas_Neue, DM_Sans } from "next/font/google";
import { BottomNav } from "@/components/BottomNav";
import { AuthGate } from "@/components/AuthGate";
import "./globals.css";

const display = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const body = DM_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Miles Mowing Management",
  description:
    "Lawn schedule, weather-smart mow forecasts, and money tracking for Miles' Southwest Topeka mowing business.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Miles Mowing",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#367C2B",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="font-body antialiased">
        <AuthGate>
          <div className="field-texture mx-auto min-h-dvh max-w-lg px-4 pb-nav pt-2">
            {children}
          </div>
          <BottomNav />
        </AuthGate>
      </body>
    </html>
  );
}
