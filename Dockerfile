# Use a lightweight Node.js image
FROM node:22-alpine

# Install git for cloning
RUN apk add --no-cache git

# Set working directory
WORKDIR /app

# Clone the repository
# Default to the current origin, but allow override via build-arg
ARG REPO_URL=https://github.com/fatlungodev/Trend-AI-guard-demo.git
RUN git clone ${REPO_URL} .

# Install production dependencies
RUN npm install --omit=dev
RUN npm install -g npm@11.9.0
# Create volume mount points for persistence
# - /app/auth_session: Stores WhatsApp session credentials
VOLUME ["/app/auth_session"]

# Expose the port the app runs on
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
