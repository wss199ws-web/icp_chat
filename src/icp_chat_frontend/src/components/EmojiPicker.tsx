import React, { useState, useRef, useEffect } from 'react';
import './EmojiPicker.css';

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onSelectImage?: (imageUrl: string) => void; // 选择网络图片时的回调（插入到输入框）
  onSendImage?: (imageBase64: string) => void; // 新增：直接发送图片（不插入到输入框）
  onClose?: () => void;
}

// 常用表情分类
const EMOJI_CATEGORIES = {
  '常用': ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓'],
  '手势': ['👋', '🤚', '🖐', '✋', '🖖', '👌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💪', '🦾', '🦿', '🦵', '🦶', '👂', '🦻', '👃', '🧠', '🦷', '🦴', '👀', '👁', '👅', '👄'],
  '爱心': ['💋', '💌', '💘', '💝', '💖', '💗', '💓', '💞', '💕', '💟', '❣️', '💔', '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💯', '💢', '💥', '💫', '💦', '💨', '🕳️', '💣', '💬', '👁️‍🗨️', '🗨️', '🗯️', '💭', '💤'],
  '物品': ['⌚', '📱', '📲', '💻', '⌨️', '🖥', '🖨', '🖱', '🖲', '🕹', '🗜', '💾', '💿', '📀', '📼', '📷', '📸', '📹', '🎥', '📽', '🎞', '📞', '☎️', '📟', '📠', '📺', '📻', '🎙', '🎚', '🎛', '⏱', '⏲', '⏰', '🕰', '⌛', '⏳', '📡'],
  '符号': ['✅', '❌', '❓', '❔', '❕', '❗', '💯', '🔅', '🔆', '🔱', '🔰', '♻️', '⚛️', '🉑', '☢️', '☣️', '📛', '🔰', '⭕', '✅', '☑️', '✔️', '✖️', '✳️', '✴️', '❇️', '©️', '®️', '™️', '💱', '💲', '⚕️', '♻️', '🔱', '📶', '🔰', '⭕', '🆔', '🆓', '🆕', '🆖', '🆗', '🆙', '🆚', '🈁', '🈂️', '🈷️', '🈶', '🈯', '🉐', '🈹', '🈲', '🉑', '🈸', '🈴', '🈳', '㊗️', '㊙️', '🈺', '🈵'],
};

// 网络趣图表情包 - 照片
// 注意：以下 URL 需要替换为实际可用的图片资源
// 可以使用以下方案：
// 1. 自建图片服务器（推荐）
// 2. 使用支持跨域的图片 CDN（如 Cloudinary、Imgur、GitHub 等）
// 3. 将图片转换为 base64 直接嵌入代码中
// 4. 使用图片 API 服务（需注意版权和使用许可）

// 使用一些公开的图片服务作为示例，实际使用时建议替换为自建资源
const MEME_STICKERS = [
  // 照片
  { name: '1', url: 'https://picsum.photos/150/150?random=101' },
  { name: '2', url: 'https://picsum.photos/150/150?random=102' },
  { name: '3', url: 'https://picsum.photos/150/150?random=103' },
  { name: '4', url: 'https://picsum.photos/150/150?random=104' },
  { name: '5', url: 'https://picsum.photos/150/150?random=105' },
  { name: '6', url: 'https://picsum.photos/150/150?random=106' },
  { name: '7', url: 'https://picsum.photos/150/150?random=107' },
  { name: '8', url: 'https://picsum.photos/150/150?random=108' },
  { name: '9', url: 'https://picsum.photos/150/150?random=109' },
  { name: '10', url: 'https://picsum.photos/150/150?random=110' },
  
  // 照片
  { name: '1', url: 'https://picsum.photos/150/150?random=201' },
  { name: '2', url: 'https://picsum.photos/150/150?random=202' },
  { name: '3', url: 'https://picsum.photos/150/150?random=203' },
  { name: '4', url: 'https://picsum.photos/150/150?random=204' },
  { name: '5', url: 'https://picsum.photos/150/150?random=205' },
  { name: '6', url: 'https://picsum.photos/150/150?random=206' },
  { name: '7', url: 'https://picsum.photos/150/150?random=207' },
  { name: '8', url: 'https://picsum.photos/150/150?random=208' },
  { name: '9', url: 'https://picsum.photos/150/150?random=209' },
  { name: '10', url: 'https://picsum.photos/150/150?random=210' },
];

