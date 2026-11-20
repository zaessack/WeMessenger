import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Download,
  Edit3,
  FileText,
  Forward,
  Image as ImageIcon,
  Info,
  MapPin,
  Mic,
  Pause,
  Phone,
  Play,
  Plus,
  Reply,
  Search,
  Send,
  Smile,
  Square,
  Timer,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  blobToDataUrl,
  compressImageFile,
  fileToDataUrl,
  formatDayDivider,
  formatDuration,
  formatFileSize,
  formatLastSeen,
  formatMessageTime,
} from '../lib/media';
import {
  deleteMessageForEveryone,
  deleteMessageForMe,
  editMessageText,
  markMessageRead,
  sendMessage,
  setTypingStatus,
  toggleMessageReaction,
  updateChatState,
} from '../lib/chatActions';
import {
  getVisibleLastSeen,
  getVisibleOnline,
  getVisiblePhoto,
  isUserBlocked,
} from '../lib/privacy';
import { getWallpaperById } from '../lib/wallpapers';
import {
  CallType,
  Chat,
  ChatState,
  Contact,
  Message,
  MessageReplyTo,
  PublicUser,
  TypingIndicator,
} from '../types/youmessage';
import { Avatar } from './Avatar';

const QUICK_REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🙏'];

const EMOJI_PALETTE = [
  '😀', '😂', '🥹', '😍', '🥰', '😎', '🤩', '🥳',
  '🤔', '😮', '😢', '😭', '🙏', '👏', '🔥', '✨',
  '❤️', '💙', '💚', '🎉', '👍', '👎', '🤝', '🫶',
  '📍', '📷', '🎧', '☕️', '🚀', '✅', '⚡', '🌙',
];

interface VoiceBubbleProps {
  src: string;
  duration?: number;
  isOwn: boolean;
}

const VoiceBubble: React.FC<VoiceBubbleProps> = ({ src, duration = 0, isOwn }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
      setPlaying(false);
    } else {
      el.play().catch(() => {});
      setPlaying(true);
    }
  };

  return (
    <div className="flex items-center gap-3 min-w-[200px] sm:min-w-[230px] py-0.5">
      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={() => {
          const el = audioRef.current;
          if (!el || !el.duration) return;
          setCurrentTime(el.currentTime);
          setProgress((el.currentTime / el.duration) * 100);
        }}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
          setCurrentTime(0);
        }}
      />
      <button
        type="button"
        onClick={togglePlay}
        aria-label={playing ? 'Pause voice message' : 'Play voice message'}
        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
          isOwn
            ? 'bg-white/20 hover:bg-white/30 text-white'
            : 'bg-[#007AFF] hover:bg-[#0066D6] text-white'
        }`}
      >
        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
      </button>
      <div className="flex-1 min-w-0">
        <div
          className={`h-1.5 rounded-full overflow-hidden ${
            isOwn ? 'bg-white/25' : 'bg-zinc-300 dark:bg-zinc-600'
          }`}
        >
          <div
            className={`h-full transition-all ${isOwn ? 'bg-white' : 'bg-[#007AFF]'}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div
          className={`text-[11px] tabular-nums mt-1 ${
            isOwn ? 'text-white/80' : 'text-zinc-500 dark:text-zinc-400'
          }`}
        >
          {formatDuration(playing ? currentTime : duration)}
        </div>
      </div>
    </div>
  );
};

