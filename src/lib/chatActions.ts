import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { buildDirectChatId, sanitizeId } from './media';
import {
  Chat,
  ContactRequest,
  DisappearingDuration,
  Message,
  MessageLocation,
  MessageReplyTo,
  MessageType,
  PublicUser,
  StatusPrivacy,
} from '../types/youmessage';

export function buildContactRequestId(uid1: string, uid2: string): string {
  const [a, b] = [uid1, uid2].sort();
  return sanitizeId(`req_${a}_${b}`);
}

export async function lookupUserByUsername(rawUsername: string): Promise<PublicUser | null> {
  const clean = rawUsername.trim().toLowerCase().replace(/^@+/, '');
  if (!/^[a-z0-9_.]{3,32}$/.test(clean)) {
    return null;
  }
  try {
    const snap = await getDocs(
      query(collection(db, 'users_public'), where('username', '==', clean), limit(1))
    );
    if (snap.empty) return null;
    return snap.docs[0].data() as PublicUser;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'users_public');
  }
}

export interface SendContactRequestResult {
  ok: boolean;
  status?: 'sent' | 'accepted' | 'already_connected' | 'pending_outgoing';
  message: string;
  user?: PublicUser;
}

export async function sendContactRequest(
  myUser: PublicUser,
  rawUsername: string
): Promise<SendContactRequestResult> {
  const clean = rawUsername.trim().toLowerCase().replace(/^@+/, '');
  if (!/^[a-z0-9_.]{3,32}$/.test(clean)) {
    return {
      ok: false,
      message: 'Enter a valid username (3–32 characters: letters, numbers, dots, or underscores).',
    };
  }
  if (clean === myUser.username.toLowerCase()) {
    return { ok: false, message: 'You cannot send a contact request to yourself.' };
  }

  const targetUser = await lookupUserByUsername(clean);
  if (!targetUser || targetUser.uid === myUser.uid) {
    return { ok: false, message: `No user found with username @${clean}.` };
  }

  const reqId = buildContactRequestId(myUser.uid, targetUser.uid);
  const reqRef = doc(db, 'contactRequests', reqId);
  const reqPath = `contactRequests/${reqId}`;

  try {
    const existingSnap = await getDoc(reqRef);
    if (existingSnap.exists()) {
      const existing = existingSnap.data() as ContactRequest;
      if (existing.status === 'accepted') {
        await addOrUpdateContact(myUser.uid, targetUser.uid, { isBlocked: false });
        return {
          ok: true,
          status: 'already_connected',
          user: targetUser,
          message: `You are already connected with @${targetUser.username}.`,
        };
      }
      if (existing.status === 'pending') {
        if (existing.fromUid === myUser.uid) {
          return {
            ok: false,
            status: 'pending_outgoing',
            user: targetUser,
            message: `Request already sent to @${targetUser.username}. Waiting for them to accept.`,
          };
        }
        // Target already sent us a pending request: accept it now
        await updateDoc(reqRef, {
          status: 'accepted',
          updatedAt: serverTimestamp(),
        });
        await addOrUpdateContact(myUser.uid, targetUser.uid, { isBlocked: false });
        return {
          ok: true,
          status: 'accepted',
          user: targetUser,
          message: `@${targetUser.username} had already sent you a request — accepted! You can now chat.`,
        };
      }
      if (existing.status === 'declined') {
        if (existing.fromUid === myUser.uid) {
          await updateDoc(reqRef, {
            status: 'pending',
            fromUsername: myUser.username,
            fromDisplayName: myUser.displayName.slice(0, 64),
            fromPhoto: myUser.photoURL || '',
            toUsername: targetUser.username,
            toDisplayName: targetUser.displayName.slice(0, 64),
            toPhoto: targetUser.photoURL || '',
            updatedAt: serverTimestamp(),
          });
          return {
            ok: true,
            status: 'sent',
            user: targetUser,
            message: `Contact request sent to @${targetUser.username}.`,
          };
        }
        // Existing declined doc had target as fromUid; delete and create fresh from myUser
        await deleteDoc(reqRef);
      }
    }

    await setDoc(reqRef, {
      id: reqId,
      fromUid: myUser.uid,
      fromUsername: myUser.username,
      fromDisplayName: myUser.displayName.slice(0, 64),
      fromPhoto: myUser.photoURL || '',
      toUid: targetUser.uid,
      toUsername: targetUser.username,
      toDisplayName: targetUser.displayName.slice(0, 64),
      toPhoto: targetUser.photoURL || '',
      participantIds: [myUser.uid, targetUser.uid],
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return {
      ok: true,
      status: 'sent',
      user: targetUser,
      message: `Contact request sent to @${targetUser.username}. They must accept before you can chat.`,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, reqPath);
  }
}

export async function respondToContactRequest(
  myUid: string,
  request: ContactRequest,
  accept: boolean
): Promise<void> {
  const reqPath = `contactRequests/${request.id}`;
  try {
    await updateDoc(doc(db, 'contactRequests', request.id), {
      status: accept ? 'accepted' : 'declined',
      updatedAt: serverTimestamp(),
    });
    if (accept) {
      const peerUid = request.fromUid === myUid ? request.toUid : request.fromUid;
      await addOrUpdateContact(myUid, peerUid, { isBlocked: false });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, reqPath);
  }
}

export async function cancelOrRemoveContactRequest(requestId: string): Promise<void> {
  const reqPath = `contactRequests/${requestId}`;
  try {
    await deleteDoc(doc(db, 'contactRequests', requestId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, reqPath);
  }
}

export async function getOrCreateDirectChat(
  myUid: string,
  otherUser: PublicUser
): Promise<string> {
  const chatId = buildDirectChatId(myUid, otherUser.uid);
  const chatRef = doc(db, 'chats', chatId);
  try {
    const snap = await getDoc(chatRef);
    if (snap.exists()) {
      return chatId;
    }
    await setDoc(chatRef, {
      id: chatId,
      type: 'direct',
      memberIds: [myUid, otherUser.uid],
      adminIds: [myUid, otherUser.uid],
      disappearingDuration: 0,
      createdBy: myUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return chatId;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `chats/${chatId}`);
  }
}

export async function createGroupChat(params: {
  myUid: string;
  name: string;
  description: string;
  photoURL?: string;
  memberIds: string[];
}): Promise<string> {
  const uniqueMembers = Array.from(new Set([params.myUid, ...params.memberIds])).slice(0, 50);
  const chatId = sanitizeId(`grp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  const chatRef = doc(db, 'chats', chatId);

  try {
    await setDoc(chatRef, {
      id: chatId,
      type: 'group',
      memberIds: uniqueMembers,
      adminIds: [params.myUid],
      name: params.name.trim().slice(0, 80) || 'New Group',
      description: params.description.trim().slice(0, 300),
      photoURL: params.photoURL || '',
      disappearingDuration: 0,
      lastMessageText: 'Group created',
      lastMessageType: 'system',
      lastMessageSenderId: params.myUid,
      lastMessageAt: serverTimestamp(),
      createdBy: params.myUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const msgId = sanitizeId(`msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
    await setDoc(doc(db, 'chats', chatId, 'messages', msgId), {
      id: msgId,
      chatId,
      senderId: params.myUid,
      type: 'system',
      text: `Created group "${params.name.trim().slice(0, 80)}"`,
      forwardedFrom: false,
      isEdited: false,
      isDeleted: false,
      deliveredTo: [params.myUid],
      readBy: [params.myUid],
      deletedForUids: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return chatId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `chats/${chatId}`);
  }
}

export async function sendMessage(params: {
  chat: Chat;
  senderId: string;
  type: MessageType;
  text: string;
  mediaData?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  voiceDuration?: number;
  location?: MessageLocation;
  replyTo?: MessageReplyTo;
  forwardedFrom?: boolean;
}): Promise<void> {
  const msgId = sanitizeId(`msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  const msgPath = `chats/${params.chat.id}/messages/${msgId}`;
  const cleanText = params.text.slice(0, 4000);

  const payload: Record<string, unknown> = {
    id: msgId,
    chatId: params.chat.id,
    senderId: params.senderId,
    type: params.type,
    text: cleanText,
    forwardedFrom: Boolean(params.forwardedFrom),
    isEdited: false,
    isDeleted: false,
    deliveredTo: [params.senderId],
    readBy: [params.senderId],
    deletedForUids: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (params.mediaData) payload.mediaData = params.mediaData;
  if (params.fileName) payload.fileName = params.fileName.slice(0, 160);
  if (typeof params.fileSize === 'number') payload.fileSize = Math.round(params.fileSize);
  if (params.mimeType) payload.mimeType = params.mimeType.slice(0, 100);
  if (typeof params.voiceDuration === 'number') payload.voiceDuration = params.voiceDuration;
  if (params.location) payload.location = params.location;
  if (params.replyTo) payload.replyTo = params.replyTo;

  if (params.chat.disappearingDuration > 0) {
    const expiryMs = Date.now() + params.chat.disappearingDuration * 1000;
    payload.expiresAt = Timestamp.fromMillis(expiryMs);
  }

  let preview = cleanText;
  if (!preview) {
    if (params.type === 'image') preview = 'Photo';
    else if (params.type === 'video') preview = 'Video';
    else if (params.type === 'voice') preview = 'Voice message';
    else if (params.type === 'document') preview = params.fileName || 'Document';
    else if (params.type === 'location') preview = params.location?.label || 'Shared location';
  }

  try {
    await setDoc(doc(db, 'chats', params.chat.id, 'messages', msgId), payload);
    await updateDoc(doc(db, 'chats', params.chat.id), {
      lastMessageText: preview.slice(0, 297),
      lastMessageType: params.type,
      lastMessageSenderId: params.senderId,
      lastMessageAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, msgPath);
  }
}

export async function editMessageText(
  chatId: string,
  messageId: string,
  newText: string
): Promise<void> {
  const path = `chats/${chatId}/messages/${messageId}`;
  try {
    await updateDoc(doc(db, 'chats', chatId, 'messages', messageId), {
      text: newText.trim().slice(0, 4000),
      isEdited: true,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteMessageForEveryone(
  chatId: string,
  messageId: string
): Promise<void> {
  const path = `chats/${chatId}/messages/${messageId}`;
  try {
    await updateDoc(doc(db, 'chats', chatId, 'messages', messageId), {
      text: 'This message was deleted',
      mediaData: '',
      fileName: '',
      isDeleted: true,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteMessageForMe(
  chatId: string,
  messageId: string,
  myUid: string
): Promise<void> {
  const path = `chats/${chatId}/messages/${messageId}`;
  try {
    await updateDoc(doc(db, 'chats', chatId, 'messages', messageId), {
      deletedForUids: arrayUnion(myUid),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function toggleMessageReaction(
  chatId: string,
  message: Message,
  emoji: string,
  myUid: string
): Promise<void> {
  const path = `chats/${chatId}/messages/${message.id}`;
  const current = { ...(message.reactions || {}) };
  const usersForEmoji = Array.isArray(current[emoji]) ? [...current[emoji]] : [];
  if (usersForEmoji.includes(myUid)) {
    const filtered = usersForEmoji.filter((u) => u !== myUid);
    if (filtered.length === 0) {
      delete current[emoji];
    } else {
      current[emoji] = filtered;
    }
  } else {
    current[emoji] = [...usersForEmoji, myUid].slice(0, 50);
  }
  try {
    await updateDoc(doc(db, 'chats', chatId, 'messages', message.id), {
      reactions: current,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function markMessageRead(
  chatId: string,
  message: Message,
  myUid: string,
  allowReadReceipt: boolean
): Promise<void> {
  const needsDelivered = !message.deliveredTo.includes(myUid);
  const needsRead = allowReadReceipt && !message.readBy.includes(myUid);
  if (!needsDelivered && !needsRead) return;

  const path = `chats/${chatId}/messages/${message.id}`;
  const updates: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };
  if (needsDelivered) updates.deliveredTo = arrayUnion(myUid);
  if (needsRead) updates.readBy = arrayUnion(myUid);

  try {
    await updateDoc(doc(db, 'chats', chatId, 'messages', message.id), updates);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function updateChatState(
  myUid: string,
  chatId: string,
  patch: Partial<{ isPinned: boolean; isArchived: boolean; isMuted: boolean; unreadCount: number; markRead: boolean }>
): Promise<void> {
  const path = `users_private/${myUid}/chatStates/${chatId}`;
  const ref = doc(db, 'users_private', myUid, 'chatStates', chatId);
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        chatId,
        isPinned: patch.isPinned ?? false,
        isArchived: patch.isArchived ?? false,
        isMuted: patch.isMuted ?? false,
        unreadCount: patch.unreadCount ?? 0,
        lastReadAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const updates: Record<string, unknown> = {
        updatedAt: serverTimestamp(),
      };
      if (typeof patch.isPinned === 'boolean') updates.isPinned = patch.isPinned;
      if (typeof patch.isArchived === 'boolean') updates.isArchived = patch.isArchived;
      if (typeof patch.isMuted === 'boolean') updates.isMuted = patch.isMuted;
      if (typeof patch.unreadCount === 'number') updates.unreadCount = patch.unreadCount;
      if (patch.markRead) {
        updates.unreadCount = 0;
        updates.lastReadAt = serverTimestamp();
      }
      await updateDoc(ref, updates);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function setTypingStatus(
  chatId: string,
  myUid: string,
  displayName: string,
  isTyping: boolean
): Promise<void> {
  const path = `chats/${chatId}/typing/${myUid}`;
  try {
    await setDoc(doc(db, 'chats', chatId, 'typing', myUid), {
      uid: myUid,
      displayName: displayName.slice(0, 64),
      isTyping,
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Non-fatal ephemeral presence update
  }
}

export async function updateDisappearingDuration(
  chatId: string,
  duration: DisappearingDuration
): Promise<void> {
  try {
    await updateDoc(doc(db, 'chats', chatId), {
      disappearingDuration: duration,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `chats/${chatId}`);
  }
}

export async function updateGroupDetails(
  chatId: string,
  updates: { name?: string; description?: string; photoURL?: string }
): Promise<void> {
  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (typeof updates.name === 'string') payload.name = updates.name.trim().slice(0, 80);
  if (typeof updates.description === 'string') payload.description = updates.description.trim().slice(0, 300);
  if (typeof updates.photoURL === 'string') payload.photoURL = updates.photoURL;
  try {
    await updateDoc(doc(db, 'chats', chatId), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `chats/${chatId}`);
  }
}

export async function addGroupMember(chatId: string, uid: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'chats', chatId), {
      memberIds: arrayUnion(uid),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `chats/${chatId}`);
  }
}

export async function removeGroupMember(chatId: string, uid: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'chats', chatId), {
      memberIds: arrayRemove(uid),
      adminIds: arrayRemove(uid),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `chats/${chatId}`);
  }
}

export async function toggleGroupAdmin(
  chatId: string,
  uid: string,
  makeAdmin: boolean
): Promise<void> {
  try {
    await updateDoc(doc(db, 'chats', chatId), {
      adminIds: makeAdmin ? arrayUnion(uid) : arrayRemove(uid),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `chats/${chatId}`);
  }
}

export async function addOrUpdateContact(
  myUid: string,
  contactUid: string,
  options: { nickname?: string; isBlocked?: boolean }
): Promise<void> {
  const path = `users_private/${myUid}/contacts/${contactUid}`;
  const ref = doc(db, 'users_private', myUid, 'contacts', contactUid);
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        contactUid,
        nickname: (options.nickname || '').slice(0, 64),
        isBlocked: options.isBlocked ?? false,
        addedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const updates: Record<string, unknown> = { updatedAt: serverTimestamp() };
      if (typeof options.nickname === 'string') updates.nickname = options.nickname.slice(0, 64);
      if (typeof options.isBlocked === 'boolean') updates.isBlocked = options.isBlocked;
      await updateDoc(ref, updates);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function removeContact(myUid: string, contactUid: string): Promise<void> {
  const path = `users_private/${myUid}/contacts/${contactUid}`;
  const reqId = buildContactRequestId(myUid, contactUid);
  try {
    await deleteDoc(doc(db, 'users_private', myUid, 'contacts', contactUid));
    const reqRef = doc(db, 'contactRequests', reqId);
    const reqSnap = await getDoc(reqRef);
    if (reqSnap.exists()) {
      await deleteDoc(reqRef);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function createStatusUpdate(params: {
  author: PublicUser;
  type: 'text' | 'image' | 'video';
  text?: string;
  backgroundColor?: string;
  mediaData?: string;
  privacy: StatusPrivacy;
  allowedUids: string[];
}): Promise<void> {
  const statusId = sanitizeId(`st_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  const path = `statuses/${statusId}`;
  const allowed = Array.from(new Set([params.author.uid, ...params.allowedUids])).slice(0, 50);
  const expiresAt = Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000);

  const payload: Record<string, unknown> = {
    id: statusId,
    authorId: params.author.uid,
    authorName: params.author.displayName.slice(0, 64),
    authorPhoto: params.author.photoURL || '',
    type: params.type,
    privacy: params.privacy,
    allowedUids: allowed,
    viewedBy: [params.author.uid],
    expiresAt,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (params.text) payload.text = params.text.slice(0, 500);
  if (params.backgroundColor) payload.backgroundColor = params.backgroundColor;
  if (params.mediaData) payload.mediaData = params.mediaData;

  try {
    await setDoc(doc(db, 'statuses', statusId), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function markStatusViewed(statusId: string, myUid: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'statuses', statusId), {
      viewedBy: arrayUnion(myUid),
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Ignore minor view tracking race
  }
}

export async function deleteStatusUpdate(statusId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'statuses', statusId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `statuses/${statusId}`);
  }
}
