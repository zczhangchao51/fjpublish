const fs = require('fs');
const path = require('path');
const is = require('is');
const date = require('phpdate-js');
const SSH2Shell = require('ssh2shell');
const logger = require('./index.js').logger;
const mergeNoUndefined = require('./index.js').mergeNoUndefined;

module.exports = function shell(module, env, next) {
    let isObject = is.object,
        isArray = is.array,
        isString = is.string,
        isEmpty = is.empty,
        isFn = is.fn,
        isUndefined = is.undefined;
    let localLogger = (local, type) => (msg, end = false, cb = next) => logger[type](msg, local, end, cb);
    let error = localLogger('shell', 'error');
    let warning = localLogger('shell', 'warning');

    let { postCommands, preCommands, tarFilename, remoteTarFileDir, extractVerbose, tag, remotePath, shellTrashPath, localPathEntries, localPath, ssh, nobackup, nomerge, ssh2shell = {} } = module;

    nobackup = mergeNoUndefined(false, nobackup);
    nomerge = mergeNoUndefined(true, nomerge);
    module.nobackup = nobackup;
    module.nomerge = nomerge;

    if (isUndefined(remotePath)) return error(`Publish environment '${env}' option 'remotePath' is not found`);
    if (isUndefined(tarFilename)) return error(`Publish environment '${env}' option 'tarFilename' is not found`);
    if (isUndefined(remoteTarFileDir)) return error(`Publish environment '${env}' option 'remoteTarFileDir' is not found`);
    if (isUndefined(ssh)) return error(`Publish environment '${env}' option 'ssh' is not found`);

    if (localPathEntries && !isString(localPathEntries) && !isArray(localPathEntries)) return error(`Publish environment '${env}' option 'localPathEntries' must be a string or an array`);
    if (!isString(remotePath)) return error(`Publish environment '${env}' option 'remotePath' must be a string`);
    if (!isString(tarFilename)) return error(`Publish environment '${env}' option 'tarFilename' must be a string`);
    if (!isString(remoteTarFileDir)) return error(`Publish environment '${env}' option 'remoteTarFileDir' must be a string`);
    if (shellTrashPath && !isString(shellTrashPath)) return error(`Publish environment '${env}' option 'shellTrashPath' must be a string`);

    remotePath = path.posix.join(remotePath, '.');
    remoteTarFileDir = path.posix.join(remoteTarFileDir, '.');
    if (shellTrashPath) shellTrashPath = path.posix.join(shellTrashPath, '.');
    if (!/^(\/[^\/\s]+){2,}$/.test(remotePath)) return error(`Publish environment '${env}' option 'remotePath' file path is no vaild, the file path must be more than two level directory, and must be absolute path`);
    if (!isString(remoteTarFileDir)) return error(`Publish environment '${env}' option 'remoteTarFileDir' must be a string or an array`);
    if (!/^(\/[^\/\s]+){2,}$/.test(path.posix.resolve(remoteTarFileDir)) && remoteTarFileDir !== '/tmp') return error(`Publish environment '${env}' option 'remoteTarFileDir' file path is no vaild, the file path must be more than two level directory, and must be absolute path`);
    if (shellTrashPath && !/^(\/[^\/\s]+){2,}$/.test(shellTrashPath)) return error(`Publish environment '${env}' option 'shellTrashPath' file path is no vaild, the file path must be more than two level directory, and must be absolute path`);
    if (tag && !isString(tag) && !isFn(tag)) return error(`Publish environment '${env}' option 'tag' must be a string or a function`);

    if (isString(localPathEntries)) localPathEntries = [localPathEntries];
    if (localPathEntries && localPathEntries.some(path.isAbsolute)) return error(`Publish environment '${env}' option 'localPathEntries' must all be relative paths`);

    if (isFn(preCommands)) preCommands = preCommands(module, env, this);
    if (isFn(postCommands)) postCommands = postCommands(module, env, this);
    if (isString(preCommands)) preCommands = [preCommands];
    if (isString(postCommands)) postCommands = [postCommands];
    if (preCommands && !isArray(preCommands)) return error(`Publish environment '${env}' option 'preCommands' must be a string or an array`);
    if (postCommands && !isArray(postCommands)) return error(`Publish environment '${env}' option 'postCommands' must be a string or an array`);

    remoteTarFileDir = path.posix.resolve(remoteTarFileDir);

    module.tag = tag ? isFn(tag) ? isString(tag(module, env, this)) ? tag(module, env, this) : date('YmdHis') : tag : date('YmdHis');

    let remoteTarFilePath = path.posix.resolve(remoteTarFileDir, tarFilename);
    let TrashPath = shellTrashPath ? shellTrashPath : '/tmp/fjpublishTrashDir';
    //基础命令
    let commands = [
        //保证远程环境父目录必须存在
        `mkdir -p ${remotePath}`,
        //保证远程环境垃圾箱必须存在
        `mkdir -p ${TrashPath}`,
        //进入远程环境父目录
        `cd ${localPathEntries ? remotePath : path.dirname(remotePath)}`,
    ];

    //确保远程垃圾箱目录存在
    let remotePathBackupPath = `${TrashPath + remotePath.replace(/\b\//g,'.')}.${date('YmdHis')}`;
    if (nobackup && localPathEntries) commands.push(`mkdir -p ${remotePathBackupPath}`);

    //根据发布文件(夹)数组生成的主要处理命令
    let mainCommands = mainCmdFn(localPathEntries ? localPathEntries : [path.basename(remotePath)]);
    if (!localPathEntries) {
        mainCommands.push(`mkdir -p ${path.basename(remotePath)}`);
        mainCommands.push(`cd ${remotePath}`);
    };

    function mainCmdFn(paths = []) {
        let result = [];
        paths.forEach(v => {
            pathV = path.posix.join(v, '.');
            //如果tag字段存在，为防止每次发布时忘记主动更替tag导致tag文件备份时合并在一起，先确保移除先前的tag文件
            if (tag) result.push(`mv ${pathV}.${module.tag} ${remotePathBackupPath}`);
            //移除或者简单备份或者增量备份原子文件(夹)
            if (nobackup) {
                let backupPath = `${remotePathBackupPath}/${path.normalize(pathV)}`;
                if (!/^(\/[^\/\s]+){2,}$/.test(backupPath)) {
                    error('Combine path error');
                    return next('Combine path error');
                };
                result.push(`mv ${pathV} ${localPathEntries ? backupPath : remotePathBackupPath }`);
            } else {
                result.push(`${nomerge ? 'mv' : 'cp -r'} ${pathV} ${pathV}.${module.tag}`);
            };
        });
        return result;
    };

    // 文件解压至远程环境父目录
    let tarCommand = `tar -zmx${extractVerbose ? 'v' : ''}f ${remoteTarFilePath}`;

    //合并命令
    commands = [...commands, ...mainCommands, tarCommand];

    //增加前置处理命令
    if (preCommands) commands = [...preCommands, ...commands];

    //增加后置置处理命令
    if (postCommands) commands = [...commands, ...postCommands];

    module._commands = commands.slice();
    if (this._metadata.check) {
        logger.success(`env ${env} shell success`);
        next(null, 'shell success');
        return;
    };
    let cacheMsg = '';
    let opt = Object.assign({}, ssh2shell, {
        server: ssh,
        commands,
        // 10s 超时
        idleTimeOut: 10000,
    });
    let SSH = new SSH2Shell(opt);
    SSH.on('data', data => {
        process.stdout.write(data)
    });
    // SSH.pipe(fs.createWriteStream('example.txt'));
    SSH.connect(text => {
        console.log('\n')
        logger.success(`env ${env} shell success`);
        next(null, 'shell success');
    });
};
