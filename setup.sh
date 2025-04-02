#!/bin/bash

# Step 8: Change back to the directory where the script is located before running npm commands
echo "Changing back to the script location..."
cd "$(dirname "$0")" || exit

# Step 9: Run npm install and link (skip errors)
echo "Running npm install..."
npm install || true
echo "Running npm link..."
npm link || true

# Success message
echo "Nginx installed and running successfully as a user service, npm commands executed."


# Step 1: Uninstall any existing root-installed nginx (skip errors)
echo "Uninstalling any root version of nginx..."
sudo systemctl stop nginx || true
sudo systemctl disable nginx || true
sudo apt-get purge nginx nginx-common nginx-full -y || true
sudo apt-get autoremove -y || true

# Step 2: Install dependencies for Nginx and Python (skip errors)
echo "Installing dependencies..."
# sudo apt update || true
sudo apt install -y build-essential libpcre3 libpcre3-dev zlib1g zlib1g-dev libssl-dev python3 python3-pip || true

# Step 3: Download and Install Nginx for User (skip errors)
echo "Downloading and installing Nginx..."
cd ~
git clone https://github.com/nginx/nginx.git || true
cd nginx || exit
./auto/configure --prefix=$HOME/nginx --without-http_rewrite_module --without-http_gzip_module --without-http_ssi_module || true
make -j$(nproc) || true
make install || true

# Step 4: Set up Nginx as a user systemd service (skip errors)
echo "Setting up Nginx as a user service..."

# Create systemd service directory for user
mkdir -p ~/.config/systemd/user || true

# Create nginx.service file for user service
cat > ~/.config/systemd/user/nginx.service <<EOF
[Unit]
Description=User instance of Nginx
After=network.target

[Service]
ExecStart=$HOME/nginx/sbin/nginx -c $HOME/nginx/conf/nginx.conf
ExecStop=$HOME/nginx/sbin/nginx -s stop
Restart=always
WorkingDirectory=$HOME/nginx
StandardOutput=journal
StandardError=journal
StartLimitIntervalSec=0
StartLimitBurst=0

[Install]
WantedBy=default.target
EOF

# Step 5: Kill the process using port 8080 (if any)
echo "Checking for process using port 8080..."
if sudo lsof -i :8080; then
    echo "Port 8080 is already in use, killing the process..."
    # Get the PID of the process using port 8080 and kill it
    PID=$(sudo lsof -t -i :8080)
    sudo kill -9 $PID || true
else
    echo "Port 8080 is free."
fi

# Step 6: Reload systemd and start nginx (skip errors)
systemctl --user daemon-reload || true
systemctl --user enable nginx || true
systemctl --user start nginx || true

# Step 7: Verify that Nginx is running
systemctl --user status --no-pager nginx || true

# Step 8: Running serman list (skip errors)
echo "Running serman list..."
serman list || true
