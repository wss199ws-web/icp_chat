import React, { useState, useEffect } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { newsService, NewsItem } from '../services/newsService';
import './NewsDetail.css';

const NewsDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const [news, setNews] = useState<NewsItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadNews = async () => {
      if (!id) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        
        // 首先尝试从路由state中获取（如果是从列表页跳转过来的）
        const stateNews = (location.state as any)?.newsItem as NewsItem | undefined;
        if (stateNews && stateNews.id === id) {
          // 即使从state获取，也要检查内容是否完整，如果不完整则尝试获取
          if (stateNews.content.length < 500 && stateNews.url && stateNews.url !== '#') {
            const fullNews = await newsService.getNewsById(id);
            if (fullNews && fullNews.content.length > stateNews.content.length) {
              setNews(fullNews);
            } else {
              setNews(stateNews);
            }
          } else {
            setNews(stateNews);
          }
          setLoading(false);
          return;
        }
        
        // 如果路由state中没有，则从服务获取
        const newsData = await newsService.getNewsById(id);
        setNews(newsData);
      } catch (err) {
        console.error('加载新闻详情失败:', err);
        setError('加载新闻详情失败，请稍后重试');
      } finally {
        setLoading(false);
      }
    };

    loadNews();
  }, [id, location.state]);

  if (loading) {
    return (
      <div className="news-detail-container" style={{ textAlign: 'center' }}>
        <div className="loading-spinner"></div>
        <p>加载中...</p>
      </div>
    );
  }

  if (!news) {
    return (
      <div className="news-detail-container">
        <div className="error-state">
          <h2>新闻未找到</h2>
          <p>{error || '抱歉，找不到您要查看的新闻。'}</p>
          <Link to="/news" className="back-link">返回新闻列表</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="news-detail-container">
      <Link to="/news" className="back-button">← 返回新闻列表</Link>
      
      <article className="news-article">
        <div className="article-header">
          <div className="article-meta">
            <span className="article-category">{news.category}</span>
            <span className="article-time">{news.publishTime}</span>
          </div>
          <h1 className="article-title">{news.title}</h1>
          <div className="article-author">
            {news.source} · {news.author}
          </div>
          {news.url && news.url !== '#' && (
            <a
              href={news.url}
              target="_blank"
              rel="noopener noreferrer"
              className="article-source-link"
            >
              查看原文 →
            </a>
          )}
        </div>

        {news.imageUrl && (
          <div className="article-image">
            <img src={news.imageUrl} alt={news.title} />
          </div>
        )}

        <div className="article-content">
          {news.content && news.content.length > 0 ? (
            // 如果内容包含多个段落分隔符，按段落显示
            news.content.includes('\n\n') || news.content.includes('\n') ? (
              news.content
                .split(/\n\n+/)
                .map((paragraph, index) => {
                  const trimmed = paragraph.trim();
                  if (!trimmed) return null;
                  
                  // 如果段落很长，进一步分割
                  if (trimmed.length > 500) {
                    return trimmed.split('\n').map((line, lineIndex) => (
                      line.trim() && <p key={`${index}-${lineIndex}`}>{line.trim()}</p>
                    ));
                  }
                  
                  return <p key={index}>{trimmed}</p>;
                })
                .flat()
                .filter(Boolean)
            ) : (
              <p>{news.content}</p>
            )
          ) : (
            // 如果没有内容，显示摘要
            <div>
              <p>{news.summary}</p>
              {news.url && news.url !== '#' && (
                <p className="content-note">
                  <em>提示：本文为摘要内容，请点击上方"查看原文"链接阅读完整文章。</em>
                </p>
              )}
            </div>
          )}
        </div>
      </article>
    </div>
  );
};

export default NewsDetail;

