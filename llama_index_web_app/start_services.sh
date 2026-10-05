#!/bin/bash

# Start the LlamaIndex RAG Application with integrated PDF to Word conversion
# Main service with PDF conversion runs on port 5601

echo "Starting LlamaIndex RAG Application with PDF to Word conversion..."

# Function to kill background processes on script exit
cleanup() {
    echo "Stopping service..."
    kill $MAIN_SERVICE_PID 2>/dev/null
    exit
}

# Trap exit signals
trap cleanup SIGINT SIGTERM

# Start main service with integrated PDF to Word conversion
echo "Starting integrated RAG service with PDF to Word conversion on port 5601..."
python3 flask_demo.py &
MAIN_SERVICE_PID=$!

# Wait a moment for the service to start
sleep 3

echo "Service started successfully!"
echo "RAG Service with PDF to Word conversion: http://localhost:5601"
echo "Available endpoints:"
echo "  - RAG queries: /queryFile"
echo "  - File upload: /uploadFile"
echo "  - PDF to Word: /convertPdfToWord"
echo "  - Chat: /chat"
echo "  - Documents: /getDocuments"
echo ""
echo "Press Ctrl+C to stop the service"

# Wait for the process
wait
