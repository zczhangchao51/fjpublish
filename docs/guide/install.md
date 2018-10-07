# 安装

安装 fjpublish 很简单，然而在安装前，您必须检查电脑中是否已安装了nodejs（6.0+），fjpublish依赖于nodejs。如果您的电脑中已经安装了nodejs，那么接下来只需要使用 npm（或[cnpm](https://npm.taobao.org/)或[yarn](https://yarn.bootcss.com/)） 即可完成 fjpublish 的全局安装。

	npm install fjpublish -g

值得注意的是，fjpublish推荐使用全局安装，这样在任何一个文件目录都可以直接使用，若不想全局安装，也可以在具体的项目使用命令`npm install fjpublish`局部安装。局部安装fjpublish在使用的时候比较麻烦，需要加上路径前缀./node_modules/fjpublish，也可以使用[npm script](http://www.ruanyifeng.com/blog/2016/10/npm_scripts.html)或者[函数式发布](/guide/advanced.html)。

<font color="#DC143C">注意: fjpublish依赖一份配置文件，默认是fjpublish.config.js，如果不想在版本库中提交服务器安全信息，请千万记得把它加入忽略文件中，如.gitignore</font>