# 关于安全（重要）

每一个开发人员都应该有服务器安全意识，不少小伙伴都表示了对安全的担忧，所以这篇文档就来解答你的疑惑。

## 服务器登录信息安全

我相信这是小伙伴们关心的重点，对于把生产服务器密码什么的放在别人开发的工具的配置文件中，估计睡觉也不会安稳吧...
那么怎么样使用 fjpublish 才能更安全呢，以下将列出几个方法，请根据自己要发布的环境和掌握难度自行配置。

### 1.版本忽略文件（安全等级 ★）

将配置文件添加至版本忽略列表是最简单的方式，也是最不稳定的方式，因为说不定什么时候就忘记加入版本忽略列表，不过如果都是发布内网，那么倒也无妨。

### 2.命令选项配置（安全等级 ★★）

可以使用`fjpublish env <env> --ssh <server>`命令来每次发布时配置服务器信息，这样在配置文件中将可以不用配置 ssh 字段。server 参数的格式为：`[env:]<username><@host>[:port][#password]`。

- 密码可以省略，如果省略密码，fjpublish 将在命令确认后单独弹出一个输入框填写密码，完全模拟 ssh 的登录行为，例如:`fjpublish env test --ssh root@192.168.0.100`。

- 若为同时发布多个环境，请写上当前设置的 ssh 信息是为哪个环境设置，例如:`fjpublish env test,public --ssh public:root@192.168.0.100#123456`，若只发布一个环境则可省略。

不过这个命令实际使用很麻烦，不过也免去了把密码写在配置文件的担忧。

### 3.免密发布（安全等级 ★★★）

