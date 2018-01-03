const path = require('path')
const inquirer = require('inquirer')
const date = require('phpdate-js')
const SSH2Shell = require('ssh2shell')
const chalk = require('chalk')
const is = require('is')
const isObject = is.object,
  isArray = is.array,
  isString = is.string,
  isEmpty = is.empty,
  isFn = is.fn,
  isUndefined = is.undefined
const { error, warning, success } = require('./index.js').logger

module.exports = function recover(module, env, next) {
  let {
    _history,
    recoverTemplate,
    ssh2shell,
    remotePath,
    ssh,
    shellTrashPath,
    preCommands,
    postCommands,
    _recover: { previous, length = 5 }
  } = module
  if (ssh.userName || ssh.user) {
    warning(
      "ssh配置中的'userName'与'user'请统一配置为'username'，详情参考ssh2库(https://github.com/mscdex/ssh2)",
      'recover',
      false,
      false
    )
  }
  if (ssh.username) ssh.userName = ssh.username
  if (ssh.hostHash) ssh.hashMethod = ssh.hostHash
  if (ssh.passphrase) ssh.passPhrase = ssh.passphrase

  if (isEmpty(_history))
    return warning('The history record is empty', 'recover', true)
  if (_history.length === 1)
    return warning(
      'There is only one history record that dont need to recover',
      'recover',
      true
    )

  remotePath = path.posix.join(remotePath, '.')
  shellTrashPath = shellTrashPath
    ? path.posix.join(shellTrashPath, '.')
    : '/tmp/fjpublishTrashDir'

  if (!/^(\/[^\/\s]+){2,}$/.test(remotePath))
    return error(
      `Publish environment '${env}' option 'remotePath' file path is no vaild, the file path must be more than two level directory, and must be absolute path`,
      'recover'
    )
  if (shellTrashPath && !/^(\/[^\/\s]+){2,}$/.test(shellTrashPath))
    return error(
      `Publish environment '${env}' option 'shellTrashPath' file path is no vaild, the file path must be more than two level directory, and must be absolute path`,
      'recover'
    )

  let p = previous
    ? Promise.resolve({ index: 1 })
    : inquirer.prompt([
        {
          type: 'list',
          name: 'index',
          message: 'Please select the version you want to recover',
          choices: _history.slice(1, +length + 1).map((v, k) => ({
            name: recoverTemplate
              ? recoverTemplate(module, v, chalk)
              : `${chalk.gray(v.tag)}  ${v._backupExt}  ${v.gitMessage || ''}`,
            value: k + 1
          }))
        }
      ])

  p.then(({ index }) => {
    let record = _history[index]
    let { tag, _backupExt, localPathEntries } = record
    let _timeStamp = date('YmdHis')
    let commands = [
      //保证远程环境垃圾箱必须存在
      `mkdir -p ${shellTrashPath}`,
      //进入远程环境父目录
      `cd ${localPathEntries ? remotePath : path.dirname(remotePath)}`
    ]

    let remotePathBackupPath = `${shellTrashPath +
      remotePath.replace(/\b\//g, '.')}.${_timeStamp}`
    if (localPathEntries) commands.push(`mkdir -p ${remotePathBackupPath}`)

    //根据发布文件(夹)数组生成的主要处理命令
    let mainCommands = mainCmdFn(
      localPathEntries ? localPathEntries : [path.basename(remotePath)]
    )
    if (!localPathEntries) {
      //进入remotePath的目录执行后命令
      mainCommands.push(`cd ${remotePath}`)
    }

    function mainCmdFn(paths = []) {
      let result = []
      paths.forEach(v => {
        let pathV = path.posix.join(v, '.')
        let backupPath = `${remotePathBackupPath}/${path.normalize(pathV)}`
        if (!/^(\/[^\/\s]+){2,}$/.test(backupPath)) {
          return error('Combine path error', 'recover')
        }
        result.push(
          `mv ${pathV} ${localPathEntries ? backupPath : remotePathBackupPath}`
        )
        result.push(`mv ${pathV}.${_backupExt} ${pathV}`)
      })
      return result
    }

    //合并命令
    commands = [...commands, ...mainCommands]

    //增加前置处理命令
    if (preCommands) commands = [...preCommands, ...commands]

    //增加后置置处理命令
    if (postCommands) commands = [...commands, ...postCommands]

    _history.splice(index, 1)
    delete record._backupExt
    record._timeStamp = _timeStamp
    _history.splice(0, 1, record)

    let opt = Object.assign({ idleTimeOut: 10000 }, ssh2shell, {
      server: ssh,
      commands
    })
    let SSH = new SSH2Shell(opt)
    SSH.on('data', data => {
      process.stdout.write(data)
    })

    SSH.connect(text => {
      console.log('\n')
      setTimeout(() => {
        module._customHistory = true
        success(`recover success`)
        next(null)
      }, 500)
    })
  })
}
