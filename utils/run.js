const { spawn } = require('child_process');

module.exports = function run(command, useSudo, options = {}) {
    return new Promise((resolve, reject) => {
        if (useSudo) {
            command = ["sudo", ...command.split(' ')]; // Convert to an array properly
        } else {
            command = command.split(' '); // Convert to an array properly
        }

        const [cmd, ...args] = command;

        const child = spawn(cmd, args, {
            shell: !useSudo, // No need for a shell, since args are properly split
            stdio: 'inherit', // Pass input/output directly to terminal
        });

        let stdoutData = '';
        let stderrData = '';

        child.stdout?.on('data', (data) => {
            stdoutData += data.toString();
            process.stdout.write(data);
        });

        child.stderr?.on('data', (data) => {
            stderrData += data.toString();
            process.stderr.write(data);
        });

        child.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`Command failed with exit code ${code}\n${stderrData}`));
            } else {
                resolve(stdoutData);
            }
        });

        child.on('error', (error) => {
            reject(error);
        });
    });
};
