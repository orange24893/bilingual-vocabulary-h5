export default defineAppConfig({
  pages: [
    'pages/index/index',
    'pages/study/index',
    'pages/wordbook/index',
    'pages/word-edit/index',
    'pages/profile/index'
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#F6F7F2',
    navigationBarTitleText: '双语单词本',
    navigationBarTextStyle: 'black',
    backgroundColor: '#F6F7F2'
  },
  tabBar: {
    color: '#73776E',
    selectedColor: '#1F5A4A',
    backgroundColor: '#FFFFFF',
    list: [
      {
        pagePath: 'pages/index/index',
        text: '学习',
        iconPath: 'assets/tabbar/study.svg',
        selectedIconPath: 'assets/tabbar/study-selected.svg'
      },
      {
        pagePath: 'pages/wordbook/index',
        text: '生词本',
        iconPath: 'assets/tabbar/wordbook.svg',
        selectedIconPath: 'assets/tabbar/wordbook-selected.svg'
      },
      {
        pagePath: 'pages/profile/index',
        text: '我的',
        iconPath: 'assets/tabbar/profile.svg',
        selectedIconPath: 'assets/tabbar/profile-selected.svg'
      }
    ]
  }
})
