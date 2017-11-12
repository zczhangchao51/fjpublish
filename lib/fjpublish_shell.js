const fs = require('fs');
const path = require('path');
const is = require('is');
const SSH2Shell = require('ssh2shell');
const createHash = require("crypto").createHash;
const md5 = (input) => {
    return createHash('md5').update(input).digest('hex');
};
const logger = require('./index.js').logger;

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

    let { nohistory, postCommands, preCommands, tarFilename, remoteTarFileDir, _current, _latest, extractVerbose, tag, remotePath, shellTrashPath, localPathEntries, localPath, ssh, nobackup, merge, ssh2shell = {}, _timeStamp } = module;
    let md5TimeStamp = md5(_timeStamp).slice(0, 5);

    if (isUndefined(remotePath)) return error(`Publish environment '${env}' option 'remotePath' is not found`);
    if (isUndefined(tarFilename)) return error(`Publish environment '${env}' option 'tarFilename' is not found`);
    if (isUndefined(remoteTarFileDir)) return error(`Publish environment '${env}' option 'remoteTarFileDir' is not found`);
    if (isUndefined(ssh)) return error(`Publish environment '${env}' option 'ssh' is not found`);

    if (ssh.userName || ssh.user) {
        warning("ssh配置中的'userName'与'user'请统一配置为'username'，详情参考ssh2库(https://github.com/mscdex/ssh2)", false, false);
    };
    if (ssh.username) ssh.userName = ssh.username;
    if (ssh.hostHash) ssh.hashMethod = ssh.hostHash;
    if (ssh.passphrase) ssh.passPhrase = ssh.passphrase;

    if (localPathEntries && !isString(localPathEntries) && !isArray(localPathEntries)) return error(`Publish environment '${env}' option 'localPathEntries' must be a string or an array`);
    if (!isString(remotePath)) return error(`Publish environment '${env}' option 'remotePath' must be a string`);
    if (!isString(tarFilename)) return error(`Publish environment '${env}' option 'tarFilename' must be a string`);
    if (!isString(remoteTarFileDir)) return error(`Publish environment '${env}' option 'remoteTarFileDir' must be a string`);
    if (shellTrashPath && !isString(shellTrashPath)) return error(`Publish environment '${env}' option 'shellTrashPath' must be a string`);

    remotePath = path.posix.join(remotePath, '.');
    remoteTarFileDir = path.posix.join(remoteTarFileDir, '.');
    if (shellTrashPath) shellTrashPath = path.posix.join(shellTrashPath, '.');
    if (!/^(\/[^\/\s]+){2,}$/.test(remotePath)) return error(`Publish environment '${env}' option 'remotePath' file path is no vaild, the file path must be more than two level directory, and must be absolute path`);
    if (!/^(\/[^\/\s]+){2,}$/.test(remoteTarFileDir) && remoteTarFileDir !== '/tmp') return error(`Publish environment '${env}' option 'remoteTarFileDir' file path is no vaild, the file path must be more than two level directory, and must be absolute path`);
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

    module.tag = tag ? isFn(tag) ? isString(tag(module, env, this)) ? tag(module, env, this) : md5TimeStamp : tag : md5TimeStamp;
    if (!nohistory) {
        _latest._backupExt = _current._timeStamp = _timeStamp;
        _current.tag = module.tag;
    };

    shellTrashPath = shellTrashPath || '/tmp/fjpublishTrashDir';
    let remoteTarFilePath = path.posix.join(remoteTarFileDir, tarFilename);
    let commands = [
        //保证远程环境父目录必须存在
        `mkdir -p ${remotePath}`,
        //保证远程环境垃圾箱必须存在
        `mkdir -p ${shellTrashPath}`,
        //进入远程环境父目录
        `cd ${localPathEntries ? remotePath : path.dirname(remotePath)}`,
    ];

    //确保远程垃圾箱目录存在
    let remotePathBackupPath = `${shellTrashPath + remotePath.replace(/\b\//g, '.')}.${_timeStamp}`;
    if (nobackup && localPathEntries) commands.push(`mkdir -p ${remotePathBackupPath}`);

    //根据发布文件(夹)数组生成的主要处理命令
    let mainCommands = mainCmdFn(localPathEntries ? localPathEntries : [path.basename(remotePath)]);
    if (!localPathEntries) {
        //重建一份可能被移走的目录
        mainCommands.push(`mkdir -p ${path.basename(remotePath)}`);
        //进入remotePath的目录执行解压和后命令
        mainCommands.push(`cd ${remotePath}`);
        //在不记录历史的情况下防止历史记录丢失所以把被移走的fjpublish.json再拷贝回来
        if (nohistory && !merge) {
            let cpHistoryPath = path.posix.join(nobackup ? remotePathBackupPath : `${remotePath}.${_timeStamp}`, 'fjpublish.json');
            mainCommands.push(`cp ${cpHistoryPath} fjpublish.json`);
        };
    };

    function mainCmdFn(paths = []) {
        let result = [];
        paths.forEach(v => {
            let pathV = path.posix.join(v, '.');
            if (nobackup) {
                let backupPath = path.posix.join(remotePathBackupPath, pathV);
                if (!/^(\/[^\/\s]+){2,}$/.test(backupPath)) {
                    return error('Combine path error');
                };
                result.push(`${merge ? 'cp -r' : 'mv'} ${pathV} ${localPathEntries ? backupPath : remotePathBackupPath}`);
            } else {
                result.push(`${merge ? 'cp -r' : 'mv'} ${pathV} ${pathV}.${_timeStamp}`);
            };
        });
        return result;
    };

    // 文件解压至远程环境父目录
    let tarCommand = `tar --no-same-owner -zmpx${extractVerbose ? 'v' : ''}f ${remoteTarFilePath}`;

    //合并命令
    commands = [...commands, ...mainCommands, tarCommand];

    //增加前置处理命令
    if (preCommands) commands = [...preCommands, ...commands];

    //增加后置置处理命令
    if (postCommands) commands = [...commands, ...postCommands];

    module._commands = commands.slice();
    if (this._metadata.check) {
        logger.success(`env ${env} shell success`);
        return next(null, 'shell success');
    };
    let cacheMsg = '';
    let opt = Object.assign({ idleTimeOut: 10000 }, ssh2shell, {
        server: ssh,
        commands,
    });
    let SSH = new SSH2Shell(opt);
    SSH.on('data', data => {
        process.stdout.write(data);
    });
    // SSH.pipe(fs.createWriteStream('example.txt'));

    SSH.connect(text => {
        console.log('\n')
        logger.success(`env ${env} shell success`);
        setTimeout(() => {
            next(null, 'shell success');
        }, 500);
    });
};
