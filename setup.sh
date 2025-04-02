#!/bin/bash

# Step 8: Change back to the directory where the script is located before running npm commands
echo "Changing back to the script location..."
cd "$(dirname "$0")" || exit

# Step 9: Run npm install and link (skip errors)
echo "Running npm install..."
npm install || true
echo "Running npm link..."
npm link || true

# Step 8: Running serman list (skip errors)
echo "Running serman list..."
serman list || true
