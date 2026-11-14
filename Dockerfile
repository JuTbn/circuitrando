FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./

# --- Développement : toutes les dépendances, code monté depuis l'hôte, redémarrage automatique
FROM base AS dev
ENV NODE_ENV=development
RUN npm ci
EXPOSE 3000
CMD ["npx", "nodemon", "-L", "--watch", "server", "server/index.js"]

# --- Production (cible par défaut)
FROM base AS prod
ENV NODE_ENV=production
RUN npm ci --omit=dev
COPY server ./server
COPY public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://localhost:3000/api/health || exit 1
CMD ["node", "server/index.js"]
