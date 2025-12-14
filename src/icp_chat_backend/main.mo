import Nat "mo:base/Nat";
import Nat64 "mo:base/Nat64";
import Int "mo:base/Int";
import Int64 "mo:base/Int64";
import Text "mo:base/Text";
import Time "mo:base/Time";
import Array "mo:base/Array";
import Principal "mo:base/Principal";
import Result "mo:base/Result";
import HashMap "mo:base/HashMap";
import Blob "mo:base/Blob";
import Hash "mo:base/Hash";
import Buffer "mo:base/Buffer";
import Nat8 "mo:base/Nat8";
import Types "./Types";
import Wallet "./Wallet";
import Chat "./Chat";
import Image "./Image";
import PrivateChat "./PrivateChat";

// 去掉 persistent / transient，用普通 actor 即可
actor ICPChat {

  // 配置常量
  private let MAX_MESSAGE_LENGTH : Nat = 1000; // 单条消息最大长度
  private let MAX_MESSAGES : Nat = 10000;      // 最大消息数量
  private let DEFAULT_PAGE_SIZE : Nat = 50;    // 默认分页大小
  private let MAX_IMAGE_SIZE : Nat = 10_000_000; // 单张图片最大大小（10MB）
  private let MAX_IMAGES : Nat = 1000;         // 最大图片数量

  // 类型别名，统一转发到 `Types` 模块，保证 Candid 接口保持不变
  public type Message = Types.Message;
  public type SendMessageResult = Result.Result<Message, Text>;
  public type MessagePage = Types.MessagePage;

  // 用户资料类型（方案 B：基于 Principal 的个人信息配置）
  public type UserProfile = Types.UserProfile;

  // 私聊相关类型
  public type PrivateMessage = Types.PrivateMessage;
  public type PrivateChatSession = Types.PrivateChatSession;
  public type PrivateMessagePage = Types.PrivateMessagePage;
  public type SendPrivateMessageResult = Result.Result<PrivateMessage, Text>;

  // 持久化状态用 stable 即可
  stable var messages : [Message] = [];
  stable var nextId : Nat = 0;
  stable var nextImageId : Nat = 0;
  stable var nextUploadId : Nat = 0;
  
  // 私聊消息存储
  stable var privateMessages : [PrivateMessage] = [];
  stable var nextPrivateMessageId : Nat = 0;
  
  // 图片存储：使用 HashMap 存储图片数据
  // 注意：HashMap 不能直接 stable，需要序列化/反序列化
  var images : HashMap.HashMap<Nat, Blob> = HashMap.HashMap<Nat, Blob>(0, Nat.equal, Hash.hash);
  
  type UploadSession = Types.UploadSession;

  // ========== ICP 钱包相关，对外接口 ==========

  // 查询当前 caller 的 ICP 余额（单位：e8s）
  public shared ({ caller }) func getIcpBalance() : async Nat {
    await Wallet.getIcpBalance(caller)
  };

  // 交易相关类型同样从 Types 中导出，便于复用
  public type IcpTxDirection = Types.IcpTxDirection;
  public type IcpTxRecord = Types.IcpTxRecord;
  public type IcpTxHistoryPage = Types.IcpTxHistoryPage;

  // 获取当前 caller 的 ICP 交易历史（完整链上记录，分页）
  //
  // 说明：
  // - cursor: 上一页返回的 nextCursor（作为 start 参数），首次调用传 null
  // - limit: 期望返回的最大条数，后端限制最多 100 条
  public shared ({ caller }) func getIcpTxHistory(cursor : ?Nat, limit : Nat) : async IcpTxHistoryPage {
    await Wallet.getIcpTxHistory(caller, cursor, limit)
  };

  var uploadSessions : HashMap.HashMap<Nat, UploadSession> = HashMap.HashMap<Nat, UploadSession>(0, Nat.equal, Hash.hash);
  
  // 将 HashMap 转换为数组用于序列化
  private func imagesToArray() : [(Nat, Blob)] {
    var arr : [(Nat, Blob)] = [];
    for ((id, blob) in images.entries()) {
      arr := Array.append(arr, [(id, blob)]);
    };
    arr
  };
  
  // 从数组恢复 HashMap
  private func imagesFromArray(arr : [(Nat, Blob)]) {
    images := HashMap.HashMap<Nat, Blob>(0, Nat.equal, Hash.hash);
    for ((id, blob) in arr.vals()) {
      images.put(id, blob);
    };
  };
  
  // Stable 存储图片数组
  stable var imagesStable : [(Nat, Blob)] = [];
  
  // 系统升级时保存数据
  system func preupgrade() {
    // 保存所有需要持久化的数据
    imagesStable := imagesToArray();
    userKeysStable := userKeysToArray();
    groupKeysStable := groupKeysToArray();
    userProfilesStable := userProfilesToArray();
    // 注意：messages 和 privateMessages 是 stable var，会自动持久化，不需要手动处理
  };
  
  // 系统升级时恢复数据
  system func postupgrade() {
    // 恢复图片数据
    imagesFromArray(imagesStable);
    imagesStable := [];
    
    // 恢复用户密钥和群组密钥（如果存在）
    if (userKeysStable.size() > 0) {
      userKeysFromArray(userKeysStable);
      userKeysStable := [];
    };
    if (groupKeysStable.size() > 0) {
      groupKeysFromArray(groupKeysStable);
      groupKeysStable := [];
    };
    
    // 恢复用户资料
    if (userProfilesStable.size() > 0) {
      userProfilesFromArray(userProfilesStable);
      userProfilesStable := [];
    };
    
    // 注意：messages 是 stable var，会自动恢复，不需要手动处理
  };

  // 上传图片
  public shared ({ caller }) func uploadImage(imageBlob : Blob) : async Result.Result<Nat, Text> {
    ignore caller;
    switch (Image.uploadImage(imageBlob, images, nextImageId, MAX_IMAGE_SIZE, MAX_IMAGES)) {
      case (#err(msg)) { #err(msg) };
      case (#ok(state)) {
        nextImageId := state.nextImageId;
        #ok(state.imageId);
      };
    }
  };

  public shared ({ caller }) func startImageUpload(totalSize : Nat, mimeType : Text) : async Result.Result<Nat, Text> {
    ignore caller;
    switch (Image.startImageUpload(totalSize, mimeType, uploadSessions, nextUploadId, MAX_IMAGE_SIZE)) {
      case (#err(msg)) { #err(msg) };
      case (#ok(state)) {
        nextUploadId := state.nextUploadId;
        #ok(state.uploadId);
      };
    }
  };

  public shared ({ caller }) func uploadImageChunk(uploadId : Nat, chunk : [Nat8], isFinal : Bool) : async Result.Result<?Nat, Text> {
    ignore caller;
    switch (Image.uploadImageChunk(
      uploadId,
      chunk,
      isFinal,
      uploadSessions,
      images,
      nextImageId,
      MAX_IMAGE_SIZE,
      MAX_IMAGES,
    )) {
      case (#err(msg)) { #err(msg) };
      case (#ok(state)) {
        nextImageId := state.nextImageId;
        #ok(state.imageId);
      };
    }
  };
  
  // 获取图片
  public query func getImage(imageId : Nat) : async ?Blob {
    images.get(imageId)
  };
  
  // 发送消息（带验证）
  public shared ({ caller }) func sendMessage(text : Text, imageId : ?Nat, senderId : Text, replyTo : ?Nat) : async SendMessageResult {
    switch (Chat.sendMessage(
      caller,
      text,
      imageId,
      senderId,
      replyTo,
      messages,
      images,
      userProfiles,
      nextId,
      MAX_MESSAGE_LENGTH,
      MAX_MESSAGES,
    )) {
      case (#err(msg)) {
        #err(msg);
      };
      case (#ok(state)) {
        messages := state.messages;
        nextId := state.nextId;
        #ok(state.msg);
      };
    };
  };

  // 获取最近 n 条消息
  public query func getLastMessages(n : Nat) : async [Message] {
    Chat.getLastMessages(messages, n, DEFAULT_PAGE_SIZE)
  };

  // 获取所有消息
  public query func getAllMessages() : async [Message] {
    Chat.getAllMessages(messages)
  };

  // 获取消息总数
  public query func getMessageCount() : async Nat {
    Chat.getMessageCount(messages)
  };

  // 分页获取消息（从最新到最旧）
  public query func getMessagesPage(page : Nat, pageSize : Nat) : async MessagePage {
    Chat.getMessagesPage(messages, page, pageSize, DEFAULT_PAGE_SIZE)
  };

  // 根据 ID 获取消息
  public query func getMessageById(id : Nat) : async ?Message {
    Chat.getMessageById(messages, id)
  };

  // 清空所有消息（管理员功能，可根据需要添加权限检查）
  public shared ({ caller }) func clearAllMessages() : async Bool {
    // 这里暂时没有做权限控制
    ignore caller;
    messages := [];
    nextId := 0;
    true
  };

  // ========== 数据备份和恢复功能 ==========
  
  // 导出所有数据（用于备份）
  public query func exportAllData() : async {
    messages : [Message];
    nextId : Nat;
    nextImageId : Nat;
    userProfiles : [(Principal, UserProfile)];
    messageCount : Nat;
    profileCount : Nat;
  } {
    {
      messages = messages;
      nextId = nextId;
      nextImageId = nextImageId;
      userProfiles = userProfilesToArray();
      messageCount = messages.size();
      profileCount = userProfiles.size();
    }
  };
  
  // 检查数据完整性
  public query func checkDataIntegrity() : async {
    messageCount : Nat;
    nextId : Nat;
    isConsistent : Bool;
    hasData : Bool;
  } {
    let count = messages.size();
    let consistent = nextId >= count; // nextId 应该 >= 消息数量
    {
      messageCount = count;
      nextId = nextId;
      isConsistent = consistent;
      hasData = count > 0;
    }
  };
  
  // 导入消息数据（用于恢复）- 合并模式
  public shared ({ caller }) func importMessages(importedMessages : [Message], importedNextId : Nat) : async Result.Result<Bool, Text> {
    // 验证数据
    if (importedMessages.size() > MAX_MESSAGES) {
      return #err("导入的消息数量超过最大限制");
    };
    
    // 合并消息（保留现有消息，添加新消息）
    // 如果 nextId 小于导入的 nextId，更新 nextId
    if (importedNextId > nextId) {
      nextId := importedNextId;
    };
    
    // 合并消息数组（去重，基于消息 ID）
    var existingIds : HashMap.HashMap<Nat, Bool> = HashMap.HashMap<Nat, Bool>(0, Nat.equal, Hash.hash);
    for (msg in messages.vals()) {
      existingIds.put(msg.id, true);
    };
    
    var newMessages : [Message] = [];
    for (msg in importedMessages.vals()) {
      switch (existingIds.get(msg.id)) {
        case (null) {
          // 新消息，添加
          newMessages := Array.append(newMessages, [msg]);
          existingIds.put(msg.id, true);
        };
        case (_) {
          // 已存在，跳过
        };
      };
    };
    
    // 合并到现有消息
    messages := Array.append(messages, newMessages);
    
    // 如果消息数量超过限制，清理旧消息
    messages := Chat.cleanupOldMessages(messages, MAX_MESSAGES);
    
    #ok(true)
  };
  
  // 完全替换消息数据（谨慎使用！）
  public shared ({ caller }) func replaceAllMessages(newMessages : [Message], newNextId : Nat) : async Result.Result<Bool, Text> {
    // 验证数据
    if (newMessages.size() > MAX_MESSAGES) {
      return #err("消息数量超过最大限制");
    };
    
    // 完全替换
    messages := newMessages;
    nextId := newNextId;
    
    #ok(true)
  };
  
  // 获取数据统计信息
  public query func getDataStats() : async {
    messageCount : Nat;
    nextId : Nat;
    nextImageId : Nat;
    profileCount : Nat;
    imageCount : Nat;
  } {
    {
      messageCount = messages.size();
      nextId = nextId;
      nextImageId = nextImageId;
      profileCount = userProfiles.size();
      imageCount = images.size();
    }
  };

  // ========== 密钥同步相关功能 ==========
  
  // 用户密钥存储：Principal -> 加密后的密钥（Base64）
  // 注意：密钥应该用用户的主密钥加密后再存储，这里简化处理
  var userKeys : HashMap.HashMap<Principal, Text> = HashMap.HashMap<Principal, Text>(0, Principal.equal, Principal.hash);
  
  // 将 HashMap 转换为数组用于序列化
  private func userKeysToArray() : [(Principal, Text)] {
    var arr : [(Principal, Text)] = [];
    for ((principal, key) in userKeys.entries()) {
      arr := Array.append(arr, [(principal, key)]);
    };
    arr
  };
  
  // 从数组恢复 HashMap
  private func userKeysFromArray(arr : [(Principal, Text)]) {
    userKeys := HashMap.HashMap<Principal, Text>(0, Principal.equal, Principal.hash);
    for ((principal, key) in arr.vals()) {
      userKeys.put(principal, key);
    };
  };
  
  // Stable 存储用户密钥数组
  stable var userKeysStable : [(Principal, Text)] = [];

  // ========== 用户资料（个人信息配置）相关 ==========

  // 用户资料存储：Principal -> UserProfile
  var userProfiles : HashMap.HashMap<Principal, UserProfile> = HashMap.HashMap<Principal, UserProfile>(0, Principal.equal, Principal.hash);

  // 将用户资料 HashMap 转换为数组用于序列化
  private func userProfilesToArray() : [(Principal, UserProfile)] {
    var arr : [(Principal, UserProfile)] = [];
    for ((principal, profile) in userProfiles.entries()) {
      arr := Array.append(arr, [(principal, profile)]);
    };
    arr
  };

  // 从数组恢复用户资料 HashMap
  private func userProfilesFromArray(arr : [(Principal, UserProfile)]) {
    userProfiles := HashMap.HashMap<Principal, UserProfile>(0, Principal.equal, Principal.hash);
    for ((principal, profile) in arr.vals()) {
      userProfiles.put(principal, profile);
    };
  };

  // Stable 存储用户资料数组
  stable var userProfilesStable : [(Principal, UserProfile)] = [];
  

  // 保存用户加密密钥（用于跨设备同步）
  // 注意：实际应用中应该对密钥进行二次加密
  public shared ({ caller }) func saveEncryptionKey(encryptedKey : Text) : async Result.Result<Bool, Text> {
    if (Principal.isAnonymous(caller)) {
      return #err("匿名用户无法保存密钥");
    };
    
    // 验证密钥格式（简单检查）
    if (Text.size(encryptedKey) == 0 or Text.size(encryptedKey) > 10000) {
      return #err("密钥格式无效");
    };
    
    userKeys.put(caller, encryptedKey);
    #ok(true)
  };

  // 获取用户加密密钥
  public shared query ({ caller }) func getEncryptionKey() : async ?Text {
    if (Principal.isAnonymous(caller)) {
      return null;
    };
    userKeys.get(caller)
  };

  // 删除用户加密密钥
  public shared ({ caller }) func deleteEncryptionKey() : async Bool {
    if (Principal.isAnonymous(caller)) {
      return false;
    };
    userKeys.delete(caller);
    true
  };

  // ========== 群组密钥相关功能 ==========
  
  // 群组密钥存储：群组ID -> 加密后的密钥（Base64）
  // 群组ID 可以是 Principal 或其他标识符
  var groupKeys : HashMap.HashMap<Text, Text> = HashMap.HashMap<Text, Text>(0, Text.equal, Text.hash);
  
  // 将 HashMap 转换为数组用于序列化
  private func groupKeysToArray() : [(Text, Text)] {
    var arr : [(Text, Text)] = [];
    for ((groupId, key) in groupKeys.entries()) {
      arr := Array.append(arr, [(groupId, key)]);
    };
    arr
  };
  
  // 从数组恢复 HashMap
  private func groupKeysFromArray(arr : [(Text, Text)]) {
    groupKeys := HashMap.HashMap<Text, Text>(0, Text.equal, Text.hash);
    for ((groupId, key) in arr.vals()) {
      groupKeys.put(groupId, key);
    };
  };
  
  // Stable 存储群组密钥数组
  stable var groupKeysStable : [(Text, Text)] = [];
  
  // 更新系统升级函数以包含群组密钥
  // （preupgrade 和 postupgrade 已在上面更新）

  // 创建或更新群组密钥
  public shared ({ caller }) func setGroupKey(groupId : Text, encryptedKey : Text) : async Result.Result<Bool, Text> {
    if (Principal.isAnonymous(caller)) {
      return #err("匿名用户无法设置群组密钥");
    };
    
    // 验证密钥格式
    if (Text.size(encryptedKey) == 0 or Text.size(encryptedKey) > 10000) {
      return #err("密钥格式无效");
    };
    
    // 验证群组ID格式
    if (Text.size(groupId) == 0 or Text.size(groupId) > 200) {
      return #err("群组ID格式无效");
    };
    
    groupKeys.put(groupId, encryptedKey);
    #ok(true)
  };

  // 获取群组密钥
  public shared query ({ caller }) func getGroupKey(groupId : Text) : async ?Text {
    groupKeys.get(groupId)
  };

  // 删除群组密钥
  public shared ({ caller }) func deleteGroupKey(groupId : Text) : async Bool {
    if (Principal.isAnonymous(caller)) {
      return false;
    };
    groupKeys.delete(groupId);
    true
  };

  // ========== 用户资料（个人信息配置）API ==========

  // 保存/更新当前 Principal 的用户资料
  public shared ({ caller }) func saveUserProfile(profile : UserProfile) : async Result.Result<Bool, Text> {
    // 只允许已登录用户保存个人资料
    if (Principal.isAnonymous(caller)) {
      return #err("请先登录以保存个人资料");
    };

    // 简单校验：昵称不能为空且长度限制
    if (Text.size(profile.nickname) == 0) {
      return #err("昵称不能为空");
    };
    if (Text.size(profile.nickname) > 50) {
      return #err("昵称长度不能超过 50 个字符");
    };

    // 头像、颜色、签名增加简单长度限制，避免滥用
    switch (profile.avatar) {
      case (null) {};
      case (?url) {
        // 头像现在支持 data URL（base64），长度会比普通 URL 大很多，这里放宽限制
        if (Text.size(url) > 200_000) {
          return #err("头像数据过大");
        };
      };
    };

    switch (profile.color) {
      case (null) {};
      case (?c) {
        if (Text.size(c) > 50) {
          return #err("颜色字符串过长");
        };
      };
    };

    switch (profile.bio) {
      case (null) {};
      case (?b) {
        if (Text.size(b) > 200) {
          return #err("签名长度不能超过 200 个字符");
        };
      };
    };

    userProfiles.put(caller, profile);
    
    // 更新该用户发送的所有历史消息中的 author、authorAvatar、authorColor
    // 只更新已登录用户的消息（匿名用户没有 Principal，无法匹配）
    if (not Principal.isAnonymous(caller)) {
      var updatedCount : Nat = 0;
      messages := Array.tabulate<Message>(messages.size(), func(i : Nat) : Message {
        let msg = messages[i];
        switch (msg.senderPrincipal) {
          case (?principal) {
            // 如果消息的 senderPrincipal 匹配当前 caller，更新消息信息
            if (Principal.equal(principal, caller)) {
              updatedCount += 1;
              {
                id = msg.id;
                author = profile.nickname;
                senderId = msg.senderId;
                senderPrincipal = msg.senderPrincipal;
                authorAvatar = profile.avatar;
                authorColor = profile.color;
                text = msg.text;
                timestamp = msg.timestamp;
                imageId = msg.imageId;
                replyTo = msg.replyTo;
              }
            } else {
              msg
            }
          };
          case (null) {
            // 匿名用户的消息，不更新
            msg
          };
        }
      });
      // 注意：这里 updatedCount 只是用于调试，实际不需要返回
    };
    
    #ok(true)
  };

  // 获取当前 Principal 的用户资料
  public shared query ({ caller }) func getUserProfile() : async ?UserProfile {
    // 同 saveUserProfile 一致，这里也允许匿名查询自己的资料
    // 正式环境可根据需要重新启用匿名拦截
    // if (Principal.isAnonymous(caller)) {
    //   return null;
    // };
    userProfiles.get(caller)
  };

  // ========== 私聊相关 API ==========

  // 发送私聊消息
  public shared ({ caller }) func sendPrivateMessage(
    receiverPrincipal : Principal,
    text : Text,
    imageId : ?Nat,
    senderId : Text,
    replyTo : ?Nat,
  ) : async SendPrivateMessageResult {
    // 只允许已登录用户发送私聊消息
    if (Principal.isAnonymous(caller)) {
      return #err("请先登录以发送私聊消息");
    };

    switch (PrivateChat.sendPrivateMessage(
      caller,
      receiverPrincipal,
      text,
      imageId,
      senderId,
      replyTo,
      privateMessages,
      images,
      userProfiles,
      nextPrivateMessageId,
      MAX_MESSAGE_LENGTH,
      MAX_MESSAGES,
    )) {
      case (#err(msg)) {
        #err(msg);
      };
      case (#ok(state)) {
        privateMessages := state.messages;
        nextPrivateMessageId := state.nextId;
        #ok(state.msg);
      };
    };
  };

  // 获取私聊会话列表
  public shared query ({ caller }) func getPrivateChatSessions() : async [PrivateChatSession] {
    // 只允许已登录用户获取会话列表
    if (Principal.isAnonymous(caller)) {
      return [];
    };
    PrivateChat.getUserSessions(privateMessages, caller, userProfiles)
  };

  // 获取私聊会话的消息（最近n条）
  public shared query ({ caller }) func getLastPrivateMessages(
    otherPrincipal : Principal,
    n : Nat,
  ) : async [PrivateMessage] {
    if (Principal.isAnonymous(caller)) {
      return [];
    };
    let sessionId = PrivateChat.generateSessionId(caller, otherPrincipal);
    PrivateChat.getLastPrivateMessages(
      privateMessages,
      sessionId,
      caller,
      otherPrincipal,
      n,
      DEFAULT_PAGE_SIZE,
    )
  };

  // 分页获取私聊消息
  public shared query ({ caller }) func getPrivateMessagesPage(
    otherPrincipal : Principal,
    page : Nat,
    pageSize : Nat,
  ) : async PrivateMessagePage {
    if (Principal.isAnonymous(caller)) {
      return {
        messages = [];
        total = 0;
        page = 0;
        pageSize = 0;
        totalPages = 0;
      };
    };
    let sessionId = PrivateChat.generateSessionId(caller, otherPrincipal);
    PrivateChat.getPrivateMessagesPage(
      privateMessages,
      sessionId,
      caller,
      otherPrincipal,
      page,
      pageSize,
      DEFAULT_PAGE_SIZE,
    )
  };

  // 根据ID获取私聊消息
  public shared query ({ caller }) func getPrivateMessageById(id : Nat) : async ?PrivateMessage {
    PrivateChat.getPrivateMessageById(privateMessages, id, caller)
  };

}
