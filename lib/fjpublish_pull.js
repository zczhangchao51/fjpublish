const fs = require('fs');
const path = require('path');
const os = require('os');
const is = require('is');
const ora = require('ora');
const Client = require('scp2').Client;
const logger = require('./index.js').logger;
const historyFileName = 'fjpublish.json';

module.exports = function pull(module, env, next) {
    if (module.nohistory || this._metadata.check) {
        setModuleHistory([]);
        return next(null)
    };
    let isObject = is.object,
        isArray = is.array,
        isString = is.string,
        isEmpty = is.empty,
        isFn = is.fn,
        isUndefined = is.undefined;
    let localLogger = (local, type) => (msg, end = false, cb = next) => logger[type](msg, local, end, cb);
    let error = localLogger('pull', 'error');
    let warning = localLogger('pull', 'warning');

    let { remotePath, historyFileDir, localPathEntries, ssh } = module;

    if (isUndefined(remotePath)) return error(`Publish environment '${env}' option 'remotePath' is not found`);

    let client = new Client(ssh);
    let historyFilePath = path.join(module.historyFileDir || os.tmpdir(), `fjpublish_${env}.json`);
    let spinner = ora('Pull history...').start();
    client.sftp((err, sftp) => {
        if (err) return next(err);
        // let historyPathDir = localPathEntries ? remotePath : path.dirname(remotePath);
        let readStream = sftp.createReadStream(path.posix.join(remotePath, historyFileName));
        readStream.on('error', error => {
            if ((error instanceof Error) && (error.message === 'No such file')) {
                spinner.succeed('Pull history success');
                client.close();
                setModuleHistory([]);
                next(null);
            } else {
                spinner.fail('Pull history failures');
                next(error)
            };
        });
        readStream.pipe(fs.createWriteStream(historyFilePath)).on('close', error => {
            if (error) return next(error);
            spinner.succeed('Pull history success');
            client.close();
            setModuleHistory(require(historyFilePath));
            next(null);
        });

    });

    function setModuleHistory(history) {
        module._history = history;
        module._latest = history[0] || {};
        module._current = {};
    };
};
