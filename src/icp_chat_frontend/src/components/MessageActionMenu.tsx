import React from 'react';
import './MessageActionMenu.css';

interface MessageActionMenuProps {
  position: { x: number; y: number };
  onReply: () => void;
  onEmojiClick?: (emoji: string) => void;
  onClose: () => void;
}

const MessageActionMenu: React.FC<MessageActionMenuProps> = ({
  position,
  onReply,
  onEmojiClick,
  onClose,
}) => {
  const menuRef = React.useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = React.useState(position);

  // 调整位置，确保不超出视口
  React.useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let x = position.x;
      let y = position.y;
      x = x + rect.width / 2;
      y = y + rect.height / 2;
      // 确保不超出左边界
      if (x < 10) {
        x = 10;
      }

      // 如果超出右边界，向左调整
      if (x + rect.width > viewportWidth - 10) {
        x = viewportWidth - rect.width - 10;
      }

      // 如果超出上边界，向下调整
      if (y < 10) {
        y = 10;
      }

      // 如果超出下边界，向上调整
      if (y + rect.height > viewportHeight - 10) {
        y = viewportHeight - rect.height - 10;
      }

      setAdjustedPosition({ x, y });
    }
  }, [position]);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="message-action-menu"
      style={{
        left: `${adjustedPosition.x}px`,
        top: `${adjustedPosition.y}px`,
      }}
      onMouseEnter={(e) => {
        e.stopPropagation();
      }}
      onMouseLeave={(e) => {
        // 检查鼠标是否移到了消息框上
        const relatedTarget = e.relatedTarget as HTMLElement;
        if (relatedTarget && relatedTarget.closest('.message-body')) {
          return; // 如果移到了消息框上，不关闭
        }
        onClose();
      }}
    >
      <button 
        className="action-menu-item" 
        title="😂"
        onClick={() => {
          if (onEmojiClick) {
            onEmojiClick('😂');
          }
          onClose();
        }}
      >
        😂
      </button>
      <button 
        className="action-menu-item" 
        title="🤣"
        onClick={() => {
          if (onEmojiClick) {
            onEmojiClick('🤣');
          }
          onClose();
        }}
      >
        🤣
      </button>
      <button 
        className="action-menu-item" 
        title="😆"
        onClick={() => {
          if (onEmojiClick) {
            onEmojiClick('😆');
          }
          onClose();
        }}
      >
        😆
      </button>
      <button 
        className="action-menu-item" 
        title="🙂"
        onClick={() => {
          if (onEmojiClick) {
            onEmojiClick('🙂');
          }
          onClose();
        }}
      >
        🙂
      </button>
      {/* <button className="action-menu-item action-menu-comment" title="评论">
        <span className="comment-icon">💬</span>
        <span className="comment-plus">+</span>
      </button> */}
      <button className="action-menu-item action-menu-reply" onClick={onReply} title="回复">
        ↩️
      </button>
      {/* <button className="action-menu-item" title="更多">
        ⋮
      </button> */}
    </div>
  );
};

export default MessageActionMenu;
