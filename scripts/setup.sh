#!/bin/bash

# EventFlow Setup Script

set -e

echo "🚀 Setting up EventFlow..."

# Check if .env exists
if [ ! -f .env ]; then
  echo "❌ .env file not found. Please create one based on .env.example"
  exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Generate Prisma Client
echo "🔧 Generating Prisma Client..."
npm run prisma:generate

# Run database migrations
echo "🗄️  Running database migrations..."
npm run prisma:migrate

echo "✅ Setup complete!"
echo ""
echo "To start the API server: npm run dev"
echo "To start the worker: npm run dev:worker"

