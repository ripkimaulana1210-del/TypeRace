# Gunakan image resmi Node.js Alpine yang ringan & aman
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Atur environment variables
ENV NODE_ENV=production \
    PORT=3000

# Salin manifest dependensi terlebih dahulu untuk optimasi Docker layer cache
COPY package*.json ./

# Install dependensi produksi saja
RUN npm ci --omit=dev

# Salin seluruh berkas proyek yang diperlukan
COPY server.js ./
COPY public/ ./public/

# Ganti hak akses ke user non-root bawaan Node.js demi keamanan
RUN chown -R node:node /app
USER node

# Expose port aplikasi
EXPOSE 3000

# Healthcheck memanfaatkan endpoint /health yang sudah tersedia
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Perintah menjalankan server
CMD ["node", "server.js"]
