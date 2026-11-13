import { headers } from "next/headers";

// The caller's IP address. Vercel and most proxies put the original client first in
// x-forwarded-for; locally there is no header and everything counts as one client.
export async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip") || "local";
}

export function ipFromRequest(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
}
