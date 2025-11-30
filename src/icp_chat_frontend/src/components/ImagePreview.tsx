import React, { useEffect, useState, useRef } from 'react';
import './ImagePreview.css';

interface ImagePreviewProps {
  imageUrl: string;
  onClose: () => void;
}

const ImagePreview: React.FC<ImagePreviewProps> = ({ imageUrl, onClose }) => {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 重置缩放和位置
  const resetTransform = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  // 缩放
  const handleZoom = (delta: number) => {
    setScale((prev) => {
      const newScale = Math.max(0.5, Math.min(5, prev + delta));
      return newScale;
    });
  };

  // 鼠标滚轮缩放
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    handleZoom(delta);
  };

  // 开始拖拽
  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale > 1) {
      setIsDragging(true);
      setDragStart({
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      });
    }
  };

  // 拖拽中
  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && scale > 1) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  // 结束拖拽
  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // 双击重置
  const handleDoubleClick = () => {
    resetTransform();
  };

  // 点击背景关闭
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // 触摸事件处理（移动端）- 点击背景关闭
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    // 如果触摸的是背景层（不是图片或控制按钮），关闭预览
    const target = e.target as HTMLElement;
    if (
      target === e.currentTarget ||
      target.classList.contains('image-preview-overlay') ||
      (target.classList.contains('image-preview-container') && 
       !target.closest('.image-preview-content') &&
       !target.closest('.image-preview-controls') &&
       !target.closest('.image-preview-close'))
    ) {
      // 延迟关闭，避免与图片交互冲突
      setTimeout(() => {
        onClose();
      }, 100);
    }
  };

  // 键盘事件
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === '+' || e.key === '=') {
        handleZoom(0.1);
      } else if (e.key === '-') {
        handleZoom(-0.1);
      } else if (e.key === '0') {
        resetTransform();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // 阻止背景滚动（但只在预览打开时）
  useEffect(() => {
    // 保存原始值
    const savedOverflow = document.body.style.overflow || '';
    const savedPosition = document.body.style.position || '';
    const savedWidth = document.body.style.width || '';
    const savedTop = document.body.style.top || '';
    
    // 获取当前滚动位置（移动端需要）
    const scrollY = window.scrollY;
    
    // 设置样式阻止背景滚动
    document.body.style.overflow = 'hidden';
    
    // 移动端需要设置position来确保滚动被阻止
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      document.body.style.top = `-${scrollY}px`;
    }
    
    // 清理函数：恢复原始样式
    const cleanup = () => {
      document.body.style.overflow = savedOverflow;
      document.body.style.position = savedPosition;
      document.body.style.width = savedWidth;
      
      // 移动端恢复滚动位置
      if (isMobile) {
        document.body.style.top = savedTop;
        // 使用 requestAnimationFrame 确保 DOM 更新后再滚动
        requestAnimationFrame(() => {
          window.scrollTo(0, scrollY);
        });
      }
    };
    
    // 组件卸载时清理
    return cleanup;
  }, []);

  return (
    <div
      ref={containerRef}
      className="image-preview-overlay"
      onClick={handleBackdropClick}
      onTouchStart={handleTouchStart}
      onWheel={handleWheel}
    >
      <div className="image-preview-container">
        <button className="image-preview-close" onClick={onClose} title="关闭 (ESC)">
          ×
        </button>
        <div className="image-preview-controls">
          <button
            className="image-preview-control-btn"
            onClick={() => handleZoom(0.2)}
            title="放大 (+)"
          >
            +
          </button>
          <button
            className="image-preview-control-btn"
            onClick={() => handleZoom(-0.2)}
            title="缩小 (-)"
          >
            −
          </button>
          <button
            className="image-preview-control-btn"
            onClick={resetTransform}
            title="重置 (0)"
          >
            ↻
          </button>
          <span className="image-preview-scale">{(scale * 100).toFixed(0)}%</span>
        </div>
        <div
          className="image-preview-content"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onDoubleClick={handleDoubleClick}
          style={{
            cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
          }}
        >
          <img
            ref={imageRef}
            src={imageUrl}
            alt="预览"
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
              transition: isDragging ? 'none' : 'transform 0.2s ease-out',
            }}
            draggable={false}
          />
        </div>
      </div>
    </div>
  );
};

export default ImagePreview;

