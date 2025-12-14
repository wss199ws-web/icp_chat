import React from 'react';

// 单个路由配置
export interface RouteConfig {
  id: string; // 唯一 ID，用于 visited / key 等
  path: string;
  // 是否需要 keep-alive（组件挂载后通过 display: none 隐藏）
  keepAlive?: boolean;
  // 路由懒加载组件
  component: React.LazyExoticComponent<React.ComponentType<any>>;
}

// 需要 keep-alive 的主页面
export const keepAliveRoutes: RouteConfig[] = [
  {
    id: 'chat',
    path: '/',
    keepAlive: true,
    component: React.lazy(() => import('./components/Chat')),
  },
  {
    id: 'news-list',
    path: '/news',
    keepAlive: true,
    component: React.lazy(() => import('./components/NewsList')),
  },
  {
    id: 'profile',
    path: '/profile',
    keepAlive: true,
    component: React.lazy(() => import('./components/UserProfile')),
  },
  {
    id: 'wallet',
    path: '/wallet',
    keepAlive: true,
    component: React.lazy(() => import('./components/Wallet')),
  },
  {
    id: 'private-chat-list',
    path: '/private-chat',
    keepAlive: true,
    component: React.lazy(() => import('./components/PrivateChatLayout')),
  },
];

// 不需要 keep-alive 的页面（例如详情页）
export const normalRoutes: RouteConfig[] = [
  {
    id: 'news-detail',
    path: '/news/:id',
    keepAlive: false,
    component: React.lazy(() => import('./components/NewsDetail')),
  },
  {
    id: 'private-chat',
    path: '/private-chat/:otherPrincipal',
    keepAlive: true,
    component: React.lazy(() => import('./components/PrivateChatLayout')),
  },
];


