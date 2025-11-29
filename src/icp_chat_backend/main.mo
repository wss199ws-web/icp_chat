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
    author : Text;
    text : Text;
    timestamp : Int;
    imageId : ?Nat; // 图片ID，如果有图片则不为null
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
    imagesStable := imagesToArray();
    userKeysStable := userKeysToArray();
    groupKeysStable := groupKeysToArray();
    userProfilesStable := userProfilesToArray();
  };
  
  // 系统升级时恢复数据
  system func postupgrade() {
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
  public shared ({ caller }) func sendMessage(text : Text, imageId : ?Nat) : async SendMessageResult {
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
    
    switch (validateMessage(text, imageId)) {
      case (#err(msg)) {
        return #err(msg);
      };
      case (#ok(validText)) {
        // 优先使用用户自己的昵称；如果没有配置，再回退到默认规则
        let author =
          switch (userProfiles.get(caller)) {
            case (?profile) {
              // 使用用户配置的昵称
              profile.nickname;
            };
            case (null) {
              if (Principal.isAnonymous(caller)) {
                "匿名";
              } else {
                Principal.toText(caller);
              };
            };
          };

        let msg : Message = {
          id = nextId;
          author = author;
          text = validText;
          timestamp = Time.now();
          imageId = imageId;
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
    // 注意：为了方便本地开发和匿名访问，这里暂时允许匿名 Principal 也保存资料。
    // 在正式环境中可以恢复下面的校验，强制要求登录身份：
    // if (Principal.isAnonymous(caller)) {
    //   return #err("匿名用户无法保存个人资料");
    // };

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
