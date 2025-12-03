import Nat "mo:base/Nat";
import Int "mo:base/Int";
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

// 去掉 persistent / transient，用普通 actor 即可
actor ICPChat {

  // 配置常量
  private let MAX_MESSAGE_LENGTH : Nat = 1000; // 单条消息最大长度
  private let MAX_MESSAGES : Nat = 10000;      // 最大消息数量
  private let DEFAULT_PAGE_SIZE : Nat = 50;    // 默认分页大小
  private let MAX_IMAGE_SIZE : Nat = 10_000_000; // 单张图片最大大小（10MB）
  private let MAX_IMAGES : Nat = 1000;         // 最大图片数量

  public type Message = {
    id : Nat;
    author : Text;      // 展示用昵称（发送时的快照）
    senderId : Text;    // 稳定的发送者ID（前端生成的 clientId）
    senderPrincipal : ?Principal; // 发送者的 Principal（如果是已登录用户），用于更新历史消息
    authorAvatar : ?Text; // 头像（发送时的快照，从 UserProfile.avatar 取）
    authorColor : ?Text;  // 昵称颜色（发送时的快照，从 UserProfile.color 取）
    text : Text;
    timestamp : Int;
    imageId : ?Nat; // 图片ID，如果有图片则不为null
    replyTo : ?Nat; // 回复的消息ID，如果有回复则不为null
  };

  public type SendMessageResult = Result.Result<Message, Text>;

  public type MessagePage = {
    messages : [Message];
    total : Nat;
    page : Nat;
    pageSize : Nat;
    totalPages : Nat;
  };

  // 用户资料类型（方案 B：基于 Principal 的个人信息配置）
  public type UserProfile = {
    nickname : Text;
    avatar : ?Text; // 头像URL 或 标识
    color : ?Text;  // 主题色 / 昵称颜色
    bio : ?Text;    // 个性签名
  };

  // 持久化状态用 stable 即可
  stable var messages : [Message] = [];
  stable var nextId : Nat = 0;
  stable var nextImageId : Nat = 0;
  stable var nextUploadId : Nat = 0;
  
  // 图片存储：使用 HashMap 存储图片数据
  // 注意：HashMap 不能直接 stable，需要序列化/反序列化
  var images : HashMap.HashMap<Nat, Blob> = HashMap.HashMap<Nat, Blob>(0, Nat.equal, Hash.hash);
  
  type UploadSession = {
    buffer : Buffer.Buffer<Nat8>;
    var receivedSize : Nat;
    totalSize : Nat;
    mimeType : Text;
  };

  // 主网 ICP Ledger canister（余额、转账等）
  type LedgerService = actor {
    icrc1_balance_of : shared { owner : Principal; subaccount : ?Blob } -> async Nat;
  };

  // 获取 Ledger canister 的 actor 引用
  func ledger() : LedgerService {
    // 这里直接写主网 Ledger 的 canister id
    actor ("ryjl3-tyaaa-aaaaa-aaaba-cai");
  };

  // 查询当前 caller 的 ICP 余额（单位：e8s）
  public shared ({ caller }) func getIcpBalance() : async Nat {
    let account = {
      owner = caller;
      subaccount = null; // 默认子账户 0
    };

    // 这里用 ledger() 拿到远程 actor，再调用 icrc1_balance_of
    await ledger().icrc1_balance_of(account)
  };

  // ========== ICP 链上交易历史（预留接口）==========

  // 交易方向（相对于当前 caller）
  public type IcpTxDirection = {
    #send;
    #receive;
  };

  // 精简后的交易记录结构，供前端展示使用
  public type IcpTxRecord = {
    index : Nat;          // 交易在账本中的索引（如果可用）
    from : Text;          // 发送方地址（Principal 或 Account 文本）
    to : Text;            // 接收方地址
    amount : Nat;         // 金额（单位：e8s）
    timestamp : Int;      // 时间戳（纳秒）
    memo : ?Text;         // 备注（如果有的话，做简化后的文本表达）
    direction : IcpTxDirection; // 相对当前 caller 是转出还是转入
  };

  // 分页返回结构，支持前端“加载更多”
  public type IcpTxHistoryPage = {
    txs : [IcpTxRecord];
    nextCursor : ?Nat;
  };

  // 预留：获取当前 caller 的 ICP 交易历史（完整链上记录，分页）
  //
  // 说明：
  // - cursor: 上一页返回的 nextCursor，首次调用传 null
  // - limit: 期望返回的最大条数，后端可根据需要做上限裁剪
  //
  // 当前版本尚未接入 Ledger Index / ICRC-3，只返回空结果，主要用于
  // 先打通前后端类型和调用链，后续只需在这里补链上查询实现。
  public shared ({ caller }) func getIcpTxHistory(cursor : ?Nat, limit : Nat) : async IcpTxHistoryPage {
    ignore caller;

    let _ = cursor;
    let _ = limit;

    {
      txs = [];
      nextCursor = null;
    };
  };

  private func newUploadSession(totalSize : Nat, mimeType : Text) : UploadSession {
    {
      buffer = Buffer.Buffer<Nat8>(Nat.min(totalSize, 1024));
      var receivedSize = 0;
      totalSize = totalSize;
      mimeType = mimeType;
    };
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
    // 注意：messages 是 stable var，会自动持久化，不需要手动处理
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

  // 验证消息文本（这里简单用非空 + 长度限制，避免 trim 的版本差异问题）
  private func validateMessage(text : Text, imageId : ?Nat) : Result.Result<Text, Text> {
    // 如果既没有文本也没有图片，则返回错误
    if (Text.size(text) == 0 and imageId == null) {
      return #err("消息内容不能为空");
    };
    if (Text.size(text) > MAX_MESSAGE_LENGTH) {
      return #err("消息长度不能超过 " # Nat.toText(MAX_MESSAGE_LENGTH) # " 个字符");
    };
    #ok(text)
  };
  
  // 验证图片大小
  private func validateImage(blob : Blob) : Result.Result<Blob, Text> {
    let bytes = Blob.toArray(blob);
    let size = bytes.size();
    if (size == 0) {
      return #err("图片不能为空");
    };
    if (size > MAX_IMAGE_SIZE) {
      return #err("图片大小不能超过 " # Nat.toText(MAX_IMAGE_SIZE / 1_000_000) # "MB");
    };
    #ok(blob)
  };
  
  // 清理旧图片（当超过上限时）
  private func cleanupOldImages() {
    let count = images.size();
    if (count >= MAX_IMAGES) {
      // 删除最旧的图片（这里简化处理，删除前100张）
      let deleteCount : Nat = 100;
      var deleted : Nat = 0;
      var keysToDelete : [Nat] = [];
      for ((id, _) in images.entries()) {
        if (deleted < deleteCount) {
          keysToDelete := Array.append(keysToDelete, [id]);
          deleted += 1;
        };
      };
      for (id in keysToDelete.vals()) {
        images.delete(id);
      };
    };
  };

  private func storeValidatedImage(validBlob : Blob) : Nat {
    cleanupOldImages();
    let imageId = nextImageId;
    images.put(imageId, validBlob);
    nextImageId += 1;
    imageId
  };

  // 清理旧消息（当超过上限时）
  private func cleanupOldMessages() {
    let len = messages.size();
    if (len >= MAX_MESSAGES) {
      // 保留最新的 MAX_MESSAGES - 1000 条消息，删除最旧的 1000 条
      let deleteCount : Nat = 1000;
      if (MAX_MESSAGES >= deleteCount and len >= deleteCount) {
        let keepCount = MAX_MESSAGES - deleteCount;
        if (len > keepCount) {
          let startIdx = len - keepCount;
          messages := Array.subArray<Message>(messages, startIdx, keepCount);
        };
      };
    };
  };

  // 上传图片
  public shared ({ caller }) func uploadImage(imageBlob : Blob) : async Result.Result<Nat, Text> {
    switch (validateImage(imageBlob)) {
      case (#err(msg)) {
        return #err(msg);
      };
      case (#ok(validBlob)) {
        let imageId = storeValidatedImage(validBlob);
        #ok(imageId)
      };
    };
  };

  public shared ({ caller }) func startImageUpload(totalSize : Nat, mimeType : Text) : async Result.Result<Nat, Text> {
    if (totalSize == 0) {
      return #err("图片不能为空");
    };
    if (totalSize > MAX_IMAGE_SIZE) {
      return #err("图片大小不能超过 " # Nat.toText(MAX_IMAGE_SIZE / 1_000_000) # "MB");
    };

    let uploadId = nextUploadId;
    nextUploadId += 1;
    uploadSessions.put(uploadId, newUploadSession(totalSize, mimeType));
    #ok(uploadId)
  };

  public shared ({ caller }) func uploadImageChunk(uploadId : Nat, chunk : [Nat8], isFinal : Bool) : async Result.Result<?Nat, Text> {
    switch (uploadSessions.get(uploadId)) {
      case null {
        return #err("上传会话不存在或已完成");
      };
      case (?session) {
        if (chunk.size() > 0) {
          for (byte in chunk.vals()) {
            session.buffer.add(byte);
          };
          session.receivedSize += chunk.size();
        };

        if (session.receivedSize > MAX_IMAGE_SIZE) {
          uploadSessions.delete(uploadId);
          return #err("图片大小超过限制");
        };

        if (isFinal) {
          uploadSessions.delete(uploadId);
          if (session.buffer.size() == 0) {
            return #err("图片数据为空");
          };

          let bytesArray = Buffer.toArray(session.buffer);
          let finalBlob = Blob.fromArray(bytesArray);
          switch (validateImage(finalBlob)) {
            case (#err(msg)) {
              return #err(msg);
            };
            case (#ok(validBlob)) {
              let imageId = storeValidatedImage(validBlob);
              return #ok(?imageId);
            };
          };
        } else {
          return #ok(null);
        };
      };
    };
  };
  
  // 获取图片
  public query func getImage(imageId : Nat) : async ?Blob {
    images.get(imageId)
  };
  
  // 发送消息（带验证）
  public shared ({ caller }) func sendMessage(text : Text, imageId : ?Nat, senderId : Text, replyTo : ?Nat) : async SendMessageResult {
    // 如果指定了图片ID，验证图片是否存在
    switch (imageId) {
      case (?id) {
        switch (images.get(id)) {
          case null {
            return #err("图片不存在");
          };
          case (_) {};
        };
      };
      case null {};
    };
    
    // 如果指定了回复的消息ID，验证消息是否存在
    switch (replyTo) {
      case (?replyId) {
        var found : Bool = false;
        label search for (msg in messages.vals()) {
          if (msg.id == replyId) {
            found := true;
            break search;
          };
        };
        if (not found) {
          return #err("回复的消息不存在");
        };
      };
      case null {};
    };
    
    switch (validateMessage(text, imageId)) {
      case (#err(msg)) {
        return #err(msg);
      };
      case (#ok(validText)) {
        // 从 UserProfile 获取昵称、头像、颜色（发送时的快照）
        let (author, authorAvatar, authorColor) =
          switch (userProfiles.get(caller)) {
            case (?profile) {
              // 使用用户配置的昵称、头像、颜色
              (profile.nickname, profile.avatar, profile.color);
            };
            case (null) {
              // 没有配置 Profile，昵称回退到默认规则，头像和颜色为 null
              let defaultAuthor =
                if (Principal.isAnonymous(caller)) {
                  "游客";
                } else {
                  Principal.toText(caller);
                };
              (defaultAuthor, null, null);
            };
          };

        // 如果不是匿名用户，存储 Principal，用于后续更新历史消息
        let senderPrincipalOpt : ?Principal = 
          if (Principal.isAnonymous(caller)) {
            null;
          } else {
            ?caller;
          };

        let msg : Message = {
          id = nextId;
          author = author;
          senderId = senderId;
          senderPrincipal = senderPrincipalOpt;
          authorAvatar = authorAvatar;
          authorColor = authorColor;
          text = validText;
          timestamp = Time.now();
          imageId = imageId;
          replyTo = replyTo;
        };

        // 清理旧消息（如果需要）
        cleanupOldMessages();

        messages := Array.append(messages, [msg]);
        nextId += 1;

        #ok(msg)
      };
    };
  };

  // 获取最近 n 条消息
  public query func getLastMessages(n : Nat) : async [Message] {
    let len = messages.size();
    let count = if (n == 0) { DEFAULT_PAGE_SIZE } else { Nat.min(n, len) };
    if (count >= len) {
      messages
    } else {
      Array.subArray<Message>(messages, len - count, count)
    }
  };

  // 获取所有消息
  public query func getAllMessages() : async [Message] {
    messages
  };

  // 获取消息总数
  public query func getMessageCount() : async Nat {
    messages.size()
  };

  // 分页获取消息（从最新到最旧）
  public query func getMessagesPage(page : Nat, pageSize : Nat) : async MessagePage {
    let total = messages.size();
    let size = if (pageSize == 0) { DEFAULT_PAGE_SIZE } else { Nat.min(pageSize, 100) }; // 限制每页最多100条
    
    let totalPages =
      if (total == 0 or size == 0) {
        0
      } else {
        let pages = total / size;
        if (total % size == 0) { pages } else { pages + 1 };
      };

    let currentPage = if (page == 0) { 1 } else { page };
    
    if (total == 0) {
      return {
        messages = [];
        total = 0;
        page = currentPage;
        pageSize = size;
        totalPages = 0;
      };
    };

    // 页码超出范围
    if (currentPage > totalPages or currentPage == 0) {
      return {
        messages = [];
        total = total;
        page = currentPage;
        pageSize = size;
        totalPages = totalPages;
      };
    };

    let fromEnd =
      if (currentPage <= 1) {
        0
      } else {
        (currentPage - 1) * size;
      };
    
    let startIdx =
      if (fromEnd >= total) {
        0
      } else {
        let endPos = fromEnd + size;
        if (total >= endPos) {
          total - endPos
        } else {
          0
        };
      };

    let actualStart = startIdx;
    let remaining =
      if (total > actualStart) {
        total - actualStart
      } else {
        0
      };
    let actualCount = Nat.min(size, remaining);
    
    let pageMessages =
      if (actualCount == 0) {
        []
      } else {
        Array.subArray<Message>(messages, actualStart, actualCount)
      };

    {
      messages = pageMessages;
      total = total;
      page = currentPage;
      pageSize = size;
      totalPages = totalPages;
    }
  };

  // 根据 ID 获取消息
  public query func getMessageById(id : Nat) : async ?Message {
    Array.find<Message>(messages, func(msg : Message) : Bool { msg.id == id })
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
    cleanupOldMessages();
    
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

}
