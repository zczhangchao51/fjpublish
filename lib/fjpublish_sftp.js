const fs = require('fs')
const os = require('os')
const path = require('path')
const is = require('is')
const ProgressBar = require('progress')
const createHash = require('crypto').createHash
const md5 = input => {
  return createHash('md5')
    .update(input)
    .digest('hex')
}
const chalk = require('chalk')
const Client = require('scp2').Client
const logger = require('./index.js').logger

module.exports = function sftp(module, env, next) {
  let isObject = is.object,
    isString = is.string,
    isEmpty = is.empty,
    isFn = is.fn,
    isUndefined = is.undefined
  let localLogger = (local, type) => (msg, end = false, cb = next) =>
    logger[type](msg, local, end, cb)
  let error = localLogger('sftp', 'error')
  let warning = localLogger('sftp', 'warning')

  let {
    localTarFileDir,
    _compressHash,
    tarFilename,
    remoteTarFileDir,
    ssh
  } = module

  if (isUndefined(localTarFileDir)) {
    return error(
      `Publish environment '${env}' option 'localTarFileDir' is not found`
    )
  }
  if (isUndefined(tarFilename)) {
    return error(
      `Publish environment '${env}' option 'tarFilename' is not found`
    )
  }
  if (isUndefined(ssh)) {
    return error(`Publish environment '${env}' option 'ssh' is not found`)
  }

  if (!isString(localTarFileDir)) {
    return error(
      `Publish environment '${env}' option 'localTarFileDir' must be a string`
    )
  }
  if (!isString(tarFilename)) {
    return error(
      `Publish environment '${env}' option 'tarFilename' must be a string`
    )
  }

  if (remoteTarFileDir && !isString(remoteTarFileDir)) {
    return error(
      `Publish environment '${env}' option 'remoteTarFileDir' must be a string`
    )
  }
  remoteTarFileDir = remoteTarFileDir
    ? path.posix.join(remoteTarFileDir, '.')
    : '/tmp'
  if (
    !/^(\/[^\/\s]+){2,}$/.test(remoteTarFileDir) &&
    remoteTarFileDir !== '/tmp'
  ) {
    return error(
      `Publish environment '${env}' option 'remoteTarFileDir' file path is no vaild, the file path must be more than two level directory, and must be absolute path`
    )
  }

  let _sftpHash = md5(
    [ssh.host]
      .concat(_compressHash || localTarFileDir + tarFilename)
      .concat(remoteTarFileDir)
      .join('')
  ).slice(0, 5)

  module._sftpHash = _sftpHash
  module.remoteTarFileDir = remoteTarFileDir

  let localTarpackPath = path.resolve(localTarFileDir, tarFilename)
  let remoteTarpackPath = path.posix.join(remoteTarFileDir, tarFilename)
  let hashPromiseName = `_${_sftpHash}HashSftpPromise`
  let client = new Client(ssh)
  let p = this[hashPromiseName]
    ? this[hashPromiseName]
    : (this[hashPromiseName] = new Promise((resolve, reject) => {
      if (this._metadata.check) return resolve(null)
      console.log(
        `${chalk.blue(localTarpackPath)} => ${chalk.green(remoteTarpackPath)}`
      )
      let bar = new ProgressBar('  Uploading [:bar] :percent :etas', {
        complete: '=',
        incomplete: ' ',
        width: 20,
        total: 100
      })
      client.upload(localTarpackPath, remoteTarpackPath, err => {
        client.close()
      })
      client.on('transfer', (buffer, uploaded, total) => {
        bar.update(uploaded / total)
      })
      client.on('end', () => {
        bar.update(1)
        resolve(null)
      })
      client.on('error', err => {
        bar.update(1)
        resolve(err)
      })
    }).catch(next))

  p.then(err => {
    if (err) {
      error(
        `Publish environment '${env}' sftp failures, ${err.message}`,
        false,
        () => {}
      )
      next(err)
    } else {
      logger.success(`env ${env} sftp success`)
      next(null, 'sftp success')
    }
  })
}
