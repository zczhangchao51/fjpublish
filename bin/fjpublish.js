#! /usr/bin/env node

const pkg = require('../package.json')
const fs = require('fs')
const os = require('os')
const path = require('path')
const chalk = require('chalk')
const program = require('commander')
const is = require('is')
const inquirer = require('inquirer')
const { spawn, execSync, exec } = require('child_process')
const Fjpublish = require('../lib/index.js')
const pull = require('../lib/fjpublish_pull.js')
const prompt = require('../lib/fjpublish_prompt.js')
const git = require('../lib/fjpublish_git.js')
const builder = require('../lib/fjpublish_builder.js')
const compress = require('../lib/fjpublish_compress.js')
const sftp = require('../lib/fjpublish_sftp.js')
const shell = require('../lib/fjpublish_shell.js')
const push = require('../lib/fjpublish_push.js')
const recover = require('../lib/fjpublish_recover.js')
const logger = require('../lib/logger.js')

const success = logger.success
const localAssert = (local, type) => (boolean, type = 'error', msg, ...arg) =>
  logger.assert(boolean, type, msg, local, ...arg)
const assert = localAssert('fjpublish')
const localLogger = (local, type) => (msg, end = true, cb) =>
  logger[type](msg, local, end, cb)
const warning = localLogger('fjpublish', 'warning')
const error = localLogger('fjpublish', 'error')

const isObject = is.object,
  isArray = is.array,
  isString = is.string,
  isEmpty = is.empty,
  isFn = is.fn,
  isUndefined = is.undefined

process.on('uncaughtException', err => {
  return error(err.stack)
})
process.on('unhandledRejection', (err, p) => {
  return error(err.stack)
})

program
  .version(pkg.version)
  .usage('<cmd> [options]')
  .option(
    '--config <path>',
    "Set the profile path and defaults to 'fjpublish.config.js' in the current directory"
  )

program
  .command('init')
  .description('Generate a default configuration for reference')
  .action(cmd => {
    COMMAND = 'init'
    let confPath = path.join(process.cwd(), 'fjpublish.config.js')
    let p = fs.existsSync(confPath)
      ? inquirer.prompt([
          {
            type: 'confirm',
            name: 'init',
            message:
              "There is a 'fjpublish.config.js' file in the current directory. Continue operation will overwrite. Are you sure?",
            default: false
          }
        ])
      : Promise.resolve({ init: true })
    p.then(({ init }) => {
      if (!init) return warning('cancelled', false)
      let fileStream = fs.createReadStream(
        path.join(__dirname, '../lib/fjpublish.config.js')
      )
      fileStream.pipe(fs.createWriteStream(confPath))
      fileStream.on('end', () => {
        success('Init success')
      })
    })
  })

program
  .command('auth <server>')
  .usage('<server> [options]')
  .description('authenticate the public key to remote server')
  .option(
    '-k, --key <path>',
    'Select the pubic keys that need to be authenticated'
  )
  .action((server, { key }) => {
    COMMAND = 'auth'
    let defaultKey = `${os.homedir()}/.ssh/id_rsa.pub`
    if (!key)
      assert(
        fs.existsSync(defaultKey),
        'error',
        "File '~/.ssh/id_rsa.pub' is not found, please check or select a pubic keys that need to be authenticated"
      )
    if (key)
      assert(
        path.isAbsolute(key) && path.extname(key) === '.pub',
        'error',
        "please select a public key and path must be absolute path, eg '/abc/cde.pub'"
      )
    if (key)
      assert(fs.existsSync(key), 'error', 'Public key you choice is not exist')
    if (!key) key = defaultKey
    let catKey = fs.createReadStream(key, 'utf8')
    let sshAuth = exec(
      `ssh ${server} "mkdir -p ~/.ssh && cat >>  ~/.ssh/authorized_keys"`,
      (err, stdout, stderr) => {
        if (err) return error(err)
        success('auth success')
      }
    )
    catKey
      .on('data', data => {
        sshAuth.stdin.write(data)
      })
      .on('close', code => {
        sshAuth.stdin.end()
      })
  })

program
  .command('list')
  .description('List the configured environment')
  .action(cmd => {
    COMMAND = 'list'
    let configPath = getConfigPath(cmd.parent)
    let config = require(configPath)
    console.log('You can publish the following environment:')
    if (isArray(config.modules)) {
      config.modules.forEach(v => {
        console.log(`   ${chalk.green(v.env)}  ${v.name}  ${v.ssh.host}`)
      })
    } else if (isObject(config.modules)) {
      Object.keys(config.modules).forEach(v => {
        let obj = config.modules[v]
        console.log(`   ${chalk.green(obj.env)}  ${obj.name}  ${obj.ssh.host}`)
      })
    }
  })

