#! /usr/bin/env node

const pkg = require('../package.json');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const program = require('commander');
const date = require('phpdate-js');
const is = require('is');
const inquirer = require('inquirer');
const { spawn, execSync } = require('child_process');
const Fjpublish = require('../lib/index.js');
const prompt = require('../lib/fjpublish_prompt.js');
const builder = require('../lib/fjpublish_builder.js');
const compress = require('../lib/fjpublish_compress.js');
const sftp = require('../lib/fjpublish_sftp.js');
const shell = require('../lib/fjpublish_shell.js');

const logger = require('../lib/logger.js');
const success = logger.success;
const localAssert = (local, type) => (boolean, type = 'error', msg, ...arg) => logger.assert(boolean, type, msg, local, ...arg);
const assert = localAssert('fjpublish');
const localLogger = (local, type) => (msg, end = true, cb) => logger[type](msg, local, end, cb);
const warning = localLogger('fjpublish', 'warning');
const error = localLogger('fjpublish', 'error');

const isObject = is.object,
    isArray = is.array,
    isString = is.string,
    isEmpty = is.empty,
    isFn = is.fn,
    isUndefined = is.undefined;

process.on('uncaughtException', (err) => {
    return error(err.stack);
});
process.on('unhandledRejection', function(err, p) {
    return error(err.stack);
});

program
    .version(pkg.version)
    .usage('<cmd> [options]')
    .option('--config <path>', "Set the profile path and defaults to 'fjpublish.config.js' in the current directory")

program
    .command('init')
    .description('Generate a default configuration for reference')
    .action((cmd) => {
        COMMAND = 'init';
        let confPath = path.resolve(process.cwd(), 'fjpublish.config.js');
        let copySourcePath = confPath.replace(/\s/g, '\\ '); //把空格转义
        let copyObjectPath = path.resolve(__dirname, '../lib/fjpublish.config.js').replace(/\s/g, '\\ '); //把空格转义
        let cp = `cp -f ${copyObjectPath} ${copySourcePath}`;
        if (fs.existsSync(confPath)) {
            inquirer.prompt([{
                type: 'confirm',
                name: 'init',
                message: "There is a 'fjpublish.config.js' file in the current directory. Continue operation will overwrite. Are you sure?",
                default: false,
            }]).then((answers) => {
                if (!answers.init) return warning('cancelled', false);
                execSync(cp);
            });
        } else {
            execSync(cp);
        };
    });

program
    .command('list')
    .description('List the configured environment')
    .action((cmd) => {
        COMMAND = 'list';
        let configPath = getConfigPath(cmd.parent);
        let config = require(configPath);
        console.log('You can publish the following environment:')
        if (isArray(config.modules)) {
            config.modules.forEach(v => {
                console.log(`   ${chalk.green(v.env)}  ${v.name}  ${v.ssh.host}`)
            });
        } else if (isObject(config.modules)) {
            Object.keys(config.modules).forEach(v => {
                let obj = config.modules[v];
                console.log(`   ${chalk.green(obj.env)}  ${obj.name}  ${obj.ssh.host}`)
            });
        };
    });

program
    .command('select')
    .usage('[options]')
    .description('Publish by select')
    .option('--nobuild [env]', 'Do not node build direct publish')
    .option('--nobackup [env]', 'Last release no backup')
    .option('--nomerge [env]', 'No combine this release with last release')
    .option('--check', 'Do not run the Task')
    .option('--parallel', 'Parallel publishing')
    .option('-p, --prompt', 'Publish by prompt')
    .option('-m, --multiple', 'Multiple choice')
    .option('--arg <arg>', 'Receive custom parameters')
    .action((cmd) => {
        assert((cmd instanceof program.constructor), 'error', 'Parameter is not valid');
        COMMAND = 'select';
        let choices;
        let configPath = getConfigPath(cmd.parent);
        let config = require(configPath);
        let modules = config.modules;
        assert(!isUndefined(modules), 'error', "Config option 'modules' is required");
        if (isArray(modules)) {
            choices = modules.map(v => ({
                name: `${chalk.green(v.env)}  ${v.name}  ${v.ssh.host}`,
                value: v.env
            }));
        } else if (isObject(modules)) {
            choices = [];
            Object.keys(modules).forEach(v => {
                let obj = modules[v];
                choices.push({
                    name: `${chalk.green(obj.env)}  ${obj.name}  ${obj.ssh.host}`,
                    value: obj.env
                });
            });
        };
        inquirer.prompt([{
            type: cmd.multiple ? 'checkbox' : 'list',
            name: 'env',
            message: 'Please select the environment to publish?',
            choices,
        }]).then((answers) => {
            MAINFUNC(config, isArray(answers.env) ? answers.env : [answers.env], cmd);
        });
    });

