# syntax=docker/dockerfile:1
# 베이스 이미지는 digest(멀티 아키 index)로 고정한다 (GPU-293)
FROM node:24-alpine@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY . .
# 테스트는 CI check job(vitest)에서 돈다. 이미지 빌드에서 다시 돌리지 않는다 (GPU-282)
RUN npm run build

# 비root(uid 101)로 8080에서 듣는 nginx. Kubernetes의 runAsNonRoot를 만족한다.
FROM nginxinc/nginx-unprivileged:1.29-alpine@sha256:0c79d56aee561a1d81c63f00eee5fb5fe29279560cdc55e91425133104c7fbe6
ENV BACKEND_URL=http://backend.platform.svc.cluster.local:8000 \
    NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
