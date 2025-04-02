

/**
 * The application class.
 * @module App
 *
 * @property {string} name - The Application name.
 * @property {string} description - The Application description.
 * @property {string} start - The startup script.
 * @property {number} port - The port number.
 * @property {string[]} domains - The domain names.
 * @property {string} config - The configuration.
 *
 */

module.exports = class App {

    /**
     * @constructor
     * Initializes the App instance with the specified properties.
     *
     * @param {string} name - The Application name.
     * @param {string} description - The Application description.
     * @param {string} start - The startup script.
     * @param {number} port - The port number.
     * @param {string[]} domains - The domain names.
     * @param {string} [config=""] - The configuration.
     */

    constructor(name, description = '', start = '', port = -1, domains = [], config = "") {
        this.name = name;
        this.description = description;
        this.start = start;
        this.port = port;
        this.domains = domains;
        this.config = config
    }

}