interface ChatWindowProps {
  myUser: PublicUser;
  chat: Chat;
  chatState?: ChatState;
  usersById: Record<string, PublicUser>;
  contacts: Record<string, Contact>;
  wallpaperId: string;
  onBack: () => void;
  onOpenInfo: () => void;
  onStartCall: (targetUser: PublicUser, callType: CallType, chatId: string) => void;
  onForwardMessage: (message: Message) => void;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({
  myUser,
  chat,
  usersById,
  contacts,
  wallpaperId,
  onBack,
  onOpenInfo,
  onStartCall,
  onForwardMessage,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [typingUsers, setTypingUsers] = useState<TypingIndicator[]>([]);
  const [inputText, setInputText] = useState('');
  const [replyTo, setReplyTo] = useState<MessageReplyTo | null>(null);
  const [editingMsg, setEditingMsg] = useState<Message | null>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showSearchBar, setShowSearchBar] = useState(false);
  const [inChatSearch, setInChatSearch] = useState('');
  const [activeActionMsgId, setActiveActionMsgId] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [composerError, setComposerError] = useState('');
  const [sending, setSending] = useState(false);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const docInputRef = useRef<HTMLInputElement | null>(null);

  const otherUid =
    chat.type === 'direct' ? chat.memberIds.find((id) => id !== myUser.uid) : undefined;
  const otherUser = otherUid ? usersById[otherUid] : undefined;
  const blocked = otherUid ? isUserBlocked(otherUid, contacts) : false;

  const chatTitle =
    chat.type === 'group'
      ? chat.name || 'Group'
      : (otherUid && contacts[otherUid]?.nickname) || otherUser?.displayName || 'YouMessage User';

  const chatPhoto =
    chat.type === 'group'
      ? chat.photoURL
      : getVisiblePhoto(otherUser, myUser.uid, contacts);

  const otherOnline =
    chat.type === 'direct' ? getVisibleOnline(otherUser, myUser.uid, contacts) : false;
  const otherLastSeen =
    chat.type === 'direct' ? getVisibleLastSeen(otherUser, myUser.uid, contacts) : undefined;

  const wallpaper = getWallpaperById(wallpaperId);

  // Subscribe to messages
  useEffect(() => {
    const path = `chats/${chat.id}/messages`;
    const q = query(
      collection(db, 'chats', chat.id, 'messages'),
      orderBy('createdAt', 'asc'),
      limit(200)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const nowMs = Date.now();
        const items: Message[] = [];
        snap.docs.forEach((d) => {
          const m = d.data() as Message;
          if (m.deletedForUids?.includes(myUser.uid)) return;
          if (m.expiresAt && m.expiresAt.toMillis() <= nowMs) return;
          items.push(m);
        });
        setMessages(items);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, path)
    );
    return () => unsub();
  }, [chat.id, myUser.uid]);

  // Subscribe to typing indicators
  useEffect(() => {
    const path = `chats/${chat.id}/typing`;
    const unsub = onSnapshot(
      collection(db, 'chats', chat.id, 'typing'),
      (snap) => {
        const now = Date.now();
        const active: TypingIndicator[] = [];
        snap.docs.forEach((d) => {
          const data = d.data() as TypingIndicator;
          if (
            data.uid !== myUser.uid &&
            data.isTyping &&
            data.updatedAt &&
            now - data.updatedAt.toMillis() < 8000
          ) {
            active.push(data);
          }
        });
        setTypingUsers(active);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, path)
    );
    return () => unsub();
  }, [chat.id, myUser.uid]);

  // Mark chat read & mark incoming messages delivered/read
  useEffect(() => {
    updateChatState(myUser.uid, chat.id, { markRead: true }).catch(() => {});
  }, [chat.id, myUser.uid, messages.length]);

