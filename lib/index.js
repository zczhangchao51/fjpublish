const logger = require('./logger.js');
const is = require('is');
const chalk = require('chalk');
const semver = require('semver');
const request = require('request');
const async = require('async');
const date = require('phpdate-js');
const localAssert = (local) => (boolean, type = 'error', msg, ...arg) => logger.assert(boolean, type, msg, local, ...arg);
const assert = localAssert('core');
var packageConfig = require('../package.json');

const isObject = is.object,
    isArray = is.array,
    isFn = is.fn,
    isString = is.string,
    isEmpty = is.empty,
    isUndefined = is.undefined;

/**
 * Export 'Fjpublish'
 */
module.exports = Fjpublish;

/**
 * Constructor
 * @param {Object} config configuration options
 * @param {Object|Array|String} opt publish options
 */
function Fjpublish(config, opt) {
    assert(semver.satisfies(process.version, packageConfig.engines.node), 'error', `You must upgrade node to ${packageConfig.engines.node} to use fjpublish`)
    if (!(this instanceof Fjpublish)) return new Fjpublish(config, opt);
    this._middlewares = [];
    this.initMetadata(config, opt);
    return this;
};

Fjpublish.logger = logger;

Fjpublish.mergeNoUndefined = function(val, ...arg) {
    for (let i = arg.length - 1; i != -1; i--) {
        if (!isUndefined(arg[i])) {
            val = arg[i];
            break;
        };
    };
    return val;
};

Fjpublish.extend = function(target = {}, ...source) {
    let options, name, src, copy, copyIsArray, clone,
        length = source.length;

    for (let i = 0; i < length; i++) {
        if ((options = source[i]) != null) {
            for (name in options) {
                src = target[name];
                copy = options[name];
                if (target === copy) continue;
                if (copy && (isObject(copy) || (copyIsArray = isArray(copy)))) {
                    if (copyIsArray) {
                        copyIsArray = false;
                        clone = src && isArray(src) ? src : [];
                    } else {
                        clone = src && isObject(src) ? src : {};
                    };
                    target[name] = Fjpublish.extend(clone, copy);
                } else if (copy !== undefined) {
                    target[name] = copy;
                };
            };
        };
    };

    return target;
};

/**
 * Init metadata
 * @param {Object} config configuration options
 * @param {Array|String} opt publish options
 * @return {Fjpublish}
 */
Fjpublish.prototype.initMetadata = function(config, opt) {
    assert(!isUndefined(config), 'error', 'Config is not found');
    assert(isObject(config), 'error', 'Config is not a object');
    assert(!isEmpty(config), 'error', 'Config cant not be an empty object');
    assert(!isUndefined(config.modules), 'error', 'Config option "modules" is required');
    assert(isObject(config.modules) || isArray(config.modules), 'error', 'Config option "modules" must be a object or an array');
    assert(!isEmpty(config.modules), 'error', 'Config option "modules" cant not be an empty object');
    let modules = config.modules,
        replaceModules = {},
        pickArray;
    if (isArray(modules)) assert(modules.every(v => !isUndefined(v.env)), 'error', 'Publish option properties "env" is not found');
    let deepCloneConfig = Fjpublish.extend({}, config);
    this._metadata = new Option();
    for (let i in deepCloneConfig) {
        if (i !== 'modules' && deepCloneConfig.hasOwnProperty(i)) {
            Option.prototype[i] = deepCloneConfig[i];
        };
    };
    if (isString(opt)) pickArray = [{ env: opt }];
    if (isArray(opt)) {
        pickArray = opt.map(v => {
            assert(isString(v) || isObject(v), 'error', 'The publish environment option you choice must be an object or a string');
            return isString(v) ? { env: v } : v;
        });
    };
    if (pickArray) {
        pickArray.forEach(v => {
            let obj = isArray(modules) ? modules.find(vv => vv.env === v.env) : modules[v.env];
            if (obj) {
                replaceModules[v.env] = Fjpublish.extend(new Option(obj), v);
            } else {
                logger.error(`The selected environment '${v.env}' does not exist`, 'core');
            };
        });
    } else {
        if (isArray(modules)) {
            modules.forEach(v => {
                replaceModules[v.env] = new Option(obj);
            });
        } else {
            for (let i in modules) {
                replaceModules[i] = new Option(modules[i]);
            };
        };
    };
    this._metadata.modules = replaceModules;
    let { beforeHook, afterHook } = this._metadata;
    if (beforeHook) this.beforeHook(beforeHook);
    if (afterHook) this.afterHook(afterHook);
    return this;
};

/**
 * Return metadata or set metadata
 * @param  {Object} metadata
 * @return {Fjpublish|Object}
 */
Fjpublish.prototype.metadata = function(metadata) {
    if (!arguments.length) return this._metadata;
    assert(isObject(metadata), 'error', 'You must pass a metadata object');
    Fjpublish.extend(this._metadata, metadata);
    return this;
};

