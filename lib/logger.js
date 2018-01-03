const chalk = require('chalk')
const is = require('is')

/**
 * Normal log
 * @param  {String} msg log contents
 */
exports.log = function(msg) {
  console.log(chalk.white(prefixTemp()), msg)
}

/**
 * The warning log
 * @param  {String}  msg log contents
 * @param  {Boolean} end Whether to stop the process when the warning way, the default is false
 */
exports.warning = function(msg, local = 'undefined', end = false, cb) {
  console.log(`${chalk.yellow(prefixTemp('warning'))}[${local}]`, msg)
  end && process.exit(1)
  if (cb && is.fn(cb)) return cb(msg)
}

/**
 * The error log
 * @param  {String}  msg log contents
 * @param  {Boolean} end Whether to stop the process when the wrong way, the default is true
 */
exports.error = function(msg, local = 'undefined', end = true, cb) {
  if (msg instanceof Error) msg = msg.message.trim()
  console.log(`${chalk.red(prefixTemp('error'))}[${local}]`, msg)
  end && process.exit(1)
  if (cb && is.fn(cb)) return cb(msg)
}

/**
 * The success log
 * @param  {String} msg log contents
 */
exports.success = function(msg) {
  console.log(chalk.green(prefixTemp('success')), msg)
}

/**
 * Determine whether to generate log
 * @param  {Boolean}    boolean
 * @param  {String}    type    log's type
 * @param  {...[Arguments]} arg     Passed to the log function parameters
 */
exports.assert = function(boolean, type = 'error', ...arg) {
  if (!exports[type]) exports.error(`log type '${type}' is not found`, 'logger')
  if (!boolean) return exports[type](...arg)
}

/**
 * Prefix template
 * @param  {String} text The prefix word, default is Fjpublish
 * @return {String}
 */
function prefixTemp(text = 'Fjpublish') {
  return `[${text}]  `
}