  useEffect(() => {
    messages.forEach((m) => {
      if (m.senderId !== myUser.uid) {
        const sender = usersById[m.senderId];
        const allowRead =
          Boolean(myUser.privacyReadReceipts) &&
          (sender ? Boolean(sender.privacyReadReceipts) : true);
        markMessageRead(chat.id, m, myUser.uid, allowRead).catch(() => {});
      }
    });
  }, [messages, chat.id, myUser.uid, myUser.privacyReadReceipts, usersById]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, typingUsers.length]);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
      if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
    };
  }, []);

  const handleTypingChange = (val: string) => {
    setInputText(val);
    setTypingStatus(chat.id, myUser.uid, myUser.displayName, val.trim().length > 0);
    if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    if (val.trim().length > 0) {
      typingTimeoutRef.current = window.setTimeout(() => {
        setTypingStatus(chat.id, myUser.uid, myUser.displayName, false);
      }, 3000);
    }
  };

  const handleSendText = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed || sending || blocked) return;

    setComposerError('');
    setSending(true);
    setTypingStatus(chat.id, myUser.uid, myUser.displayName, false);

    try {
      if (editingMsg) {
        await editMessageText(chat.id, editingMsg.id, trimmed);
        setEditingMsg(null);
      } else {
        await sendMessage({
          chat,
          senderId: myUser.uid,
          type: 'text',
          text: trimmed,
          replyTo: replyTo || undefined,
        });
        setReplyTo(null);
      }
      setInputText('');
      setShowEmojiPicker(false);
    } catch (err) {
      setComposerError(err instanceof Error ? err.message : 'Failed to send message.');
    } finally {
      setSending(false);
    }
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setShowAttachMenu(false);
    setComposerError('');
    setSending(true);
    try {
      const compressed = await compressImageFile(file, 1024, 0.76);
      await sendMessage({
        chat,
        senderId: myUser.uid,
        type: 'image',
        text: inputText.trim(),
        mediaData: compressed,
        fileName: file.name,
        fileSize: file.size,
        mimeType: 'image/jpeg',
        replyTo: replyTo || undefined,
      });
      setInputText('');
      setReplyTo(null);
    } catch (err) {
      setComposerError(err instanceof Error ? err.message : 'Could not send image.');
    } finally {
      setSending(false);
    }
  };

  const handleVideoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setShowAttachMenu(false);
    setComposerError('');
    setSending(true);
    try {
      const dataUrl = await fileToDataUrl(file, 520000);
      await sendMessage({
        chat,
        senderId: myUser.uid,
        type: 'video',
        text: inputText.trim(),
        mediaData: dataUrl,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || 'video/mp4',
        replyTo: replyTo || undefined,
      });
      setInputText('');
      setReplyTo(null);
    } catch (err) {
      setComposerError(err instanceof Error ? err.message : 'Could not send video.');
    } finally {
      setSending(false);
    }
  };

  const handleDocSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setShowAttachMenu(false);
    setComposerError('');
    setSending(true);
    try {
      const dataUrl = await fileToDataUrl(file, 520000);
      await sendMessage({
        chat,
        senderId: myUser.uid,
        type: 'document',
        text: '',
        mediaData: dataUrl,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || 'application/octet-stream',
        replyTo: replyTo || undefined,
      });
      setReplyTo(null);
    } catch (err) {
      setComposerError(err instanceof Error ? err.message : 'Could not send document.');
    } finally {
      setSending(false);
    }
  };

  const handleShareLocation = () => {
    setShowAttachMenu(false);
    setComposerError('');
    if (!navigator.geolocation) {
      setComposerError('Geolocation is not supported in this browser.');
      return;
    }
    setSending(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const lat = Number(pos.coords.latitude.toFixed(5));
          const lng = Number(pos.coords.longitude.toFixed(5));
          await sendMessage({
            chat,
            senderId: myUser.uid,
            type: 'location',
            text: `Location (${lat}, ${lng})`,
            location: {
              lat,
              lng,
              label: `Current Location (${lat}, ${lng})`,
            },
            replyTo: replyTo || undefined,
          });
          setReplyTo(null);
        } catch (err) {
          setComposerError(err instanceof Error ? err.message : 'Failed to share location.');
        } finally {
          setSending(false);
        }
      },
      (err) => {
        setSending(false);
        setComposerError(`Location permission denied: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const startVoiceRecording = async () => {
    setComposerError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordSeconds(0);
      recordTimerRef.current = window.setInterval(() => {
        setRecordSeconds((s) => s + 1);
      }, 1000);
    } catch {
      setComposerError('Microphone access is required to record voice messages.');
    }
  };

  const stopVoiceRecording = (send: boolean) => {
    const recorder = mediaRecorderRef.current;
    if (recordTimerRef.current) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    const duration = recordSeconds;
    setIsRecording(false);
    setRecordSeconds(0);

    if (!recorder) return;
    recorder.onstop = async () => {
      recorder.stream.getTracks().forEach((t) => t.stop());
      if (!send || audioChunksRef.current.length === 0) return;
      const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
      try {
        setSending(true);
        const dataUrl = await blobToDataUrl(blob);
        await sendMessage({
          chat,
          senderId: myUser.uid,
          type: 'voice',
          text: '',
          mediaData: dataUrl,
          voiceDuration: Math.max(1, duration),
          mimeType: blob.type,
          replyTo: replyTo || undefined,
        });
        setReplyTo(null);
      } catch (err) {
        setComposerError(err instanceof Error ? err.message : 'Failed to send voice note.');
      } finally {
        setSending(false);
      }
    };
    recorder.stop();
  };

  const visibleMessages = useMemo(() => {
    const q = inChatSearch.trim().toLowerCase();
    if (!q) return messages;
    return messages.filter(
      (m) =>
        m.text.toLowerCase().includes(q) ||
        (m.fileName || '').toLowerCase().includes(q)
    );
  }, [messages, inChatSearch]);

  const subtitle = useMemo(() => {
    if (typingUsers.length > 0) {
      if (chat.type === 'group') {
        return `${typingUsers.map((t) => t.displayName || 'Someone').join(', ')} typing...`;
      }
      return 'typing...';
    }
    if (chat.type === 'group') {
      return `${chat.memberIds.length} members`;
    }
    if (blocked) return 'Blocked';
    if (otherOnline) return 'Online';
    if (otherLastSeen) return `Last seen ${formatLastSeen(otherLastSeen)}`;
    return otherUser ? `@${otherUser.username}` : '';
  }, [typingUsers, chat.type, chat.memberIds.length, blocked, otherOnline, otherLastSeen, otherUser]);

  const renderReceipt = (msg: Message) => {
    if (msg.senderId !== myUser.uid || msg.isDeleted || msg.type === 'system') return null;
    const otherMembers = chat.memberIds.filter((id) => id !== myUser.uid);
    const isRead = otherMembers.some((id) => msg.readBy.includes(id));
    const isDelivered = otherMembers.some((id) => msg.deliveredTo.includes(id));

    if (isRead) {
      return <CheckCheck className="w-3.5 h-3.5 text-sky-200 inline-block ml-1" aria-label="Read" />;
    }
    if (isDelivered) {
      return <CheckCheck className="w-3.5 h-3.5 text-white/70 inline-block ml-1" aria-label="Delivered" />;
    }
    return <Check className="w-3.5 h-3.5 text-white/70 inline-block ml-1" aria-label="Sent" />;
  };

  return (
    <div className={`relative flex flex-col h-full overflow-hidden ${wallpaper.lightClass} dark:${wallpaper.darkClass}`}>
      {/* Optional Wallpaper Image Layer */}
      {wallpaper.imageUrl && (
        <div className="pointer-events-none absolute inset-0 z-0">
          <img
            src={wallpaper.imageUrl}
            alt=""
            className="w-full h-full object-cover opacity-55 dark:opacity-45"
          />
          <div className="absolute inset-0 bg-white/30 dark:bg-black/45" />
        </div>
      )}

      {/* Glass Header */}
      <header className="relative z-20 px-3 sm:px-5 py-2.5 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-2xl border-b border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to chats"
            className="lg:hidden min-h-[40px] min-w-[40px] rounded-full hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center text-[#007AFF] cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={onOpenInfo}
            className="flex items-center gap-3 min-w-0 text-left hover:opacity-85 transition-opacity cursor-pointer"
          >
            <Avatar
              src={chatPhoto}
              name={chatTitle}
              size="sm"
              isOnline={otherOnline}
              isGroup={chat.type === 'group'}
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="font-display text-[15px] font-semibold text-zinc-900 dark:text-white truncate">
                  {chatTitle}
                </h2>
                {chat.disappearingDuration > 0 && (
                  <Timer
                    className="w-3.5 h-3.5 text-[#007AFF] shrink-0"
                    aria-label="Disappearing messages enabled"
                  />
                )}
              </div>
              <p
                className={`text-xs truncate ${
                  typingUsers.length > 0
                    ? 'text-[#007AFF] font-medium'
                    : 'text-zinc-500 dark:text-zinc-400'
                }`}
              >
                {subtitle}
              </p>
            </div>
          </button>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => {
              setShowSearchBar((s) => !s);
              setInChatSearch('');
            }}
            aria-label="Search messages"
            className="min-h-[40px] min-w-[40px] rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-zinc-600 dark:text-zinc-300 flex items-center justify-center transition-colors cursor-pointer"
          >
            <Search className="w-4 h-4" />
          </button>

          {chat.type === 'direct' && otherUser && !blocked && (
            <>
              <button
                type="button"
                onClick={() => onStartCall(otherUser, 'voice', chat.id)}
                aria-label="Voice Call"
                className="min-h-[40px] min-w-[40px] rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-[#007AFF] flex items-center justify-center transition-colors cursor-pointer"
              >
                <Phone className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onStartCall(otherUser, 'video', chat.id)}
                aria-label="Video Call"
                className="min-h-[40px] min-w-[40px] rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-[#007AFF] flex items-center justify-center transition-colors cursor-pointer"
              >
                <Video className="w-4 h-4" />
              </button>
            </>
          )}

          <button
            type="button"
            onClick={onOpenInfo}
            aria-label="Conversation info"
            className="min-h-[40px] min-w-[40px] rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-zinc-600 dark:text-zinc-300 flex items-center justify-center transition-colors cursor-pointer"
          >
            <Info className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* In-Chat Search Bar */}
      {showSearchBar && (
        <div className="relative z-20 px-4 py-2 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl border-b border-black/[0.06] dark:border-white/[0.08] flex items-center gap-2">
          <Search className="w-4 h-4 text-zinc-400 shrink-0" />
          <input
            type="text"
            autoFocus
            value={inChatSearch}
            onChange={(e) => setInChatSearch(e.target.value)}
            placeholder="Search inside this conversation..."
            className="flex-1 bg-transparent text-sm text-zinc-900 dark:text-white focus:outline-none"
          />
          <button
            type="button"
            onClick={() => {
              setShowSearchBar(false);
              setInChatSearch('');
            }}
            className="p-1.5 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Messages Stream */}
      <div
        className="relative z-10 flex-1 overflow-y-auto px-3 sm:px-6 py-4 space-y-2"
        onClick={() => {
          setActiveActionMsgId(null);
          setShowAttachMenu(false);
          setShowEmojiPicker(false);
        }}
      >
        {visibleMessages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="px-5 py-3 rounded-2xl bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border border-black/[0.05] dark:border-white/[0.07] text-xs text-zinc-600 dark:text-zinc-300">
              {inChatSearch
                ? 'No messages matched your search.'
                : 'Send a message to start this conversation.'}
            </div>
          </div>
        ) : (
          visibleMessages.map((msg, idx) => {
            const prev = idx > 0 ? visibleMessages[idx - 1] : null;
            const prevDay = prev?.createdAt ? formatDayDivider(prev.createdAt) : '';
            const curDay = msg.createdAt ? formatDayDivider(msg.createdAt) : 'Today';
            const showDayDivider = idx === 0 || prevDay !== curDay;

            if (msg.type === 'system') {
              return (
                <React.Fragment key={msg.id}>
                  {showDayDivider && (
                    <div className="flex justify-center my-3">
                      <span className="px-3 py-1 rounded-full bg-white/75 dark:bg-zinc-900/75 backdrop-blur-md text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                        {curDay}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-center my-1.5">
                    <span className="px-3 py-1 rounded-xl bg-white/70 dark:bg-zinc-900/70 backdrop-blur-md text-[11px] text-zinc-600 dark:text-zinc-400">
                      {msg.text}
                    </span>
                  </div>
                </React.Fragment>
              );
            }

            const isOwn = msg.senderId === myUser.uid;
            const sender = usersById[msg.senderId];
            const senderName =
              contacts[msg.senderId]?.nickname || sender?.displayName || 'Member';
            const reactionsEntries = Object.entries(msg.reactions || {}).filter(
              ([, uids]) => Array.isArray(uids) && uids.length > 0
            );
            const showMenu = activeActionMsgId === msg.id;

            return (
              <React.Fragment key={msg.id}>
                {showDayDivider && (
                  <div className="flex justify-center my-3">
                    <span className="px-3 py-1 rounded-full bg-white/75 dark:bg-zinc-900/75 backdrop-blur-md text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                      {curDay}
                    </span>
                  </div>
                )}

                <div
                  className={`group flex flex-col ${
                    isOwn ? 'items-end' : 'items-start'
                  }`}
                >
                  {chat.type === 'group' && !isOwn && (!prev || prev.senderId !== msg.senderId) && (
                    <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400 ml-3 mb-0.5">
                      {senderName}
                    </span>
                  )}

                  <div className="relative max-w-[82%] sm:max-w-[68%] flex items-end gap-1.5">
                    {/* Message Action Trigger */}
                    {isOwn && !msg.isDeleted && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveActionMsgId(showMenu ? null : msg.id);
                        }}
                        aria-label="Message options"
                        className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity p-1.5 rounded-full bg-white/80 dark:bg-zinc-800/80 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-100 shadow-sm cursor-pointer"
                      >
                        <Smile className="w-3.5 h-3.5" />
                      </button>
                    )}

                    <div
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setActiveActionMsgId(showMenu ? null : msg.id);
                      }}
                      className={`rounded-[20px] px-3.5 py-2 shadow-sm transition-transform ${
                        isOwn
                          ? 'bg-[#007AFF] text-white rounded-br-[6px]'
                          : 'bg-white/95 dark:bg-zinc-800/95 backdrop-blur-md text-zinc-900 dark:text-zinc-100 border border-black/[0.04] dark:border-white/[0.06] rounded-bl-[6px]'
                      }`}
                    >
                      {msg.forwardedFrom && !msg.isDeleted && (
                        <div
                          className={`flex items-center gap-1 text-[10px] mb-1 ${
                            isOwn ? 'text-white/80' : 'text-zinc-500 dark:text-zinc-400'
                          }`}
                        >
                          <Forward className="w-3 h-3" />
                          <span>Forwarded</span>
                        </div>
                      )}

                      {msg.replyTo && !msg.isDeleted && (
                        <div
                          className={`mb-1.5 px-2.5 py-1.5 rounded-xl text-xs ${
                            isOwn
                              ? 'bg-white/15 text-white'
                              : 'bg-zinc-100 dark:bg-zinc-700/70 text-zinc-700 dark:text-zinc-200'
                          }`}
                        >
                          <p className="font-semibold text-[11px] truncate">
                            {msg.replyTo.senderName}
                          </p>
                          <p className="opacity-85 truncate">{msg.replyTo.text}</p>
                        </div>
                      )}

                      {msg.isDeleted ? (
                        <p
                          className={`text-sm italic ${
                            isOwn ? 'text-white/80' : 'text-zinc-500 dark:text-zinc-400'
                          }`}
                        >
                          This message was deleted
                        </p>
                      ) : (
                        <>
                          {msg.type === 'image' && msg.mediaData && (
                            <div className="mb-1.5">
                              <img
                                src={msg.mediaData}
                                alt={msg.fileName || 'Shared photo'}
                                referrerPolicy="no-referrer"
                                onClick={() => setLightboxImage(msg.mediaData || null)}
                                className="max-h-72 rounded-xl object-cover cursor-pointer hover:opacity-95 transition-opacity"
                              />
                            </div>
                          )}

                          {msg.type === 'video' && msg.mediaData && (
                            <div className="mb-1.5">
                              <video
                                src={msg.mediaData}
                                controls
                                className="max-h-72 rounded-xl bg-black"
                              />
                            </div>
                          )}

                          {msg.type === 'voice' && msg.mediaData && (
                            <VoiceBubble
                              src={msg.mediaData}
                              duration={msg.voiceDuration}
                              isOwn={isOwn}
                            />
                          )}

                          {msg.type === 'document' && (
                            <div
                              className={`flex items-center gap-3 p-2.5 rounded-xl mb-1 ${
                                isOwn ? 'bg-white/15' : 'bg-zinc-100 dark:bg-zinc-700/60'
                              }`}
                            >
                              <FileText className="w-6 h-6 shrink-0" />
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-medium truncate">
                                  {msg.fileName || 'Document'}
                                </p>
                                <p className="text-[10px] opacity-75 tabular-nums">
                                  {msg.fileSize ? formatFileSize(msg.fileSize) : 'File'}
                                </p>
                              </div>
                              {msg.mediaData && (
                                <a
                                  href={msg.mediaData}
                                  download={msg.fileName || 'document'}
                                  className="p-1.5 rounded-lg hover:bg-black/10"
                                  aria-label="Download document"
                                >
                                  <Download className="w-4 h-4" />
                                </a>
                              )}
                            </div>
                          )}

                          {msg.type === 'location' && msg.location && (
                            <a
                              href={`https://maps.google.com/?q=${msg.location.lat},${msg.location.lng}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`flex items-center gap-3 p-2.5 rounded-xl mb-1 ${
                                isOwn ? 'bg-white/15' : 'bg-zinc-100 dark:bg-zinc-700/60'
                              }`}
                            >
                              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-500 flex items-center justify-center shrink-0">
                                <MapPin className="w-5 h-5" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-semibold truncate">
                                  {msg.location.label}
                                </p>
                                <p className="text-[11px] opacity-75 tabular-nums">
                                  Open in Maps
                                </p>
                              </div>
                            </a>
                          )}

                          {msg.text && msg.type !== 'location' && (
                            <p className="text-[14.5px] leading-relaxed whitespace-pre-wrap break-words">
                              {msg.text}
                            </p>
                          )}
                        </>
                      )}

                      <div
                        className={`flex items-center justify-end gap-1 mt-1 text-[10px] tabular-nums ${
                          isOwn ? 'text-white/75' : 'text-zinc-400 dark:text-zinc-500'
                        }`}
                      >
                        {msg.isEdited && !msg.isDeleted && <span>Edited</span>}
                        <span>{formatMessageTime(msg.createdAt)}</span>
                        {renderReceipt(msg)}
                      </div>
                    </div>

                    {!isOwn && !msg.isDeleted && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveActionMsgId(showMenu ? null : msg.id);
                        }}
                        aria-label="Message options"
                        className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity p-1.5 rounded-full bg-white/80 dark:bg-zinc-800/80 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-100 shadow-sm cursor-pointer"
                      >
                        <Smile className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {/* Floating Action Menu */}
                    {showMenu && !msg.isDeleted && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className={`absolute z-30 bottom-full mb-2 ${
                          isOwn ? 'right-0' : 'left-0'
                        } w-56 rounded-2xl bg-white/95 dark:bg-zinc-900/95 backdrop-blur-2xl border border-black/[0.08] dark:border-white/[0.1] shadow-xl p-2 space-y-1`}
                      >
                        <div className="flex items-center justify-between px-1 py-1 border-b border-black/[0.05] dark:border-white/[0.06]">
                          {QUICK_REACTIONS.map((emoji) => (
                            <button
                              key={emoji}
                              type="button"
                              onClick={() => {
                                toggleMessageReaction(chat.id, msg, emoji, myUser.uid);
                                setActiveActionMsgId(null);
                              }}
                              className="w-7 h-7 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-center text-base cursor-pointer"
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setReplyTo({
                              messageId: msg.id,
                              senderId: msg.senderId,
                              senderName: isOwn ? 'You' : senderName,
                              text: msg.text || msg.fileName || msg.type,
                              type: msg.type,
                            });
                            setActiveActionMsgId(null);
                          }}
                          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-xs text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                        >
                          <Reply className="w-3.5 h-3.5" /> Reply
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onForwardMessage(msg);
                            setActiveActionMsgId(null);
                          }}
                          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-xs text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                        >
                          <Forward className="w-3.5 h-3.5" /> Forward
                        </button>
                        {isOwn && msg.type === 'text' && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingMsg(msg);
                              setInputText(msg.text);
                              setActiveActionMsgId(null);
                            }}
                            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-xs text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" /> Edit Message
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            deleteMessageForMe(chat.id, msg.id, myUser.uid);
                            setActiveActionMsgId(null);
                          }}
                          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-xs text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Delete for Me
                        </button>
                        {isOwn && (
                          <button
                            type="button"
                            onClick={() => {
                              deleteMessageForEveryone(chat.id, msg.id);
                              setActiveActionMsgId(null);
                            }}
                            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Delete for Everyone
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Reaction Badges */}
                  {reactionsEntries.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1 px-1">
                      {reactionsEntries.map(([emoji, uids]) => {
                        const reactedByMe = uids.includes(myUser.uid);
                        return (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => toggleMessageReaction(chat.id, msg, emoji, myUser.uid)}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors cursor-pointer ${
                              reactedByMe
                                ? 'bg-[#007AFF]/15 border-[#007AFF]/30 text-[#007AFF]'
                                : 'bg-white/85 dark:bg-zinc-800/85 border-black/[0.06] dark:border-white/[0.08] text-zinc-700 dark:text-zinc-200'
                            }`}
                          >
                            <span>{emoji}</span>
                            <span className="text-[11px] tabular-nums">{uids.length}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </React.Fragment>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Composer Area */}
      <div className="relative z-20 px-3 sm:px-5 pb-3 pt-2 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-2xl border-t border-black/[0.06] dark:border-white/[0.08]">
        {composerError && (
          <div className="mb-2 px-3 py-2 rounded-xl bg-red-500/10 text-xs text-red-600 dark:text-red-400 flex items-center justify-between">
            <span>{composerError}</span>
            <button type="button" onClick={() => setComposerError('')} className="cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {(replyTo || editingMsg) && (
          <div className="mb-2 px-3.5 py-2 rounded-2xl bg-zinc-100/90 dark:bg-zinc-800/90 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-[#007AFF]">
                {editingMsg ? 'Editing message' : `Replying to ${replyTo?.senderName}`}
              </p>
              <p className="text-xs text-zinc-600 dark:text-zinc-300 truncate">
                {editingMsg ? editingMsg.text : replyTo?.text}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setReplyTo(null);
                setEditingMsg(null);
                if (editingMsg) setInputText('');
              }}
              className="p-1 text-zinc-400 hover:text-zinc-600 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Emoji Picker Popover */}
        {showEmojiPicker && (
          <div className="absolute bottom-full left-4 mb-2 w-72 p-3 rounded-2xl bg-white/95 dark:bg-zinc-900/95 backdrop-blur-2xl border border-black/[0.08] dark:border-white/[0.1] shadow-xl grid grid-cols-8 gap-1">
            {EMOJI_PALETTE.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => handleTypingChange(inputText + emoji)}
                className="w-8 h-8 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-center text-lg cursor-pointer"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        {/* Attachment Menu Popover */}
        {showAttachMenu && (
          <div className="absolute bottom-full left-4 mb-2 w-52 p-1.5 rounded-2xl bg-white/95 dark:bg-zinc-900/95 backdrop-blur-2xl border border-black/[0.08] dark:border-white/[0.1] shadow-xl space-y-0.5">
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium text-zinc-800 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
            >
              <ImageIcon className="w-4 h-4 text-[#007AFF]" /> Photo
            </button>
            <button
              type="button"
              onClick={() => videoInputRef.current?.click()}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium text-zinc-800 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
            >
              <Video className="w-4 h-4 text-indigo-500" /> Video
            </button>
            <button
              type="button"
              onClick={() => docInputRef.current?.click()}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium text-zinc-800 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
            >
              <FileText className="w-4 h-4 text-amber-500" /> Document
            </button>
            <button
              type="button"
              onClick={handleShareLocation}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium text-zinc-800 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
            >
              <MapPin className="w-4 h-4 text-emerald-500" /> Current Location
            </button>
          </div>
        )}

        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageSelect}
          className="sr-only"
        />
        <input
          ref={videoInputRef}
          type="file"
          accept="video/*"
          onChange={handleVideoSelect}
          className="sr-only"
        />
        <input
          ref={docInputRef}
          type="file"
          onChange={handleDocSelect}
          className="sr-only"
        />

        {blocked ? (
          <div className="py-2.5 text-center text-xs text-zinc-500">
            You blocked this contact. Unblock in Contact Info to send messages.
          </div>
        ) : isRecording ? (
          <div className="flex items-center justify-between gap-3 h-11 px-4 rounded-2xl bg-red-500/10 border border-red-500/20">
            <div className="flex items-center gap-2.5 text-red-600 dark:text-red-400 text-sm font-medium">
              <Mic className="w-4 h-4" />
              <span>Recording</span>
              <span className="tabular-nums font-mono text-xs">
                {formatDuration(recordSeconds)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => stopVoiceRecording(false)}
                className="px-3 py-1.5 rounded-xl text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => stopVoiceRecording(true)}
                className="px-3.5 py-1.5 rounded-xl bg-[#007AFF] text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer"
              >
                <Square className="w-3 h-3 fill-current" /> Send Voice
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSendText} className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => {
                setShowAttachMenu((v) => !v);
                setShowEmojiPicker(false);
              }}
              aria-label="Attach media or location"
              className="min-h-[42px] min-w-[42px] rounded-full bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 flex items-center justify-center shrink-0 transition-colors cursor-pointer"
            >
              <Plus className="w-5 h-5" />
            </button>

            <div className="flex-1 flex items-end rounded-2xl bg-zinc-100/90 dark:bg-zinc-800/90 border border-black/[0.04] dark:border-white/[0.06] px-3 py-1.5">
              <button
                type="button"
                onClick={() => {
                  setShowEmojiPicker((v) => !v);
                  setShowAttachMenu(false);
                }}
                aria-label="Emoji picker"
                className="p-1.5 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 shrink-0 cursor-pointer"
              >
                <Smile className="w-5 h-5" />
              </button>
              <textarea
                rows={1}
                value={inputText}
                onChange={(e) => handleTypingChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendText();
                  }
                }}
                placeholder="YouMessage"
                className="flex-1 max-h-32 bg-transparent px-2 py-1.5 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none resize-none"
              />
            </div>

            {inputText.trim() ? (
              <button
                type="submit"
                disabled={sending}
                aria-label="Send message"
                className="min-h-[42px] min-w-[42px] rounded-full bg-[#007AFF] hover:bg-[#0066D6] text-white flex items-center justify-center shrink-0 shadow-sm transition-colors disabled:opacity-50 cursor-pointer"
              >
                <Send className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={startVoiceRecording}
                aria-label="Record voice message"
                className="min-h-[42px] min-w-[42px] rounded-full bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-[#007AFF] flex items-center justify-center shrink-0 transition-colors cursor-pointer"
              >
                <Mic className="w-5 h-5" />
              </button>
            )}
          </form>
        )}
      </div>

      {/* Image Lightbox */}
      {lightboxImage && (
        <div
          onClick={() => setLightboxImage(null)}
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
        >
          <button
            type="button"
            onClick={() => setLightboxImage(null)}
            className="absolute top-5 right-5 w-10 h-10 rounded-full bg-white/15 text-white flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={lightboxImage}
            alt="Full preview"
            referrerPolicy="no-referrer"
            className="max-w-full max-h-[90vh] rounded-2xl object-contain"
          />
        </div>
      )}
    </div>
  );
};
