---
home: true
actionText: 快速上手 →
actionLink: /guide/
features:
- title: 简单至上
  details: 一次命令可发布一个或多个环境。
- title: 更智能
  details: 自动判断最优发布方式，省去重复步骤
- title: 轻松扩展
  details: 自由组合中间件，扩展更多功能
footer: MIT Licensed
---

### 像数 1, 2, 3 一样容易

``` bash
# 安装
npm install -g fjpublish # 或者：yarn global add fjpublish

# 在项目根目录下准备一个配置文件fjpublish.config.js
module.exports = {
  modules: [{
    name: '测试环境',
    env: 'test',
    ssh: {
      host: '192.168.0.xxx',
      username: 'root',
      password: 'xxxxxx',
    },
    buildCommand: 'build',
    localPath: 'dist',
    remotePath: '/www/manman/project',
  }]
}

# 发布项目到测试环境
fjpublish env test
```

::: warning 注意
请确保你的 Node.js 版本 >= 6。
:::