fjpublish 配置文件中的 ssh 选项完全就是[ssh2](https://github.com/mscdex/ssh2)库的选项，那么熟悉 ssh 登录服务器的同学应该知道可以免密登录服务器。
原理就是把本地的公钥放到服务器的授信文件中，下次再登录服务器时将不再需要密码。下面简单描述操作步骤：

- 使用`ssh-keygen -b 1024 -t rsa`生成一对**‘不带密码’**的公私钥；

- 把其中的公钥内容附加到服务器的~/.ssh/authorized_keys 中；

- 好了，现在你可以每次 ssh 登录服务器都不需要服务器密码了。

原谅我写得那么草率，因为这个过程不是我要说的重点，而且我也为你准备了[一篇文章](http://blog.csdn.net/u014743697/article/details/56282428)，也可以自行多谷歌几篇'免密登录服务器'的文章。
另外，fjpublish 也有一个[`fjpublish auth <server> [--key <key>]`](/guide/use.html#fjpublish-auth-server-options)的命令用于快速将公钥文件认证入服务器，感兴趣了可以了解一下。

那么对应 fjpublish 的配置文件需要改为如下配置：

```js
module.exports = {
    modules: [{
        name: '测试环境',
        env: 'test',
        ssh: {
            host: '12.23.345.678',
            username: 'root',
            //rc版本的user选项和userName选项请在未来统一配置为username
            //privateKey为认证在服务器的公钥对应的私钥地址，请灵活变通
            privateKey: require('fs').readFileSync('/Users/manman/.ssh/id_rsa')  //mac用户举例
            privateKey: require('fs').readFileSync('C:/User/manman/.ssh/id_rsa')  //window用户举例
            privateKey: require('fs').readFileSync(`${require('os').homedir()}/.ssh/id_rsa`)  //通用写法
        },
        buildCommand: 'build',
        localPath: 'example',
        remotePath: '/www/example',
    }],
}
```

这样配置，即使你的配置文件不小心泄漏出去，但是没拿到你的私钥文件也是无法登陆服务器的。
不过较真来说，这对于 fjpublish 的开发者及依赖库的开发者而言私钥文件还是可以读取到的，不能算绝对安全。（我发誓我没有写后门，我也害怕依赖库的开发者窃取我的私钥）

### 4.免密发布进阶版（安全等级 ★★★★）

其实说是进阶版，无非这次是生成一对**带密码**的公私钥，这样每次 ssh 登录服务器需要输入的是**私钥的密码**，而不是服务器的密码。
对应 fjpublish 的配置文件中 ssh 项需要改为如下配置：

```js
...
ssh: {
    host: '12.23.345.678',
    username: 'root',
    //rc版本的user选项和userName选项请在未来统一配置为username
    //privateKey为认证在服务器的公钥对应的私钥地址，请灵活变通
    privateKey: require('fs').readFileSync('/Users/manman/.ssh/password')  //mac用户
    privateKey: require('fs').readFileSync('C:/User/manman/.ssh/password')  //window用户
    privateKey: require('fs').readFileSync(`${require('os').homedir()}/.ssh/password`)  //通用写法
    passphrase: '123456'  //私钥的密码
},
...
```

不过较真来说这样一样没有做到绝对的安全，请接着往下看。

### 5.终极大招（安全等级 ★★★★★）

是时候放出大招了，这是方法 4 的升级版，对于私钥中的密码，可以不用写入配置文件中，我们可以使用 ssh 代理（ssh-agent）**先在本机记录私钥密码**，这样发布时就不需要私钥密码也不需要服务器密码。
简单介绍一下，ssh-agent 是一个用来帮你记住私钥密码的程序，它是 OpenSSH 中默认包括的 ssh 代理程序，因为篇幅有限，所以这里不介绍如何配置 ssh-agent,请一定一定要看[这篇文章](http://blog.csdn.net/u014743697/article/details/56282428)。这时 fjpublish 的配置文件要改为这样：

```js
module.exports = {
  modules: [
    {
      name: '测试环境',
      env: 'test',
      ssh: {
        host: '12.23.345.678',
        username: 'root',
        //rc版本的user选项和userName选项请在未来统一配置为username
        agent: process.env.SSH_AUTH_SOCK,
        agentForward: true
      },
      buildCommand: 'build',
      localPath: 'example',
      remotePath: '/www/example'
    }
  ]
}
```

这样，再也不用担心密码泄露了。

## 文件操作安全

fjpublish 就像一个黑盒，用户只管设置配置文件，而后 fjpublish 就会完成既定任务，那么问题就来了，如果配置不正确会不会对本地计算机或者远程服务器的文件造成不可挽回的损坏呢。事实上 fjpublish 中写了很多关键的判断，也专门开发了一个[`--check`](/guide/use.html#fjpublish-env-env-options)选项来进行检查，如果第一次使用有点忐忑不安，可以使用这个功能检测一下。
例如下面的配置：

```js
module.exports = {
  modules: [
    {
      name: '测试环境',
      env: 'test',
      ssh: {
        host: '192.168.0.xxx',
        username: 'root',
        //rc版本的user选项和userName选项请在未来统一配置为username
        password: '123456'
      },
      remotePath: '/abc'
    }
  ],
  completeHook(fj) {
    console.log(fj._metadata.modules.test)
  }
}
```

很明显这个配置文件是有以下问题：

- buildCommand 未设置；

- localPath 或 localPathEntries 没有设置其中之一；

- remotePath 远程文件路径是不安全的路径（非二级目录以上的绝对路径）。

那么我们敲入命令`fjpublish env test --check`，这时 fjpublish 会跳过所有中间件文件操作的流程，只执行其中的参数判断的部分，然后在最先检测到错误的地方就停止并抛出错误，你可以试一试并逐一改正再试试。

如果你的参数配置正确，那么你可以关注一下`completeHook`这个钩子函数打印出的数据，其中'\_commands'就是表示将要在远程环境执行的命令，如果没有危险操作，那么就是 ok 的。

<font color="#DC143C">其实说得再安全都是废话，而且有些错误只在运行时才能发现，所以最保险的方式为：请先在测试环境试用 fjpublish！！！</font>
