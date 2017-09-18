const fs = require('fs');
const path = require('path');
const is = require('is');
const md5 = require('md5');
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
        let charLenght = 0;
        process.stdout.write(`'${chalk.blue(localTarpackPath)}' => '${chalk.green(remoteTarpackPath)}'\n`);
        client.upload(localTarpackPath, remoteTarpackPath, err => {
            client.close();
        });
        client.on('transfer', (buffer, uploaded, total) => {
            let msg = chalk.gray('uploading ' + (uploaded / total * 100).toFixed(1) + '%');
            charLenght = msg.length;
            let str = "";
            for (; charLenght > msg.length; charLenght--) {
                str += "\b \b";
            };
            charLenght = msg.length;
            for (let i = 0; i < charLenght; i++) {
                str += "\b";
            };
            process.stdout.write(str + msg);
        });
        client.on('end', () => {
            resolve(null);
        });
        client.on('error', err => {
            resolve(err);
        });
    }).catch(next);

    p.then(err => {
        if (err) {
            process.stdout.write('\n');
            error(`Publish environment '${env}' sftp failures`, false, () => {});
            next(err);
        } else {
            process.stdout.write('\n');
            logger.success(`env ${env} sftp success`);
            next(null, "sftp success");
        };
    })
};
