## 前言

曾几何时，我相信部分Web Developer（包括我）使用的项目发布方式还活着刀耕火种的年代（使用xftp或者sublime text的插件sftp等），发布方式简单又粗暴，想发布哪个目录就直接上传覆盖...

但是这种方式对于现在的前端项目有很多弊端：

* 若项目包含webpack\gulp等构建工具，则每次发布都需要等待构建完成后再手动上传，效率低；
* 若项目为前端的服务端渲染项目，例如vue的服务端渲染，那么项目上传服务器后还得登录服务器重启进程；
* 发布时由于选错文件或者选错发布环境导致的上传(＞﹏＜)悲剧，可没有后悔药吃。

鉴于传统的发布方式已经不适应各种复杂的发布要求，我在公司的同事发发写的前端发布脚本的雏形上进行了改造，意在提供一个全方面覆盖并且拓展性强的命令行发布工具。

注： fjpublish不是一个单词，它纯粹只是的我所在公司名称的缩写（fj = 富甲） + publish, 原谅我取名时的草率， 也为了全局安装时不和现有的命令行工具重名，可以简单记忆为（富甲publish）囧~~。

## fjpublish能做什么

* 通过配置文件配置每个要发布的环境，并通过简单的命令行命令选择发布到不同的环境；
* 自动化发布流程涵盖了构建->打包压缩->上传服务器->执行远程命令备份并替换旧文件；
* 一次发布可完成并行或串行发布单独或多个环境；
* 若为同时发布多个不同环境，fupublish能自动根据配置文件判断出哪些文件已构建，哪些环境已上传等，智能的忽略重复流程；
* 自由组合发布的目录层级，可发布多个目录和忽略不需要发布的文件；
* 通过中间件机制组成发布器，中间件之间独立无耦合，可灵活拆卸或新增中间件，完成简单的二次开发新的命令；
* 可通过配置文件配置或者发布命令配置完成忽略某些当次发布不需要的流程，例如： 配置nobuild则不进行构建；
* 可使用编程式的发布方式，不需要使用命令行也可以直接调用核心构建函数进行发布；
* 可配置钩子函数灵活的控制在某个具体的中间件前或后做些事情；
* 可配置远程前置或后置linux处理命令，例如： 配置postcommands来在执行文件替换后重启pm2进程等；
* 完备的提醒功能，若未配置或者配置错误某些重要或必要的配置则终止该发布流程并给出提示；
* [开发计划] 在发布流程中加入自动git流程和cdn文件上传功能；
* [开发计划] 可通过命令选择还原远程文件为某个Git文件版本或者时间版本；
* [开发计划] 可单独使用命令执行某个中间件流程或中间件衍生的方法。

事实上，fjpublish是一个由核心实例加上各种中间件函数组成的，类似于'express'的概念，以上的功能部分是由官方编写的中间件完成，所以，理论上功能的多少，完全取决于搭配的中间件。

{% asset_img 84khbuzgU8.gif 简单的流程gif %}

## 安装

安装 fjpublish 相当简单。然而在安装前，您必须检查电脑中是否已安装了nodejs（6.0+），fjpublish依赖于nodejs。如果您的电脑中已经安装了nodejs，那么接下来只需要使用 npm 即可完成 fjpublish 的安装。

	npm install fjpublish -g

值得注意的是，fjpublish推荐使用全局安装，这样在任何一个文件目录都可以直接使用。
若不想全局安装，也可以在具体的项目局部安装。

	npm install fjpublish

