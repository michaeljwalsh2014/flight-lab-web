import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
// Legacy bearer links no longer bypass account entitlements. Stored user data is untouched.
export default function SharedProPage() { redirect("/pricing"); }
