
const os = require('os');
const fs = require('fs');
const path = require('path');

const App = require('../app/index.js');
const run = require('../run.js');
const { serverBlock } = require('../strings.js');

const USERNAME = os.userInfo().username;

/**
 * The application class.
 * @param {App} app
 * @returns
 */

async function make_service(app) {

    return new Promise(async (resolve, reject) => {
        let workingDirectory = path.isAbsolute(app.start)
            ? path.dirname(app.start)
            : path.resolve(__dirname, path.dirname(app.start));

        let service = `[Unit]
Description=${app.description}
After=network.target

[Service]
Type=simple
User=${USERNAME}
Group=${USERNAME}
WorkingDirectory=${workingDirectory}
ExecStart=/bin/bash ${app.start}
Restart=always

[Install]
WantedBy=multi-user.target
`;

        try {
            fs.writeFileSync(`/home/${USERNAME}/.config/systemd/user/${app.name}.service`, service);
        } catch (error) {
            throw new Error(`Failed to create service file for ${app.name}.\n${error}`);
        }

        await run('systemctl --user daemon-reload');
        let message = await run(`systemctl --user start ${app.name}`);
        await run(`systemctl --user enable ${app.name}`);

        resolve(message);
    });
}

async function update_service(app) {
    // stop the service if it is running
    await run(`systemctl --user stop ${app.name} 2>/dev/null`);

    // delete old service file if it exists and then make_service
    if (fs.existsSync(`/home/${USERNAME}/${app.name}.service`)) {
        fs.unlinkSync(`/home/${USERNAME}/${app.name}.service`);
    }

    await make_service(app);
}

async function update_nginx(apps) {
    const nginxPath = '/etc/nginx/nginx.conf';
    const localNginxPath = path.resolve(__dirname, '../../../nginx.conf');
    let serverBlocks = apps.map(app => serverBlock(app)).join('\n');

    try {
        // first, if it doesn't even exist, create it
        if (!fs.existsSync(nginxPath)) {
            await run(`touch ${nginxPath}`, true);
        }

        let config = fs.readFileSync(nginxPath, 'utf8');

        const startMarker = '#---SERMAN---#';
        const endMarker = '#---ENDSERMAN---#';

        if (config.includes(startMarker) && config.includes(endMarker)) {
            const regex = new RegExp(`${startMarker}[\\s\\S]*?${endMarker}`, 'g');
            config = config.replace(regex, `${startMarker}\n${serverBlocks}\n    ${endMarker}`);
        } else {
            const httpRegex = /http\s*{[\s\S]*}/;
            const match = config.match(httpRegex);
            if (match) {
                const httpBlock = match[0];
                const newHttpBlock = httpBlock.replace(/}$/, `    ${startMarker}\n    ${serverBlocks}\n    ${endMarker}\n}`);
                config = config.replace(httpBlock, newHttpBlock);
            } else {
                console.error('Error: No http {} block found in nginx.conf.');

                // make our http block and try again
                config = `user www-data;
worker_processes auto;
pid /run/nginx.pid;
include /etc/nginx/modules-enabled/*.conf;

events {
    worker_connections 1024;
}

http {\n    ${startMarker}\n    ${serverBlocks}\n    ${endMarker}\n}`;
            }
        }

        run(`cp ${nginxPath} ${nginxPath}.bak`, true);
        fs.writeFileSync(localNginxPath, config);
        await run(`cp ${localNginxPath} ${nginxPath}`, true); // true means sudo

        // restart nginx
        await run('systemctl restart nginx', true);

        console.log('Nginx configuration updated successfully.');
    } catch (err) {
        if (err.code === 'EACCES') {
            console.error(`Permission denied. Run: sudo chown $USER:$USER ${nginxPath}`);
        } else {
            console.error('Error updating nginx configuration:', err);
        }
    }
}


class Manager {

    /**
     * @constructor
     * Initializes the Manager instance with a configuration file.
     * Resolves the file path relative to the current directory and loads the configuration.
     *
     * @param {string} [file="../../config.json"] - The relative path to the configuration file.
     * @property {App[]} apps - The loaded configuration object from the specified file.
     */

    constructor(file = "../../config.json") {
        this.path = path.resolve(__dirname, file);

        /**
         * @type {App[]} apps - The loaded configuration object from the specified file.
         */
        this.apps = require(this.path);
    }

    /**
     * @param {App} app
     * @returns
     */
    exists(app) {
        // if app exists in the configuration
        if (this.apps.find(a => a.name === app.name)) return true;

        // if app.service exists in /home/${USERNAME}
        if (fs.existsSync(`/home/${USERNAME}/.config/systemd/user/${app.name}.service`)) return true;

        // else it does not exist
        return false;
    }

    /**
     * @param {App} app
     * @returns
     */
    async add(app) {
        // first add to the config file

        return new Promise(async (resolve, reject) => {
            if (this.exists(app))
                throw new Error(`App with name ${app.name} already exists in either the configuration file or as a service(${app.name}.service)`);

            const commonDomains = this.apps.filter(a => a.domains.some(d => app.domains.includes(d)));
            if (commonDomains.length > 0) {
                throw new Error(`The following apps have at least one domain in common with the new app: ${commonDomains.map(a => a.name).join(', ')} `);
            }

            let message;

            try {
                message = await make_service(app);
            } catch (error) {
                throw new Error(`Failed to create service for ${app.name}.\n${error}`);
            }

            await this.update(apps => [...apps, app]);

            resolve(message);
        });

    }

