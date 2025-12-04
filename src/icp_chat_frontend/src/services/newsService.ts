/**
 * 新闻服务
 * 从外部API获取经济类文章
 */

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  content: string;
  author: string;
  publishTime: string;
  imageUrl?: string;
  category: string;
  source: string;
  url: string;
}

interface CachedNewsData {
  data: NewsItem[];
  timestamp: number;
  category: string;
}

class NewsService {
  // 使用 NewsAPI 或其他新闻API
  // 注意：实际使用时需要配置API密钥
  private readonly NEWS_API_KEY = import.meta.env.VITE_NEWS_API_KEY || '';
  private readonly NEWS_API_URL = 'https://newsapi.org/v2';
  
  // 缓存新闻数据（使用Map存储，key为ID）
  private newsCache = new Map<string, NewsItem>();
  
  // 缓存新闻列表（按分类缓存，key为分类）
  private newsListCache = new Map<string, CachedNewsData>();
  
  // 缓存过期时间（30分钟）
  private readonly CACHE_EXPIRY = 30 * 60 * 1000;
  
  // 备用方案：使用RSS feed或直接爬取
  // 经济类新闻RSS源列表
  private readonly ECONOMIC_RSS_FEEDS = [
    // 英文经济新闻源
    'https://feeds.finance.yahoo.com/rss/2.0/headline', // Yahoo Finance
    'https://www.ft.com/?format=rss', // Financial Times
    'https://feeds.npr.org/1004/rss.xml', // NPR Business
    'https://www.wsj.com/xml/rss/3_7085.xml', // Wall Street Journal
    'https://feeds.marketwatch.com/marketwatch/topstories', // MarketWatch
    'https://www.cnbc.com/id/100003114/device/rss/rss.html', // CNBC
    'https://feeds.feedburner.com/oreilly/radar', // O'Reilly Radar (Tech Business)
    
    // 中文经济新闻源
    'https://www.ftchinese.com/rss/news', // FT中文网
    'https://www.caixin.com/rss/all.xml', // 财新网
    'https://www.36kr.com/feed', // 36氪（科技财经）
    'https://www.huxiu.com/rss/0.xml', // 虎嗅（商业科技）
  ];

  // Web3技术文章RSS源列表（美国）
  private readonly WEB3_RSS_FEEDS = [
    // 美国Web3/区块链技术媒体
    'https://cointelegraph.com/rss', // CoinTelegraph（美国）
    'https://decrypt.co/feed', // Decrypt（美国）
    'https://thedefiant.io/feed/', // The Defiant（美国）
    'https://www.coindesk.com/arc/outboundfeeds/rss/', // CoinDesk RSS
    'https://www.coinbase.com/blog/rss.xml', // Coinbase Blog（美国）
    'https://blog.ethereum.org/feed.xml', // Ethereum Blog（美国）
    'https://consensys.net/blog/feed/', // ConsenSys Blog（美国）
    'https://a16zcrypto.com/feed/', // a16z crypto（美国）
    'https://www.paradigm.xyz/feed.xml', // Paradigm（美国）
    'https://www.multicoin.capital/feed/', // Multicoin Capital（美国）
    'https://www.blockchain.com/research/feed', // Blockchain.com Research（美国）
    'https://www.coinbase.com/blog/rss.xml', // Coinbase Blog
    'https://medium.com/feed/tag/web3', // Medium Web3标签
    'https://medium.com/feed/tag/blockchain', // Medium Blockchain标签
    'https://medium.com/feed/tag/cryptocurrency', // Medium Cryptocurrency标签
    'https://hackernoon.com/feed', // HackerNoon（美国，技术+Web3）
    'https://www.theblock.co/rss.xml', // The Block（美国）
  ];

  // 当前使用的RSS源索引
  private currentRssIndex = 0;
  private currentWeb3RssIndex = 0;


