import React, { useMemo, useState } from 'react';
import { Camera, Check, Search, UserPlus, Users, X } from 'lucide-react';
import { Chat, Contact, Message, PublicUser } from '../types/youmessage';
import { sendContactRequest } from '../lib/chatActions';
import { compressImageFile } from '../lib/media';
import { getVisiblePhoto } from '../lib/privacy';
import { Avatar } from './Avatar';

interface NewChatModalProps {
  myUser: PublicUser;
  users: PublicUser[];
  contacts: Record<string, Contact>;
  onClose: () => void;
  onStartChat: (user: PublicUser) => Promise<void> | void;
}

export const NewChatModal: React.FC<NewChatModalProps> = ({
  myUser,
  users,
  contacts,
  onClose,
  onStartChat,
}) => {
  const myUid = myUser.uid;
  const [search, setSearch] = useState('');
  const [usernameToAdd, setUsernameToAdd] = useState('');
  const [sendingReq, setSendingReq] = useState(false);
  const [feedback, setFeedback] = useState<{
    ok: boolean;
    message: string;
    user?: PublicUser;
    canChat?: boolean;
  } | null>(null);
  const [openingUid, setOpeningUid] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users
      .filter((u) => u.uid !== myUid && !contacts[u.uid]?.isBlocked)
      .filter(
        (u) =>
          !q ||
          u.displayName.toLowerCase().includes(q) ||
          u.username.toLowerCase().includes(q)
      );
  }, [users, myUid, contacts, search]);

  const handleAddByUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameToAdd.trim()) return;
    setSendingReq(true);
    setFeedback(null);
    try {
      const res = await sendContactRequest(myUser, usernameToAdd);
      setFeedback({
        ok: res.ok,
        message: res.message,
        user: res.user,
        canChat: res.status === 'accepted' || res.status === 'already_connected',
      });
      if (res.ok) setUsernameToAdd('');
    } catch (err) {
      setFeedback({
        ok: false,
        message: err instanceof Error ? err.message : 'Could not send contact request.',
      });
    } finally {
      setSendingReq(false);
    }
  };

  const handleSelectUser = async (user: PublicUser) => {
    setOpeningUid(user.uid);
    try {
      await onStartChat(user);
    } finally {
      setOpeningUid(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-3xl bg-white/95 dark:bg-zinc-900/95 backdrop-blur-2xl border border-black/[0.06] dark:border-white/[0.08] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-zinc-900 dark:text-white">
            New Message
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="min-h-[36px] min-w-[36px] rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-center text-zinc-500 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Add contact by exact username */}
        <form
          onSubmit={handleAddByUsername}
          className="p-4 border-b border-black/[0.05] dark:border-white/[0.06] space-y-2 bg-zinc-50/70 dark:bg-zinc-950/40"
        >
          <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            Add someone by @username (they must accept before chatting)
          </p>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-xs">@</span>
              <input
                type="text"
                value={usernameToAdd}
                onChange={(e) =>
                  setUsernameToAdd(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''))
                }
                placeholder="exact.username"
                className="w-full h-9 pl-7 pr-3 rounded-xl bg-white dark:bg-zinc-800 border border-black/[0.06] dark:border-white/[0.08] text-xs focus:outline-none focus:ring-2 focus:ring-[#007AFF]/40"
              />
            </div>
            <button
              type="submit"
              disabled={sendingReq || !usernameToAdd.trim()}
              className="h-9 px-3 rounded-xl bg-[#007AFF] hover:bg-[#0066D6] text-white text-xs font-semibold flex items-center gap-1 disabled:opacity-50 cursor-pointer shrink-0"
            >
              <UserPlus className="w-3.5 h-3.5" />
              {sendingReq ? 'Sending...' : 'Request'}
            </button>
          </div>
          {feedback && (
            <div
              className={`px-3 py-2 rounded-xl text-[11px] flex items-center justify-between gap-2 ${
                feedback.ok
                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
              }`}
            >
              <span>{feedback.message}</span>
              {feedback.canChat && feedback.user && (
                <button
                  type="button"
                  onClick={() => handleSelectUser(feedback.user!)}
                  className="px-2.5 py-1 rounded-lg bg-[#007AFF] text-white font-semibold shrink-0 cursor-pointer"
                >
                  Chat
                </button>
              )}
            </div>
          )}
        </form>

        <div className="p-3 border-b border-black/[0.05] dark:border-white/[0.06]">
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search your accepted contacts"
              className="w-full h-10 pl-10 pr-4 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-[#007AFF]/40"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {filtered.length === 0 ? (
            <p className="py-10 px-4 text-center text-sm text-zinc-500">
              {users.length === 0
                ? 'No accepted contacts yet. Send a contact request by @username above.'
                : 'No matching contacts found.'}
            </p>
          ) : (
            filtered.map((user) => (
              <button
                key={user.uid}
                type="button"
                disabled={openingUid === user.uid}
                onClick={() => handleSelectUser(user)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-colors text-left cursor-pointer disabled:opacity-60"
              >
                <Avatar
                  src={getVisiblePhoto(user, myUid, contacts)}
                  name={user.displayName}
                  size="md"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">
                    {contacts[user.uid]?.nickname || user.displayName}
                  </p>
                  <p className="text-xs text-zinc-500 truncate">@{user.username}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

interface NewGroupModalProps {
  myUid: string;
  users: PublicUser[];
  contacts: Record<string, Contact>;
  onClose: () => void;
  onCreateGroup: (data: {
    name: string;
    description: string;
    photoURL?: string;
    memberIds: string[];
  }) => Promise<void>;
}

export const NewGroupModal: React.FC<NewGroupModalProps> = ({
  myUid,
  users,
  contacts,
  onClose,
  onCreateGroup,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [photoURL, setPhotoURL] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const availableUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users
      .filter((u) => u.uid !== myUid && !contacts[u.uid]?.isBlocked)
      .filter(
        (u) =>
          !q ||
          u.displayName.toLowerCase().includes(q) ||
          u.username.toLowerCase().includes(q)
      );
  }, [users, myUid, contacts, search]);

  const toggleMember = (uid: string) => {
    setSelectedIds((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageFile(file, 480, 0.8);
      setPhotoURL(compressed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to process image.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter a group name.');
      return;
    }
    if (selectedIds.length === 0) {
      setError('Please select at least 1 member.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onCreateGroup({
        name,
        description,
        photoURL,
        memberIds: selectedIds,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create group.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg rounded-3xl bg-white/95 dark:bg-zinc-900/95 backdrop-blur-2xl border border-black/[0.06] dark:border-white/[0.08] shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
      >
        <div className="px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-[#007AFF]" />
            New Group
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[36px] min-w-[36px] rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-center text-zinc-500 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              <Avatar src={photoURL} name={name || 'Group'} size="lg" isGroup />
              <label className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-[#007AFF] text-white flex items-center justify-center cursor-pointer shadow-sm">
                <Camera className="w-3.5 h-3.5" />
                <input type="file" accept="image/*" onChange={handlePhoto} className="sr-only" />
              </label>
            </div>
            <div className="flex-1 space-y-2">
              <input
                type="text"
                required
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Group subject"
                className="w-full h-10 px-3.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-[#007AFF]/40"
              />
              <input
                type="text"
                maxLength={300}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description (optional)"
                className="w-full h-9 px-3.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs focus:outline-none focus:ring-2 focus:ring-[#007AFF]/40"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Select Members ({selectedIds.length} selected)
              </span>
            </div>
            <div className="relative mb-2">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter accepted contacts..."
                className="w-full h-9 pl-9 pr-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs focus:outline-none"
              />
            </div>
            <div className="max-h-52 overflow-y-auto space-y-1">
              {availableUsers.length === 0 ? (
                <p className="py-6 text-center text-xs text-zinc-500">
                  No accepted contacts available. Add friends by @username first.
                </p>
              ) : (
                availableUsers.map((user) => {
                const checked = selectedIds.includes(user.uid);
                return (
                  <button
                    key={user.uid}
                    type="button"
                    onClick={() => toggleMember(user.uid)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition-colors cursor-pointer ${
                      checked
                        ? 'bg-[#007AFF]/10 text-zinc-900 dark:text-white'
                        : 'hover:bg-zinc-100 dark:hover:bg-zinc-800/70'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar
                        src={getVisiblePhoto(user, myUid, contacts)}
                        name={user.displayName}
                        size="sm"
                      />
                      <div className="text-left min-w-0">
                        <p className="text-sm font-medium truncate">{user.displayName}</p>
                        <p className="text-xs text-zinc-500 truncate">@{user.username}</p>
                      </div>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center border ${
                        checked
                          ? 'bg-[#007AFF] border-[#007AFF] text-white'
                          : 'border-zinc-300 dark:border-zinc-600'
                      }`}
                    >
                      {checked && <Check className="w-3 h-3" />}
                    </div>
                  </button>
                );
                })
              )}
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>

        <div className="px-5 py-4 border-t border-black/[0.06] dark:border-white/[0.08] flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2 rounded-xl bg-[#007AFF] hover:bg-[#0066D6] text-white text-sm font-medium disabled:opacity-60 cursor-pointer"
          >
            {submitting ? 'Creating...' : 'Create Group'}
          </button>
        </div>
      </form>
    </div>
  );
};

interface ForwardModalProps {
  myUid: string;
  message: Message;
  chats: Chat[];
  usersById: Record<string, PublicUser>;
  contacts: Record<string, Contact>;
  onClose: () => void;
  onForwardToChats: (targetChats: Chat[]) => Promise<void>;
}

export const ForwardModal: React.FC<ForwardModalProps> = ({
  myUid,
  chats,
  usersById,
  contacts,
  onClose,
  onForwardToChats,
}) => {
  const [selectedChatIds, setSelectedChatIds] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  const toggle = (id: string) => {
    setSelectedChatIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSend = async () => {
    if (selectedChatIds.length === 0) return;
    setSending(true);
    try {
      const targets = chats.filter((c) => selectedChatIds.includes(c.id));
      await onForwardToChats(targets);
      onClose();
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-3xl bg-white/95 dark:bg-zinc-900/95 backdrop-blur-2xl border border-black/[0.06] dark:border-white/[0.08] shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        <div className="px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-zinc-900 dark:text-white">
            Forward Message
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[36px] min-w-[36px] rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-center text-zinc-500 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {chats.map((chat) => {
            const otherId = chat.memberIds.find((id) => id !== myUid) || myUid;
            const other = usersById[otherId];
            const title =
              chat.type === 'group'
                ? chat.name || 'Group'
                : contacts[otherId]?.nickname || other?.displayName || 'User';
            const photo =
              chat.type === 'group'
                ? chat.photoURL
                : getVisiblePhoto(other, myUid, contacts);
            const checked = selectedChatIds.includes(chat.id);
            return (
              <button
                key={chat.id}
                type="button"
                onClick={() => toggle(chat.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-2xl transition-colors cursor-pointer ${
                  checked ? 'bg-[#007AFF]/10' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800/70'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar src={photo} name={title} size="sm" isGroup={chat.type === 'group'} />
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                    {title}
                  </span>
                </div>
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center border ${
                    checked
                      ? 'bg-[#007AFF] border-[#007AFF] text-white'
                      : 'border-zinc-300 dark:border-zinc-600'
                  }`}
                >
                  {checked && <Check className="w-3 h-3" />}
                </div>
              </button>
            );
          })}
        </div>

        <div className="px-5 py-4 border-t border-black/[0.06] dark:border-white/[0.08] flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={selectedChatIds.length === 0 || sending}
            onClick={handleSend}
            className="px-5 py-2 rounded-xl bg-[#007AFF] hover:bg-[#0066D6] text-white text-sm font-medium disabled:opacity-50 cursor-pointer"
          >
            {sending ? 'Forwarding...' : `Forward (${selectedChatIds.length})`}
          </button>
        </div>
      </div>
    </div>
  );
};
