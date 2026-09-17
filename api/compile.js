// api/compile.js — Vercel serverless function. Same contract as the local
// dev proxy (scripts/serve.py POST /api/compile), so the app calls it
// identically: {code} in, {ok, errors, output} out.
//
// Why a proxy at all: the Go playground compile API (https://go.dev/_/compile)
// sends no CORS headers, so browsers refuse to call it directly. Same-origin
// POST /api/compile forwards server-to-server and returns JSON.
const UPSTREAM = "https://go.dev/_/compile";
// Must outlast slow networks but stay under the platform limit
// (see maxDuration in vercel.json). The browser waits up to 90s.
const UPSTREAM_TIMEOUT_MS = 55000;
const MAX_CODE = 64 * 1024;

export function shapeResult(up) {
  const events = up && Array.isArray(up.Events) ? up.Events : [];
  const output = events
    .filter((e) => e && typeof e.Message === "string" && (e.Kind === "stdout" || e.Kind === "stderr"))
    .map((e) => e.Message)
    .join("");
  return {
    ok: true,
    errors: up && typeof up.Errors === "string" ? up.Errors : "",
    output,
  };
}

export default async function handler(req, res) {
  if (!req || req.method !== "POST") {
    res.status(405).json({ ok: false, error: "POST only." });
    return;
  }
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (_) {
      body = {};
    }
  }
  if (!body || typeof body !== "object") body = {};
  const code = typeof body.code === "string" ? body.code : "";
  if (!code.trim()) {
    res.status(400).json({ ok: false, error: "Empty program." });
    return;
  }
  if (code.length > MAX_CODE) {
    res.status(400).json({ ok: false, error: "Program too big (64KB max)." });
    return;
  }
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const form = new URLSearchParams({ version: "2", body: code });
    const up = await fetch(UPSTREAM, {
      method: "POST",
      body: form,
      signal: ctl.signal,
    }).then((r) => r.json());
    res.status(200).json(shapeResult(up));
  } catch (e) {
    const timeout = e && (e.name === "AbortError" || e.name === "TimeoutError");
    sysLog("compile: upstream " + (e && e.name ? e.name : "failed"));
    res.status(502).json({
      ok: false,
      error: timeout
        ? "Go sandbox timed out. Try Run again, or use the Playground button."
        : "Go servers unreachable (" +
          (e && e.name ? e.name : "fetch failed") +
          "). Check your connection or use the Playground button.",
    });
  } finally {
    clearTimeout(t);
  }
}

function sysLog(m) {
  try {
    if (typeof console !== "undefined") console.error(m);
  } catch (_) {}
}