  /**
   * 从 NewsAPI 获取经济类新闻
   */
  async fetchNewsFromAPI(country: string = 'us', pageSize: number = 20): Promise<NewsItem[]> {
    try {
      // 如果没有API密钥，使用备用方案
      if (!this.NEWS_API_KEY) {
        console.warn('[NewsService] NewsAPI密钥未配置，使用RSS feed');
        return await this.fetchNewsFromRSS();
      }

      const url = `${this.NEWS_API_URL}/top-headlines?country=${country}&category=business&pageSize=${pageSize}&apiKey=${this.NEWS_API_KEY}`;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.status === 'ok' && data.articles) {
        return data.articles.map((article: any) => {
          const title = article.title || '无标题';
          const url = article.url || '#';
          return {
            id: this.generateStableId(url, title, 'api'),
            title: title,
            summary: article.description || title || '',
            content: article.content || article.description || title || '',
            author: article.author || article.source?.name || '未知作者',
            publishTime: this.formatDate(article.publishedAt),
            imageUrl: article.urlToImage,
            category: '经济',
            source: article.source?.name || '未知来源',
            url: url,
          };
        });
      }

      return [];
    } catch (error) {
      console.error('[NewsService] 从API获取新闻失败:', error);
      // 失败时使用备用方案
      return await this.fetchNewsFromRSS();
    }
  }

  /**
   * 从RSS feed获取新闻（备用方案）
   * 尝试多个RSS源，直到成功获取数据
   */
  async fetchNewsFromRSS(): Promise<NewsItem[]> {
    const maxAttempts = Math.min(5, this.ECONOMIC_RSS_FEEDS.length); // 最多尝试5个源
    let allNews: NewsItem[] = [];

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const rssUrl = this.ECONOMIC_RSS_FEEDS[this.currentRssIndex % this.ECONOMIC_RSS_FEEDS.length];
        this.currentRssIndex++;
        
        // 使用 RSS2JSON API（免费，无需密钥）
        const proxyUrl = 'https://api.rss2json.com/v1/api.json';
        const response = await fetch(`${proxyUrl}?rss_url=${encodeURIComponent(rssUrl)}`, {
          signal: AbortSignal.timeout(10000), // 10秒超时
        });
        
        if (!response.ok) {
          console.warn(`[NewsService] RSS源 ${rssUrl} 返回错误: ${response.status}`);
          continue;
        }

        const data = await response.json();
        
        if (data.status === 'ok' && data.items && data.items.length > 0) {
          // 过滤经济相关新闻
          const economicKeywords = [
            'economy', 'economic', 'finance', 'financial', 'market', 'business', 
            'trade', 'GDP', 'inflation', 'stock', 'currency', 'banking', 'investment',
            '经济', '金融', '市场', '贸易', '股票', '货币', '银行', '投资', '财经',
            '商业', '企业', '股市', '汇率', '通胀', 'GDP'
          ];
          
          const filteredItems = data.items.filter((item: any) => {
            const title = (item.title || '').toLowerCase();
            const description = (item.description || '').toLowerCase();
            const content = (item.content || '').toLowerCase();
            return economicKeywords.some(keyword => 
              title.includes(keyword.toLowerCase()) || 
              description.includes(keyword.toLowerCase()) ||
              content.includes(keyword.toLowerCase())
            );
          });

          const itemsToUse = filteredItems.length > 0 ? filteredItems : data.items.slice(0, 15);

          const newsItems = itemsToUse.map((item: any) => {
            const title = item.title || '无标题';
            const url = item.link || '#';
            const description = this.cleanHtml(item.description || '');
            const content = this.cleanHtml(item.content || item.description || '');
            
            return {
              id: this.generateStableId(url, title, 'rss'),
              title: title,
              summary: description.substring(0, 300) || title.substring(0, 200) || '',
              // 保留完整内容，不截断（详情页会使用）
              content: content || description || title || '',
              author: item.author || data.feed?.title || '未知作者',
              publishTime: this.formatDate(item.pubDate),
              imageUrl: item.thumbnail || item.enclosure?.link,
              category: '经济',
              source: data.feed?.title || 'RSS Feed',
              url: url,
            };
          });

          allNews = [...allNews, ...newsItems];
          
          // 如果已经获取到足够的新闻，停止尝试
          if (allNews.length >= 20) {
            break;
          }
        }
      } catch (error) {
        console.warn(`[NewsService] RSS源 ${i + 1} 获取失败:`, error);
        // 继续尝试下一个源
        continue;
      }
    }

    // 去重（基于标题）
    const uniqueNews = allNews.filter((item, index, self) =>
      index === self.findIndex(t => t.title === item.title)
    );

    // 按发布时间排序（最新的在前）
    uniqueNews.sort((a, b) => {
      const dateA = new Date(a.publishTime).getTime();
      const dateB = new Date(b.publishTime).getTime();
      return dateB - dateA;
    });

    if (uniqueNews.length > 0) {
      return uniqueNews.slice(0, 30); // 返回最多30条
    }

    console.warn('[NewsService] 所有RSS源都失败，使用模拟数据');
    return this.getMockNews();
  }

  /**
   * 清理HTML标签，保留文本内容
   */
  private cleanHtml(html: string): string {
    if (!html) return '';
    
    // 创建一个临时DOM元素来解析HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    
    // 提取文本内容，保留换行
    let text = tempDiv.textContent || tempDiv.innerText || '';
    
    // 清理多余的空白字符，但保留段落分隔
    text = text
      .replace(/\n\s*\n\s*\n/g, '\n\n') // 多个换行合并为两个
      .replace(/[ \t]+/g, ' ') // 多个空格合并为一个
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
    
    return text;
  }

  /**
   * 尝试从URL获取完整文章内容（使用CORS代理）
   */
  private async fetchFullContent(url: string): Promise<string | null> {
    if (!url || url === '#') return null;
    
    try {
      // 使用CORS代理获取内容（尝试多个代理）
      const proxies = [
        `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
        `https://corsproxy.io/?${encodeURIComponent(url)}`,
      ];
      
      for (const proxyUrl of proxies) {
        try {
          const response = await fetch(proxyUrl, {
            signal: AbortSignal.timeout(15000), // 15秒超时
          });
          
          if (!response.ok) {
            console.warn(`[NewsService] 代理 ${proxyUrl} 返回错误: ${response.status}`);
            continue;
          }
          
          const data = await response.json();
          let htmlContent = '';
          
          // 处理不同代理的响应格式
          if (data.contents) {
            htmlContent = data.contents;
          } else if (data.contents) {
            htmlContent = data.contents;
          } else if (typeof data === 'string') {
            htmlContent = data;
          } else {
            continue;
          }
          
          if (!htmlContent) continue;
          
          // 解析HTML内容
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = htmlContent;
          
          // 尝试找到主要内容区域（常见的文章容器类名）
          const contentSelectors = [
            'article',
            '.article-content',
            '.article-body',
            '.post-content',
            '.post-body',
            '.entry-content',
            '.entry-body',
            '.content',
            '.story-body',
            '.article-text',
            'main',
            '#content',
            '[role="article"]',
          ];
          
          let contentElement: Element | null = null;
          for (const selector of contentSelectors) {
            contentElement = tempDiv.querySelector(selector);
            if (contentElement) {
              break;
            }
          }
          
          // 如果找到特定容器，使用它；否则使用整个body
          const targetElement = contentElement || tempDiv;
          const htmlElement = targetElement as HTMLElement;
          let text = htmlElement.textContent || htmlElement.innerText || '';
          
          // 清理文本
          text = text
            .replace(/\n\s*\n\s*\n/g, '\n\n')
            .replace(/[ \t]+/g, ' ')
            .replace(/\s+\./g, '.') // 清理多余的空白
            .trim();
          
          // 如果内容足够长（超过200字符），返回它
          if (text.length > 200) {
            return text;
          } else {
            console.warn(`[NewsService] 获取的内容太短: ${text.length} 字符`);
          }
        } catch (proxyError) {
          console.warn(`[NewsService] 代理 ${proxyUrl} 请求失败:`, proxyError);
          continue;
        }
      }
    } catch (error) {
      console.warn(`[NewsService] 获取完整内容失败: ${url}`, error);
    }
    
    return null;
  }

  /**
   * 生成稳定的新闻ID（基于URL或标题）
   */
  private generateStableId(url: string, title: string, prefix: string = 'news'): string {
    // 优先使用URL生成ID
    if (url && url !== '#') {
      try {
        // 使用URL的hash作为ID的一部分
        const urlHash = this.simpleHash(url);
        return `${prefix}-${urlHash}`;
      } catch (e) {
        // 如果URL无效，使用标题
      }
    }
    
    // 使用标题生成hash
    const titleHash = this.simpleHash(title);
    return `${prefix}-${titleHash}`;
  }

  /**
   * 简单的字符串hash函数
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    // 转换为正数并转为16进制
    return Math.abs(hash).toString(16).substring(0, 12);
  }

  /**
   * 获取模拟新闻（兜底方案）
   */
  private getMockNews(): NewsItem[] {
    return [
      {
        id: 'mock-1',
        title: '全球经济复苏势头强劲',
        summary: '最新数据显示，全球经济正在稳步复苏，多个主要经济体增长超出预期。',
        content: '最新数据显示，全球经济正在稳步复苏，多个主要经济体增长超出预期。专家认为，这一趋势将持续到明年。',
        author: '经济观察',
        publishTime: new Date().toLocaleString('zh-CN'),
        category: '经济',
        source: '模拟数据',
        url: '#',
      },
      {
        id: 'mock-2',
        title: '数字货币市场波动加剧',
        summary: '近期数字货币市场出现大幅波动，投资者需谨慎应对市场风险。',
        content: '近期数字货币市场出现大幅波动，投资者需谨慎应对市场风险。分析师建议保持理性投资。',
        author: '金融分析',
        publishTime: new Date().toLocaleString('zh-CN'),
        category: '经济',
        source: '模拟数据',
        url: '#',
      },
    ];
  }

  /**
   * 格式化日期
   */
  private formatDate(dateString: string): string {
    try {
      const date = new Date(dateString);
      return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return new Date().toLocaleString('zh-CN');
    }
  }

  /**
   * 从Web3 RSS源获取技术文章
   */
  async fetchWeb3Articles(): Promise<NewsItem[]> {
    const maxAttempts = Math.min(5, this.WEB3_RSS_FEEDS.length);
    let allNews: NewsItem[] = [];

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const rssUrl = this.WEB3_RSS_FEEDS[this.currentWeb3RssIndex % this.WEB3_RSS_FEEDS.length];
        this.currentWeb3RssIndex++;
        
        const proxyUrl = 'https://api.rss2json.com/v1/api.json';
        const response = await fetch(`${proxyUrl}?rss_url=${encodeURIComponent(rssUrl)}`, {
          signal: AbortSignal.timeout(10000),
        });
        
        if (!response.ok) {
          console.warn(`[NewsService] Web3 RSS源 ${rssUrl} 返回错误: ${response.status}`);
          continue;
        }

        const data = await response.json();
        
        if (data.status === 'ok' && data.items && data.items.length > 0) {
          // Web3相关关键词
          const web3Keywords = [
            'web3', 'blockchain', 'crypto', 'cryptocurrency', 'defi', 'nft', 
            'ethereum', 'bitcoin', 'smart contract', 'dapp', 'dao', 'metaverse',
            'layer2', 'rollup', 'staking', 'yield', 'liquidity', 'protocol',
            'Web3', 'Blockchain', 'DeFi', 'NFT', 'DAO', 'Metaverse',
            '智能合约', '去中心化', '区块链', '加密货币', 'NFT', 'DeFi'
          ];
          
          const filteredItems = data.items.filter((item: any) => {
            const title = (item.title || '').toLowerCase();
            const description = (item.description || '').toLowerCase();
            const content = (item.content || '').toLowerCase();
            return web3Keywords.some(keyword => 
              title.includes(keyword.toLowerCase()) || 
              description.includes(keyword.toLowerCase()) ||
              content.includes(keyword.toLowerCase())
            );
          });

          const itemsToUse = filteredItems.length > 0 ? filteredItems : data.items.slice(0, 15);

          const newsItems = itemsToUse.map((item: any) => {
            const title = item.title || '无标题';
            const url = item.link || '#';
            // 优先使用content，如果没有则使用description
            const rawContent = item.content || item.description || '';
            const description = this.cleanHtml(item.description || '');
            const content = this.cleanHtml(rawContent);
            
            // 确保内容不为空
            const finalContent = content || description || title || '';
            
            return {
              id: this.generateStableId(url, title, 'web3'),
              title: title,
              summary: description.substring(0, 300) || title.substring(0, 200) || '',
              // 保留完整内容，不截断（详情页会使用）
              content: finalContent,
              author: item.author || data.feed?.title || '未知作者',
              publishTime: this.formatDate(item.pubDate),
              imageUrl: item.thumbnail || item.enclosure?.link,
              category: 'Web3',
              source: data.feed?.title || 'Web3 RSS Feed',
              url: url,
            };
          });

          allNews = [...allNews, ...newsItems];
          
          if (allNews.length >= 20) {
            break;
          }
        }
      } catch (error) {
        console.warn(`[NewsService] Web3 RSS源 ${i + 1} 获取失败:`, error);
        continue;
      }
    }

    // 去重和排序
    const uniqueNews = allNews.filter((item, index, self) =>
      index === self.findIndex(t => t.title === item.title)
    );

    uniqueNews.sort((a, b) => {
      const dateA = new Date(a.publishTime).getTime();
      const dateB = new Date(b.publishTime).getTime();
      return dateB - dateA;
    });

    if (uniqueNews.length > 0) {
      return uniqueNews.slice(0, 30);
    }

    return this.getMockWeb3News();
  }

  /**
   * 获取模拟Web3新闻（兜底方案）
   */
  private getMockWeb3News(): NewsItem[] {
    return [
      {
        id: 'web3-mock-1',
        title: 'Ethereum 2.0 升级进展顺利',
        summary: '以太坊2.0升级持续推进，权益证明机制运行稳定，网络性能显著提升。',
        content: '以太坊2.0升级持续推进，权益证明机制运行稳定，网络性能显著提升。开发者社区对升级进展表示乐观，预计将在未来几个月内完成全面升级。',
        author: 'Web3观察',
        publishTime: new Date().toLocaleString('zh-CN'),
        category: 'Web3',
        source: '模拟数据',
        url: '#',
      },
      {
        id: 'web3-mock-2',
        title: 'DeFi 协议总锁仓量创新高',
        summary: '去中心化金融协议总锁仓量突破历史新高，显示DeFi生态持续发展。',
        content: '去中心化金融协议总锁仓量突破历史新高，显示DeFi生态持续发展。多个主流DeFi协议推出新功能，吸引了大量资金流入。',
        author: 'DeFi分析',
        publishTime: new Date().toLocaleString('zh-CN'),
        category: 'Web3',
        source: '模拟数据',
        url: '#',
      },
    ];
  }

  /**
   * 检查缓存是否有效
   */
  private isCacheValid(cachedData: CachedNewsData | undefined): boolean {
    if (!cachedData) return false;
    const now = Date.now();
    return (now - cachedData.timestamp) < this.CACHE_EXPIRY;
  }

  /**
   * 获取新闻列表
   * @param pageSize 每页数量
   * @param category 新闻分类：'economic' | 'web3' | 'all'
   * @param forceRefresh 是否强制刷新（忽略缓存）
   */
  async getNewsList(
    pageSize: number = 20, 
    category: 'economic' | 'web3' | 'all' = 'all',
    forceRefresh: boolean = false
  ): Promise<NewsItem[]> {
    try {
      // 检查缓存
      if (!forceRefresh) {
        const cachedData = this.newsListCache.get(category);
        if (this.isCacheValid(cachedData)) {
          // 更新单个新闻的缓存
          cachedData!.data.forEach(item => {
            this.newsCache.set(item.id, item);
          });
          return cachedData!.data;
        }
      }
      let news: NewsItem[] = [];
      
      if (category === 'web3') {
        // 只获取Web3文章
        news = await this.fetchWeb3Articles();
      } else if (category === 'economic') {
        // 只获取经济新闻
        const apiNews = await this.fetchNewsFromAPI('us', pageSize);
        news = apiNews.length > 0 ? apiNews : await this.fetchNewsFromRSS();
      } else {
        // 获取所有类型
        const [economicNews, web3News] = await Promise.all([
          this.fetchNewsFromAPI('us', Math.floor(pageSize / 2)).catch(() => this.fetchNewsFromRSS()),
          this.fetchWeb3Articles(),
        ]);
        
        // 合并并排序
        news = [...economicNews, ...web3News];
        news.sort((a, b) => {
          const dateA = new Date(a.publishTime).getTime();
          const dateB = new Date(b.publishTime).getTime();
          return dateB - dateA;
        });
        
        news = news.slice(0, pageSize);
      }
      
      // 更新缓存
      this.newsListCache.set(category, {
        data: news,
        timestamp: Date.now(),
        category: category,
      });
      
      // 更新单个新闻的缓存
      news.forEach(item => {
        this.newsCache.set(item.id, item);
      });
      
      return news;
    } catch (error) {
      console.error('[NewsService] 获取新闻失败:', error);
      // 如果出错，尝试返回缓存数据
      const cachedData = this.newsListCache.get(category);
      if (cachedData) {
        return cachedData.data;
      }
      return this.getMockNews();
    }
  }

  /**
   * 根据ID获取新闻详情
   * 优先从缓存查找，如果缓存中没有，则重新获取数据
   * 如果内容太短，尝试从原始URL获取完整内容
   */
  async getNewsById(id: string): Promise<NewsItem | null> {
    try {
      // 首先尝试从缓存中查找
      let news = this.newsCache.get(id);
      if (news) {
        // 如果缓存中的内容太短，尝试获取完整内容
        if (news.content.length < 500 && news.url && news.url !== '#') {
          const fullContent = await this.fetchFullContent(news.url);
          if (fullContent && fullContent.length > news.content.length) {
            news = { ...news, content: fullContent };
            this.newsCache.set(id, news);
          }
        }
        return news;
      }
      
      // 如果缓存中没有，尝试从所有分类获取
      const [economicNews, web3News] = await Promise.all([
        this.getNewsList(100, 'economic'),
        this.getNewsList(100, 'web3'),
      ]);
      const allNews = [...economicNews, ...web3News];
      
      // 首先尝试通过ID精确匹配
      news = allNews.find(item => item.id === id);
      
      // 如果找不到，尝试通过ID的hash部分匹配（兼容旧ID格式）
      if (!news && id.includes('-')) {
        const idParts = id.split('-');
        if (idParts.length > 1) {
          const prefix = idParts[0];
          const hashPart = idParts.slice(1).join('-');
          news = allNews.find(item => {
            const itemIdParts = item.id.split('-');
            return itemIdParts[0] === prefix && itemIdParts.slice(1).join('-') === hashPart;
          });
        }
      }
      
      // 如果还是找不到，尝试通过URL匹配（URL是唯一且稳定的）
      if (!news) {
        // 从ID中提取可能的URL信息（如果ID包含URL的hash）
        // 或者尝试匹配所有新闻的URL hash
        for (const item of allNews) {
          if (item.url && item.url !== '#') {
            const urlHash = this.simpleHash(item.url);
            const expectedId = `${item.id.split('-')[0]}-${urlHash}`;
            if (id === expectedId || item.id === id) {
              news = item;
              break;
            }
          }
        }
      }
      
      // 如果找到了，更新缓存，并尝试获取完整内容
      if (news) {
        // 如果内容太短，尝试从原始URL获取完整内容
        if (news.content.length < 500 && news.url && news.url !== '#') {
          const fullContent = await this.fetchFullContent(news.url);
          if (fullContent && fullContent.length > news.content.length) {
            news = { ...news, content: fullContent };
          }
        }
        
        this.newsCache.set(id, news);
        // 也使用实际ID作为key缓存
        if (news.id !== id) {
          this.newsCache.set(news.id, news);
        }
        return news;
      }
      
      console.warn(`[NewsService] 无法找到新闻 ID: ${id}`);
      return null;
    } catch (error) {
      console.error('[NewsService] 获取新闻详情失败:', error);
      return null;
    }
  }
}

export const newsService = new NewsService();

