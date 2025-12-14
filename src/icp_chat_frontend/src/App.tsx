import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import Navigation from './components/Navigation';
import './App.css';
import { keepAliveRoutes, normalRoutes } from './router';

/**
 * 组件缓存容器：保持组件状态，避免路由切换时重新渲染
 * 使用 display: none 来隐藏组件，而不是卸载它
 */
const AppContent: React.FC = () => {
  const location = useLocation();

  // 记录哪些 keepAlive 页面已经被访问过，用于「按需加载 + 保持状态」
  const [visited, setVisited] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const route of keepAliveRoutes) {
      // 首页默认认为已访问
      initial[route.id] = route.path === '/';
    }
    return initial;
  });

  // 为每个 keepAlive 路由创建固定组件实例，保持状态
  const keepAliveComponents = useMemo(() => {
    const map = new Map<string, React.ReactNode>();
    for (const route of keepAliveRoutes) {
      const Element = route.component;
      map.set(route.id, <Element key={route.id} />);
    }
    return map;
  }, []);

  // 判断当前是否在某个 keepAlive 路由下
  const isActivePath = (path: string) => {
    if (path === '/private-chat') {
      // /private-chat 和 /private-chat/:otherPrincipal 都匹配
      return location.pathname === '/private-chat' || location.pathname.startsWith('/private-chat/');
    }
    return location.pathname === path;
  };
  const isNewsDetail = location.pathname.startsWith('/news/') && location.pathname !== '/news';

  // 路由变化时，标记对应页面为已访问，从而触发懒加载
  useEffect(() => {
    setVisited(prev => {
      let changed = false;
      const next = { ...prev };
      for (const route of keepAliveRoutes) {
        if (isActivePath(route.path) && !next[route.id]) {
          next[route.id] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [location.pathname]);

  return (
    <div className="app-wrapper">
      <Navigation />
      <div className="app-content">
        {/* 渲染所有 keepAlive 组件，但只显示当前匹配的；用 Suspense 包一层以支持按需加载 */}
        <Suspense fallback={<div style={{ color: '#999', padding: '16px', textAlign: 'center' }}>加载中...</div>}>
          {keepAliveRoutes.map(route => {
            if (!visited[route.id]) return null;
            const isActive = isActivePath(route.path);
            const element = keepAliveComponents.get(route.id);
            return (
              <div
                key={route.id}
                style={{
                  display: isActive ? 'block' : 'none',
                  width: '100%',
                  height: '100%',
                  position: isActive ? 'relative' : 'absolute',
                  top: 0,
                  left: 0,
                  overflow: route.path === '/news' ? 'hidden' : 'visible',
                }}>
                {element}
              </div>
            );
          })}

          {/* 新闻详情页直接渲染（不缓存，每次都重新渲染） */}
          {/* 非 keep-alive 页面（例如详情页）直接走 <Routes>，每次进入重新挂载 */}
          {isNewsDetail && (
            <div style={{ 
              width: '100%', 
              height: '100%', 
              position: 'relative',
              overflow: 'hidden',
            }}>
              <Routes>
                {normalRoutes.map(route => {
                  const Element = route.component;
                  return (
                    <Route
                      key={route.id}
                      path={route.path}
                      element={<Element />}
                    />
                  );
                })}
              </Routes>
            </div>
          )}
        </Suspense>
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