/**
 * Use middleware
 * @param  {Function} middleware
 * @return {Fjpublish}
 */
Fjpublish.prototype.use = function(middleware) {
    assert(arguments.length, 'error', 'You must pass a middleware function');
    assert(isFn(middleware), 'error', 'Middleware must be a function as a hook function');
    this._middlewares.push(middleware);
    return this;
};

/**
 * Use hook function before a middleware function
 * @param  {Object,Array} hook function
 * @return {Fjpublish}
 */
Fjpublish.prototype.beforeHook = function(hook) {
    this.hook(hook, 'before');
};

/**
 * Use hook function after a middleware function
 * @param  {Object,Array} hook function
 * @return {Fjpublish}
 */
Fjpublish.prototype.afterHook = function(hook) {
    this.hook(hook, 'after');
};

/**
 * Use hook function
 * @param  {Object,Array} hook function
 * @param  {String} hook function direction
 * @return {Fjpublish}
 */
Fjpublish.prototype.hook = function(hook, direction) {
    assert(direction === 'before' || direction === 'after', 'error', 'You have to choose whether or not before or after a middleware function');
    assert(isObject(hook) || isArray(hook), 'error', 'hook function must be an object or a collections');
    if (isObject(hook)) assert(isString(hook.when), 'error', 'hook function must hava a key "when" to tell fjpublish when to use this hook');

    if (isObject(hook)) assert(isFn(hook.fn), 'error', 'you must pass a function as a hook function');
    if (isArray(hook)) assert(hook.every(v => isString(v.when)), 'error', 'hook function must hava a key "when" to tell fjpublish when to use this hook');
    if (isArray(hook)) assert(hook.every(v => isFn(v.fn)), 'error', 'you must pass a function as a hook function');
    if (isObject(hook)) hook = [hook];
    this._hooks = this._hooks || [];
    this._hooks = [...this._hooks, ...hook.map(v => {
        v.direction = direction;
        return v;
    })];
    return this;
};

/**
 * Return middlewares
 * @return {Object}
 */
Fjpublish.prototype.middlewares = function() {
    return this._middlewares;
};

/**
 * Perform asynchronous tasks using the 'async' module
 * https://caolan.github.io/async/
 * @return {Fjpublish}
 */
Fjpublish.prototype.start = function() {
    let { modules, parallel, completeHook, checkUpdate = true } = this._metadata;
    assert(!isEmpty(modules), 'error', 'The publish environments you choice is not found');
    let { error, success } = logger;
    let { _middlewares, _hooks } = this;
    if (_hooks && isArray(_hooks)) {
        _hooks.forEach(v => {
            let index = _middlewares.findIndex(vv => v.when === vv.name);
            let obj = _middlewares[index];
            if (~index) {
                _middlewares.splice(index + (v.direction === 'before' ? 0 : 1), 0, v.fn);
            } else {
                logger.error(`The hook function mount middleware "${v.when}" was not found`);
            };
        });
    };
    console.time('Total time-consuming');
    async [parallel ? 'concat' : 'concatSeries'](Object.keys(modules), async.reflect((key, callback) => {
        // async.series(this._middlewares.map(v => next => v.bind(this, modules[key], key, next)()), callback);
        async.series(_middlewares.map(v => async.apply(v.bind(this), modules[key], key)), callback);
    }), (err, result) => {
        if (completeHook) completeHook(this, result);
        if (err) error(err, 'core');
        logger.log(`mission completed, end time ${date('Y-m-d H:i:s')}`);
        console.timeEnd('Total time-consuming');
        if (checkUpdate) checkUpdateAction();
    });
    return this;
};

function checkUpdateAction() {
    request({
        url: 'https://registry.npmjs.org/fjpublish',
        timeout: 1000
    }, (err, res, body) => {
        if (!err && res.statusCode === 200) {
            let latestVersion = JSON.parse(body)['dist-tags'].latest;
            let localVersion = packageConfig.version;
            if (semver.lt(localVersion, latestVersion)) {
                console.log()
                console.log(chalk.yellow('A newer version of fjpublish is available.'))
                console.log()
                console.log('  latest:    ' + chalk.green(latestVersion))
                console.log('  installed: ' + chalk.red(localVersion))
                console.log()
            };
        };
    });
};

/**
 * Option constructor
 * @param {Object} obj option
 */
function Option(obj) {
    if (isObject(obj)) {
        for (let i in obj) {
            if (obj.hasOwnProperty(i)) {
                this[i] = obj[i];
            };
        };
    };
};

process.on('uncaughtException', err => {
    return Fjpublish.logger.error(err.stack, 'uncaughtException');
});
process.on('unhandledRejection', err => {
    return Fjpublish.logger.error(err.stack, 'unhandledRejection');
});
