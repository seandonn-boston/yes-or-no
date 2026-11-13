import type { Instrumentation } from "next";

// Server errors as one JSON line each, which Vercel's log view can search and filter.
// To send them to Sentry or similar, forward from here. Request headers are left out so
// cookies and other secrets never reach the logs.
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const error = err instanceof Error ? err : new Error(String(err));
  console.error(
    JSON.stringify({
      level: "error",
      at: new Date().toISOString(),
      message: error.message,
      digest: typeof err === "object" && err !== null && "digest" in err ? String((err as { digest: unknown }).digest) : undefined,
      stack: error.stack?.split("\n").slice(0, 8).join("\n"),
      method: request.method,
      path: request.path.split("?")[0],
      route: context.routePath,
      kind: context.routeType,
    }),
  );
};
