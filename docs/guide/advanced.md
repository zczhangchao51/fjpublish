# 进阶教程

fjpublish 的基本使用方式在前几个章节已介绍完毕，如果不需要更多的功能则后面的内容可忽略。
本章节开始介绍如何编写一个 fjpublish 中间件以及如何函数式的进行发布。

## Fjpublish 函数 api

### Fjpublish

参数：( config:Array|Object, [opt: String|Array] )
核心构造函数，`config`参数必传，等同于**config**，配置参考[api 章节](/api.html)。
`opt`参数非必须，含义为选择要发布的环境，若忽略该参数，则`config`配置的 modules 字段里配置的所有环境都将作为要发布的环境。
`opt`可以是字符串或数组或集合。当为集合时，集合中每个元素必须包含`env`字段，其余字段将使用`Fjpublish.extend`合并入`config`中相同的`env`对应的 module，构造函数返回 fjpublish 实例。

```js
const Fjpublish = require('Fjpublish')
const config = require('fjpublish.config.js')

Fjpublish(config, ['test', { env: 'public', nomerge: true }])
```

### Fjpublish.extend

参数：( target, object1, [objectN] )
类似于 Object.assign，不同的是当遇到 undefind 时保留原字段且`Fjpublish.extend`是深度克隆。

```js
const Fjpublish = require('Fjpublish')

Fjpublish.extend({}, { a: 1, b: 2, c: 3 }, { a: undefined, b: 4, d: 5 }) //{a: 1, b: 4, c: 3, d: 5}
Object.assign({}, { a: 1, b: 2, c: 3 }, { a: undefined, b: 4, d: 5 }) //{a: undefined, b: 4, c: 3, d: 5}
```

### Fjpublish.logger

日志功能
[源代码](https://github.com/zczhangchao51/fjpublish/blob/master/lib/logger.js)

### Fjpublish.mergeNoUndefined

参数：( target, val1, [valN] )
对于一组值的 merge 操作，如果值为 undefind 则忽略。

```js
const Fjpublish = require('Fjpublish')

Fjpublish.mergeNoUndefined(false, true, undefined) //true
```

### Fjpublish.prototype.metadata

参数：( [config: Object] )
若`config`已传则在`Fjpublish`实例化后对**metadata**进行 merge 操作，merge 使用的规则是`Fjpublish.extend`，返回 fjpublish 实例。
若`config`未传值则返回**matadata**。

### Fjpublish.prototype.use

参数：( middleware: Function )
挂载中间件函数，并返回 fjpublish 实例。

### Fjpublish.prototype.start

参数：( [adjust: Boolean] )
启动 fjpublish，必须显式的调用 start 方法才会真正执行任务。
如果提供了参数 adjust 才会开启调整流程，也就是会吸收配置文件中的钩子函数组成每个 module 单独的流程。

## 编写一个中间件或钩子函数

fjpublish 基于[async](https://github.com/caolan/async)完成任务执行的功能。编写一个中间件或钩子函数注意以下几点即可：

- 如果编写的是中间件请确保输出一个具名函数(匿名函数会导致钩子函数无法匹配这个中间件)，并且确保这个函数在各种操作后调用 next 方法即可；

- 函数可借助 Fjpublish 的静态方法完成一些辅助功能，尤其建议使用[`Fjpublish.logger`](/guide/advanced.html#fjpublish-logger)，这样会让输出更统一；

- 中间件中可以通过 this 访问 fjpublish 实例，this.\_medata 访问元数据**metadata**（实例化的 config）；

- 注意**module 实例**中的配置项有可能是从**config**中继承过来的，如果明确只需要是在**module**中配置的则需要加上一层[hasOwnProperty](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Object/hasOwnProperty)的判断；

- 任务若无报错调用 next(null, arg), 若报错调用 next(arg)。不管成功失败 arg 都会收录到[`completeHook`](/api/#completehook)的`result`中；

- 若一个中间件或钩子函数调用 next 抛出错误，则该 module 对应的发布任务提前结束；

- 每一个 module 的发布任务都是独立的，若非显式的让 node 进程退出则它们之间的报错互不影响；

- 建议命名中间件文件为 fjpublish\_{中间件名称}.js。

```js
module.exports = function builder(module, env, next) {
  console.log('开始')
  process.nextTick(() => {
    console.log('结束')
    next(null, 'builder success')
  })
}
```

## 函数式发布

在了解 Fjpublish 的 api 以及编写一个中间件后，那么就可以进行函数式发布了：

```js
const Fjpublish = require('Fjpublish')
const prompt = require('Fjpublish/lib/fjpublish_prompt.js')
const git = require('Fjpublish/lib/fjpublish_git.js')
const builder = require('Fjpublish/lib/fjpublish_builder.js')
const compress = require('Fjpublish/lib/fjpublish_compress.js')
const sftp = require('Fjpublish/lib/fjpublish_sftp.js')
const shell = require('Fjpublish/lib/fjpublish_shell.js')
const config = require('./fjpublish.config.js')

Fjpublish(config, ['test', { env: 'public', nomerge: true }])
  .use(prompt)
  .use(git)
  .use(builder)
  .use(compress)
  .use(sftp)
  .use(shell)
  .start()
```

## 编写自定义的发布命令

有了以上的知识，也可以尝试编写一个自定义的命令，推荐你[这篇文章](http://www.open-open.com/lib/view/open1450339482282.html)