program
    .command('env <env>')
    .usage('<env> [options]')
    .description('Publish code to remote host')
    .option('--nobuild [env]', 'Do not node build direct publish')
    .option('--nobackup [env]', 'Last release no backup')
    .option('--nomerge [env]', 'No combine this release with last release')
    .option('--check', 'Do not run the Task')
    .option('--parallel', 'Parallel publishing')
    .option('-y, --yes', 'No confirmation prompt')
    .option('-p, --prompt', 'Publish by prompt')
    .option('--arg <arg>', 'Receive custom parameters')
    .action((env, cmd) => {
        assert((cmd instanceof program.constructor), 'error', 'Parameter is not valid');
        COMMAND = env;
        let module,
            extend = {};
        let configPath = getConfigPath(cmd.parent);
        let config = require(configPath);
        let modules = config.modules;
        assert(!isUndefined(modules), 'error', "Config option 'modules' is required");
        let configIsArray = isArray(modules);
        let nameArr = env.split(',').map(v => {
            if (module = configIsArray ? modules.find(vv => v === vv.env) : modules[v]) {
                return module.name;
            } else {
                error(`The selected environment '${v}' does not exist`);
            };
        });
        if (cmd.yes) return MAINFUNC(config, env.split(','), cmd);
        inquirer.prompt([{
            type: 'confirm',
            name: 'confirm',
            message: `Confirm publish to ${chalk.red(nameArr.join(','))} ?`,
            default: false,
        }]).then((answers) => {
            if (answers.confirm) MAINFUNC(config, env.split(','), cmd);
        });
    })

program.on('--help', function() {
    console.log('');
    console.log('  e.g:');
    console.log('');
    console.log('    $ fjpublish init');
    console.log('    $ fjpublish list');
    console.log('    $ fjpublish select [option]');
    console.log('    $ fjpublish env <env> [option]');
    console.log('');
});

program.parse(process.argv);

if (typeof COMMAND === 'undefined') {
    error("The command not selected or no exist, you can get help by enter 'fjpublish -h'");
};

function MAINFUNC(config, env, cmd, beforeStart) {
    let { use = { prompt, builder, compress, sftp, shell }, nobuild, nobackup, nomerge, prompt: usePrompt, check, parallel, parent, arg } = cmd;
    let extend = {};
    env = env.map(v => ({
        env: v,
        nobuild: cmdExtendModules(v, nobuild),
        nobackup: cmdExtendModules(v, nobackup),
        nomerge: cmdExtendModules(v, nomerge),
    }));
    if (arg) {
        let parse = cmdCustomArgParse(arg);
        parse.forEach(v => {
            if (v) {
                env.forEach(vv => {
                    vv[v.key] = v.env === true ? v.val : cmdExtendModules(vv.env, v.env, v.val);
                    if (v.env === true) extend[v.key] = v.val;
                });
            };
        });
    };
    if (parallel) extend.parallel = true;
    if (check) extend.check = true;
    if (usePrompt) {
        extend.usePrompt = true;
        extend._prompt = [{
            type: 'confirm',
            name: 'nobuild',
            message: 'Do not node build direct publish ?',
            default: false,
        }, {
            type: 'confirm',
            name: 'nobackup',
            message: 'Last release no backup ?',
            default: false,
        }, {
            type: 'confirm',
            name: 'nomerge',
            message: 'No combine this release with last release ?',
            default: false,
        }];
        extend._promptSyncModule = ['nobuild', 'nobackup', 'nomerge']
    };

    let fjpublish = Fjpublish(config, env);
    Object.keys(use).forEach(v => fjpublish.use(use[v]));
    fjpublish.metadata(extend);
    if (beforeStart && isFn(beforeStart)) beforeStart(fjpublish);
    fjpublish.start();
};

//asd:cbd@a-b-c
function cmdCustomArgParse(arg, exec) {
    return arg.split(',').map(v => {
        return (exec = /^(\w+)(?::(\w+))?(?:@(\w+(?:-\w+)*))?$/.exec(v)) ? {
            key: exec[1],
            val: exec[2] ? exec[2] : true,
            env: exec[3] ? exec[3].replace(/-/g, ',') : true,
        } : null;
    });
};

function cmdExtendModules(singleEnv, optionEnv, val = true) {
    return optionEnv ? optionEnv === true ? val : optionEnv.split(',').includes(singleEnv) ? val : void 0 : void 0;
};

function getConfigPath({ config } = {}) {
    let configPath = path.join(process.cwd(), 'fjpublish.config.js');
    if (config) configPath = path.resolve(config);
    if (!fs.existsSync(configPath)) return error("The configuration file does not exist. You can enter 'fjpublish init' to generate a reference configuration in the current directory.");
    return configPath;
};
