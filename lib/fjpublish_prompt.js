const is = require('is');
const fs = require('fs');
const path = require('path');
var async = require('async');
const inquirer = require('inquirer');
const logger = require('./index.js').logger;
const mergeNoUndefined = require('./index.js').mergeNoUndefined;

module.exports = function prompt(module, env, next) {
    let isString = is.string,
        isObject = is.object,
        isArray = is.array,
        isUndefined = is.undefined;
    let localLogger = (local, type) => (msg, end = false, cb = next) => logger[type](msg, local, end, cb);
    let error = localLogger('prompt', 'error');
    let warning = localLogger('prompt', 'warning');
    let modules = this._metadata.modules;
    if (!this._metadata.usePrompt) return next(null, 'No use Prompt');

    let p = this.promptPromise ? this.promptPromise : this.promptPromise = new Promise((resolve, reject) => {
        async.series([promptParent.bind(this), promptModule.bind(this)], resolve);
    });

    p.then(err => {
        next(err, 'prompt success');
    }).catch(next);

    function promptParent(callback) {
        let { _prompt = [], prompt: parentPrompt, _promptSyncModule = [], promptSyncModule = [], promptIgnore } = this._metadata;
        if (isString(promptIgnore)) promptIgnore = [promptIgnore];
        if (isString(promptSyncModule)) promptSyncModule = [promptSyncModule];
        let promptParentArr = _prompt.concat(parentPrompt || []);
        let promptParentSyncModuleArr = _promptSyncModule.concat(promptSyncModule);
        let promptParentFilterArr = isArray(promptIgnore) ? promptParentArr.filter(v => !promptIgnore.includes(v.name)) : promptParentArr;
        if (!promptParentFilterArr.length) return callback(null);
        inquirer.prompt(promptParentFilterArr).then((answers) => {
            Object.assign(this._metadata, answers);
            if (promptParentSyncModuleArr.length) {
                promptParentSyncModuleArr.forEach(v => {
                    if (!isUndefined(answers[v])) {
                        for (i in modules) {
                            modules[i][v] = answers[v];
                        };
                    };
                });
            };
            callback(null);
        });
    };

    function promptModule(callback) {
        async.eachSeries(Object.keys(modules), (env, done) => {
            let sourcePrompt = modules[env].prompt;
            let sourcePromptIgnore = modules[env].promptIgnore;
            let promptModuleArr = prompt && modules[env].hasOwnProperty('prompt') ? sourcePrompt : [];
            let promptIgnore = sourcePromptIgnore && modules[env].hasOwnProperty('promptIgnore') ? sourcePromptIgnore : void 0;
            if (isString(promptIgnore)) promptIgnore = [promptIgnore];
            let promptModuleFilterArr = isArray(promptIgnore) ? promptModuleArr.filter(v => !promptIgnore.includes(v.name)) : promptModuleArr;
            if (!promptModuleFilterArr.length) return done(null);
            inquirer.prompt(promptModuleFilterArr).then((answers) => {
                Object.assign(modules[env], answers);
                done();
            });
        }, callback);
    };
};
