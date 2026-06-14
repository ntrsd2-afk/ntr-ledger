FROM node:20-alpine

# Install Ghostscript (provides the 'gs' command for PDF B&W conversion)
RUN apk add --no-cache ghostscript

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY server.js ./

# Uploads dir for temporary converted files
RUN mkdir -p uploads

EXPOSE 5000

CMD ["node", "server.js"]
