import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const title = "Flight Lab — Throw. Measure. Improve.";
  const description = "Measure paper airplane throws, rate your design, and unlock Flight Lab Pro for calibrated distance and interactive video flight-path analysis.";

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
      images: [{ url: `${origin}/og.png`, width: 1728, height: 910, alt: "Flight Lab Pro paper airplane flight-path analysis" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${origin}/og.png`],
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