    /**
     * Starts the service for the specified app.
     * @param {string} name
     * @param {number} port
     * Repoints the app's port to the specified value.
     */
    async point(name, port) {
        if (port < 1024 || port > 65535) {
            throw new Error('Port number must be between 1024 and 65535.');
        }

        // check if app with that name exists
        const app = this.apps.find(a => a.name === name);
        if (!app) {
            throw new Error(`App with name ${name} does not exist in the configuration.`);
        }

        try {
            // change the port
            app.port = +port;

            await this.update(apps => apps.map(a => a.name === app.name ? app : a));
            update_service(app); // update the service and relaunch app.

        } catch (error) {
            throw new Error(`Failed to point ${app.name} to port ${port}.\n${error}`);
        }

    }

    /**
     * Removes an app from the configuration and stops its service.
     * @param {App} app
     * @returns
     */
    async remove(app) {
        if (!this.exists(app)) {
            throw new Error(`App with name ${app.name} does not exist in the configuration or as a service.`);
        }

        try {
            // Stop and disable the service
            try {
                await run(`systemctl --user stop ${app.name}`);
            } catch { }

            try {
                await run(`systemctl --user disable ${app.name}`);
            } catch { }

            // Remove the service file
            const servicePath = `/home/${USERNAME}/.config/systemd/user/${app.name}.service`;
            if (fs.existsSync(servicePath)) {
                fs.unlinkSync(servicePath);
            }

            await run('systemctl --user daemon-reload');

            // Remove the app from the configuration
            await this.update(apps => apps.filter(a => a.name !== app.name));
        } catch (error) {
            throw new Error(`Failed to remove service for ${app.name}.\n${error}`);
        }
    }

    /**
     * Starts the service for the specified app if it exists.
     * @param {App} app
     * @returns
     */
    async start(app) {
        if (!this.exists(app)) {
            throw new Error(`App with name ${app.name} does not exist in the configuration or as a service.`);
        }

        try {
            await run('systemctl --user daemon-reload');
            let message = await run(`systemctl --user start ${app.name}`);
            await run(`systemctl --user enable ${app.name}`);
            return message;
        } catch (error) {
            throw new Error(`Failed to start service for ${app.name}.\n${error}`);
        }
    }

    /**
     * Stops the service for the specified app and sets its port to 0.
     * Also removes the app from boot using systemctl command.
     * @param {App} app
     * @returns
     */
    async stop(app) {
        if (!this.exists(app)) {
            throw new Error(`App with name ${app.name} does not exist in the configuration or as a service.`);
        }

        try {
            // Stop the service
            await run(`systemctl --user stop ${app.name}`);

            // Disable the service from boot
            await run(`systemctl --user disable ${app.name}`);

            await run('systemctl --user daemon-reload');

            // Set the port to 0
            app.port = 0;
            await this.update(apps => apps.map(a => a.name === app.name ? app : a));
        } catch (error) {
            throw new Error(`Failed to stop service for ${app.name}.\n${error}`);
        }
    }

    /**
     * Restarts the service for the specified app if it exists.
     * @param {App} app
     * @returns
     */
    async restart(app) {
        if (!this.exists(app)) {
            throw new Error(`App with name ${app.name} does not exist in the configuration or as a service.`);
        }

        try {
            await run('systemctl --user daemon-reload');
            let message = await run(`systemctl --user restart ${app.name}`);
            return message;
        } catch (error) {
            throw new Error(`Failed to restart service for ${app.name}.\n${error}`);
        }
    }

    /**
     * Changes a specific property of an app and applies the changes.
     * @param {App} app - The name of the app to modify.
     * @param {string} key - The property key to change.
     * @param {any} value - The new value for the property.
     * @returns
     */
    async change(app, key, value) {
        try {
            // Update the specified property
            app[key] = value;

            // Apply the changes
            await this.update(apps => apps.map(a => a.name === app.name ? app : a));
            update_service(app); // Update the service to reflect changes
        } catch (error) {
            throw new Error(`Failed to change property ${key} for ${app.name}.\n${error}`);
        }
    }


    /**
     * @param {(apps: App[]) => App[]} fn
     * @returns
     */
    async update(fn) {
        this.apps = fn(this.apps);
        this.save();

        update_nginx(fn(this.apps));

    }

    /**
     * Saves the current configuration to the specified file.
     */
    save() {
        // write to the file JSON.stringify(this.apps, null, 2)
        try {
            fs.writeFileSync(this.path, JSON.stringify(this.apps, null, 2));
        } catch (error) {
            console.error(`Failed to save the configuration to ${this.path} `);
            console.error(error);
        }

        this.refresh();
    }

    refresh() {
        this.apps = require(this.path);
    }
}

module.exports = {
    Manager,
    make_service,
    update_service,
    update_nginx
}
