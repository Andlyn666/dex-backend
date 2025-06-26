FROM node:18-slim

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY *.js ./
COPY abi ./abi

# Expose the port the app runs on
EXPOSE 3000
EXPOSE 3100

# Command to run the application
CMD ["node", "bootstrap.js"] 