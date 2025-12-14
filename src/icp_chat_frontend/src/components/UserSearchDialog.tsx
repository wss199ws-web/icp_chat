import React, { useState } from 'react';
import { Principal } from '@dfinity/principal';
import './UserSearchDialog.css';

interface UserSearchDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSearch: (principal: string) => void;
}

const UserSearchDialog: React.FC<UserSearchDialogProps> = ({
  isOpen,
  onClose,
  onSearch,
}) => {
  const [uid, setUid] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  if (!isOpen) return null;

  const handleValidateAndSearch = async () => {
    const trimmedUid = uid.trim();
    if (!trimmedUid) {
      setError('请输入用户UID');
      return;
    }

    setIsValidating(true);
    setError(null);

    try {
      // 验证 Principal 格式
      Principal.fromText(trimmedUid);
      // 如果验证成功，调用搜索回调
      onSearch(trimmedUid);
      setUid('');
      setError(null);
    } catch (e) {
      setError('无效的UID格式，请输入有效的Principal字符串');
      console.error('[UserSearchDialog] Principal验证失败:', e);
    } finally {
      setIsValidating(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleValidateAndSearch();
    }
  };

  const handleClose = () => {
    setUid('');
    setError(null);
    onClose();
  };

  return (
    <div className="user-search-dialog-overlay" onClick={handleClose}>
      <div className="user-search-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="user-search-dialog-header">
          <h3>查找用户</h3>
          <button className="user-search-dialog-close" onClick={handleClose}>
            ×
          </button>
        </div>
        <div className="user-search-dialog-content">
          <div className="user-search-dialog-form">
            <label>
              <span>用户UID (Principal)</span>
              <input
                type="text"
                value={uid}
                onChange={(e) => {
                  setUid(e.target.value);
                  setError(null);
                }}
                onKeyPress={handleKeyPress}
                placeholder="例如: abcde-efghi-jklmn-opqrs-tuvwx-yz123-45678-9abcd"
                className={error ? 'error' : ''}
                autoFocus
              />
              {error && <div className="user-search-dialog-error">{error}</div>}
            </label>
            <div className="user-search-dialog-hint">
              <p>输入用户的Principal字符串（UID）来查找并开始私聊</p>
            </div>
          </div>
        </div>
        <div className="user-search-dialog-actions">
          <button
            className="user-search-dialog-button secondary"
            onClick={handleClose}
          >
            取消
          </button>
          <button
            className="user-search-dialog-button primary"
            onClick={handleValidateAndSearch}
            disabled={isValidating || !uid.trim()}
          >
            {isValidating ? '验证中...' : '查找并开始聊天'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserSearchDialog;
