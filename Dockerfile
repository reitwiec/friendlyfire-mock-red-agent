FROM node:22-slim

WORKDIR /agent

COPY . /agent

CMD ["node", "index.mjs"]
