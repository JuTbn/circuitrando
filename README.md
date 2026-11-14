# Circuit Rando (Node.js + PostgreSQL, Docker)

## Lancer

```bash
cp .env.example .env        # puis choisissez un mot de passe dans .env
docker compose up -d --build
```

# Ouvrez : http://localhost:3000
- `docker compose logs -f app` : journaux de l'application
- `docker compose down` : arrêt (les données restent dans le volume `pgdata`)
- `docker compose down -v` : arrêt **et suppression des données**

## Mode développement (rechargement automatique)

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

- Les dossiers `public/` et `server/` sont montés dans le conteneur : vos modifications sont prises en compte sans reconstruire l'image.
- **`public/` (HTML, JS)** : la page se recharge toute seule dans le navigateur.
- **`public/style.css`** : les styles sont remplacés à chaud, sans recharger la page (les calques déjà chargés sont conservés).
- **`server/`** : le serveur redémarre automatiquement (nodemon), puis la page se recharge.
- Enregistrez votre projet sur le serveur avant de modifier le JS : un rechargement efface les calques non enregistrés.
- Le mode production reste `docker compose up -d --build` (le code est copié dans l'image, sans rechargement automatique).

## Contenu

| Élément | Rôle |
| `public/` | Interface (index.html, style.css, app.js) servie par Express |
| `server/index.js` | API : projets (CRUD), relais vers refuges.info |
| `server/db.js` | Connexion PostgreSQL et création des tables au démarrage |
| `server/site.js` | Recherche du site officiel d'un refuge |
| `server/livereload.js` | Rechargement automatique (actif seulement avec `LIVE_RELOAD=1`) |

## API

- `GET/POST /api/projects`, `GET/PUT/DELETE /api/projects/:id` : projets enregistrés en base (JSONB)
- `GET /api/refuges/{bbox|massif|point}?…` : relais vers l'API de refuges.info
- `GET /api/refuges/site?id=…&lien=…` : site officiel d'un refuge (mis en cache 30 jours en base)
- `GET /api/health` : état de l'application et de la base

## Attention

Il n'y a **pas d'authentification** : tout le monde pouvant joindre le port 3000 peut lire,
modifier et supprimer les projets. À réserver à un usage personnel, ou à placer derrière
un proxy avec authentification avant toute exposition sur Internet.

Sauvegarde de la base : `docker compose exec db pg_dump -U cartezones cartezones > sauvegarde.sql`
