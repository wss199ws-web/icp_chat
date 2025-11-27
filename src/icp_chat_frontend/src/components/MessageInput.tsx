import React, { useState, KeyboardEvent, useRef, useEffect } from 'react';
import './MessageInput.css';
import { chatService } from '../services/chatService';

interface MessageInputProps {
  onSend: (text: string, imageId?: number | null) => void;
  disabled?: boolean;
  placeholder?: string;
}

const MessageInput: React.FC<MessageInputProps> = ({
  onSend,
  disabled = false,
  placeholder = '输入消息...',
}) => {
  const [text, setText] = useState('');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [detectedBase64, setDetectedBase64] = useState<{ dataUrl: string; mimeType: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const MAX_LENGTH = 1000;
  const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2MB

  // 检测文本中是否包含 base64 图片数据
  const detectBase64Image = (text: string): { dataUrl: string; mimeType: string } | null => {
    // 匹配 data:image/xxx;base64,xxxxx 格式
    const base64ImageRegex = /data:image\/([a-zA-Z]*);base64,([^"'\s]+)/;
    const match = text.match(base64ImageRegex);
    
    if (match) {
      return {
        dataUrl: match[0],
        mimeType: match[1] || 'jpeg'
      };
    }
    return null;
  };

  // 检测文本输入中的 base64 图片
  useEffect(() => {
    const base64Image = detectBase64Image(text);
    setDetectedBase64(base64Image);
  }, [text]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 验证文件类型
    if (!file.type.startsWith('image/')) {
      alert('请选择图片文件');
      return;
    }

    // 验证文件大小
    if (file.size > MAX_IMAGE_SIZE) {
      alert(`图片大小不能超过 ${MAX_IMAGE_SIZE / 1024 / 1024}MB`);
      return;
    }

    setSelectedImage(file);
    // 创建预览
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 将 base64 数据 URL 转换为 Blob
  const dataURLtoBlob = (dataURL: string): Blob | null => {
    try {
      const arr = dataURL.split(',');
      const mimeMatch = arr[0].match(/:(.*?);/);
      const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      return new Blob([u8arr], { type: mime });
    } catch (error) {
      console.error('转换 base64 失败:', error);
      return null;
    }
  };

  const handleSend = async () => {
    if (disabled) return;

    let trimmedText = text.trim();
    let imageId: number | null = null;

    // 检测文本中是否包含 base64 图片数据
    const base64Image = detectBase64Image(trimmedText);
    if (base64Image) {
      // 将 base64 转换为 Blob 并上传
      const blob = dataURLtoBlob(base64Image.dataUrl);
      if (blob) {
        setUploading(true);
        try {
          const result = await chatService.uploadImage(blob);
          if (result.success && result.imageId !== undefined) {
            imageId = result.imageId;
            // 从文本中移除 base64 数据，只保留其他文本
            trimmedText = trimmedText.replace(/data:image\/[^;]+;base64,[^"'\s]+/g, '').trim();
          } else {
            alert(result.error || '图片上传失败');
            setUploading(false);
            return;
          }
        } catch (error) {
          alert('图片上传失败，请重试');
          setUploading(false);
          return;
        }
        setUploading(false);
      }
    }

    // 如果有选中的图片，先上传
    if (selectedImage) {
      setUploading(true);
      try {
        const result = await chatService.uploadImage(selectedImage);
        if (result.success && result.imageId !== undefined) {
          imageId = result.imageId;
        } else {
          alert(result.error || '图片上传失败');
          setUploading(false);
          return;
        }
      } catch (error) {
        alert('图片上传失败，请重试');
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    // 如果既没有文本也没有图片，不发送
    if (!trimmedText && !imageId) {
      return;
    }

    onSend(trimmedText, imageId);
    setText('');
    setSelectedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleKeyPress = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const remainingChars = MAX_LENGTH - text.length;
  const isNearLimit = remainingChars < 100;

  return (
    <div className="message-input-container">
      <div className="input-wrapper">
        {imagePreview && (
          <div className="image-preview">
            <img src={imagePreview} alt="预览" />
            <button className="remove-image-btn" onClick={removeImage} disabled={disabled || uploading}>
              ×
            </button>
          </div>
        )}
        {detectedBase64 && !imagePreview && (
          <div className="image-preview base64-detected">
            <img src={detectedBase64.dataUrl} alt="检测到的图片" />
            <div className="base64-hint">检测到图片，发送时将自动上传</div>
          </div>
        )}
        <textarea
          className="message-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder={placeholder}
          disabled={disabled || uploading}
          rows={3}
          maxLength={MAX_LENGTH}
        />
        <div className="input-footer">
          <div className="input-actions">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              disabled={disabled || uploading}
              style={{ display: 'none' }}
              id="image-input"
            />
            <label htmlFor="image-input" className="image-upload-btn" title="上传图片">
              📷
            </label>
            <span className={`char-count ${isNearLimit ? 'warning' : ''}`}>
              {remainingChars} / {MAX_LENGTH}
            </span>
          </div>
          <button
            className="send-button"
            onClick={handleSend}
            disabled={disabled || uploading || (!text.trim() && !selectedImage)}
          >
            {uploading ? '上传中...' : '发送'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MessageInput;

