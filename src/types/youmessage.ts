import { Timestamp } from 'firebase/firestore';

export type PrivacyLevel = 'everyone' | 'contacts' | 'nobody';
export type StatusPrivacy = 'everyone' | 'contacts' | 'selected';
export type ThemeMode = 'light' | 'dark' | 'system';
export type MessageType = 'text' | 'image' | 'video' | 'document' | 'voice' | 'location' | 'system';
export type DisappearingDuration = 0 | 86400 | 604800 | 7776000;
export type CallType = 'voice' | 'video';
export type CallStatus = 'ringing' | 'active' | 'ended' | 'declined' | 'missed';
export type ContactRequestStatus = 'pending' | 'accepted' | 'declined';

export interface PublicUser {
  uid: string;
  username: string;
  displayName: string;
  photoURL?: string;
  aboutStatus?: string;
  isOnline: boolean;
  lastSeen?: Timestamp;
  privacyLastSeen: PrivacyLevel;
  privacyOnline: PrivacyLevel;
  privacyPhoto: PrivacyLevel;
  privacyAbout: PrivacyLevel;
  privacyReadReceipts: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface PrivateUser {
  uid: string;
  email: string;
  themeMode: ThemeMode;
  wallpaperId: string;
  notifyMessages: boolean;
  notifyCalls: boolean;
  notifySounds: boolean;
  notifyPreview: boolean;
  securityLockEnabled: boolean;
  securityPin?: string;
  twoFactorNote?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Contact {
  contactUid: string;
  nickname?: string;
  isBlocked: boolean;
  addedAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ContactRequest {
  id: string;
  fromUid: string;
  fromUsername: string;
  fromDisplayName: string;
  fromPhoto?: string;
  toUid: string;
  toUsername: string;
  toDisplayName: string;
  toPhoto?: string;
  participantIds: string[];
  status: ContactRequestStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ChatState {
  chatId: string;
  isPinned: boolean;
  isArchived: boolean;
  isMuted: boolean;
  unreadCount: number;
  lastReadAt?: Timestamp;
  updatedAt: Timestamp;
}

export interface Chat {
  id: string;
  type: 'direct' | 'group';
  memberIds: string[];
  adminIds: string[];
  name?: string;
  description?: string;
  photoURL?: string;
  disappearingDuration: DisappearingDuration;
  lastMessageText?: string;
  lastMessageType?: string;
  lastMessageSenderId?: string;
  lastMessageAt?: Timestamp;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface TypingIndicator {
  uid: string;
  displayName?: string;
  isTyping: boolean;
  updatedAt: Timestamp;
}

export interface MessageLocation {
  lat: number;
  lng: number;
  label: string;
}

export interface MessageReplyTo {
  messageId: string;
  senderId: string;
  senderName: string;
  text: string;
  type: string;
}

export interface Message {
  id: string;
  chatId: string;
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
  forwardedFrom: boolean;
  reactions?: Record<string, string[]>;
  deliveredTo: string[];
  readBy: string[];
  isEdited: boolean;
  isDeleted: boolean;
  deletedForUids: string[];
  expiresAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface StatusUpdate {
  id: string;
  authorId: string;
  authorName: string;
  authorPhoto?: string;
  type: 'text' | 'image' | 'video';
  text?: string;
  backgroundColor?: string;
  mediaData?: string;
  privacy: StatusPrivacy;
  allowedUids: string[];
  viewedBy: string[];
  expiresAt: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CallSession {
  id: string;
  callerId: string;
  callerName: string;
  callerPhoto?: string;
  calleeId: string;
  calleeName: string;
  calleePhoto?: string;
  participantIds: string[];
  chatId?: string;
  callType: CallType;
  status: CallStatus;
  offer?: { type: 'offer' | 'answer'; sdp: string };
  answer?: { type: 'offer' | 'answer'; sdp: string };
  durationSec: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type NavTab = 'chats' | 'status' | 'calls' | 'contacts' | 'settings';

export interface ToastNotification {
  id: string;
  title: string;
  body: string;
  avatarUrl?: string;
  chatId?: string;
}
