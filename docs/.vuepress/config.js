module.exports = {
  title: 'fjpublish',
  description: '一个简单的命令行项目发布工具',
  dest: 'dist',
  head: [
    [
      'link',
      {
        rel: 'icon',
        href: '/favicon.ico'
      }
    ]
  ],
  theme: 'codemao_docs',
  themeConfig: {
    nav: [
      {
        text: '指南',
        link: '/guide/'
      },
      {
        text: 'API',
        link: '/api/'
      },
      {
        text: '例子',
        link: '/example/'
      },
      {
        text: '更新日志',
        link: 'https://github.com/zczhangchao51/fjpublish/releases'
      }
    ],
    algolia: {
      // appId: '3Z3BZLORQY',
      apiKey: '1c438d88633332199dc3f15527025df6',
      indexName: 'fjpublish'
    },
    sidebar: {
      '/guide/': [
        {
          title: '指南',
          collapsable: false,
          children: [
            '',
            'fjpublish',
            'install',
            'config',
            'process',
            'use',
            'advanced',
            'safe'
          ]
        }
      ],
      '/example/': [
        {
          title: '示例',
          collapsable: false,
          children: [
            '',
            'entries',
            'commands',
            'recover',
            'prompt',
            'multiple',
            'hook',
            'programming'
          ]
        }
      ]
    }
  }
}
