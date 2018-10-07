FROM node:8 AS build
WORKDIR /app
COPY ./package.json /app/
COPY ./package-lock.json /app/
RUN npm install --registry=https://registry.npm.taobao.org
COPY . /app/
RUN npm run docs:build

FROM nginx:1.13-alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx","-g","daemon off;"]
