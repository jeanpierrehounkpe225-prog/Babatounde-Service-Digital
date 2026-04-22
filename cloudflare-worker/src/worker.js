import Anthropic from "@anthropic-ai/sdk";

const SYSTEM_PROMPT = `Tu es l'assistant virtuel de Jean-Pierre, fondateur de Babatounde Digital Services. Tu parles principalement en français (mais réponds en anglais si on te parle en anglais).

Jean-Pierre propose :
- Création de sites web sur mesure (vitrine, e-commerce, landing pages)
- Chatbots IA (WhatsApp, Messenger, web) connectés à Claude/OpenRouter
- Automatisations n8n (devis automatique, social media, CRM WhatsApp)
- Dashboards métier (gestion de stock, KPIs)
- Contenu vidéo (CapCut, HeyGen, ElevenLabs)
- Packs présence digitale tout-en-un

Zones d'intervention : Afrique (Bénin, Cotonou) et diaspora (USA, Minnesota), à distance partout dans le monde.
Prix : à partir de $450 USD pour le pack démarrage.
Devise : "Build in silence. Rise in thunder."

Méthode en 4 étapes : 1) Cadrage (brief + devis ferme), 2) Design (maquette validée), 3) Build (développement avec preview en direct), 4) Lancement (mise en ligne + 1 mois de support).

Ton rôle : répondre aux questions sur les services, expliquer la méthode, aider à cadrer un besoin, orienter vers le formulaire de contact pour les devis précis. Sois concis (3-4 phrases max), chaleureux, direct, professionnel. Ne cite jamais de noms de clients. Utilise quelques emojis avec parcimonie.`;

const MAX_MESSAGES = 40;
const MAX_USER_CHARS = 2000;

function buildCorsHeaders(env, request) {
  const allowed = (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const origin = request.headers.get("Origin") || "";
  const allowOrigin = allowed.includes(origin) ? origin : allowed[0] || "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function jsonResponse(body, init, corsHeaders) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      ...(init?.headers || {}),
    },
  });
}

export default {
  async fetch(request, env) {
    const corsHeaders = buildCorsHeaders(env, request);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    if (request.method !== "POST") {
      return jsonResponse({ error: "method_not_allowed" }, { status: 405 }, corsHeaders);
    }
    if (!env.ANTHROPIC_API_KEY) {
      return jsonResponse({ error: "api_key_missing" }, { status: 500 }, corsHeaders);
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return jsonResponse({ error: "invalid_json" }, { status: 400 }, corsHeaders);
    }

    const messages = payload?.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      return jsonResponse({ error: "messages_required" }, { status: 400 }, corsHeaders);
    }
    if (messages.length > MAX_MESSAGES) {
      return jsonResponse({ error: "conversation_too_long" }, { status: 400 }, corsHeaders);
    }
    for (const m of messages) {
      if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") {
        return jsonResponse({ error: "invalid_message_shape" }, { status: 400 }, corsHeaders);
      }
      if (m.role === "user" && m.content.length > MAX_USER_CHARS) {
        return jsonResponse({ error: "message_too_long" }, { status: 400 }, corsHeaders);
      }
    }

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

    let response;
    try {
      response = await client.messages.create({
        model: "claude-opus-4-7",
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages,
      });
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) {
        return jsonResponse({ error: "rate_limited" }, { status: 429 }, corsHeaders);
      }
      if (err instanceof Anthropic.APIError) {
        return jsonResponse(
          { error: "upstream_error", status: err.status, message: err.message },
          { status: 502 },
          corsHeaders,
        );
      }
      return jsonResponse({ error: "internal_error" }, { status: 500 }, corsHeaders);
    }

    const reply = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    return jsonResponse(
      { reply, usage: response.usage, stop_reason: response.stop_reason },
      { status: 200 },
      corsHeaders,
    );
  },
};
