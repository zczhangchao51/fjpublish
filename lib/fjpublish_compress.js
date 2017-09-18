const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const is = require('is');
const tar = require('tar-fs');
const md5 = require('md5');
const multimatch = require('multimatch');
const logger = require('./index.js').logger;

module.exports = function compress(module, env, next) {
    let isObject = is.object,
        isArray = is.array,
        isString = is.string,
        isEmpty = is.empty,
        isFn = is.fn,
        isUndefined = is.undefined;
    let localLogger = (local, type) => (msg, end = false, cb = next) => logger[type](msg, local, end, cb);
    let error = localLogger('compress', 'error');
    let warning = localLogger('compress', 'warning');

    let { localPath, localPathEntries, localPathIgnore, buildCommand, nobuild, localTarFileDir, tarFilename } = module;

    if (isUndefined(localPath) && isUndefined(localPathEntries)) return error(`Publish environment '${env}' option 'localPath' and 'localPathEntries' exist at least one. if you want to publish all files in the current directory, please set 'localPath' to '.'`);

    if (localPath && !isString(localPath)) return error(`Publish environment '${env}' option 'localPath' must be a string`);
    if (localPathEntries && !isString(localPathEntries) && !isArray(localPathEntries)) return error(`Publish environment '${env}' option 'localPathEntries' must be a string or an array`);

    if (!isUndefined(localTarFileDir) && !isString(localTarFileDir)) return error(`Publish environment '${env}' option 'localTarFileDir' must be a string`);
    if (tarFilename && !isString(tarFilename)) return error(`Publish environment '${env}' option 'tarFilename' must be a string`);
    if (tarFilename && !/^\w+$/.test(tarFilename)) return error(`Publish environment '${env}' option 'tarFilename' name is illegal, e.g. example.tar.gz only white example`);

    if (isString(localPathEntries)) localPathEntries = [localPathEntries];
    if (localPathEntries && localPathEntries.some(path.isAbsolute)) return error(`Publish environment '${env}' option 'localPathEntries' must all be relative paths, and all path must in the current working directory`);
    if (isString(localPathIgnore)) localPathIgnore = [localPathIgnore];
    let _compressHash = md5([].concat(isFn(localPathIgnore) ? Math.random() : localPathIgnore || [])
            .concat(localPath || [])
            .concat(localPathEntries || [])
            .concat(localTarFileDir || [])
            .concat(tarFilename || [])
            .concat(nobuild ? [] : buildCommand || [])
            .join(''))
        .slice(0, 5);

    module.localTarFileDir = localTarFileDir ? path.resolve(localTarFileDir) : os.tmpdir();
    module._compressHash = _compressHash;

    let hashPromiseName = `_${_compressHash}HashCompressPromise`;
    let p = this[hashPromiseName] ? this[hashPromiseName] : this[hashPromiseName] = new Promise((resolve, reject) => {
        let option = {};
        let curIndex = this._compressIndex || (this._compressIndex = 0);
        let filename = `${tarFilename ? tarFilename : 'fjcompress' + curIndex}.tar.gz`;
        this._compressIndex++;
        if (this._metadata.check) return resolve({ filename });
        if (localPathEntries) option.entries = localPathEntries.slice();
        if (localPathIgnore) option.ignore = (name) => {
            if (isFn(localPathIgnore)) return localPathIgnore(name);
            if (isArray(localPathIgnore)) return !!multimatch([name], localPathIgnore, { dot: true }).length;
            return false;
        };
        let pack = tar.pack(localPath || '.', option);
        let gzStream = pack.pipe(zlib.createGzip());
        gzStream.pipe(fs.createWriteStream(path.join(module.localTarFileDir, filename)));
        // pack.pipe(zlib.createGzip()).pipe(fs.createWriteStream(path.join(module.localTarFileDir, filename)));
        gzStream.on('error', err => {
            resolve({ err });
        });
        gzStream.on('end', () => {
            resolve({ filename });
        });
    })

    p.then(({ filename, err = null }) => {
        if (err) {
            error(`Publish environment '${env}' compress failures`, false, () => {});
            next(err);
        } else {
            module.tarFilename = filename;
            logger.success(`env ${env} compress success`);
            next(null, "compress success");
        };
    });
};