const EmojiPicker: React.FC<EmojiPickerProps> = ({ onSelect, onSelectImage, onSendImage, onClose }) => {
  const [activeCategory, setActiveCategory] = useState<string>('常用');
  const [loadingImage, setLoadingImage] = useState<string | null>(null);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const pickerRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭选择器
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        onClose?.();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  const handleEmojiClick = (emoji: string) => {
    onSelect(emoji);
    // 选择表情后不关闭，方便连续选择多个表情
  };

  // 处理网络表情包选择：将图片 URL 转换为 base64 并直接发送
  const handleStickerClick = async (sticker: { name: string; url: string }) => {
    try {
      setLoadingImage(sticker.url);
      const response = await fetch(sticker.url, { mode: 'cors' });
      if (!response.ok) {
        throw new Error('图片加载失败');
      }
      const blob = await response.blob();
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setLoadingImage(null);
        
        // 如果提供了 onSendImage，直接发送图片
        if (onSendImage) {
          onSendImage(base64);
          onClose?.(); // 发送后关闭选择器
        } else if (onSelectImage) {
          // 否则使用 onSelectImage 回调（插入到输入框）
          onSelectImage(sticker.url);
        } else {
          // 最后回退到插入到输入框
          onSelect(base64);
        }
      };
      reader.onerror = () => {
        console.error('转换图片失败');
        setLoadingImage(null);
        alert('表情包加载失败，请稍后重试');
      };
      reader.readAsDataURL(blob);
    } catch (error) {
      console.error('加载表情包失败:', error);
      setLoadingImage(null);
      alert('表情包加载失败，请检查网络连接');
    }
  };

  return (
    <div className="emoji-picker" ref={pickerRef}>
      <div className="emoji-picker-header">
        <div className="emoji-categories">
          <button
              className={`emoji-category-btn ${activeCategory === '网络趣图' ? 'active' : ''}`}
              onClick={() => setActiveCategory('网络趣图')}
              title="网络趣图"
            >
            网络趣图
          </button>
          {Object.keys(EMOJI_CATEGORIES).map((category) => (
            <button
              key={category}
              className={`emoji-category-btn ${activeCategory === category ? 'active' : ''}`}
              onClick={() => setActiveCategory(category)}
              title={category}
            >
              {category}
            </button>
          ))}
        </div>
      </div>
      <div className="emoji-picker-body">
        {activeCategory === '网络趣图' ? (
          <div className="sticker-grid">
            {MEME_STICKERS.map((sticker, index) => {
              const isFailed = failedImages.has(sticker.url);
              const isLoading = loadingImage === sticker.url;
              
              return (
                <button
                  key={`sticker-${index}`}
                  className="sticker-item"
                  onClick={() => !isFailed && handleStickerClick(sticker)}
                  title={sticker.name}
                  disabled={isLoading || isFailed}
                >
                  {isLoading ? (
                    <div className="sticker-loading">加载中...</div>
                  ) : isFailed ? (
                    <div className="sticker-error">
                      <span className="sticker-error-icon">❌</span>
                      <span className="sticker-error-text">{sticker.name}</span>
                    </div>
                  ) : (
                    <img
                      src={sticker.url}
                      alt={sticker.name}
                      onError={(e) => {
                        console.error('表情包加载失败:', sticker.url);
                        setFailedImages((prev) => new Set(prev).add(sticker.url));
                        e.currentTarget.style.display = 'none';
                      }}
                      onLoad={() => {
                        // 图片加载成功，从失败列表中移除
                        setFailedImages((prev) => {
                          const newSet = new Set(prev);
                          newSet.delete(sticker.url);
                          return newSet;
                        });
                      }}
                      loading="lazy"
                      crossOrigin="anonymous"
                    />
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="emoji-grid">
            {EMOJI_CATEGORIES[activeCategory as keyof typeof EMOJI_CATEGORIES]?.map((emoji, index) => (
              <button
                key={`${activeCategory}-${index}`}
                className="emoji-item"
                onClick={() => handleEmojiClick(emoji)}
                title={emoji}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="emoji-picker-footer">
        <button className="emoji-picker-close" onClick={onClose}>
          关闭
        </button>
      </div>
    </div>
  );
};

export default EmojiPicker;

