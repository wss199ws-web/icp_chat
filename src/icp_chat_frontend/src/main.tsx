import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// 生产环境统一屏蔽所有 console 输出，避免前端日志泄露到线上
if (import.meta.env.PROD && typeof window !== 'undefined') {
  const noop = () => {};
  // eslint-disable-next-line no-console
  (console as any).log = noop as any;
  // eslint-disable-next-line no-console
  (console as any).warn = noop as any;
  // eslint-disable-next-line no-console
  (console as any).error = noop as any;
  // eslint-disable-next-line no-console
  (console as any).info = noop as any;
  // eslint-disable-next-line no-console
  (console as any).debug = noop as any;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

