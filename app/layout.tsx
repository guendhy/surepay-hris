import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

// Self-hosted by next/font, so no third-party font requests (CSP unchanged).
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"], weight: ["600", "700"] });

export const metadata: Metadata = {
  title: { default: "SurePay HRIS", template: "%s · SurePay HRIS" },
  description: "Human Resource Information System of SurePay Technologies Inc.",
  robots: { index: false, follow: false },
  icons: { icon: "/surepay-logo.png" },
};

export const viewport: Viewport = {
  themeColor: "#f5f7f3",
};

// Light by default (the calm daytime look); dark only when the user picked it.
const themeScript = `(function(){try{if(localStorage.getItem('theme')==='dark'){document.documentElement.classList.add('dark')}}catch(e){}})()`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${jakarta.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
