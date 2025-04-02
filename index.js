#!/usr/bin/env node
const path = require('path');
const fs = require('fs');
const os = require('os');
const colors = require('colors');
const promptpure = require('prompt-sync')({});
const { program } = require('commander');

const Application = require('./utils/app');

const { Manager } = require('./utils/manager');
const { script } = require('./utils/strings.js');
const run = require('./utils/run.js');

const USERNAME = process.env.SUDO_USER || os.userInfo().username;
const manager = new Manager();

const prompt = (message) => promptpure(colors.green(message));

function nameToDomainID(name) {
    return name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
}

// check if root
if (!process.getuid || process.getuid() !== 0) {
    console.log('Serman needs to be ran as root!');
    process.exit(1);
}

async function init(name) {
    const app = new Application(name, '', 'npm start', 0, ['localhost']);

    if (manager.exists(app)) {
        console.log('App already exists, please choose another name.');
        process.exit(1);
    }

    console.log(
        'Welcome to the app initialization process.\nEnter the following details (type \'exit\' to leave):\n'
    );


    const checkExit = (input, acceptEmpty) => {
        if (input === 'exit' || (acceptEmpty && input === '')) {
            console.log('Exiting initialization process.');
            process.exit(0);
        }
    };

    const promptUntilValid = (message, validator, acceptEmpty = true) => {
        let value;
        do {
            value = prompt(message);
            checkExit(value, acceptEmpty);
        } while (!validator(value));
        return value;
    };

    app.domains = promptUntilValid(
        `App domains (*.${nameToDomainID(app.name)}.com): `,
        (domains) => domains.trim() !== ''
    ).split(' ');

    app.description = promptUntilValid(
        'App description: ',
        (desc) => desc.trim() !== ''
    );

    app.start = promptUntilValid(
        'App start (ex. node index.js): ',
        () => true
    );

    app.config = promptUntilValid(
        'NGINX Config (optional): ',
        () => true,
        false
    );

    console.log()

    const appDir = path.join('/home', USERNAME, 'servers', app.name);
    try {
        fs.mkdirSync(appDir, { recursive: true });
        console.log(`Directory (${appDir}) created successfully.`);
    } catch (error) {
        console.log('Failed to create directory for app:', error.message);
        process.exit(1);
    }

    // make a directory called server inside appDir
    const serverDir = path.join(appDir, 'server');
    try {
        fs.mkdirSync(serverDir, { recursive: true });
        console.log(`Directory (${serverDir}) created successfully.`);
    } catch (error) {
        console.log('Failed to create directory for app:', error.message);
        process.exit(1);
    }

    // write with +x permission
    let scriptStartPath = path.join(appDir, 'start.sh');
    let appScript = script(app);

    fs.writeFileSync(scriptStartPath, appScript, { mode: 0o755 });

    app.start = scriptStartPath;

    const message = await manager.add(app);
    if (message) {
        console.log(message);
    }

    console.log(colors.gray("\nPlease run " + appDir + "/start.sh"));
    console.log(colors.green('App Created Successfully!'))
}

function remove(name) {
    console.log(colors.gray(`Removing ${name}...`));

    let app = new Application(name);
    if (!manager.exists(app)) {
        console.log(colors.red(`App ${name} does not exist.`));
        process.exit(1);
    }

    manager.remove(app);
}

async function point(name, port) {
    console.log(`Pointing ${name} to ${port}...`);
    await manager.point(name, port);
}

function stop(name) {
    console.log(`Stopping ${name}...`);

    let app = new Application(name);
    if (!manager.exists(app)) {
        console.log(colors.red(`App ${name} does not exist.`));
        process.exit(1);
    }

    manager.stop(app);
}

function start(name) {
    console.log(`Starting ${name}...`);

    let app = new Application(name);
    if (!manager.exists(app)) {
        console.log(colors.red(`App ${name} does not exist.`));
        process.exit(1);
    }

    manager.start(app);
}

function restart(name) {
    console.log(`Restarting ${name}...`);

    let app = new Application(name);
    if (!manager.exists(app)) {
        console.log(colors.red(`App ${name} does not exist.`));
        process.exit(1);
    }

    manager.restart(app);
}

function set(name, key, value) {
    let app = new Application(name);

    let possibleKeys = Reflect.ownKeys(app);
    if (!possibleKeys.includes(key)) {
        console.log(colors.red(`Key ${key} doesn't exist.`));
        process.exit(1);
    }

    if (!manager.exists(app)) {
        console.log(colors.red(`App ${name} does not exist.`));
        process.exit(1);
    }

    manager.change(app, key, value);

}

function change_domain(name) {
    console.log(colors.gray(`Changing domains for ${name}...`));

    let app = new Application(name);
    if (!manager.exists(app)) {
        console.log(colors.red(`App ${name} does not exist.`));
        process.exit(1);
    }

    const newDomains = prompt(
        `Enter new domains (space-separated): `
    ).split(' ');

    if (newDomains.length === 0 || newDomains.some(domain => domain.trim() === '')) {
        console.log(colors.red('Invalid domains provided.'));
        process.exit(1);
    }

    manager.change(app, 'domains', newDomains);
    console.log(colors.green(`Domains for ${name} updated successfully.`));
}

async function showlog(name) {
    console.log(colors.gray(`Fetching logs for ${name}...`));

    let app = new Application(name);
    if (!manager.exists(app)) {
        console.log(colors.red(`App ${name} does not exist.`));
        process.exit(1);
    }

    try {
        const output = await run(`sudo systemctl --no-pager status ${name}`);
        console.log(output);
    } catch (error) {
        console.log(colors.red(`Failed to fetch logs for ${name}:`));
        console.log(error.message);
        process.exit(1);
    }
}

program
    .name('serman')
    .description('A CLI app for managing Servers (services)')
    .version('1.0.0');

program
    .command('init <name>')
    .alias('create')
    .alias('add')
    .description('Add a new app')
    .action(init);

program
    .command('stop <name>')
    .description('Stops an app and disables from starting on boot')
    .action(stop);

program
    .command('start <name>')
    .description('Starts an app and disables from starting on boot')
    .action(start);

program
    .command('restart <name>')
    .description('Restarts an app and disables from starting on boot')
    .action(restart);

program
    .command('change <name> <key> <value>')
    .alias('set')
    .description('Set a key value pair for an app')
    .action(set);

program
    .command('domain <name>')
    .alias('dom')
    .description('Alias for change <name> domains ...')
    .action(change_domain);

program
    .command('point <id> <port>')
    .alias('p')
    .description('Point an app to a new port (MUST EXIST)')
    .action(point);

program
    .command('remove <id>')
    .alias('rm')
    .description('Remove an app')
    .action(remove);

program
    .command('log <name>')
    .description('Show logs for an app')
    .action(showlog);

program
    .command('list')
    .description('List all tasks')
    .action(() => {
        console.log('Listing all servers...');
        if (manager.apps.length === 0) {
            console.log('No servers found.');
        } else
            manager.apps.forEach((app) => {
                console.log(app);
            });
    });

program.parse(process.argv);
