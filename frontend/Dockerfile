FROM node:20-alpine AS build
WORKDIR /app
ENV NODE_OPTIONS=--max-old-space-size=4096
COPY frontend/package.json frontend/yarn.lock ./
RUN yarn install --frozen-lockfile --network-timeout 600000
COPY frontend/ .
# API na mesma origem (nginx faz o proxy de /api)
ENV REACT_APP_BACKEND_URL=""
RUN npx cross-env CI=false GENERATE_SOURCEMAP=false yarn build

FROM nginx:alpine
COPY --from=build /app/build /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
