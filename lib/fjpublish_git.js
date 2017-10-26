const is = require('is');
const fs = require('fs');
const simpleGit = require('simple-git');
const logger = require('./index.js').logger;
const mergeNoUndefined = require('./index.js').mergeNoUndefined;

module.exports = function git(module, env, next) {
    let isString = is.string,
        isFn = is.fn,
        isBool = is.bool,
        isUndefined = is.undefined;
    let localLogger = (local, type) => (msg, end = false, cb = next) => logger[type](msg, local, end, cb);
    let error = localLogger('git', 'error');
    let warning = localLogger('git', 'warning');
    let { gitCommit, gitPush, gitRebase } = this._metadata;

    if (gitCommit && !isString(gitCommit) && !isFn(gitCommit) && !isBool(gitCommit)) return error(`Publish option 'gitCommit' must be a string or a function or a boolean`);

    if (!gitCommit) return next(null, `no use git`);

    let gitMessage = isString(gitCommit) ? gitCommit : isFn(gitCommit) ? isString(gitCommitFn = gitCommit(module, env, this)) ? gitCommitFn : 'update' : 'update';
    let promiseName = `_gitPromise`;

    let p = this[promiseName] ? this[promiseName] : this[promiseName] = new Promise((resolve, reject) => {
        let branch,
            gitCommitFn;
        let instance = simpleGit();
        instance.outputHandler(function(command, stdout, stderr) {
            stdout.pipe(process.stdout);
            //stderr.pipe(process.stderr);
        }).status((err, statusSummary) => {
            if (err) return resolve({ err });
            branch = statusSummary.current;
        }).add('.').commit(gitMessage, (err, { commit }) => {
            if (err) return resolve({ err });
            if (!gitPush) {
                resolve({ commit });
            } else {
                let pullOption = {};
                if (gitRebase) pullOption['--rebase'] = 'true';
                instance.pull('origin', branch, pullOption, (err, pullSummary) => {
                    if (err) return resolve({ err });
                    instance.push('origin', branch, (err, pushSummary) => {
                        if (err) return resolve({ err });
                        resolve();
                    });
                    // resolve("File is changed after git pull, please make sure that the project is not affected and try again publish");
                });
            };
        });
    }).catch(next);

    p.then(({ err, commit }) => {
        if (err) {
            next(err);
        } else {
            if (!module.nohistory) {
                module._current.gitMessage = gitMessage
                if (commit) {
                    module._commit = commit;
                    module._current._commit = commit;
                };
            };
            logger.success(`git success`);
            next(null, "git success");
        };
    });
};
