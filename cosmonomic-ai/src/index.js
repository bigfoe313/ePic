export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Only allow POST /calories
    if (request.method !== "POST" || url.pathname !== "/calories") {
      return new Response("Not found", { status: 404 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    const food = body.food?.toLowerCase().trim();
    if (!food) {
      return new Response("Missing food", { status: 400 });
    }

    /* ---------------- CACHE LOOKUP ---------------- */

    const cacheKey = new Request(
      `https://cache.cosmonomic/calories?food=${encodeURIComponent(food)}`
    );

    const cache = caches.default;
    const cachedResponse = await cache.match(cacheKey);

	if (cachedResponse) {
	  const headers = new Headers(cachedResponse.headers);
	  headers.set("X-Cache", "HIT");
	  headers.set("Access-Control-Allow-Origin", "*");

	  return new Response(cachedResponse.body, { headers });
	}

    /* ---------------- OPENAI CALL ---------------- */

    const prompt = `Return ONLY a single integer number of calories for: ${food}`;

    const openaiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 10
        })
      }
    );

    const data = await openaiResponse.json();

    const text = data?.choices?.[0]?.message?.content || "";
    const match = text.match(/\d+/);
    const calories = match ? Number(match[0]) : null;

    const responseBody = JSON.stringify({ calories });

    const response = new Response(responseBody, {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=86400" // 24 hours
      }
    });

    /* ---------------- CACHE WRITE ---------------- */

    ctx.waitUntil(cache.put(cacheKey, response.clone()));

    response.headers.set("X-Cache", "MISS");
    return response;
  }
};
