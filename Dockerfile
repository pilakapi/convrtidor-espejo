FROM node:18-alpine

# Instalar FFmpeg
RUN apk add --no-cache ffmpeg

WORKDIR /app
COPY . .

RUN npm install

EXPOSE 3000
CMD ["node", "server.js"]