不过使用的时候相当麻烦，需要加上路径前缀./node_modules/fjpublish或者使用[npm script](http://www.ruanyifeng.com/blog/2016/10/npm_scripts.html)

<font color="#DC143C">注意: fjpublish依赖一份配置文件，默认是fjpublish.config.js，如果不想在版本库中提交服务器安全信息，请千万记得把它加入忽略文件中，如.gitignore</font>

## 起步

### 1.配置文件结构

fjpublish命令行默认会读取当前工作目录下的**fjpublish.config.js**文件，该文件返回一个对象，结构如下：

{% asset_img config.jpg 配置文件 %}

以上展示了一个简单的配置文件的基本结构，fjpublish在处理配置文件时，会进行以下操作：

* 把modules数组的每一个module实例化为一个构造函数Option的实例，在modules外的剩余字段将会加入到构造函数Option的原型链中，所以默认情况下module会继承config中除modules外所有的字段，这样的好处就是有些字段可以不必重复在module中配置，也可以很方便定义优先级；
* 同时也把config实例化为一个构造函数Option的实例并放入发布实例中以元数据（this._metadata）的方式访问，这样的设计能更灵活的让中间件选择要读取的字段值。


### 2.命令行发布方式

命令行的使用方式很简单，以fjpublish起头，接上子命令及各类参数即可，具体可用哪些子命令，可使用**fjpublish -h**获得帮助

```
➜  example git:(master) ✗ fjpublish -h

  Usage: fjpublish <cmd> [options]

  Options:

    -V, --version        output the version number
    -c, --config <path>  Set the profile path and defaults to 'fjpublish.config.js' in the current directory
    -h, --help           output usage information

  Commands:

    init                 Generate a default configuration for reference
    list                 List the configured environment
    select [options]     Publish by select
    env [options] <env>  Publish code to remote host

  e.g:

    $ fjpublish init
    $ fjpublish list
    $ fjpublish select [option]
    $ fjpublish env <env> [option]
```

若需要获得某个子命令的帮助，例如想获得fjpublish env可以接收的参数，可输入**fjpublish env -h**：

#### 命令参数介绍

fjpublish命令行的实现依赖[commander](https://github.com/tj/commander)库

* **publish**
没有任何功能，等同于输入publish -h。

	`--config`
	选择其他的文件替代默认的fjpublish.config.js文件。

  `-h, --help`
  获得**fjpublish**的帮助。


* **publish init**
在当前工作目录生成一份参考配置文件fjpublish.config.js

* **publish list**
列出当前配置文件中配置的发布的环境

* **publish env &lt;env&gt; [options]**
选择发布至配置好的某环境，env参数必填

  `-h, --help`
  获得**fjpublish env**的帮助。

  `--nobuild [env]`
  等同于为module设置了nobuild=true，若module已存在该值，则覆盖。若配置env参数（可多选，英文逗号分隔），则只对env参数对应的环境设置值

  `--nobackup [env]`
  等同于为module设置了nobackup=true，若module已存在该值，则覆盖。若配置env参数（可多选，英文逗号分隔），则只对env参数对应的环境设置值

  `--nomerge [env]`
  等同于为module设置了nomerge=true，若module已存在该值，则覆盖。若配置env参数（可多选，英文逗号分隔），则只对env参数对应的环境设置值

  `--check`
  等同于为config设置了check=true

  `--parallel`
  等同于为config设置了parallel=true

  `-y, --yes`
  设置后无需确认直接发布

  `-p, --prompt`
  使用提示器的方式进行发布

  `--arg <arg>`
  为module传递其他参数的方式，单一参数解析格式为key:val@env，其中:val和@env为选填，若需要传递多个参数，以逗号分隔每个参数组，该功能可用于为某些自定义钩子函数传参等。
  例如： **--arg a:1@test,b@test,public,c:3** 可解析为:
  1.为test环境设置a=1；
  2.为test和public环境设置b=true；
  3.为每一个环境设置c=3。

* **publish select [options]**
以提示器的方式选择发布至配置好的某环境

  `-h, --help` ,
  `--nobuild [env]` ,
  `--nobuild [env]` ,
  `--nobuild [env]` ,
  `--check` ,
  `--parallel` ,
  `-p, --prompt` ,
  `--arg <arg>`
  参考publish env中这些的选项配置

  `-m, --multiple`
  以多选提示器的方式选择发布环境

* **独立命令**
正在开发中，敬请期待...

### 3.配置文件api

#### module参数

* **env**: (Sring) [必填]
发布环境的唯一标识符。

* **name**: (String)
设置环境的名称易于辨识，如：测试环境。

* **ssh**: (Object) [必填]
基于[ssh2](https://github.com/mscdex/ssh2)库完成上传远程机器目录和执行远程操作，通常情况下只需要配置`host`、`port`、`user`、`userName`、`password`。
```
ssh: {
   host: '192.168.0.xxx',
   port: 22,
   user: 'root',
   userName: 'root',
   password: 'xxxx',
}
```

* **buildCommand**: (String)
fjpublish会根据该选项结合[npm script](http://www.ruanyifeng.com/blog/2016/10/npm_scripts.html)执行构建命令。
例如，配置`buildCommand`为'build'则构建命令为`npm run build`

* **nobuild**: (String)
若项目没有需要构建的需求或发布时已经不需要构建则设置该项为true, 默认需要构建。

* **localPath**: (String)
要发布的文件夹根目录，支持绝对路径和相对路径，建议使用相对路径。
默认取值为当前工作目录，但是为了防止忘记配置该项导致把node_modules上传，所以当`localPathEntries`未配置时，此项必须配置，若真的需要把当前工作目录整个发布，请配置为“.”;
当`localPathEntries`已配置时，该项可忽略并且默认为当前工作目录。

* **localPathEntries**: (String|Array)
fjpublish使用的打包工具为[tar-fs](https://github.com/mafintosh/tar-fs)，所以这里`localPathEntries`的概念就是**tar-fs**中entries的概念。
对于要发布多个文件夹到远程环境，则配置此项为一个`localPath`根路径下的一个或多个子目录，则发布后远程文件夹将以这些子文件夹（而不是`localPath`）作为备份源

* **localPathIgnore**: (String|Array|Function)
fjpublish使用的打包工具为[tar-fs](https://github.com/mafintosh/tar-fs)，所以这里`localPathIgnore`的概念就是**tar-fs**中ignore的概念。
但是fjpublish专门增强了它，允许并建议使用通配符来忽略某些文件上传，参考[multimatch](https://github.com/sindresorhus/multimatch)。这样做的好处是若该项不设置为函数时fjpublish能正确的区分不同环境的打包的代码和上传的代码任务是否有相同的，相同则忽略，减少重复任务，若设置为函数则无法区分，这对一次发布多个环境的速度而言还是有很大影响的。
例如：忽略任意文件夹下.map后缀的文件上传：
```
localPathIgnore: '**/*.map'
```

* **localTarFileDir**: (String)
压缩后的文件放置目录，默认为系统的tmp目录。

* **tarFilename**: (String)
压缩后的文件名，不含后缀部分，默认为fjpublish根据每个环境发布的文件异同生成的一个fjcompress{索引}.tar.gz，索引从0自增。

* **remotePath**: (String) [必填]
要发布到远程服务器的路径，必须是一个二级及以上的绝对目录路径，例如：'/abc/cde'。
当需要发布单个目录到远程服务器是应该把其理解为平级目录，`localPath`中定义的目录将与其替换。
当需要发布多个目录到远程服务器是应该把其理解为父目录，`localPathEntries`中定义的目录将放置入其中。

* **remoteTarFileDir**: (String)
发布时上传压缩包到远程机器的目录，当自定义时必须是一个二级及以上的绝对目录路径，例如：'/abc/cde'， 默认为**'/tmp'**。

* **shellTrashPath**: (String)
当module的`nobackup`设置为true时，fjpublish进行软删除的后文件的放置地址，当自定义时必须是一个二级及以上的绝对目录路径，例如：'/abc/cde'， 默认为**'/tmp/fjpublishTrashDir'**。

* **ssh2shell**: (Object)
fjpublish使用[ss2shell](https://github.com/cmp-202/ssh2shell)库来完成远程命令的操作，且默认情况下每一个命令都没有做异常判断，只是按顺序执行，通常这没有什么问题，如果你需要对每一个命令进行控制，请参考ss2shell的文档进行进程管理。
注意，这个字段请传ss2shell可配置的字段中除了server，commands以外的剩余字段。
```
ssh2shell: {
    onCommandComplete: function(command, response, sshObj) {
        if (command === 'cd /xxx/xxx/xxx') {
            process.exit(1);
        };
    }
},
```

* **tag**: (String|Function)
发布时进行备份旧文件时的备份后缀，默认为当前时间戳。

* **extractVerbose**: (String)
发布时进行解压操作时是否显示解压文件，默认不显示。

* **preCommands**: (String|Array)
远程fjpublish内部命令执行前的命令。

* **postCommands**: (String)
远程fjpublish内部命令执行后即远程项目文件替换后执行的linux命令，例如，重启pm2服务器：
```
postCommands: ['pm2 restart']
```

* **nobackup**: (String)
发布时是否备份旧文件。默认进行备份，备份方式为例如abc文件将被备份为abc.{时间戳}（若`tag`字段存在则后缀为对应字段）。
若选择不备份，fjpublish为了安全起见是进行软删除， 即使用mv命名移动至`shellTrashPath`设置的目录，默认为**'/tmp/fjpublishTrashDir'**，例如备份/www/test/abc，则将其移动至/tmp/fjpublishTrashDir/www.test.abc.{时间戳} 。

* **nomerge**: (String)
发布时默认的备份方式是移除旧文件然后放入新文件，但是如果项目使用webpack之类的自动将文件加上hash，则替换后正在使用网站的人会出现找不到文件的错误。
该选项就是为了解决这个问题，旧文件夹移除并将新文件夹与旧文件夹合并。
该选项默认为不进行合并。

* **prompt**: (Object|Array)
fjpublish使用的提示器为[Inquirer](https://github.com/SBoudrias/Inquirer.js)，fjpublish会将`prompt`数组原封不动的传给**Inquirer**来生成提示器。
配置提示器可以通过命令行的方式获取module所需的参数，在module中配置的提示器只会影响该module，在config配置的提示器会影响metadata或也可配置影响每一个module。
提示器只会在**prompt**中间件中进行一次性询问，一次性收集在config中定义的prompt及每一个发布的module的prompt。

* **promptIgnore**： (String|Array)
忽略某些`prompt`定义的提示器，匹配module的`prompt`中每一项的**name**字段。

#### config参数

* **prompt**: (String)
配置方式参考module中的`prompt`配置，区别在于config中的`prompt`默认只为metadata赋值。

* **promptSyncModule**: (String)
由于希望完成提示一次即可为每一个module赋值的需求，所以需要通过该项决定在config中配置的`prompt`哪一项需要同步到每一个module。

* **promptIgnore**： (String|Array)
配置方式参考module中的`promptIgnore`配置，区别在于只用于忽略config中定义的`prompt`。
通常用于在命令`--prompt`中忽略官方设置的`nobuild`、`nobackup`、`nomerge`等自己不需要的提示器。

* **parallel**: (Boolean)
fjpublish默认使用的是串行完成每一个任务，也可以设置该项为**true**来并行进行发布任务。
不过fjpublish已经在构建、打包、上传环节考虑到了避免重复任务所以通常并不需要设置该项，而且串行的输出更直观，并行输出会比较混乱。
但是事实是并行会比串行快一丢丢，如果还设置了钩子函数且执行一些异步高耗时操作时这个差距会更大。

* **check**: (Boolean)
配置该项为**true**可跳过每一个中间件的文件操作环节，通常用于快速检查参数是否配置正确，该选项依赖于每一个中间件是否遵守这个规则。

* **checkUpdate**: (Boolean)
是否在发布任务完成后检查fjpublish是否有更新的版本，默认为**true**，进行检查。

* **usePrompt**: (Boolean)
配置该项为**true**则使用提示器的方式进行发布。

* **beforeHook**: (Object|Array)
为fjpublish的中间件设置前置钩子函数，事实上它就是一个自定义的中间件。

  `when`: (String)
  设置在哪一个中间件前使用这个钩子函数，默认可选项为**prompt**(提示器)、**builder**(构建)、**compress**(打包)、**sftp**(上传)、**shell**(远程操作)

  `fn`: (Function)
  钩子函数的规则和中间件函数规则类似，必须显式的调用next进入下一个阶段，否则后续中间件无法执行。

* **afterHook**: (Object|Array)
和`beforeHook`类似，区别在于该项配置的是一个后置钩子函数。
例如配置一个简单的在发布选择完毕后显示发布配置的功能，效果就如同文章开始时显示的gif图上的效果：
```
afterHook: {
    when: 'prompt',
    fn({ name, ssh: { host }, localPath = '.', localPathEntries = [], remotePath, nobackup = false, nobuild = false, nomerge = true }, env, next) {
        console.log(`Config: ...
name: %s
env: %s
host: %s
======
local path: %s
local entries: %s
remote path: %s
======
nobuild: %s
nobackup: %s
nomerge: %s
`, name, env, host, localPath, localPathEntries, remotePath, nobuild, nobackup, nomerge);
        next();
    },
}
```

* **completeHook**: (Function)
所有任务完成时触发，可以配合`check`选项来打印出数据并检查。
```
completeHook(fjpublish, result) {
  console.log(fjpublish._metadata);
  console.log(result);
}
```

### 4.进阶教程
fjpublish的基本使用方式在上面已介绍完毕，如果不需要更多的功能则后面的内容可忽略。
从本小节开始介绍如何编写一个fjpublish中间件以及如何函数式的进行发布。

####Fjpublish函数api
* **Fjpublish**: (config:Object, [opt: String|Array])
核心构造函数，`config`参数必传，配置等同于上文的`config`。
`opt`参数非必须，含义为选择要发布的环境，若忽略该参数，则`config`配置的`modules`都将作为要发布的环境。
`opt`可以是字符串或数组或集合。当为集合时，集合中每个元素必须包含`env`字段，其余字段将使用`Fjpublish.extend`合并入`config`中相同的`env`对应的module，构造函数返回fjpublish实例。

* **Fjpublish.extend**: (target, object1, [objectN])
类似于Object.assign，不同的是当遇到undefind时保留原字段。

* **Fjpublish.logger**:
日志功能

* **Fjpublish.mergeNoUndefined**: (target, val1, [valN])
对于一组值的merge操作，如果值为undefind则忽略。

* **Fjpublish.prototype.metadata**: ([config: Object])
若config存在则在`Fjpublish`实例化后可对元数据this._metadata进行merge操作的方法，merge使用的规则是`Fjpublish.extend`，返回fjpublish实例。
若config未传值则返回this._matadata。

* **Fjpublish.prototype.use**: (middleware: Function)
挂载中间件函数，并返回fjpublish实例。

* **Fjpublish.prototype.beforeHook**: (object: Object|Array)
定义前置钩子函数, 配置选项参考上文配置文件api中`beforeHook`，返回fjpublish实例。

* **Fjpublish.prototype.afertHook**: (object: Object|Array)
定义后置钩子函数, 配置选项参考上文配置文件api中`afterHook`，返回fjpublish实例。
事实上`use`、`beforeHook`、`afertHook`并无先后要求，他们会在`fjpublish.prototype.start`启动时再进行排序。

* **Fjpublish.prototype.start**:
启动fjpublish，必须显式的调用start方法才会真正执行任务。

####编写一个中间件
fjpublish基于[async](https://github.com/caolan/async)完成任务执行的功能。编写一个中间件注意以下几点即可：
* 确保输出一个具名函数(匿名函数会导致钩子函数无法匹配这个中间件)，并且确保这个函数在各种操作后调用next方法即可。
* 函数可借助Fjpublish的静态方法完成一些辅助功能，尤其建议使用`Fjpublish.logger`，这样会让输出更统一。
* 中间件中可以通过this访问fjpublish实例，this._medata访问元数据（实例化的config）。
* 注意module中的配置项有可能是从config中继承过来的，所以如果明确的只需要是在module中配置的则需要加上一层[hasOwnProperty](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Object/hasOwnProperty)的判断。
* 任务若无报错调用next(null, arg), 若报错调用next(arg)。不管成功失败arg都会收录到上文`completeHook`的result中。
* 若一个中间件调用next抛出错误，则该module的发布任务提前结束。
* 每一个module的发布任务都是独立的，若非显式的让node进程退出则它们之间的报错互不影响。
* 建议命名中间件文件为fjpublish_{中间件名称}.js。
* [开发计划]中间件可衍生一些Fjpublish的公有方法，例如shell中间件有备份文件的操作，那么可以衍生一个用于还原文件的方法。
```
module.exports = function builder(module, env, next) {
  console.log('开始');
  process.nextTick(() => {
    console.log('结束');
    next(null, 'builder success');
  });
}
```

####函数式发布
在了解Fjpublish的api以及编写一个中间件后，那么进行函数式发布就非常简单了：
```
const Fjpublish = require('Fjpublish');
const prompt = require('Fjpublish/lib/fjpublish_prompt.js');
const builder = require('Fjpublish/lib/fjpublish_builder.js');
const compress = require('Fjpublish/lib/fjpublish_compress.js');
const sftp = require('Fjpublish/lib/fjpublish_sftp.js');
const shell = require('Fjpublish/lib/fjpublish_shell.js');
const config = require('fjpublish.config.js');

Fjpublish(config, ['test', {env: 'public', nomerge: true}]).use(prompt)
    .use(builder)
    .use(compress)
    .use(sftp)
    .use(shell)
    .start()
```

####编写自定义的发布命令
有了以上的知识，编写一个自定义的命令也是非常简单的，推荐你[这篇文章](http://www.open-open.com/lib/view/open1450339482282.html)

## 后记
fjpublish核心的功能都已经实现，并在公司内部项目中运行了大半年，也在计划着完成剩余的开发计划，如果你有什么好的idea，请在留言区留言或在github上开issue。
再次感谢能有耐心看到这里的各位大哥，觉得不错的给个star呗:)



