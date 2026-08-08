# Node + Python in one image, since parse_pdf.py (pdfplumber) is invoked
# as a child process from the Express server.
FROM node:20-slim

# Python for the PDF parser
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 python3-pip && \
    rm -rf /var/lib/apt/lists/*

RUN pip3 install --no-cache-dir --break-system-packages pdfplumber

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Render sets $PORT and expects the service to bind to 0.0.0.0:$PORT
ENV NODE_ENV=production
EXPOSE 10000

CMD ["node", "src/index.js"]
