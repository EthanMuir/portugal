// Serves the scrapbook, stores photos + the published book in R2.
//
// Routes:
//   GET  /photos/<name>   -> image from R2
//   GET  /photos.json     -> published book from R2 (falls back to the static file)
//   POST /api/upload      -> store one image   (needs x-edit-key)
//   POST /api/save        -> store photos.json (needs x-edit-key)
//   everything else       -> static assets

const DATA_KEY = "_data/photos.json";
const MAX_BYTES = 8 * 1024 * 1024;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}

function authed(request, env) {
  const key = request.headers.get("x-edit-key") || "";
  const want = env.EDIT_KEY || "";
  if (!want) return false;
  if (key.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < key.length; i++) diff |= key.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}

function safeName(raw) {
  return String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "photo.jpg";
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // ---- images ----
    if (path.startsWith("/photos/")) {
      if (!env.PHOTOS) return new Response("R2 not bound", { status: 503 });
      const key = decodeURIComponent(path.slice("/photos/".length));
      if (!key || key.includes("..")) return new Response("Bad name", { status: 400 });
      const obj = await env.PHOTOS.get(key);
      if (!obj) return new Response("Not found", { status: 404 });
      return new Response(obj.body, {
        headers: {
          "content-type": obj.httpMetadata?.contentType || "image/jpeg",
          "cache-control": "public, max-age=31536000, immutable",
          "etag": obj.httpEtag
        }
      });
    }

    // ---- published book ----
    if (path === "/photos.json") {
      if (env.PHOTOS) {
        const obj = await env.PHOTOS.get(DATA_KEY);
        if (obj) {
          return new Response(obj.body, {
            headers: { "content-type": "application/json", "cache-control": "no-store" }
          });
        }
      }
      return env.ASSETS.fetch(request);
    }

    // ---- check whether editing is wired up ----
    if (path === "/api/status") {
      return json({ r2: !!env.PHOTOS, key: !!env.EDIT_KEY });
    }

    // ---- verify the edit key ----
    if (path === "/api/check" && request.method === "POST") {
      return authed(request, env) ? json({ ok: true }) : json({ error: "Wrong key" }, 401);
    }

    // ---- upload one image ----
    if (path === "/api/upload" && request.method === "POST") {
      if (!env.PHOTOS) return json({ error: "R2 bucket not bound" }, 503);
      if (!authed(request, env)) return json({ error: "Wrong key" }, 401);

      const name = safeName(url.searchParams.get("name"));
      const type = request.headers.get("content-type") || "image/jpeg";
      if (!type.startsWith("image/")) return json({ error: "Images only" }, 400);

      const body = await request.arrayBuffer();
      if (body.byteLength > MAX_BYTES) return json({ error: "Too large" }, 413);

      await env.PHOTOS.put(name, body, { httpMetadata: { contentType: type } });
      return json({ ok: true, name: name, src: "photos/" + name });
    }

    // ---- publish ----
    if (path === "/api/save" && request.method === "POST") {
      if (!env.PHOTOS) return json({ error: "R2 bucket not bound" }, 503);
      if (!authed(request, env)) return json({ error: "Wrong key" }, 401);

      let data;
      try { data = await request.json(); }
      catch (e) { return json({ error: "Bad JSON" }, 400); }
      if (!data || typeof data !== "object" || !Array.isArray(data.pages)) {
        return json({ error: "Missing pages" }, 400);
      }

      await env.PHOTOS.put(DATA_KEY, JSON.stringify(data, null, 2), {
        httpMetadata: { contentType: "application/json" }
      });
      return json({ ok: true, pages: data.pages.length });
    }

    // ---- delete an unused image ----
    if (path === "/api/delete" && request.method === "POST") {
      if (!env.PHOTOS) return json({ error: "R2 bucket not bound" }, 503);
      if (!authed(request, env)) return json({ error: "Wrong key" }, 401);
      const name = safeName(url.searchParams.get("name"));
      await env.PHOTOS.delete(name);
      return json({ ok: true });
    }

    return env.ASSETS.fetch(request);
  }
};