program
  .command('env [env]')
  .usage('[env] [options]')
  .description('Publish code to remote host')
  .option('-s, --select', 'Publish by select')
  .option('-m, --multiple', 'Select multiple publishing environments')
  .option('--nobuild [env]', 'Do not node build direct publish')
  .option('--nobackup [env]', 'Last release no backup')
  .option('--nohistory [env]', 'No pull and push history')
  .option('-d, --diff [env]', 'Only publish modified files')
  .option(
    '--merge [env]',
    'Merge the current version with the previous version'
  )
  .option('-t, --tag <message>', 'Create a tag on publish')
  .option('--ssh <ssh>', 'Create a tag on publish')
  .option('--cmd <command>', 'Set node build command')
  .option('--check', 'Do not run the Task and check parameters')
  .option('--parallel', 'Parallel publish')
  .option('-y, --yes', 'No confirmation prompt')
  .option('-p, --prompt', 'Publish by prompt')
  .option('--commit [msg]', 'Use git commit')
  .option('--rebase', 'use git pull --rebase')
  .option('--push', 'use git push')
  .option('--arg <arg>', 'Receive custom parameters')
  .action((env, cmd) => {
    assert(
      cmd instanceof program.constructor,
      'error',
      'Parameter is not valid'
    )
    COMMAND = true
    let { select, multiple, yes } = cmd
    assert(
      env || select || multiple,
      'error',
      "You must choose an environment to publish, please use 'fjpublish env <env> [option]' or 'fjpublish env -s|m [option]'"
    )
    let configPath = getConfigPath(cmd.parent)
    let config = require(configPath)
    let modules = config.modules
    assert(
      !isUndefined(modules),
      'error',
      "Config option 'modules' is required"
    )
    if (env) {
      let module
      let configIsArray = isArray(modules)
      let nameArr = env.split(',').map(v => {
        if (
          (module = configIsArray
            ? modules.find(vv => v === vv.env)
            : modules[v])
        ) {
          return module.name
        } else {
          error(`The selected environment '${v}' does not exist`)
        }
      })
      if (yes) return envMainFunction(config, env.split(','), cmd)
      inquirer
        .prompt([
          {
            type: 'confirm',
            name: 'confirm',
            message: `Confirm publish to ${chalk.red(nameArr.join(','))} ?`,
            default: false
          }
        ])
        .then(answers => {
          if (answers.confirm) envMainFunction(config, env.split(','), cmd)
        })
    } else {
      selectEnv(
        modules,
        'Please select the environment to publish?',
        multiple
      ).then(answers => {
        if (isArray(answers.env) && !answers.env.length)
          return warning('Not to select')
        envMainFunction(
          config,
          isArray(answers.env) ? answers.env : [answers.env],
          cmd
        )
      })
    }
  })

program
  .command('recover <env>')
  .description('Recover the code to a version')
  .option('-p, --previous', 'Recover the code to the previous version')
  .option('-l, --length <n>', 'How many length of history records want to show')
  .action((env, cmd) => {
    assert(
      cmd instanceof program.constructor,
      'error',
      'Parameter is not valid'
    )
    COMMAND = env
    let { previous, length } = cmd
    let configPath = getConfigPath(cmd.parent)
    let config = require(configPath)
    let modules = config.modules
    assert(
      !isUndefined(modules),
      'error',
      "Config option 'modules' is required"
    )
    let module = isArray(modules)
      ? modules.find(v => env === v.env)
      : modules[env]
    assert(
      !isUndefined(module),
      'error',
      `The selected environment '${env}' does not exist`
    )
    let fjpublish = Fjpublish(config, [{ env, _recover: { previous, length } }])
    fjpublish
      .use(pull)
      .use(recover)
      .use(push)
      .start()
  })

program.on('--help', function() {
  console.log('')
  console.log('  e.g:')
  console.log('')
  console.log('    $ fjpublish init')
  console.log('    $ fjpublish list')
  console.log('    $ fjpublish env [env] [option]')
  console.log('    $ fjpublish auth <server> [option]')
  console.log('    $ fjpublish recover <env> [option]')
  console.log('')
})

program.parse(process.argv)

if (typeof COMMAND === 'undefined') {
  error(
    "The command not selected or no exist, you can get help by enter 'fjpublish -h'"
  )
}

function envMainFunction(config, env, cmd) {
  let p = cmd.ssh ? sshParse(cmd.ssh, env) : Promise.resolve()
  p.then(ssh => {
    if (ssh) cmd.ssh = ssh
    MAINFUNC(config, env, cmd)
  })
}

