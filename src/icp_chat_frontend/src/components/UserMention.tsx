import React from 'react';
import './UserMention.css';

export interface User {
  nickname: string;
  senderId: string;
  avatar?: string | null;
  color?: string | null;
}

interface UserMentionProps {
  users: User[];
  onSelect: (user: User) => void;
  onClose?: () => void;
  searchQuery?: string;
}

const UserMention: React.FC<UserMentionProps> = ({ users, onSelect, onClose, searchQuery = '' }) => {
  // 根据搜索关键词过滤用户
  const filteredUsers = users.filter((user) =>
    user.nickname.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (filteredUsers.length === 0) {
    return (
      <div className="user-mention">
        <div className="user-mention-empty">未找到匹配的用户</div>
      </div>
    );
  }

  return (
    <div className="user-mention">
      {filteredUsers.map((user) => (
        <button
          key={user.senderId}
          className="user-mention-item"
          onClick={() => {
            onSelect(user);
            onClose?.();
          }}
        >
          <div
            className="user-mention-avatar"
            style={{ backgroundColor: user.color || '#459cd1' }}
          >
            {user.avatar ? (
              <img src={user.avatar} alt={user.nickname} />
            ) : (
              <span>{user.nickname.charAt(0)}</span>
            )}
          </div>
          <div className="user-mention-info">
            <div className="user-mention-name">{user.nickname}</div>
          </div>
        </button>
      ))}
    </div>
  );
};

export default UserMention;

