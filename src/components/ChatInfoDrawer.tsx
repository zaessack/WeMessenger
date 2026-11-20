import React, { useState } from 'react';
import {
  Archive,
  Ban,
  Bell,
  BellOff,
  Camera,
  Check,
  LogOut,
  Pin,
  Shield,
  Timer,
  UserMinus,
  UserPlus,
  X,
} from 'lucide-react';
import {
  addGroupMember,
  addOrUpdateContact,
  removeGroupMember,
  toggleGroupAdmin,
  updateChatState,
  updateDisappearingDuration,
  updateGroupDetails,
} from '../lib/chatActions';
import { compressImageFile } from '../lib/media';
import {
  getVisibleAbout,
  getVisibleOnline,
  getVisiblePhoto,
  isUserBlocked,
} from '../lib/privacy';
import {
  Chat,
  ChatState,
  Contact,
  DisappearingDuration,
  PublicUser,
} from '../types/youmessage';
import { Avatar } from './Avatar';

interface ChatInfoDrawerProps {
  myUid: string;
  chat: Chat;
  chatState?: ChatState;
  usersById: Record<string, PublicUser>;
  allUsers: PublicUser[];
  contacts: Record<string, Contact>;
  onClose: () => void;
}

const DISAPPEARING_OPTIONS: { label: string; value: DisappearingDuration }[] = [
  { label: 'Off', value: 0 },
  { label: '24 Hours', value: 86400 },
  { label: '7 Days', value: 604800 },
  { label: '90 Days', value: 7776000 },
];

