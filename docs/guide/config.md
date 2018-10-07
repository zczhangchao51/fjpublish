# 配置文件结构

##文件结构

fjpublish命令行默认会读取当前工作目录下的**fjpublish.config.js**文件，该文件返回一个对象，结构如下：

```js
module.exports = {
    //modules开始
    modules: [{
        name: '测试环境',
        env: 'test',
        ssh: {
            host: '12.23.345.678',
            port: 22,
            username: 'root',
            //rc版本的user选项和userName选项请在未来统一配置为username
            password: '12345678',
        },
        buildCommand: 'build',
        localPath: 'example',
        remotePath: '/www/example',
        tag: '123'
    }, { ... }],
    //modules结束
    nobuild: true,
    tag: 'v1',
}
```

以上展示了一个简单的[配置](/api.html)，关于使用fjpublish和阅读本文档，还需明白以下几个概念：

* modules数组中每一个对象（也称**module**）代表一个发布环境，在本文档中**module**指在配置文件中任意一个环境配置module。**module实例**指实例化后的module，也就是最终在中间件或钩子函数中取值的module。

* 在本文档中**config**指代module.exports输出的所有字段（包含modules在内）的对象。

* **config**中modules字段外的字段在初始后将并入每一个**module**，优先级为**module** > **config**，也可以理解为**module**继承自**config**。

* 在本文档中**metadata**也称为元数据，指代由**config**实例化后的对象，在每一个中间件或钩子函数中以**this._metadata**的方式访问，也就是说**config**中modules外定义的字段不仅仅为了继承给**module实例**也可以是为了定义全局的配置字段。

举一个简单的中间件读取数据例子就明白了，以上文配置为例：

```js
module.exports = function builder(module, env, next){
    console.log(env)  //'test'
    console.log(module.tag)  //'123'
    console.log(this._metadata.tag)  //'v1'
    console.log(module.nobuild)  //true
    next();
}
```

