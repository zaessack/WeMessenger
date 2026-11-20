import React, { useMemo, useState } from 'react';
import {
  Ban,
  Check,
  Clock,
  MessageCircle,
  Phone,
  Search,
  Send,
  UserCheck,
  UserMinus,
  UserPlus,
  Video,
  X,
} from 'lucide-react';
import {
  addOrUpdateContact,
  cancelOrRemoveContactRequest,
  removeContact,
  respondToContactRequest,
  sendContactRequest,
} from '../lib/chatActions';
import { getVisibleAbout, getVisibleOnline, getVisiblePhoto } from '../lib/privacy';
import { CallType, Contact, ContactRequest, PublicUser } from '../types/youmessage';
import { Avatar } from './Avatar';

interface ContactsViewProps {
  myUser: PublicUser;
  contactUsers: PublicUser[];
  usersById: Record<string, PublicUser>;
  contacts: Record<string, Contact>;
  incomingRequests: ContactRequest[];
  outgoingRequests: ContactRequest[];
  onStartChat: (user: PublicUser) => void;
  onStartCall: (user: PublicUser, callType: CallType) => void;
}

export const ContactsView: React.FC<ContactsViewProps> = ({
  myUser,
  contactUsers,
  usersById,
  contacts,
  incomingRequests,
  outgoingRequests,
  onStartChat,
  onStartCall,
}) => {
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'contacts' | 'requests' | 'blocked'>('contacts');
  const [usernameInput, setUsernameInput] = useState('');
  const [sendingReq, setSendingReq] = useState(false);
  const [reqFeedback, setReqFeedback] = useState<{
    ok: boolean;
    message: string;
    user?: PublicUser;
    canChat?: boolean;
  } | null>(null);
  const [busyReqId, setBusyReqId] = useState<string | null>(null);

  const myUid = myUser.uid;

  const filteredContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contactUsers
      .filter((u) => u.uid !== myUid && !contacts[u.uid]?.isBlocked)
      .filter((u) => {
        if (!q) return true;
        const nick = contacts[u.uid]?.nickname || '';
        return (
          u.displayName.toLowerCase().includes(q) ||
          u.username.toLowerCase().includes(q) ||
          nick.toLowerCase().includes(q)
        );
      });
  }, [contactUsers, myUid, contacts, search]);

  const blockedContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return Object.values(contacts)
      .filter((c) => c.isBlocked)
      .map((c) => ({ contact: c, user: usersById[c.contactUid] }))
      .filter(({ contact, user }) => {
        if (!q) return true;
        const name = user?.displayName || '';
        const uname = user?.username || '';
        const nick = contact.nickname || '';
        return (
          name.toLowerCase().includes(q) ||
          uname.toLowerCase().includes(q) ||
          nick.toLowerCase().includes(q)
        );
      });
  }, [contacts, usersById, search]);

  const handleSendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameInput.trim()) return;
    setSendingReq(true);
    setReqFeedback(null);
    try {
      const res = await sendContactRequest(myUser, usernameInput);
      setReqFeedback({
        ok: res.ok,
        message: res.message,
        user: res.user,
        canChat: res.status === 'accepted' || res.status === 'already_connected',
      });
      if (res.ok) {
        setUsernameInput('');
      }
    } catch (err) {
      setReqFeedback({
        ok: false,
        message: err instanceof Error ? err.message : 'Unable to send contact request.',
      });
    } finally {
      setSendingReq(false);
    }
  };

  const handleRespond = async (req: ContactRequest, accept: boolean) => {
    setBusyReqId(req.id);
    try {
      await respondToContactRequest(myUid, req, accept);
    } finally {
      setBusyReqId(null);
    }
  };

  const handleCancel = async (reqId: string) => {
    setBusyReqId(reqId);
    try {
      await cancelOrRemoveContactRequest(reqId);
    } finally {
      setBusyReqId(null);
    }
  };

  return (
    <div className="h-full flex flex-col bg-white/75 dark:bg-zinc-950/75 backdrop-blur-2xl overflow-hidden">
      <header className="px-6 py-5 border-b border-black/[0.06] dark:border-white/[0.08] space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-display text-2xl font-bold text-zinc-900 dark:text-white">
              Contacts
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Add someone by their exact @username. They must accept your request before you can chat or call.
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 rounded-xl bg-zinc-100 dark:bg-zinc-900">
            <button
              type="button"
              onClick={() => setTab('contacts')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                tab === 'contacts'
                  ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm'
                  : 'text-zinc-600 dark:text-zinc-400'
              }`}
            >
              My Contacts ({filteredContacts.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('requests')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 cursor-pointer ${
                tab === 'requests'
                  ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm'
                  : 'text-zinc-600 dark:text-zinc-400'
              }`}
            >
              <span>Requests</span>
              {incomingRequests.length > 0 && (
                <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#007AFF] text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                  {incomingRequests.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setTab('blocked')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                tab === 'blocked'
                  ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm'
                  : 'text-zinc-600 dark:text-zinc-400'
              }`}
            >
              Blocked
            </button>
          </div>
        </div>

        {/* Direct @username request form */}
        <form onSubmit={handleSendRequest} className="max-w-xl space-y-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 text-sm font-medium">
                @
              </span>
              <input
                type="text"
                value={usernameInput}
                onChange={(e) =>
                  setUsernameInput(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''))
                }
                placeholder="Enter exact username to send a request"
                className="w-full h-11 pl-8 pr-4 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-black/[0.05] dark:border-white/[0.07] text-sm focus:outline-none focus:ring-2 focus:ring-[#007AFF]/40"
              />
            </div>
            <button
              type="submit"
              disabled={sendingReq || !usernameInput.trim()}
              className="min-h-[44px] px-4 rounded-xl bg-[#007AFF] hover:bg-[#0066D6] text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer shrink-0"
            >
              <UserPlus className="w-4 h-4" />
              <span>{sendingReq ? 'Sending...' : 'Add Username'}</span>
            </button>
          </div>

          {reqFeedback && (
            <div
              className={`px-3.5 py-2.5 rounded-xl text-xs flex items-center justify-between gap-3 ${
                reqFeedback.ok
                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20'
              }`}
            >
              <span>{reqFeedback.message}</span>
              {reqFeedback.canChat && reqFeedback.user && (
                <button
                  type="button"
                  onClick={() => onStartChat(reqFeedback.user!)}
                  className="px-3 py-1 rounded-lg bg-[#007AFF] text-white text-xs font-semibold shrink-0 cursor-pointer"
                >
                  Open Chat
                </button>
              )}
            </div>
          )}
        </form>

        {tab !== 'requests' && (
          <div className="relative max-w-md">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter your saved contacts"
              className="w-full h-10 pl-10 pr-4 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-black/[0.04] dark:border-white/[0.06] text-sm focus:outline-none focus:ring-2 focus:ring-[#007AFF]/40"
            />
          </div>
        )}
      </header>

      <div className="flex-1 overflow-y-auto p-5 pb-24 lg:pb-6 max-w-3xl w-full mx-auto space-y-4">
        {tab === 'contacts' && (
          <>
            {filteredContacts.length === 0 ? (
              <div className="p-10 rounded-3xl bg-white/60 dark:bg-zinc-900/60 border border-black/[0.05] dark:border-white/[0.06] text-center space-y-2">
                <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                  {search.trim() ? 'No matching contacts' : 'No accepted contacts yet'}
                </p>
                <p className="text-xs text-zinc-500 max-w-sm mx-auto leading-relaxed">
                  {search.trim()
                    ? 'Try another name or @username.'
                    : 'Enter a friend’s exact @username above to send them a contact request. Once they accept, tap their username to start chatting.'}
                </p>
                {incomingRequests.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setTab('requests')}
                    className="mt-2 px-4 py-2 rounded-xl bg-[#007AFF] text-white text-xs font-semibold cursor-pointer"
                  >
                    View {incomingRequests.length} Pending Request{incomingRequests.length > 1 ? 's' : ''}
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredContacts.map((user) => {
                  const contact = contacts[user.uid];
                  const about = getVisibleAbout(user, myUid, contacts);

                  return (
                    <div
                      key={user.uid}
                      className="p-3 rounded-2xl bg-white/85 dark:bg-zinc-900/85 border border-black/[0.05] dark:border-white/[0.07] flex items-center justify-between gap-3"
                    >
                      <button
                        type="button"
                        onClick={() => onStartChat(user)}
                        className="flex items-center gap-3 min-w-0 flex-1 text-left rounded-xl p-1 -m-1 hover:bg-zinc-100/70 dark:hover:bg-zinc-800/60 transition-colors cursor-pointer"
                      >
                        <Avatar
                          src={getVisiblePhoto(user, myUid, contacts)}
                          name={user.displayName}
                          size="md"
                          isOnline={getVisibleOnline(user, myUid, contacts)}
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">
                            {contact?.nickname || user.displayName}
                          </p>
                          <p className="text-xs text-[#007AFF] dark:text-sky-400 truncate">
                            @{user.username}
                            {about ? (
                              <span className="text-zinc-500 dark:text-zinc-400"> · {about}</span>
                            ) : null}
                          </p>
                        </div>
                      </button>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => onStartChat(user)}
                          title="Message"
                          aria-label={`Message ${user.displayName}`}
                          className="min-h-[40px] min-w-[40px] rounded-xl bg-[#007AFF]/10 hover:bg-[#007AFF]/20 text-[#007AFF] flex items-center justify-center cursor-pointer"
                        >
                          <MessageCircle className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onStartCall(user, 'voice')}
                          title="Voice Call"
                          aria-label={`Voice call ${user.displayName}`}
                          className="min-h-[40px] min-w-[40px] rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 flex items-center justify-center cursor-pointer"
                        >
                          <Phone className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onStartCall(user, 'video')}
                          title="Video Call"
                          aria-label={`Video call ${user.displayName}`}
                          className="min-h-[40px] min-w-[40px] rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 flex items-center justify-center cursor-pointer"
                        >
                          <Video className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeContact(myUid, user.uid)}
                          title="Remove Contact"
                          aria-label={`Remove ${user.displayName}`}
                          className="min-h-[40px] min-w-[40px] rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 flex items-center justify-center cursor-pointer"
                        >
                          <UserMinus className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            addOrUpdateContact(myUid, user.uid, { isBlocked: true })
                          }
                          title="Block"
                          aria-label={`Block ${user.displayName}`}
                          className="min-h-[40px] min-w-[40px] rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 flex items-center justify-center cursor-pointer"
                        >
                          <Ban className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {tab === 'requests' && (
          <div className="space-y-6">
            <section className="space-y-2">
              <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 px-1">
                Incoming Requests ({incomingRequests.length})
              </h2>
              {incomingRequests.length === 0 ? (
                <div className="p-6 rounded-2xl bg-white/60 dark:bg-zinc-900/60 border border-black/[0.05] dark:border-white/[0.06] text-center text-xs text-zinc-500">
                  No incoming contact requests.
                </div>
              ) : (
                incomingRequests.map((req) => {
                  const sender = usersById[req.fromUid];
                  const name = sender?.displayName || req.fromDisplayName;
                  const uname = sender?.username || req.fromUsername;
                  const photo = sender?.photoURL || req.fromPhoto;
                  const busy = busyReqId === req.id;

                  return (
                    <div
                      key={req.id}
                      className="p-3.5 rounded-2xl bg-white/85 dark:bg-zinc-900/85 border border-black/[0.05] dark:border-white/[0.07] flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar src={photo} name={name} size="md" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">
                            {name}
                          </p>
                          <p className="text-xs text-zinc-500 truncate">
                            @{uname} wants to connect with you
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleRespond(req, true)}
                          className="min-h-[38px] px-3.5 rounded-xl bg-[#007AFF] hover:bg-[#0066D6] text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Accept
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleRespond(req, false)}
                          className="min-h-[38px] px-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-xs font-medium flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                          Decline
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </section>

            <section className="space-y-2">
              <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 px-1">
                Sent Requests ({outgoingRequests.length})
              </h2>
              {outgoingRequests.length === 0 ? (
                <div className="p-6 rounded-2xl bg-white/60 dark:bg-zinc-900/60 border border-black/[0.05] dark:border-white/[0.06] text-center text-xs text-zinc-500">
                  No pending sent requests.
                </div>
              ) : (
                outgoingRequests.map((req) => {
                  const recipient = usersById[req.toUid];
                  const name = recipient?.displayName || req.toDisplayName;
                  const uname = recipient?.username || req.toUsername;
                  const photo = recipient?.photoURL || req.toPhoto;
                  const busy = busyReqId === req.id;

                  return (
                    <div
                      key={req.id}
                      className="p-3.5 rounded-2xl bg-white/85 dark:bg-zinc-900/85 border border-black/[0.05] dark:border-white/[0.07] flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar src={photo} name={name} size="md" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">
                            {name}
                          </p>
                          <p className="text-xs text-zinc-500 truncate flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            @{uname} · Pending acceptance
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleCancel(req.id)}
                        className="min-h-[38px] px-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 text-xs font-medium flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shrink-0"
                      >
                        <Send className="w-3.5 h-3.5 opacity-60" />
                        Cancel
                      </button>
                    </div>
                  );
                })
              )}
            </section>
          </div>
        )}

        {tab === 'blocked' && (
          <>
            {blockedContacts.length === 0 ? (
              <div className="p-10 rounded-3xl bg-white/60 dark:bg-zinc-900/60 border border-black/[0.05] dark:border-white/[0.06] text-center">
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  No blocked contacts
                </p>
                <p className="text-xs text-zinc-500 mt-1">
                  Users you block will appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {blockedContacts.map(({ contact, user }) => (
                  <div
                    key={contact.contactUid}
                    className="p-3.5 rounded-2xl bg-white/85 dark:bg-zinc-900/85 border border-black/[0.05] dark:border-white/[0.07] flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar
                        src={user?.photoURL}
                        name={user?.displayName || contact.contactUid}
                        size="md"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">
                          {contact.nickname || user?.displayName || contact.contactUid}
                        </p>
                        {user?.username && (
                          <p className="text-xs text-zinc-500 truncate">@{user.username}</p>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        addOrUpdateContact(myUid, contact.contactUid, { isBlocked: false })
                      }
                      className="min-h-[38px] px-3.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                    >
                      <UserCheck className="w-4 h-4" />
                      Unblock
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
