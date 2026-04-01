FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --no-audit --no-fund

COPY src ./src

EXPOSE 8080

CMD ["npm", "run", "start"]
