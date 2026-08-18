# --- Etapa 1: build de la app con Vite ---
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# URL del backend que queda "horneada" en el bundle estático.
# Por defecto apunta al puerto publicado por el servicio "backend" en docker-compose
# (el navegador corre en el host, no dentro de la red de Docker, por eso es localhost).
ARG VITE_API_URL=http://localhost:4000/api
ENV VITE_API_URL=$VITE_API_URL

# Docker Compose siempre sirve desde la raíz (nginx sirve /usr/share/nginx/html
# directo en "/"), a diferencia de GitHub Pages (usuario.github.io/nombre-repo/).
# --base=/ pisa a propósito lo que diga vite.config.js — sin esto, un `base`
# fijo pensado para GitHub Pages rompería el build local: el index.html
# pediría los assets con un prefijo que nginx no tiene, y el bundle nunca
# llegaría a cargar.
RUN npx vite build --base=/

# --- Etapa 2: servir el build estático con Nginx ---
FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
