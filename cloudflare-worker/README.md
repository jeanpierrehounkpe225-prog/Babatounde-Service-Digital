# Backend chatbot — Cloudflare Worker

Ce dossier contient le **proxy** entre le chatbot du site et l'API Anthropic.
Le navigateur ne doit JAMAIS appeler `api.anthropic.com` directement (ça
exposerait ta clé API). Le worker garde la clé en sécurité côté serveur.

## Pourquoi Cloudflare Workers ?

- **Gratuit** jusqu'à 100 000 requêtes/jour
- **Déploiement en 5 commandes**
- **Pas de serveur à maintenir**
- Latence très faible (réseau global)

---

## Déploiement (10 minutes)

### Pré-requis

- Compte Cloudflare gratuit : https://dash.cloudflare.com/sign-up
- Node.js 18+ installé sur ta machine
- Une clé API Anthropic : https://console.anthropic.com/settings/keys

### Étapes

```bash
# 1. Va dans le dossier du worker
cd cloudflare-worker

# 2. Installe les dépendances
npm install

# 3. Connecte-toi à Cloudflare (ouvre ton navigateur)
npx wrangler login

# 4. Stocke ta clé Anthropic comme secret (Cloudflare la garde chiffrée)
npx wrangler secret put ANTHROPIC_API_KEY
# → colle ta clé sk-ant-... quand demandé, puis Entrée

# 5. (Optionnel) Tester en local avant de déployer
npx wrangler dev
# → ouvre http://localhost:8787 dans ton navigateur

# 6. Déployer en production
npx wrangler deploy
```

À la fin, tu verras une URL du type :

```
https://babatounde-chatbot.<ton-compte>.workers.dev
```

**Copie cette URL** — c'est elle que tu mettras dans `index.html`.

---

## Connecter le worker au site

1. Ouvre `../index.html`
2. Cherche la ligne :
   ```js
   const CHAT_API_URL = "https://REMPLACE-MOI.workers.dev";
   ```
3. Remplace par l'URL de ton worker (étape 6 ci-dessus)
4. Commit + push :
   ```bash
   git add ../index.html
   git commit -m "branche le chatbot sur le worker Cloudflare"
   git push
   ```

---

## CORS — autoriser ton domaine

Dans `wrangler.toml`, la variable `ALLOWED_ORIGINS` contient les domaines
autorisés à appeler le worker. Par défaut :

```
ALLOWED_ORIGINS = "https://jeanpierrehounkpe225-prog.github.io,http://localhost:8000"
```

Si tu héberges ton site ailleurs (Netlify, Vercel, ton propre domaine),
ajoute l'URL séparée par une virgule, puis redéploie :

```bash
npx wrangler deploy
```

---

## Coûts

Le worker en lui-même est gratuit (jusqu'à 100k req/jour).
Tu paies seulement les appels Anthropic, à la demande.

**Modèle utilisé** : `claude-opus-4-7` (le plus puissant)
- ~$5 / 1M tokens en entrée
- ~$25 / 1M tokens en sortie

Pour un chatbot Q&A simple sur tes services, **tu peux passer à un modèle
moins cher** sans perte significative de qualité. Ouvre `src/worker.js`
et remplace :

```js
model: "claude-opus-4-7",
```

par l'un de :

| Modèle | Coût (in/out par 1M tokens) | Cas d'usage |
|---|---|---|
| `claude-haiku-4-5` | $1 / $5 | Recommandé pour ce cas — économie ~80% |
| `claude-sonnet-4-6` | $3 / $15 | Bon compromis qualité/prix |
| `claude-opus-4-7` | $5 / $25 | Maximum de qualité (par défaut) |

Puis redéploie avec `npx wrangler deploy`.

---

## Tester

Une fois déployé, teste depuis le terminal :

```bash
curl -X POST https://babatounde-chatbot.<ton-compte>.workers.dev \
  -H "Content-Type: application/json" \
  -H "Origin: https://jeanpierrehounkpe225-prog.github.io" \
  -d '{"messages":[{"role":"user","content":"Quels sont vos services ?"}]}'
```

Tu devrais recevoir une réponse JSON avec la clé `reply`.

---

## Alternative : n8n

Si tu préfères utiliser n8n (que tu connais déjà), tu peux remplacer le
worker par un workflow :

1. **Webhook Trigger** (POST, public) — reçoit `{messages: [...]}`
2. **HTTP Request** vers `https://api.anthropic.com/v1/messages` :
   - Headers : `x-api-key: {{$credentials.anthropic}}`, `anthropic-version: 2023-06-01`
   - Body : `{"model": "claude-haiku-4-5", "max_tokens": 400, "system": "<le system prompt>", "messages": "{{$json.messages}}"}`
3. **Respond to Webhook** : renvoie `{reply: "{{$json.content[0].text}}"}`

Mets l'URL du webhook n8n dans `CHAT_API_URL` côté `index.html`.
N8n nécessite par contre un hébergement (cloud n8n payant ou self-hosted).

---

## Sécurité

- ✅ Clé API stockée comme **secret Cloudflare** (jamais dans le code)
- ✅ CORS limité aux origines listées dans `ALLOWED_ORIGINS`
- ✅ Validation de la taille du message et du nombre de tours
- ⚠️  Pas de rate-limit par IP — pour un site très exposé, ajoute Cloudflare
  Turnstile ou un rate-limit via Workers KV
