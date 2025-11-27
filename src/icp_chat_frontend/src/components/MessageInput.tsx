import React, { useState, KeyboardEvent, ClipboardEvent, DragEvent, useRef } from 'react';
import './MessageInput.css';

interface MessageInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

// 图片压缩函数（支持自适应压缩直到符合长度限制）
const compressImage = (
  file: File,
  maxLength: number,
  maxWidth: number = 1920,
  maxHeight: number = 1920,
  initialQuality: number = 0.8
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // 递归压缩函数
        const tryCompress = (
          targetWidth: number,
          targetHeight: number,
          quality: number
        ): string | null => {
          const canvas = document.createElement('canvas');
          canvas.width = targetWidth;
          canvas.height = targetHeight;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('无法创建 canvas 上下文'));
            return null;
          }

          ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          
          // 检查长度（base64 前缀大约 23 个字符）
          const base64Length = dataUrl.length;
          if (base64Length <= maxLength) {
            return dataUrl;
          }

          return null;
        };

        // 计算初始尺寸
        let width = img.width;
        let height = img.height;

        // 计算压缩后的尺寸
        if (width > height) {
          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = (width * maxHeight) / height;
            height = maxHeight;
          }
        }

        // 尝试不同的压缩策略（更激进的压缩）
        const strategies = [
          { width, height, quality: initialQuality },
          { width, height, quality: 0.6 },
          { width: width * 0.8, height: height * 0.8, quality: 0.6 },
          { width: width * 0.7, height: height * 0.7, quality: 0.5 },
          { width: width * 0.6, height: height * 0.6, quality: 0.5 },
          { width: width * 0.5, height: height * 0.5, quality: 0.4 },
          { width: width * 0.4, height: height * 0.4, quality: 0.3 },
          { width: width * 0.3, height: height * 0.3, quality: 0.25 },
          { width: width * 0.25, height: height * 0.25, quality: 0.2 },
        ];

        for (const strategy of strategies) {
          const result = tryCompress(
            Math.round(strategy.width),
            Math.round(strategy.height),
            strategy.quality
          );
          if (result) {
            resolve(result);
            return;
          }
        }

        // 如果所有策略都失败，尝试更小的尺寸和更低的质量
        const minWidth = Math.max(150, Math.round(width * 0.2));
        const minHeight = Math.max(150, Math.round(height * 0.2));
        
        // 尝试更低的质量
        const finalStrategies = [
          { width: minWidth, height: minHeight, quality: 0.15 },
          { width: minWidth, height: minHeight, quality: 0.1 },
          { width: Math.max(100, Math.round(minWidth * 0.8)), height: Math.max(100, Math.round(minHeight * 0.8)), quality: 0.1 },
        ];

        for (const strategy of finalStrategies) {
          const result = tryCompress(strategy.width, strategy.height, strategy.quality);
          if (result) {
            resolve(result);
            return;
          }
        }
        
        // 如果仍然失败，返回错误
        reject(new Error('图片太大，即使压缩后也无法发送。建议使用小于 2MB 的图片。'));
      };
      img.onerror = () => reject(new Error('图片加载失败'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
};

const MessageInput: React.FC<MessageInputProps> = ({
  onSend,
  disabled = false,
  placeholder = '输入消息...',
}) => {
  const [text, setText] = useState('');
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const MAX_LENGTH = 5000; // 增加长度限制以支持图片
  const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

  const handleSend = () => {
    const trimmedText = text.trim();
    if (trimmedText && !disabled && !isProcessingImage) {
      onSend(trimmedText);
      setText('');
    }
  };

  const handleKeyPress = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // 处理图片文件
  const handleImageFile = async (file: File) => {
    if (disabled || isProcessingImage) return;

    // 检查文件类型
    if (!file.type.startsWith('image/')) {
      alert('请选择图片文件');
      return;
    }

    // 检查文件大小
    if (file.size > MAX_IMAGE_SIZE) {
      alert(`图片太大，最大支持 ${MAX_IMAGE_SIZE / 1024 / 1024}MB`);
      return;
    }

    setIsProcessingImage(true);

    try {
      // 计算可用于图片的最大长度（预留文本和标记的空间）
      const currentText = text.trim();
      const textPrefix = currentText ? `${currentText}\n[图片]` : '[图片]';
      const reservedLength = textPrefix.length;
      const maxImageLength = MAX_LENGTH - reservedLength;

      if (maxImageLength < 100) {
        alert('当前文本太长，无法添加图片。请先清空或缩短文本。');
        setIsProcessingImage(false);
        return;
      }

      // 压缩图片并转换为 base64（自适应压缩直到符合长度限制）
      const base64Image = await compressImage(file, maxImageLength);
      
      // 构建最终消息
      const imageText = `${textPrefix}${base64Image}`;
      
      // 再次检查总长度（应该不会超过，但为了安全）
      if (imageText.length > MAX_LENGTH) {
        alert('图片太大，即使压缩后也无法发送。请使用更小的图片或缩短文本。');
        setIsProcessingImage(false);
        return;
      }

      setText(imageText);
      
      // 自动发送图片消息
      setTimeout(() => {
        onSend(imageText);
        setText('');
        setIsProcessingImage(false);
      }, 100);
    } catch (error) {
      console.error('处理图片失败:', error);
      const errorMessage = error instanceof Error ? error.message : '处理图片失败，请重试';
      alert(errorMessage);
      setIsProcessingImage(false);
    }
  };

  // 处理文件选择
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleImageFile(file);
    }
    // 重置 input，允许重复选择同一文件
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 处理粘贴
  const handlePaste = async (e: ClipboardEvent<HTMLTextAreaElement>) => {
    if (disabled || isProcessingImage) return;

    const items = e.clipboardData.items;
    if (!items) return;

    // 检查是否有图片
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.indexOf('image') !== -1) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          await handleImageFile(file);
        }
        return;
      }
    }
  };

  // 处理文件拖拽
  const handleDrop = async (e: DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    if (disabled || isProcessingImage) return;

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      await handleImageFile(files[0]);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // 点击上传按钮
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const remainingChars = MAX_LENGTH - text.length;
  const isNearLimit = remainingChars < 100;

  return (
    <div className="message-input-container">
      <div className="input-wrapper">
        <div className="input-header">
          <textarea
            ref={textareaRef}
            className="message-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyPress={handleKeyPress}
            onPaste={handlePaste}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            placeholder={placeholder}
            disabled={disabled || isProcessingImage}
            rows={3}
            maxLength={MAX_LENGTH}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
        </div>
        <div className="input-footer">
          <div className="input-footer-left">
            <button
              className="upload-button"
              onClick={handleUploadClick}
              disabled={disabled || isProcessingImage}
              title="上传图片"
            >
              📷
            </button>
            {isProcessingImage && (
              <span className="processing-indicator">正在处理图片...</span>
            )}
            <span className={`char-count ${isNearLimit ? 'warning' : ''}`}>
              {remainingChars} / {MAX_LENGTH}
            </span>
          </div>
          <button
            className="send-button"
            onClick={handleSend}
            disabled={disabled || !text.trim() || isProcessingImage}
          >
            {isProcessingImage ? '处理中...' : '发送'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MessageInput;

