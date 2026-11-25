FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# 테스트는 CI check job(vitest)에서 돈다. 이미지 빌드에서 다시 돌리지 않는다 (GPU-282)
RUN npm run build

# 비root(uid 101)로 8080에서 듣는 nginx. Kubernetes의 runAsNonRoot를 만족한다.
FROM nginxinc/nginx-unprivileged:1.29-alpine
ENV BACKEND_URL=http://backend.platform.svc.cluster.local:8000 \
    NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
