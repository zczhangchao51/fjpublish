const fs = require('fs');
const path = require('path');
const ora = require('ora');
const Client = require('scp2').Client;
const historyFileName = 'fjpublish.json';

module.exports = function push(module, env, next) {
    if (module.nohistory || (this._metadata && this._metadata.check)) return next(null);
    let { remotePath, ssh, nobackup, _history,localPathEntries, _current, _latest, nohistory, _customHistory } = module;
    let client = new Client(ssh);
    if (!_customHistory) {
        if (nobackup) {
            _history.splice(0, 1, _current);
        } else {
            if (_history[0]) _history[0] = _latest;
            _history.unshift(_current);
        };
    };
    let spinner = ora('Push history...').start();
    // let historyPathDir = localPathEntries ? remotePath : path.dirname(remotePath);
    client.write({
        destination: path.posix.join(remotePath, historyFileName),
        content: Buffer.from(JSON.stringify(_history) + '\n')
    }, err => {
        if (err) return next(err);
        spinner.succeed('Push history success');
        client.close();
        next(null);
    });
};
