import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "propel-careerops.issaouianwar2020.chatgpt.site";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  return {
    metadataBase: new URL(`${protocol}://${host}`),
    title: "Propel — From job lead to interview-ready",
    description: "Find verified Canadian jobs, tailor fact-safe CVs and messages, practice interviews, and track every application in one private workspace.",
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: {
      title: "Propel",
      description: "From live job lead to interview-ready.",
      type: "website",
      images: [{ url: "/og.png", width: 1200, height: 630, alt: "Propel — From live job lead to interview-ready" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Propel",
      description: "From live job lead to interview-ready.",
      images: ["/og.png"],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
