FROM node:18-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci
RUN npm install -g tsx

COPY dex/*.js  dex/*.tsx ./dex/
COPY dex/abi ./dex/abi
COPY dashboard ./dashboard

EXPOSE 3100