function MAINFUNC(config, env, cmd) {
  let {
    use = { pull, prompt, git, builder, compress, sftp, shell, push },
    ssh,
    commit,
    rebase,
    tag,
    push: gitpush,
    nobuild,
    nobackup,
    nohistory,
    merge,
    diff,
    prompt: usePrompt,
    check,
    parallel,
    parent,
    arg,
    cmd: command
  } = cmd
  let extend = {}
  env = env.map(v => ({
    env: v,
    nobuild: cmdExtendModules(v, nobuild),
    nobackup: cmdExtendModules(v, nobackup),
    nohistory: cmdExtendModules(v, nohistory),
    merge: cmdExtendModules(v, merge),
    diff: cmdExtendModules(v, diff),
    ssh: cmdExtendModules(v, ssh ? ssh.env : void 0, ssh),
    tag,
    buildCommand: command
  }))
  if (arg) {
    let parse = cmdCustomArgParse(arg)
    parse.forEach(v => {
      if (v) {
        env.forEach(vv => {
          vv[v.key] =
            v.env === true ? v.val : cmdExtendModules(vv.env, v.env, v.val)
          if (v.env === true) extend[v.key] = v.val
        })
      }
    })
  }
  if (parallel) extend.parallel = true
  if (check) extend.check = true
  if (commit) {
    extend.gitCommit = commit
    extend.gitPush = gitpush
    extend.gitRebase = rebase
  }
  if (usePrompt) {
    extend.usePrompt = true
    extend._prompts = [
      {
        type: 'confirm',
        name: 'nobuild',
        message: 'Do not node build before publish ?',
        default: false
      },
      {
        type: 'confirm',
        name: 'nobackup',
        message: 'Last release no backup ?',
        default: false
      },
      {
        type: 'confirm',
        name: 'merge',
        message: 'Merge the current version with the previous version ?',
        default: false
      }
    ]
    extend._promptSyncModule = ['nobuild', 'nobackup', 'merge']
  }
  let fjpublish = Fjpublish(config, env)
  Object.keys(use).forEach(v => fjpublish.use(use[v]))
  fjpublish.metadata(extend)
  fjpublish.start(true)
}

//abc:cbd@a-b-c
//<key>[:val][@envs]
function cmdCustomArgParse(arg, exec) {
  return arg.split(',').map(v => {
    return (exec = /^(\w+)(?::(\w+))?(?:@(\w+(?:-\w+)*))?$/.exec(v))
      ? {
          key: exec[1],
          val: exec[2] ? exec[2] : true,
          env: exec[3] ? exec[3].replace(/-/g, ',') : true
        }
      : null
  })
}

function selectEnv(modules, tips, multiple) {
  let choices
  if (isArray(modules)) {
    choices = modules.map(v => ({
      name: `${chalk.green(v.env)}  ${v.name}  ${v.ssh.host}`,
      value: v.env
    }))
  } else if (isObject(modules)) {
    choices = []
    Object.keys(modules).forEach(v => {
      let obj = modules[v]
      choices.push({
        name: `${chalk.green(obj.env)}  ${obj.name}  ${obj.ssh.host}`,
        value: obj.env
      })
    })
  }
  return inquirer.prompt([
    {
      type: multiple ? 'checkbox' : 'list',
      name: 'env',
      message: tips,
      choices
    }
  ])
}

//test:root@123.12.23.33:22#abcdefg
//[env:]<username><@host>[:port][#password]
function sshParse(str, env) {
  let exec = /^(?:([^:]+):)?([a-zA-Z0-9\-\._]+)@([^:#]+)(?::([0-9]+))?(?:#(.+))?$/.exec(
    str
  )
  assert(exec, 'error', 'ssh is no vaild')
  let ssh = {
    env: env.length > 1 ? exec[1] : env[0],
    username: exec[2],
    host: exec[3],
    port: exec[4],
    password: exec[5]
  }
  if (env.length === 1 && exec && exec[1])
    warning(
      "When you publish only one environment, the --ssh parameter 'env' is not required",
      false
    )
  if (env.length > 1 && !ssh.env)
    error(
      "When multiple environments are selected, the --ssh parameter 'env' should clearly indicate which environment is set up"
    )
  if (env.length > 1 && !env.includes(ssh.env))
    error('The env that --ssh set up  is not include in this publish task')
  return isUndefined(ssh.password)
    ? inquirer
        .prompt([
          {
            type: 'password',
            name: 'password',
            message: `env ${ssh.env}'s password`
          }
        ])
        .then(answers => {
          ssh.password = answers.password
          return Promise.resolve(ssh)
        })
    : Promise.resolve(ssh)
}

function cmdExtendModules(singleEnv, optionEnv, val = true) {
  return optionEnv
    ? optionEnv === true
      ? val
      : optionEnv.split(',').includes(singleEnv) ? val : void 0
    : void 0
}

function getConfigPath({ config } = {}) {
  let configPath = path.join(process.cwd(), 'fjpublish.config.js')
  if (config) configPath = path.resolve(config)
  if (!fs.existsSync(configPath))
    return error(
      "The configuration file does not exist. You can enter 'fjpublish init' to generate a reference configuration in the current directory."
    )
  return configPath
}
