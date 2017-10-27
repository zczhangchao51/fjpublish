const fs = require('fs');
const os = require('os');
const path = require('path');
const is = require('is');
const createHash = require("crypto").createHash;
const md5 = (input) => {
    return createHash('md5').update(input).digest('hex');
};
const chalk = require('chalk');
const Client = require('scp2').Client;
const logger = require('./index.js').logger;

module.exports = function sftp(module, env, next) {
    let isObject = is.object,
        isString = is.string,
        isEmpty = is.empty,
        isFn = is.fn,
        isUndefined = is.undefined;
    let localLogger = (local, type) => (msg, end = false, cb = next) => logger[type](msg, local, end, cb);
    let error = localLogger('sftp', 'error');
    let warning = localLogger('sftp', 'warning');

    let { localTarFileDir, _compressHash, tarFilename, remoteTarFileDir, ssh } = module;

    if (isUndefined(localTarFileDir)) return error(`Publish environment '${env}' option 'localTarFileDir' is not found`);
    if (isUndefined(tarFilename)) return error(`Publish environment '${env}' option 'tarFilename' is not found`);
    if (isUndefined(ssh)) return error(`Publish environment '${env}' option 'ssh' is not found`);

    if (!isString(localTarFileDir)) return error(`Publish environment '${env}' option 'localTarFileDir' must be a string`);
    if (!isString(tarFilename)) return error(`Publish environment '${env}' option 'tarFilename' must be a string`);

    if (remoteTarFileDir && !isString(remoteTarFileDir)) return error(`Publish environment '${env}' option 'remoteTarFileDir' must be a string`);
    remoteTarFileDir = remoteTarFileDir ? path.posix.join(remoteTarFileDir, '.') : '/tmp';
    if (!/^(\/[^\/\s]+){2,}$/.test(remoteTarFileDir) && remoteTarFileDir !== '/tmp') return error(`Publish environment '${env}' option 'remoteTarFileDir' file path is no vaild, the file path must be more than two level directory, and must be absolute path`);

    let _sftpHash = md5([ssh.host].concat(_compressHash ? _compressHash : localTarFileDir + tarFilename)
        .concat(remoteTarFileDir)
        .join('')).slice(0, 5);

    module._sftpHash = _sftpHash;
    module.remoteTarFileDir = remoteTarFileDir;

    let localTarpackPath = path.resolve(localTarFileDir, tarFilename);
    let remoteTarpackPath = path.posix.join(remoteTarFileDir, tarFilename);
    let hashPromiseName = `_${_sftpHash}HashSftpPromise`;
    let client = new Client(ssh);
    let p = this[hashPromiseName] ? this[hashPromiseName] : this[hashPromiseName] = new Promise((resolve, reject) => {
        if (this._metadata.check) return resolve(null);
        process.stdout.write(`${chalk.blue(localTarpackPath)} => ${chalk.green(remoteTarpackPath)}`);
        client.upload(localTarpackPath, remoteTarpackPath, err => {
            client.close();
        });
        let msg = '';
        //windows的git-bash上有怪异bug，所以需要手动加上换行符
        client.on('transfer', (buffer, uploaded, total) => {
            msg = chalk.gray(`${msg ? '' : os.EOL} Uploading ` + (uploaded / total * 100).toFixed(1) + '%');
            process.stdout.write('\b'.repeat(msg.length) + msg);
        });
        client.on('end', () => {
            process.stdout.write('\b'.repeat(msg.length) + `${msg ? '' : os.EOL}Uploading success`);
            resolve(null);
        });
        client.on('error', err => {
            process.stdout.write('\b'.repeat(msg.length) + `${msg ? '' : os.EOL}Uploading failures`);
            resolve(err);
        });
    }).catch(next);

    p.then(err => {
        if (err) {
            process.stdout.write(os.EOL);
            error(`Publish environment '${env}' sftp failures, ${err.message}`, false, () => {});
            next(err);
        } else {
            process.stdout.write(os.EOL);
            logger.success(`env ${env} sftp success`);
            next(null, "sftp success");
        };
    })
};
