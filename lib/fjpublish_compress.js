const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const is = require('is');
const tar = require('tar-fs');
const createHash = require("crypto").createHash;
const md5 = (input) => {
    return createHash('md5').update(input).digest('hex');
};
const ora = require('ora');
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

    if (module.diff && module.nohistory) warning(`File diff dependency on history, please dont set 'nohistory'`, false, () => {});
    if (module.nohistory) module.diff = false;
    if (module.diff) module.merge = true;
    let { localPath, localPathEntries, localPathIgnore, buildCommand, nobuild, merge, nohistory, diff, localTarFileDir, tarFilename, _latest, _current } = module;

    if (isUndefined(localPath) && isUndefined(localPathEntries)) return error(`Publish environment '${env}' option 'localPath' and 'localPathEntries' exist at least one. if you want to publish all files in the current directory, please set 'localPath' to '.'`);

    if (localPath && !isString(localPath)) return error(`Publish environment '${env}' option 'localPath' must be a string`);
    if (localPathEntries && !isString(localPathEntries) && !isArray(localPathEntries)) return error(`Publish environment '${env}' option 'localPathEntries' must be a string or an array`);

    if (localTarFileDir && !isString(localTarFileDir)) return error(`Publish environment '${env}' option 'localTarFileDir' must be a string`);
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
            .concat(diff || [])
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
        let spinner = ora('Compressing...').start();
        if (localPathEntries) option.entries = localPathEntries.slice();
        let _latestFilesHash = _latest._filesHash;
        let _filesHash = merge ? Object.assign({}, _latestFilesHash) : {};
        option.ignore = (name) => {
            let isFile = fs.statSync(name).isFile();
            let boolean = false;
            if (isFn(localPathIgnore)) boolean = localPathIgnore(name);
            if (isArray(localPathIgnore) && !boolean) boolean = !!multimatch([name], localPathIgnore, { dot: true }).length;
            if (isFile && !boolean && !nohistory) {
                let fileContentHash = md5(fs.readFileSync(name)).slice(0, 5);
                if (diff && _latestFilesHash && _latestFilesHash[name] && (fileContentHash === _latestFilesHash[name])) boolean = true;
                _filesHash[name] = fileContentHash;
            };
            return boolean;
        };
        let pack = tar.pack(localPath || '.', option);
        let gzStream = pack.pipe(zlib.createGzip());
        gzStream.pipe(fs.createWriteStream(path.join(module.localTarFileDir, filename)));
        // pack.pipe(zlib.createGzip()).pipe(fs.createWriteStream(path.join(module.localTarFileDir, filename)));
        gzStream.on('error', err => {
            spinner.fail('Compress failures');
            resolve({ err });
        });
        gzStream.on('end', () => {
            spinner.succeed('Compress success');
            resolve({ filename, _filesHash, localPathEntries });
        });
    })

    p.then(({ filename, _filesHash, err = null }) => {
        if (err) {
            error(`Publish environment '${env}' compress failures`, false, () => {});
            next(err);
        } else {
            module.tarFilename = filename;
            if (!nohistory && !this._metadata.check) {
                if (localPathEntries) _current.localPathEntries = localPathEntries;
                _current._filesHash = _filesHash;
            };
            logger.success(`env ${env} compress success`);
            next(null, "compress success");
        };
    });
};
