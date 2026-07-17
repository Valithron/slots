const HELP_COPY = '      <p>To replace the placeholder symbols, overwrite the files in <strong>assets/symbols</strong> while keeping the same filenames.</p>\n';

const OLD_REEL_CONSTANTS = `    const STORAGE_KEY = "commune-fortune-v1";
    const REPEAT_COUNT = 7;
    const BASE_COPY = 2;
`;

const NEW_REEL_CONSTANTS = `    const STORAGE_KEY = "commune-fortune-v1";
    const BASE_COPY = 2;
    const MAX_SPIN_CYCLES = 3 + CONFIG.reels.length - 1;
    // Keep one full buffer copy after the furthest animated stop so all three visible rows stay populated.
    const REPEAT_COUNT = BASE_COPY + MAX_SPIN_CYCLES + 2;
`;

export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    const url = new URL(request.url);
    const contentType = response.headers.get("content-type") || "";
    const isGameDocument = request.method === "GET"
      && (url.pathname === "/" || url.pathname === "/index.html")
      && response.ok
      && contentType.includes("text/html");

    if (!isGameDocument) return response;

    let html = await response.text();
    html = html.replace(HELP_COPY, "");
    html = html.replace(OLD_REEL_CONSTANTS, NEW_REEL_CONSTANTS);

    const headers = new Headers(response.headers);
    headers.delete("content-length");

    return new Response(html, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
