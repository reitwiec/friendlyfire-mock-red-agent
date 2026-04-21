FROM node:22-slim

WORKDIR /agent

COPY package.json /agent/package.json
COPY vendor /agent/vendor
RUN npm install --omit=dev
COPY . /agent

CMD ["node", "--import", "tsx", "index.mjs"]
