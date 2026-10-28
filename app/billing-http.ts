import { SITE_ORIGIN } from "./stripe-server";
export const billingJson = (body: object, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return origin === SITE_ORIGIN || (process.env.NODE_ENV !== "production" && origin === new URL(request.url).origin);
}
