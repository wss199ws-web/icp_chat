import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { newsService, NewsItem } from '../services/newsService';
import './NewsList.css';

const NewsList: React.FC = () => {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('全部');
  const isFirstLoadRef = useRef<boolean>(true);
  const categoryCacheRef = useRef<Map<string, NewsItem[]>>(new Map());

  useEffect(() => {
    const loadNews = async () => {
      try {
        setLoading(true);
        setError(null);
        // 根据选择的分类获取新闻
        const category = selectedCategory === '全部' ? 'all' : 
                        selectedCategory === '经济' ? 'economic' : 'web3';
        
        // 检查是否有该分类的缓存
        const cachedNews = categoryCacheRef.current.get(category);
        if (cachedNews && cachedNews.length > 0 && !isFirstLoadRef.current) {
          console.log(`[NewsList] 使用缓存数据: ${category}`);
          setNews(cachedNews);
          setLoading(false);
          return;
        }
        
        // 首次加载时强制刷新，后续切换分类时使用缓存
        const forceRefresh = isFirstLoadRef.current;
        const newsData = await newsService.getNewsList(30, category, forceRefresh);
        setNews(newsData);
        
        // 更新缓存
        categoryCacheRef.current.set(category, newsData);
        isFirstLoadRef.current = false;
      } catch (err) {
        console.error('加载新闻失败:', err);
        setError('加载新闻失败，请稍后重试');
      } finally {
        setLoading(false);
      }
    };

    loadNews();
  }, [selectedCategory]);

  const categories = ['全部', '经济', 'Web3'];

  const filteredNews = selectedCategory === '全部'
    ? news
    : news.filter(item => {
        if (selectedCategory === '经济') {
          return item.category === '经济' || item.category.toLowerCase().includes('economic');
        } else if (selectedCategory === 'Web3') {
          return item.category === 'Web3' || item.category.toLowerCase().includes('web3');
        }
        return true;
      });

  if (loading) {
    return (
      <div className="news-list-container">
        <div className="loading-spinner"></div>
        <p>加载新闻中...</p>
      </div>
    );
  }

  return (
    <div className="news-list-container">
      <div className="news-header">
        <h1>📰 新闻资讯</h1>
        <p className="news-subtitle">实时获取最新经济与Web3技术文章</p>
      </div>

      {error && (
        <div className="error-message">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      <div className="news-filters">
        {categories.map(category => (
          <button
            key={category}
            className={`filter-btn ${selectedCategory === category ? 'active' : ''}`}
            onClick={() => setSelectedCategory(category)}
          >
            {category}
          </button>
        ))}
      </div>

      <div className="news-grid">
        {filteredNews.length === 0 ? (
          <div className="empty-state">
            <p>暂无新闻</p>
          </div>
        ) : (
          filteredNews.map((item, index) => (
            <Link 
              key={item.id || index} 
              to={`/news/${item.id}`}
              state={{ newsItem: item }}
              className="news-card"
            >
              {item.imageUrl && (
                <div className="news-image">
                  <img src={item.imageUrl} alt={item.title} />
                </div>
              )}
            <div className="news-content">
              <div className="news-meta">
                <span className="news-category">{item.category}</span>
                <span className="news-time">{item.publishTime}</span>
              </div>
              <h2 className="news-title">{item.title}</h2>
              <p className="news-summary">{item.summary}</p>
              <div className="news-footer">
                <span className="news-author">{item.source} · {item.author}</span>
                <span className="read-more">阅读更多 →</span>
              </div>
            </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
};

export default NewsList;

