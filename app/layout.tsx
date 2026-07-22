import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const title = "Flight Lab — Throw. Measure. Improve.";
  const description = "Measure paper airplane throws, compare top and bottom photos, reject non-plane images, and get fold-specific improvement tips.";

  return {
    metadataBase: new URL(origin),
    title,
    description,
    manifest: "/manifest.webmanifest",
    applicationName: "Flight Lab",
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: "Flight Lab",
    },
    icons: {
      icon: "/favicon.svg",
      apple: "/flight-lab-icon-v2.png",
    },
    openGraph: {
      title,
      description,
      type: "website",
      url: origin,
      images: [{ url: `${origin}/og-v2.png`, width: 1731, height: 909, alt: "Flight Lab two-view paper airplane analyzer" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${origin}/og-v2.png`],
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
      <body>{children}</body>
    </html>
  );
}
