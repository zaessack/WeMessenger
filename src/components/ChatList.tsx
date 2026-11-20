import React, { useMemo, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  BellOff,
  Pin,
  Plus,
  Search,
  Users,
  X,
} from 'lucide-react';
import { Chat, ChatState, Contact, PublicUser } from '../types/youmessage';
import { formatChatListTime } from '../lib/media';
import { getVisibleOnline, getVisiblePhoto } from '../lib/privacy';
import { updateChatState } from '../lib/chatActions';
import { Avatar } from './Avatar';

interface ChatListProps {
  myUid: string;
  chats: Chat[];
  chatStates: Record<string, ChatState>;
  usersById: Record<string, PublicUser>;
  contacts: Record<string, Contact>;
  activeChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
  onNewGroup: () => void;
}

export const ChatList: React.FC<ChatListProps> = ({
  myUid,
  chats,
  chatStates,
  usersById,
  contacts,
  activeChatId,
  onSelectChat,
  onNewChat,
  onNewGroup,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const getChatDisplay = (chat: Chat) => {
    if (chat.type === 'group') {
      return {
        title: chat.name || 'Untitled Group',
        photo: chat.photoURL,
        isOnline: false,
        isGroup: true,
      };
    }
    const otherId = chat.memberIds.find((id) => id !== myUid) || myUid;
    const otherUser = usersById[otherId];
    const contact = contacts[otherId];
    return {
      title: contact?.nickname || otherUser?.displayName || 'YouMessage User',
      photo: getVisiblePhoto(otherUser, myUid, contacts),
      isOnline: getVisibleOnline(otherUser, myUid, contacts),
      isGroup: false,
    };
  };

  const isUnread = (chat: Chat): boolean => {
    const state = chatStates[chat.id];
    if (state && state.unreadCount > 0) return true;
    if (!chat.lastMessageAt || !chat.lastMessageSenderId) return false;
    if (chat.lastMessageSenderId === myUid) return false;
    if (!state?.lastReadAt) return true;
    return chat.lastMessageAt.toMillis() > state.lastReadAt.toMillis();
  };

  const archivedCount = useMemo(
    () => chats.filter((c) => chatStates[c.id]?.isArchived).length,
    [chats, chatStates]
  );

  const filteredChats = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return chats
      .filter((c) => {
        const archived = Boolean(chatStates[c.id]?.isArchived);
        if (q) {
          const disp = getChatDisplay(c);
          return (
            disp.title.toLowerCase().includes(q) ||
            (c.lastMessageText || '').toLowerCase().includes(q)
          );
        }
        return showArchived ? archived : !archived;
      })
      .sort((a, b) => {
        const aPinned = Boolean(chatStates[a.id]?.isPinned);
        const bPinned = Boolean(chatStates[b.id]?.isPinned);
        if (aPinned !== bPinned) return aPinned ? -1 : 1;
        const aTime = a.lastMessageAt?.toMillis() || a.updatedAt?.toMillis() || 0;
        const bTime = b.lastMessageAt?.toMillis() || b.updatedAt?.toMillis() || 0;
        return bTime - aTime;
      });
  }, [chats, chatStates, searchQuery, showArchived, usersById, contacts]);

  return (
    <div className="flex flex-col h-full bg-white/75 dark:bg-zinc-950/75 backdrop-blur-2xl">
      {/* Header */}
      <div className="px-5 pt-5 pb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {showArchived && (
            <button
              type="button"
              onClick={() => setShowArchived(false)}
              className="min-h-[36px] px-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 cursor-pointer"
            >
              Back
            </button>
          )}
          <h1 className="font-display text-2xl font-bold tracking-tight text-zinc-900 dark:text-white truncate">
            {showArchived ? 'Archived' : 'Messages'}
          </h1>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onNewGroup}
            title="New Group"
            aria-label="New Group"
            className="min-h-[40px] min-w-[40px] rounded-full bg-zinc-100/90 dark:bg-zinc-800/90 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 flex items-center justify-center transition-colors cursor-pointer"
          >
            <Users className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onNewChat}
            title="New Chat"
            aria-label="New Chat"
            className="min-h-[40px] min-w-[40px] rounded-full bg-[#007AFF] hover:bg-[#0066D6] text-white flex items-center justify-center shadow-sm transition-colors cursor-pointer"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="px-4 pb-3">
        <div className="relative">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search conversations"
            className="w-full h-10 pl-10 pr-9 rounded-xl bg-zinc-100/90 dark:bg-zinc-900/90 border border-black/[0.04] dark:border-white/[0.06] text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/35"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Archived Folder Trigger */}
      {!showArchived && !searchQuery && archivedCount > 0 && (
        <button
          type="button"
          onClick={() => setShowArchived(true)}
          className="mx-3 mb-1.5 px-3.5 py-2.5 rounded-2xl flex items-center justify-between text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100/80 dark:hover:bg-zinc-900/80 transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-3 font-medium">
            <Archive className="w-4 h-4 text-[#007AFF]" />
            Archived
          </span>
          <span className="text-xs text-zinc-500 tabular-nums">{archivedCount}</span>
        </button>
      )}

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto px-2 pb-24 lg:pb-4 space-y-0.5">
        {filteredChats.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              {searchQuery
                ? 'No matching conversations'
                : showArchived
                  ? 'No archived chats'
                  : 'No messages yet'}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
              {searchQuery
                ? 'Try searching a different contact or message keyword.'
                : 'Start a conversation or create a group with your contacts.'}
            </p>
            {!searchQuery && !showArchived && (
              <button
                type="button"
                onClick={onNewChat}
                className="px-4 py-2 rounded-xl bg-[#007AFF] text-white text-xs font-medium hover:bg-[#0066D6] transition-colors cursor-pointer"
              >
                Start a Chat
              </button>
            )}
          </div>
        ) : (
          filteredChats.map((chat) => {
            const disp = getChatDisplay(chat);
            const state = chatStates[chat.id];
            const active = activeChatId === chat.id;
            const unread = !active && isUnread(chat);

            return (
              <div
                key={chat.id}
                className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#007AFF]/12 dark:bg-[#007AFF]/20'
                    : 'hover:bg-zinc-100/80 dark:hover:bg-zinc-900/70'
                }`}
                onClick={() => onSelectChat(chat.id)}
              >
                <Avatar
                  src={disp.photo}
                  name={disp.title}
                  size="md"
                  isOnline={disp.isOnline}
                  isGroup={disp.isGroup}
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-[15px] truncate ${
                        unread
                          ? 'font-semibold text-zinc-950 dark:text-white'
                          : 'font-medium text-zinc-900 dark:text-zinc-100'
                      }`}
                    >
                      {disp.title}
                    </span>
                    <span
                      className={`text-[11px] tabular-nums shrink-0 ${
                        unread ? 'text-[#007AFF] font-semibold' : 'text-zinc-400 dark:text-zinc-500'
                      }`}
                    >
                      {formatChatListTime(chat.lastMessageAt || chat.updatedAt)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p
                      className={`text-xs truncate ${
                        unread
                          ? 'text-zinc-800 dark:text-zinc-200 font-medium'
                          : 'text-zinc-500 dark:text-zinc-400'
                      }`}
                    >
                      {chat.lastMessageSenderId === myUid && chat.lastMessageType !== 'system'
                        ? `You: ${chat.lastMessageText || ''}`
                        : chat.lastMessageText || 'No messages yet'}
                    </p>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {state?.isMuted && (
                        <BellOff className="w-3.5 h-3.5 text-zinc-400" aria-label="Muted" />
                      )}
                      {state?.isPinned && (
                        <Pin className="w-3.5 h-3.5 text-zinc-400" aria-label="Pinned" />
                      )}
                      {unread && (
                        <span className="min-w-[18px] h-[18px] px-1.5 rounded-full bg-[#007AFF] text-white text-[10px] font-semibold flex items-center justify-center tabular-nums">
                          {state?.unreadCount && state.unreadCount > 0 ? state.unreadCount : '1'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Quick hover actions on desktop */}
                <div
                  className="hidden lg:group-hover:flex items-center gap-1 absolute right-2 bottom-1.5 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md rounded-xl border border-black/[0.06] dark:border-white/[0.08] px-1 py-0.5 shadow-sm"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    title={state?.isPinned ? 'Unpin' : 'Pin'}
                    onClick={() =>
                      updateChatState(myUid, chat.id, { isPinned: !state?.isPinned })
                    }
                    className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 cursor-pointer"
                  >
                    <Pin className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    title={state?.isArchived ? 'Unarchive' : 'Archive'}
                    onClick={() =>
                      updateChatState(myUid, chat.id, { isArchived: !state?.isArchived })
                    }
                    className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 cursor-pointer"
                  >
                    {state?.isArchived ? (
                      <ArchiveRestore className="w-3.5 h-3.5" />
                    ) : (
                      <Archive className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
