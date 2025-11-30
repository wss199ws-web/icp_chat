import React, { useMemo } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import Navigation from './components/Navigation';
import Chat from './components/Chat';
import NewsList from './components/NewsList';
import NewsDetail from './components/NewsDetail';
import UserProfile from './components/UserProfile';
import './App.css';

/**
 * 组件缓存容器：保持组件状态，避免路由切换时重新渲染
 * 使用 display: none 来隐藏组件，而不是卸载它
 */
const AppContent: React.FC = () => {
  const location = useLocation();

  // 使用 useMemo 确保组件实例只创建一次
  const chatComponent = useMemo(() => <Chat key="chat" />, []);
  const newsListComponent = useMemo(() => <NewsList key="news-list" />, []);
  const profileComponent = useMemo(() => <UserProfile key="user-profile" />, []);

  // 判断当前应该显示哪个组件
  const isNewsDetail = location.pathname.startsWith('/news/') && location.pathname !== '/news';
  const isChat = location.pathname === '/';
  const isNewsList = location.pathname === '/news';
  const isProfile = location.pathname === '/profile';

  return (
    <div className="app-wrapper">
      <Navigation />
      <div className="app-content">
        {/* 渲染所有组件，但只显示当前匹配的 */}
        {/* 聊天页面 - 使用 display: none 保持状态 */}
        <div
          style={{
            display: isChat ? 'block' : 'none',
            width: '100%',
            height: '100%',
            position: isChat ? 'relative' : 'absolute',
            top: 0,
            left: 0,
          }}
        >
          {chatComponent}
          </div>
        
        {/* 新闻列表页面 - 使用 display: none 保持状态 */}
        <div
          style={{
            display: isNewsList ? 'block' : 'none',
            width: '100%',
            height: '100%',
            position: isNewsList ? 'relative' : 'absolute',
            top: 0,
            left: 0,
            overflow: 'hidden', // 父容器不滚动，让子容器滚动
          }}
        >
          {newsListComponent}
        </div>

        {/* 新闻详情页直接渲染（不缓存，每次都重新渲染） */}
        {isNewsDetail && (
          <div style={{ 
            width: '100%', 
            height: '100%', 
            position: 'relative',
            overflow: 'hidden', // 父容器不滚动，让子容器滚动
          }}>
            <Routes>
              <Route path="/news/:id" element={<NewsDetail />} />
            </Routes>
          </div>
        )}

        {/* 个人信息配置页面 - 使用 display: none 保持状态 */}
        <div
          style={{
            display: isProfile ? 'block' : 'none',
            width: '100%',
            height: '100%',
            position: isProfile ? 'relative' : 'absolute',
            top: 0,
            left: 0,
          }}
        >
          {profileComponent}
        </div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
};

export default App;