export const ChatInfoDrawer: React.FC<ChatInfoDrawerProps> = ({
  myUid,
  chat,
  chatState,
  usersById,
  allUsers,
  contacts,
  onClose,
}) => {
  const isGroup = chat.type === 'group';
  const isAdmin = chat.adminIds.includes(myUid);
  const otherUid = !isGroup ? chat.memberIds.find((id) => id !== myUid) : undefined;
  const otherUser = otherUid ? usersById[otherUid] : undefined;
  const blocked = otherUid ? isUserBlocked(otherUid, contacts) : false;

  const [editingGroup, setEditingGroup] = useState(false);
  const [groupName, setGroupName] = useState(chat.name || '');
  const [groupDesc, setGroupDesc] = useState(chat.description || '');
  const [addingMember, setAddingMember] = useState(false);

  const handleGroupPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const compressed = await compressImageFile(file, 480, 0.8);
    await updateGroupDetails(chat.id, { photoURL: compressed });
  };

  const handleSaveGroup = async () => {
    await updateGroupDetails(chat.id, { name: groupName, description: groupDesc });
    setEditingGroup(false);
  };

  const nonMembers = allUsers.filter(
    (u) => !chat.memberIds.includes(u.uid) && !contacts[u.uid]?.isBlocked
  );

  return (
    <div className="h-full w-full lg:w-[340px] bg-white/85 dark:bg-zinc-950/85 backdrop-blur-2xl border-l border-black/[0.06] dark:border-white/[0.08] flex flex-col overflow-hidden">
      <div className="px-5 py-3.5 border-b border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between">
        <h3 className="font-display text-base font-semibold text-zinc-900 dark:text-white">
          {isGroup ? 'Group Info' : 'Contact Info'}
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close info"
          className="min-h-[36px] min-w-[36px] rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-center text-zinc-500 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        {/* Identity Header */}
        <div className="flex flex-col items-center text-center">
          <div className="relative">
            <Avatar
              src={
                isGroup
                  ? chat.photoURL
                  : getVisiblePhoto(otherUser, myUid, contacts)
              }
              name={isGroup ? chat.name || 'Group' : otherUser?.displayName || 'User'}
              size="xl"
              isGroup={isGroup}
              isOnline={!isGroup && getVisibleOnline(otherUser, myUid, contacts)}
            />
            {isGroup && isAdmin && (
              <label className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-[#007AFF] text-white flex items-center justify-center shadow cursor-pointer">
                <Camera className="w-4 h-4" />
                <input type="file" accept="image/*" onChange={handleGroupPhoto} className="sr-only" />
              </label>
            )}
          </div>

          {isGroup && editingGroup ? (
            <div className="w-full mt-4 space-y-2">
              <input
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                className="w-full h-9 px-3 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-sm text-center font-medium"
                placeholder="Group name"
              />
              <textarea
                rows={2}
                value={groupDesc}
                onChange={(e) => setGroupDesc(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-xs resize-none"
                placeholder="Group description"
              />
              <div className="flex justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingGroup(false)}
                  className="px-3 py-1.5 rounded-xl text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveGroup}
                  className="px-3 py-1.5 rounded-xl bg-[#007AFF] text-white text-xs font-medium cursor-pointer"
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <>
              <h4 className="font-display text-lg font-bold text-zinc-900 dark:text-white mt-3">
                {isGroup
                  ? chat.name || 'Untitled Group'
                  : (otherUid && contacts[otherUid]?.nickname) || otherUser?.displayName || 'User'}
              </h4>
              {isGroup ? (
                <>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Group · {chat.memberIds.length} members
                  </p>
                  {chat.description && (
                    <p className="text-xs text-zinc-600 dark:text-zinc-300 mt-2 max-w-xs">
                      {chat.description}
                    </p>
                  )}
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        setGroupName(chat.name || '');
                        setGroupDesc(chat.description || '');
                        setEditingGroup(true);
                      }}
                      className="mt-2 text-xs font-medium text-[#007AFF] hover:underline cursor-pointer"
                    >
                      Edit Group Info
                    </button>
                  )}
                </>
              ) : (
                <>
                  {otherUser && (
                    <p className="text-xs text-zinc-500 mt-0.5">@{otherUser.username}</p>
                  )}
                  {getVisibleAbout(otherUser, myUid, contacts) && (
                    <p className="text-xs text-zinc-600 dark:text-zinc-300 mt-2">
                      {getVisibleAbout(otherUser, myUid, contacts)}
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {/* Chat Preferences */}
        <div className="rounded-2xl bg-zinc-100/70 dark:bg-zinc-900/70 divide-y divide-black/[0.05] dark:divide-white/[0.06] overflow-hidden">
          <button
            type="button"
            onClick={() =>
              updateChatState(myUid, chat.id, { isPinned: !chatState?.isPinned })
            }
            className="w-full px-4 py-3 flex items-center justify-between text-sm text-zinc-800 dark:text-zinc-200 hover:bg-black/[0.03] dark:hover:bg-white/[0.03] cursor-pointer"
          >
            <span className="flex items-center gap-3">
              <Pin className="w-4 h-4 text-[#007AFF]" />
              {chatState?.isPinned ? 'Unpin Chat' : 'Pin Chat'}
            </span>
          </button>

          <button
            type="button"
            onClick={() =>
              updateChatState(myUid, chat.id, { isMuted: !chatState?.isMuted })
            }
            className="w-full px-4 py-3 flex items-center justify-between text-sm text-zinc-800 dark:text-zinc-200 hover:bg-black/[0.03] dark:hover:bg-white/[0.03] cursor-pointer"
          >
            <span className="flex items-center gap-3">
              {chatState?.isMuted ? (
                <Bell className="w-4 h-4 text-[#007AFF]" />
              ) : (
                <BellOff className="w-4 h-4 text-[#007AFF]" />
              )}
              {chatState?.isMuted ? 'Unmute Notifications' : 'Mute Notifications'}
            </span>
          </button>

          <button
            type="button"
            onClick={() =>
              updateChatState(myUid, chat.id, { isArchived: !chatState?.isArchived })
            }
            className="w-full px-4 py-3 flex items-center justify-between text-sm text-zinc-800 dark:text-zinc-200 hover:bg-black/[0.03] dark:hover:bg-white/[0.03] cursor-pointer"
          >
            <span className="flex items-center gap-3">
              <Archive className="w-4 h-4 text-[#007AFF]" />
              {chatState?.isArchived ? 'Unarchive Chat' : 'Archive Chat'}
            </span>
          </button>
        </div>

        {/* Disappearing Messages */}
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-2 px-1">
            <Timer className="w-3.5 h-3.5" />
            <span>Disappearing Messages</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {DISAPPEARING_OPTIONS.map((opt) => {
              const active = chat.disappearingDuration === opt.value;
              const disabled = isGroup && !isAdmin;
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={disabled}
                  onClick={() => updateDisappearingDuration(chat.id, opt.value)}
                  className={`px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 ${
                    active
                      ? 'bg-[#007AFF] text-white'
                      : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Group Members Management */}
        {isGroup && (
          <div>
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                Members ({chat.memberIds.length})
              </span>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setAddingMember((v) => !v)}
                  className="text-xs font-medium text-[#007AFF] flex items-center gap-1 cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  {addingMember ? 'Done' : 'Add'}
                </button>
              )}
            </div>

            {addingMember && isAdmin && (
              <div className="mb-3 p-2 rounded-2xl bg-zinc-100 dark:bg-zinc-900 space-y-1 max-h-40 overflow-y-auto">
                {nonMembers.length === 0 ? (
                  <p className="text-xs text-zinc-500 p-2 text-center">No other accepted contacts to add.</p>
                ) : (
                  nonMembers.map((u) => (
                    <button
                      key={u.uid}
                      type="button"
                      onClick={() => addGroupMember(chat.id, u.uid)}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl hover:bg-white dark:hover:bg-zinc-800 text-xs cursor-pointer"
                    >
                      <span className="truncate font-medium">{u.displayName}</span>
                      <span className="text-[#007AFF]">Add</span>
                    </button>
                  ))
                )}
              </div>
            )}

            <div className="space-y-1.5">
              {chat.memberIds.map((uid) => {
                const u = usersById[uid];
                const memberIsAdmin = chat.adminIds.includes(uid);
                return (
                  <div
                    key={uid}
                    className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-2xl bg-zinc-100/60 dark:bg-zinc-900/60"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar
                        src={getVisiblePhoto(u, myUid, contacts)}
                        name={u?.displayName || 'Member'}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-zinc-900 dark:text-white truncate">
                          {uid === myUid ? 'You' : u?.displayName || 'Member'}
                        </p>
                        {memberIsAdmin && (
                          <p className="text-[10px] text-[#007AFF]">Group Admin</p>
                        )}
                      </div>
                    </div>

                    {isAdmin && uid !== myUid && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          title={memberIsAdmin ? 'Dismiss Admin' : 'Make Admin'}
                          onClick={() => toggleGroupAdmin(chat.id, uid, !memberIsAdmin)}
                          className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-zinc-500 cursor-pointer"
                        >
                          <Shield className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Remove from Group"
                          onClick={() => removeGroupMember(chat.id, uid)}
                          className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-500 cursor-pointer"
                        >
                          <UserMinus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => {
                removeGroupMember(chat.id, myUid);
                onClose();
              }}
              className="mt-4 w-full py-2.5 rounded-2xl bg-red-500/10 hover:bg-red-500/15 text-red-600 dark:text-red-400 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogOut className="w-4 h-4" /> Leave Group
            </button>
          </div>
        )}

        {/* Direct Contact Actions */}
        {!isGroup && otherUid && (
          <div className="space-y-2">
            {!contacts[otherUid] && (
              <button
                type="button"
                onClick={() => addOrUpdateContact(myUid, otherUid, { isBlocked: false })}
                className="w-full py-2.5 rounded-2xl bg-[#007AFF]/10 hover:bg-[#007AFF]/15 text-[#007AFF] text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
              >
                <Check className="w-4 h-4" /> Save to Contacts
              </button>
            )}
            <button
              type="button"
              onClick={() => addOrUpdateContact(myUid, otherUid, { isBlocked: !blocked })}
              className="w-full py-2.5 rounded-2xl bg-red-500/10 hover:bg-red-500/15 text-red-600 dark:text-red-400 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
            >
              <Ban className="w-4 h-4" />
              {blocked ? 'Unblock Contact' : 'Block Contact'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
