import Nat "mo:base/Nat";
import Int "mo:base/Int";
import Int64 "mo:base/Int64";
import Principal "mo:base/Principal";
import Blob "mo:base/Blob";
import Result "mo:base/Result";
import Buffer "mo:base/Buffer";
import Nat8 "mo:base/Nat8";

// 公共类型定义模块
// 将主 actor 中常用的类型集中在这里，便于复用与维护

module {
  // ========== 消息与分页相关 ==========

  public type Message = {
    id : Nat;
    author : Text;                 // 展示用昵称（发送时的快照）
    senderId : Text;               // 稳定的发送者ID（前端生成的 clientId）
    senderPrincipal : ?Principal;  // 发送者的 Principal（如果是已登录用户），用于更新历史消息
    authorAvatar : ?Text;          // 头像（发送时的快照，从 UserProfile.avatar 取）
    authorColor : ?Text;           // 昵称颜色（发送时的快照，从 UserProfile.color 取）
    text : Text;
    timestamp : Int;
    imageId : ?Nat;                // 图片ID，如果有图片则不为 null
    replyTo : ?Nat;                // 回复的消息ID，如果有回复则不为 null
  };

  public type SendMessageResult = Result.Result<Message, Text>;

  public type MessagePage = {
    messages : [Message];
    total : Nat;
    page : Nat;
    pageSize : Nat;
    totalPages : Nat;
  };

  // ========== 用户资料 ==========

  public type UserProfile = {
    nickname : Text;
    avatar : ?Text; // 头像 URL 或标识
    color : ?Text;  // 主题色 / 昵称颜色
    bio : ?Text;    // 个性签名
  };

  // ========== 上传会话 ==========

  public type UploadSession = {
    buffer : Buffer.Buffer<Nat8>;
    var receivedSize : Nat;
    totalSize : Nat;
    mimeType : Text;
  };

  // ========== ICP 链上交易相关 ==========

  // 交易方向（相对于当前 caller）
  public type IcpTxDirection = {
    #send;
    #receive;
  };

  // 精简后的交易记录结构，供前端展示使用
  public type IcpTxRecord = {
    index : Nat;             // 交易在账本中的索引（如果可用）
    from : Text;             // 发送方地址（Principal 或 Account 文本）
    to : Text;               // 接收方地址
    amount : Nat;            // 金额（单位：e8s）
    timestamp : Int;         // 时间戳（纳秒）
    memo : ?Text;            // 备注
    direction : IcpTxDirection; // 相对当前 caller 是转出还是转入
  };

  // 分页返回结构，支持前端“加载更多”
  public type IcpTxHistoryPage = {
    txs : [IcpTxRecord];
    nextCursor : ?Nat;
  };

  // ========== 私聊相关 ==========

  // 私聊消息（与群聊消息结构类似，但属于特定会话）
  public type PrivateMessage = {
    id : Nat;
    author : Text;                 // 展示用昵称（发送时的快照）
    senderId : Text;               // 稳定的发送者ID（前端生成的 clientId）
    senderPrincipal : ?Principal;  // 发送者的 Principal（如果是已登录用户）
    receiverPrincipal : ?Principal; // 接收者的 Principal（如果是已登录用户）
    authorAvatar : ?Text;          // 头像（发送时的快照）
    authorColor : ?Text;           // 昵称颜色（发送时的快照）
    text : Text;
    timestamp : Int;
    imageId : ?Nat;                // 图片ID，如果有图片则不为 null
    replyTo : ?Nat;                // 回复的消息ID，如果有回复则不为 null
  };

  // 私聊会话信息
  public type PrivateChatSession = {
    sessionId : Text;              // 会话ID（两个Principal的排序组合）
    otherPrincipal : Principal;    // 对方Principal
    otherNickname : ?Text;         // 对方昵称（快照）
    otherAvatar : ?Text;           // 对方头像（快照）
    lastMessage : ?PrivateMessage; // 最后一条消息
    lastMessageTime : Int;         // 最后消息时间
    unreadCount : Nat;             // 未读消息数（相对于当前用户）
  };

  // 私聊消息分页
  public type PrivateMessagePage = {
    messages : [PrivateMessage];
    total : Nat;
    page : Nat;
    pageSize : Nat;
    totalPages : Nat;
  };
}


