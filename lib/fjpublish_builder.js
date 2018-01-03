const is = require('is')
const tar = require('tar-fs')
const fs = require('fs')
const os = require('os')
const { spawn } = require('child_process')
const zlib = require('zlib')
const multimatch = require('multimatch')
const logger = require('./index.js').logger
const mergeNoUndefined = require('./index.js').mergeNoUndefined

module.exports = function builder(module, env, next) {
  let isString = is.string,
    isUndefined = is.undefined
  let localLogger = (local, type) => (msg, end = false, cb = next) =>
    logger[type](msg, local, end, cb)
  let error = localLogger('builder', 'error')
  let warning = localLogger('builder', 'warning')

  let { buildCommand, nobuild } = module

  nobuild = mergeNoUndefined(false, nobuild)
  module.nobuild = nobuild
  if (nobuild) return next(null, `env ${env} nobuild`)

  if (isUndefined(buildCommand)) {
    return error(
      `Publish environment '${env}' option 'buildCommand' is required`
    )
  }

  if (!isString(buildCommand)) {
    return error(
      `Publish environment '${env}' option 'buildCommand' must be a string`
    )
  }

  if (this._metadata.parallel) {
    logger.assert(
      Object.values(this._metadata.modules).every(
        v => v.buildCommand === buildCommand
      ),
      'error',
      'If the task is concurrent, the release command must be consistent',
      'builder'
    )
  }

  let promiseName = `_${buildCommand}BuilderPromise`
  let p = this[promiseName]
    ? this[promiseName]
    : (this[promiseName] = new Promise((resolve, reject) => {
      if (this._metadata.check) {
        logger.success(`env ${env} build success`)
        resolve(null)
        return
      }
      let cp = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', [
        'run',
        buildCommand
      ])

      cp.stderr.on('data', data => {
        process.stdout.write(data)
      })

      cp.stdout.on('data', data => {
        process.stdout.write(data)
      })

      cp.on('close', code => {
        if (code != 0) {
          resolve('build failures')
        } else {
          logger.success(`env ${env} build success`)
          resolve(null)
        }
      })
    }))

  p.then(err => {
    if (err) {
      error(`Publish environment '${env}' build failures`, false, () => {})
      next(err)
    } else {
      next(null, 'build success')
    }
  })
}
