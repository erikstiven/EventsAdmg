#!/bin/bash

# Load environment variables from .env
export $(cat .env | grep -v '^#' | xargs)

echo "🔧 Starting FastAPI server with SQLite..."
echo "📋 DATABASE_URL: $DATABASE_URL"
echo ""

# Start the server
python main.py
