import React, { useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signOut, User as FirebaseUser } from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  CircleDot,
  MessageCircle,
  Moon,
  Phone,
  Settings,
  Sun,
  Users,
  X,
} from 'lucide-react';
import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
import {
  addOrUpdateContact,
  createGroupChat,
  getOrCreateDirectChat,
  sendMessage,
} from './lib/chatActions';
import { playNotificationChime, sanitizeId } from './lib/media';
import {
  CallSession,
  CallType,
  Chat,
  ChatState,
  Contact,
  ContactRequest,
  Message,
  NavTab,
  PrivateUser,
  PublicUser,
  StatusUpdate,
  ToastNotification,
} from './types/youmessage';
import { ActiveCallModal } from './components/ActiveCallModal';
import { AuthScreen } from './components/AuthScreen';
import { Avatar } from './components/Avatar';
import { CallsView } from './components/CallsView';
import { ChatInfoDrawer } from './components/ChatInfoDrawer';
import { ChatList } from './components/ChatList';
import { ChatWindow } from './components/ChatWindow';
import { ContactsView } from './components/ContactsView';
import { ForwardModal, NewChatModal, NewGroupModal } from './components/Modals';
import { PinLockScreen } from './components/PinLockScreen';
import { SettingsView } from './components/SettingsView';
import { StatusView } from './components/StatusView';

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [myPublicUser, setMyPublicUser] = useState<PublicUser | null>(null);
  const [myPrivateUser, setMyPrivateUser] = useState<PrivateUser | null>(null);
  const [profileChecked, setProfileChecked] = useState(false);

  const [knownUsersById, setKnownUsersById] = useState<Record<string, PublicUser>>({});
  const [contacts, setContacts] = useState<Record<string, Contact>>({});
  const [contactRequests, setContactRequests] = useState<ContactRequest[]>([]);
  const [chatStates, setChatStates] = useState<Record<string, ChatState>>({});
  const [chats, setChats] = useState<Chat[]>([]);
  const [statuses, setStatuses] = useState<StatusUpdate[]>([]);
  const [calls, setCalls] = useState<CallSession[]>([]);

  const [activeTab, setActiveTab] = useState<NavTab>('chats');
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [showInfoDrawer, setShowInfoDrawer] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);
  const [activeCall, setActiveCall] = useState<CallSession | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const [localThemeOverride, setLocalThemeOverride] = useState<'light' | 'dark'>(() => {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const prevChatLastMsgRef = useRef<Record<string, number>>({});
  const initialChatsLoadedRef = useRef(false);
  const userUnsubsRef = useRef<Map<string, () => void>>(new Map());
  const syncedAcceptedRef = useRef<Set<string>>(new Set());

  const usersById = useMemo(() => {
    const map: Record<string, PublicUser> = { ...knownUsersById };
    if (myPublicUser) map[myPublicUser.uid] = myPublicUser;
    return map;
  }, [knownUsersById, myPublicUser]);

  const incomingRequests = useMemo(() => {
    if (!myPublicUser) return [];
    return contactRequests.filter(
      (r) => r.toUid === myPublicUser.uid && r.status === 'pending'
    );
  }, [contactRequests, myPublicUser]);

  const outgoingRequests = useMemo(() => {
    if (!myPublicUser) return [];
    return contactRequests.filter(
      (r) => r.fromUid === myPublicUser.uid && r.status === 'pending'
    );
  }, [contactRequests, myPublicUser]);

  const acceptedPeerUids = useMemo(() => {
    const set = new Set<string>();
    if (!myPublicUser) return set;
    contactRequests.forEach((r) => {
      if (r.status === 'accepted') {
        const peerUid = r.fromUid === myPublicUser.uid ? r.toUid : r.fromUid;
        set.add(peerUid);
      }
    });
    return set;
  }, [contactRequests, myPublicUser]);

  const acceptedContactUsers = useMemo(() => {
    if (!myPublicUser) return [];
    const list: PublicUser[] = [];
    acceptedPeerUids.forEach((peerUid) => {
      if (contacts[peerUid]?.isBlocked) return;
      const u = usersById[peerUid];
      if (u) {
        list.push(u);
      }
    });
    return list.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [acceptedPeerUids, contacts, usersById, myPublicUser]);

  // Compute dark mode class
  const isDark = useMemo(() => {
    const mode = myPrivateUser?.themeMode || localThemeOverride;
    if (mode === 'dark') return true;
    if (mode === 'light') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }, [myPrivateUser?.themeMode, localThemeOverride]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  // Firebase Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthReady(true);
      if (!user) {
        setMyPublicUser(null);
        setMyPrivateUser(null);
        setProfileChecked(true);
        setActiveChatId(null);
        setChats([]);
        setStatuses([]);
        setCalls([]);
        setContactRequests([]);
        setContacts({});
        setKnownUsersById({});
        syncedAcceptedRef.current.clear();
        initialChatsLoadedRef.current = false;
      } else {
        setProfileChecked(false);
      }
    });
    return () => unsub();
  }, []);

  // Load current user's public & private profile
  useEffect(() => {
    if (!firebaseUser) return;
    const uid = firebaseUser.uid;
    let gotPublic = false;
    let gotPrivate = false;
    const markChecked = () => {
      if (gotPublic && gotPrivate) setProfileChecked(true);
    };

    const unsubPub = onSnapshot(
      doc(db, 'users_public', uid),
      (snap) => {
        setMyPublicUser(snap.exists() ? (snap.data() as PublicUser) : null);
        gotPublic = true;
        markChecked();
      },
      (err) => handleFirestoreError(err, OperationType.GET, `users_public/${uid}`)
    );

    const unsubPriv = onSnapshot(
      doc(db, 'users_private', uid),
      (snap) => {
        if (snap.exists()) {
          const priv = snap.data() as PrivateUser;
          setMyPrivateUser(priv);
          if (priv.securityLockEnabled && priv.securityPin && !gotPrivate) {
            setIsLocked(true);
          }
        } else {
          setMyPrivateUser(null);
        }
        gotPrivate = true;
        markChecked();
      },
      (err) => handleFirestoreError(err, OperationType.GET, `users_private/${uid}`)
    );

    return () => {
      unsubPub();
      unsubPriv();
    };
  }, [firebaseUser]);

  // Online presence heartbeat
  useEffect(() => {
    if (!myPublicUser) return;
    const uid = myPublicUser.uid;
    const setOnline = (online: boolean) => {
      updateDoc(doc(db, 'users_public', uid), {
        isOnline: online,
        lastSeen: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    };
    setOnline(true);

    const onVisibility = () => {
      setOnline(document.visibilityState === 'visible');
    };
    const onUnload = () => {
      setOnline(false);
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', onUnload);
      setOnline(false);
    };
  }, [myPublicUser?.uid]);

  // Real-time ContactRequests, Contacts, ChatStates, Chats, Statuses, Calls
  useEffect(() => {
    if (!myPublicUser || !myPrivateUser) return;
    const uid = myPublicUser.uid;

    const unsubRequests = onSnapshot(
      query(collection(db, 'contactRequests'), where('participantIds', 'array-contains', uid)),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as ContactRequest)
          .sort((a, b) => (b.updatedAt?.toMillis() || 0) - (a.updatedAt?.toMillis() || 0));
        setContactRequests(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'contactRequests')
    );

    const unsubContacts = onSnapshot(
      collection(db, 'users_private', uid, 'contacts'),
      (snap) => {
        const map: Record<string, Contact> = {};
        snap.docs.forEach((d) => {
          map[d.id] = d.data() as Contact;
        });
        setContacts(map);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `users_private/${uid}/contacts`)
    );

    const unsubStates = onSnapshot(
      collection(db, 'users_private', uid, 'chatStates'),
      (snap) => {
        const map: Record<string, ChatState> = {};
        snap.docs.forEach((d) => {
          map[d.id] = d.data() as ChatState;
        });
        setChatStates(map);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `users_private/${uid}/chatStates`)
    );

    const unsubChats = onSnapshot(
      query(collection(db, 'chats'), where('memberIds', 'array-contains', uid)),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as Chat);
        setChats(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'chats')
    );

    // 3 compliant queries for statuses merged cleanly
    const statusBuckets: Record<string, Record<string, StatusUpdate>> = {
      own: {},
      public: {},
      shared: {},
    };
    const syncStatuses = () => {
      const merged: Record<string, StatusUpdate> = {
        ...statusBuckets.public,
        ...statusBuckets.shared,
        ...statusBuckets.own,
      };
      setStatuses(Object.values(merged));
    };

    const unsubStOwn = onSnapshot(
      query(collection(db, 'statuses'), where('authorId', '==', uid)),
      (snap) => {
        statusBuckets.own = {};
        snap.docs.forEach((d) => (statusBuckets.own[d.id] = d.data() as StatusUpdate));
        syncStatuses();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'statuses')
    );

    const unsubStPub = onSnapshot(
      query(collection(db, 'statuses'), where('privacy', '==', 'everyone')),
      (snap) => {
        statusBuckets.public = {};
        snap.docs.forEach((d) => (statusBuckets.public[d.id] = d.data() as StatusUpdate));
        syncStatuses();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'statuses')
    );

    const unsubStShared = onSnapshot(
      query(collection(db, 'statuses'), where('allowedUids', 'array-contains', uid)),
      (snap) => {
        statusBuckets.shared = {};
        snap.docs.forEach((d) => (statusBuckets.shared[d.id] = d.data() as StatusUpdate));
        syncStatuses();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'statuses')
    );

    const unsubCalls = onSnapshot(
      query(collection(db, 'calls'), where('participantIds', 'array-contains', uid)),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as CallSession)
          .sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
        setCalls(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'calls')
    );

    return () => {
      unsubRequests();
      unsubContacts();
      unsubStates();
      unsubChats();
      unsubStOwn();
      unsubStPub();
      unsubStShared();
      unsubCalls();
    };
  }, [myPublicUser?.uid, Boolean(myPrivateUser)]);

  // Auto-sync accepted contact requests into owner's private contacts collection
  useEffect(() => {
    if (!myPublicUser) return;
    const uid = myPublicUser.uid;
    contactRequests.forEach((req) => {
      if (req.status !== 'accepted') return;
      const peerUid = req.fromUid === uid ? req.toUid : req.fromUid;
      if (!contacts[peerUid] && !syncedAcceptedRef.current.has(peerUid)) {
        syncedAcceptedRef.current.add(peerUid);
        addOrUpdateContact(uid, peerUid, { isBlocked: false }).catch(() => {
          syncedAcceptedRef.current.delete(peerUid);
        });
      }
    });
  }, [contactRequests, contacts, myPublicUser]);

  // Scoped per-UID public user profile listeners (no open platform directory browsing)
  const watchedPeerUidsKey = useMemo(() => {
    if (!myPublicUser) return '';
    const uids = new Set<string>();
    Object.keys(contacts).forEach((id) => uids.add(id));
    contactRequests.forEach((r) => {
      uids.add(r.fromUid);
      uids.add(r.toUid);
    });
    chats.forEach((c) => c.memberIds.forEach((id) => uids.add(id)));
    calls.forEach((c) => c.participantIds.forEach((id) => uids.add(id)));
    uids.delete(myPublicUser.uid);
    return Array.from(uids).sort().join(',');
  }, [myPublicUser, contacts, contactRequests, chats, calls]);

  useEffect(() => {
    if (!myPublicUser) {
      userUnsubsRef.current.forEach((unsub) => unsub());
      userUnsubsRef.current.clear();
      return;
    }

    const desired = new Set(watchedPeerUidsKey ? watchedPeerUidsKey.split(',') : []);

    // Remove stale listeners
    userUnsubsRef.current.forEach((unsub, peerUid) => {
      if (!desired.has(peerUid)) {
        unsub();
        userUnsubsRef.current.delete(peerUid);
      }
    });

    // Attach missing listeners
    desired.forEach((peerUid) => {
      if (!peerUid || userUnsubsRef.current.has(peerUid)) return;
      const unsub = onSnapshot(
        doc(db, 'users_public', peerUid),
        (snap) => {
          if (snap.exists()) {
            const data = snap.data() as PublicUser;
            setKnownUsersById((prev) => ({ ...prev, [peerUid]: data }));
          }
        },
        () => {
          // Ignore transient doc read issue for deleted/unavailable peer
        }
      );
      userUnsubsRef.current.set(peerUid, unsub);
    });
  }, [watchedPeerUidsKey, myPublicUser]);

  useEffect(() => {
    return () => {
      userUnsubsRef.current.forEach((unsub) => unsub());
      userUnsubsRef.current.clear();
    };
  }, []);

  // New message notification monitor
  useEffect(() => {
    if (!myPublicUser || !myPrivateUser) return;
    if (!initialChatsLoadedRef.current) {
      chats.forEach((c) => {
        if (c.lastMessageAt) prevChatLastMsgRef.current[c.id] = c.lastMessageAt.toMillis();
      });
      if (chats.length > 0) initialChatsLoadedRef.current = true;
      return;
    }

    chats.forEach((c) => {
      const msgTime = c.lastMessageAt?.toMillis() || 0;
      const prevTime = prevChatLastMsgRef.current[c.id] || 0;
      if (msgTime > prevTime) {
        prevChatLastMsgRef.current[c.id] = msgTime;
        const isFromOther = c.lastMessageSenderId && c.lastMessageSenderId !== myPublicUser.uid;
        const isMuted = Boolean(chatStates[c.id]?.isMuted);
        const isCurrentChat = activeTab === 'chats' && activeChatId === c.id;

        if (isFromOther && !isMuted && !isCurrentChat && myPrivateUser.notifyMessages) {
          const sender = c.lastMessageSenderId ? usersById[c.lastMessageSenderId] : undefined;
          const title =
            c.type === 'group'
              ? c.name || 'Group'
              : contacts[c.lastMessageSenderId || '']?.nickname ||
                sender?.displayName ||
                'New Message';
          const body = myPrivateUser.notifyPreview
            ? c.lastMessageText || 'Sent a message'
            : 'New message received';

          if (myPrivateUser.notifySounds) playNotificationChime();

          const toastId = `${c.id}_${msgTime}`;
          setToasts((prev) => [
            ...prev.slice(-2),
            { id: toastId, title, body, avatarUrl: sender?.photoURL, chatId: c.id },
          ]);
          setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== toastId));
          }, 4500);

          if (
            document.visibilityState === 'hidden' &&
            'Notification' in window &&
            Notification.permission === 'granted'
          ) {
            new Notification(title, { body });
          }
        }
      }
    });
  }, [chats, myPublicUser, myPrivateUser, chatStates, activeChatId, activeTab, usersById, contacts]);

  // Incoming call monitor
  useEffect(() => {
    if (!myPublicUser || !myPrivateUser) return;
    if (activeCall) return;
    const ringing = calls.find(
      (c) =>
        c.status === 'ringing' &&
        c.calleeId === myPublicUser.uid &&
        !contacts[c.callerId]?.isBlocked &&
        myPrivateUser.notifyCalls
    );
    if (ringing) {
      setActiveCall(ringing);
    }
  }, [calls, myPublicUser, myPrivateUser, contacts, activeCall]);

  const handleSignOut = async () => {
    if (myPublicUser) {
      await updateDoc(doc(db, 'users_public', myPublicUser.uid), {
        isOnline: false,
        lastSeen: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    }
    await signOut(auth);
  };

  const showAppToast = (title: string, body: string, avatarUrl?: string) => {
    const toastId = `sys_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev.slice(-2), { id: toastId, title, body, avatarUrl }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== toastId));
    }, 4000);
  };

  const handleStartDirectChat = async (targetUser: PublicUser) => {
    if (!myPublicUser) return;
    if (contacts[targetUser.uid]?.isBlocked) {
      showAppToast('Blocked Contact', `Unblock @${targetUser.username} before messaging.`);
      return;
    }
    if (!acceptedPeerUids.has(targetUser.uid)) {
      showAppToast(
        'Request Required',
        `@${targetUser.username} must accept your contact request before you can chat.`
      );
      return;
    }
    const chatId = await getOrCreateDirectChat(myPublicUser.uid, targetUser);
    setShowNewChat(false);
    setActiveTab('chats');
    setActiveChatId(chatId);
    setShowInfoDrawer(false);
  };

  const handleStartCall = async (
    targetUser: PublicUser,
    callType: CallType,
    chatId?: string
  ) => {
    if (!myPublicUser) return;
    if (contacts[targetUser.uid]?.isBlocked) {
      showAppToast('Blocked Contact', `Unblock @${targetUser.username} before calling.`);
      return;
    }
    if (!acceptedPeerUids.has(targetUser.uid)) {
      showAppToast(
        'Request Required',
        `@${targetUser.username} must accept your contact request before you can call.`
      );
      return;
    }
    const callId = sanitizeId(`call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
    const payload = {
      id: callId,
      callerId: myPublicUser.uid,
      callerName: myPublicUser.displayName,
      callerPhoto: myPublicUser.photoURL || '',
      calleeId: targetUser.uid,
      calleeName: targetUser.displayName,
      calleePhoto: targetUser.photoURL || '',
      participantIds: [myPublicUser.uid, targetUser.uid],
      chatId: chatId || '',
      callType,
      status: 'ringing',
      durationSec: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    try {
      await setDoc(doc(db, 'calls', callId), payload);
      setActiveCall(payload as unknown as CallSession);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `calls/${callId}`);
    }
  };

  const handleQuickToggleTheme = async () => {
    const next: 'light' | 'dark' = isDark ? 'light' : 'dark';
    setLocalThemeOverride(next);
    if (myPrivateUser) {
      await updateDoc(doc(db, 'users_private', myPrivateUser.uid), {
        themeMode: next,
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    }
  };

  const activeChat = useMemo(
    () => chats.find((c) => c.id === activeChatId) || null,
    [chats, activeChatId]
  );

  const totalUnreadChats = useMemo(() => {
    if (!myPublicUser) return 0;
    return chats.filter((c) => {
      const st = chatStates[c.id];
      if (st?.isArchived) return false;
      if (st && st.unreadCount > 0) return true;
      if (!c.lastMessageAt || !c.lastMessageSenderId) return false;
      if (c.lastMessageSenderId === myPublicUser.uid) return false;
      if (!st?.lastReadAt) return true;
      return c.lastMessageAt.toMillis() > st.lastReadAt.toMillis();
    }).length;
  }, [chats, chatStates, myPublicUser]);

  if (!authReady || (firebaseUser && !profileChecked)) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#F5F6F8] dark:bg-[#0B0D12]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#007AFF] text-white flex items-center justify-center shadow-lg">
            <MessageCircle className="w-6 h-6" />
          </div>
          <p className="text-sm font-medium text-zinc-500">Loading YouMessage...</p>
        </div>
      </div>
    );
  }

  if (!firebaseUser || !myPublicUser || !myPrivateUser) {
    return (
      <AuthScreen
        firebaseUser={firebaseUser}
        needsProfileSetup={Boolean(firebaseUser && (!myPublicUser || !myPrivateUser))}
        isDark={isDark}
        onToggleTheme={handleQuickToggleTheme}
        onProfileCompleted={() => setProfileChecked(true)}
      />
    );
  }

  const navTabs: {
    id: NavTab;
    label: string;
    Icon: React.FC<{ className?: string }>;
    badge?: number;
  }[] = [
    { id: 'chats', label: 'Chats', Icon: MessageCircle, badge: totalUnreadChats },
    { id: 'status', label: 'Status', Icon: CircleDot },
    { id: 'calls', label: 'Calls', Icon: Phone },
    {
      id: 'contacts',
      label: 'Contacts',
      Icon: Users,
      badge: incomingRequests.length,
    },
    { id: 'settings', label: 'Settings', Icon: Settings },
  ];

  const hideMobileBottomBar = activeTab === 'chats' && Boolean(activeChat);

  return (
    <div className="h-screen w-full overflow-hidden bg-[#F5F6F8] dark:bg-[#0B0D12] text-zinc-900 dark:text-zinc-100 flex">
      {/* Security PIN Lock */}
      {isLocked && myPrivateUser.securityLockEnabled && myPrivateUser.securityPin && (
        <PinLockScreen
          expectedPin={myPrivateUser.securityPin}
          onUnlock={() => setIsLocked(false)}
        />
      )}

      {/* Incoming/Active Call Modal */}
      {activeCall && (
        <ActiveCallModal
          call={activeCall}
          myUid={myPublicUser.uid}
          playSounds={myPrivateUser.notifySounds}
          onClosed={() => setActiveCall(null)}
        />
      )}

      {/* Floating Notification Toasts */}
      <div className="fixed top-4 right-4 z-40 space-y-2 max-w-xs w-full pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            onClick={() => {
              if (t.chatId) {
                setActiveTab('chats');
                setActiveChatId(t.chatId);
              }
              setToasts((prev) => prev.filter((x) => x.id !== t.id));
            }}
            className="pointer-events-auto p-3 rounded-2xl bg-white/90 dark:bg-zinc-900/90 backdrop-blur-2xl border border-black/[0.08] dark:border-white/[0.1] shadow-xl flex items-center gap-3 cursor-pointer"
          >
            <Avatar src={t.avatarUrl} name={t.title} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate">{t.title}</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{t.body}</p>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setToasts((prev) => prev.filter((x) => x.id !== t.id));
              }}
              className="p-1 text-zinc-400 hover:text-zinc-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Desktop Left Navigation Rail */}
      <aside className="hidden lg:flex flex-col items-center justify-between w-[72px] py-5 bg-white/75 dark:bg-zinc-950/75 backdrop-blur-2xl border-r border-black/[0.06] dark:border-white/[0.08] shrink-0">
        <div className="flex flex-col items-center gap-6">
          <button
            type="button"
            onClick={() => setActiveTab('chats')}
            className="w-10 h-10 rounded-2xl bg-[#007AFF] text-white flex items-center justify-center shadow-sm cursor-pointer"
            title="YouMessage"
          >
            <MessageCircle className="w-5 h-5" />
          </button>

          <nav className="flex flex-col items-center gap-2">
            {navTabs.map(({ id, label, Icon, badge }) => {
              const active = activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id)}
                  title={label}
                  aria-label={label}
                  className={`relative w-12 h-12 rounded-2xl flex items-center justify-center transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#007AFF]/12 text-[#007AFF]'
                      : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {badge && badge > 0 ? (
                    <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-[#007AFF] text-white text-[10px] font-semibold flex items-center justify-center tabular-nums">
                      {badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={handleQuickToggleTheme}
            title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label="Toggle theme"
            className="w-10 h-10 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-500 dark:text-zinc-400 flex items-center justify-center cursor-pointer"
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            title="Profile & Settings"
            className="cursor-pointer"
          >
            <Avatar src={myPublicUser.photoURL} name={myPublicUser.displayName} size="sm" />
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex min-w-0 h-full overflow-hidden">
        {activeTab === 'chats' ? (
          <>
            {/* Conversation List Pane */}
            <div
              className={`h-full border-r border-black/[0.06] dark:border-white/[0.08] shrink-0 ${
                activeChat ? 'hidden lg:block lg:w-[350px] xl:w-[380px]' : 'w-full lg:w-[350px] xl:w-[380px]'
              }`}
            >
              <ChatList
                myUid={myPublicUser.uid}
                chats={chats}
                chatStates={chatStates}
                usersById={usersById}
                contacts={contacts}
                activeChatId={activeChatId}
                onSelectChat={(id) => {
                  setActiveChatId(id);
                  setShowInfoDrawer(false);
                }}
                onNewChat={() => setShowNewChat(true)}
                onNewGroup={() => setShowNewGroup(true)}
              />
            </div>

            {/* Active Chat Pane */}
            <div
              className={`flex-1 min-w-0 h-full ${
                activeChat ? 'flex' : 'hidden lg:flex'
              }`}
            >
              {activeChat ? (
                <>
                  <div className="flex-1 min-w-0 h-full">
                    <ChatWindow
                      myUser={myPublicUser}
                      chat={activeChat}
                      chatState={chatStates[activeChat.id]}
                      usersById={usersById}
                      contacts={contacts}
                      wallpaperId={myPrivateUser.wallpaperId}
                      onBack={() => {
                        setActiveChatId(null);
                        setShowInfoDrawer(false);
                      }}
                      onOpenInfo={() => setShowInfoDrawer((v) => !v)}
                      onStartCall={(target, type, cId) => handleStartCall(target, type, cId)}
                      onForwardMessage={(msg) => setForwardingMessage(msg)}
                    />
                  </div>

                  {showInfoDrawer && (
                    <div className="fixed inset-0 z-40 lg:static lg:z-auto flex justify-end bg-black/30 lg:bg-transparent">
                      <ChatInfoDrawer
                        myUid={myPublicUser.uid}
                        chat={activeChat}
                        chatState={chatStates[activeChat.id]}
                        usersById={usersById}
                        allUsers={acceptedContactUsers}
                        contacts={contacts}
                        onClose={() => setShowInfoDrawer(false)}
                      />
                    </div>
                  )}
                </>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center bg-white/40 dark:bg-zinc-950/40">
                  <div className="w-16 h-16 rounded-3xl bg-[#007AFF]/10 text-[#007AFF] flex items-center justify-center mb-4">
                    <MessageCircle className="w-8 h-8" />
                  </div>
                  <h2 className="font-display text-xl font-bold text-zinc-900 dark:text-white">
                    YouMessage
                  </h2>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 max-w-sm">
                    Select a conversation from the sidebar or start a new chat or group.
                  </p>
                  <div className="flex items-center gap-3 mt-5">
                    <button
                      type="button"
                      onClick={() => setShowNewChat(true)}
                      className="px-4 py-2.5 rounded-xl bg-[#007AFF] hover:bg-[#0066D6] text-white text-xs font-semibold cursor-pointer"
                    >
                      New Message
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowNewGroup(true)}
                      className="px-4 py-2.5 rounded-xl bg-zinc-200/80 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-xs font-semibold cursor-pointer"
                    >
                      New Group
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : activeTab === 'status' ? (
          <div className="flex-1 min-w-0 h-full">
            <StatusView
              myUser={myPublicUser}
              statuses={statuses}
              usersById={usersById}
              allUsers={acceptedContactUsers}
              contacts={contacts}
            />
          </div>
        ) : activeTab === 'calls' ? (
          <div className="flex-1 min-w-0 h-full">
            <CallsView
              myUid={myPublicUser.uid}
              calls={calls}
              usersById={usersById}
              contacts={contacts}
              onStartCall={(target, type) => handleStartCall(target, type)}
            />
          </div>
        ) : activeTab === 'contacts' ? (
          <div className="flex-1 min-w-0 h-full">
            <ContactsView
              myUser={myPublicUser}
              contactUsers={acceptedContactUsers}
              usersById={usersById}
              contacts={contacts}
              incomingRequests={incomingRequests}
              outgoingRequests={outgoingRequests}
              onStartChat={handleStartDirectChat}
              onStartCall={(target, type) => handleStartCall(target, type)}
            />
          </div>
        ) : (
          <div className="flex-1 min-w-0 h-full">
            <SettingsView
              myUser={myPublicUser}
              privateUser={myPrivateUser}
              contacts={contacts}
              usersById={usersById}
              chats={chats}
              onSignOut={handleSignOut}
              onLockNow={() => setIsLocked(true)}
            />
          </div>
        )}
      </main>

      {/* Mobile Bottom Tab Bar */}
      {!hideMobileBottomBar && (
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/85 dark:bg-zinc-950/85 backdrop-blur-2xl border-t border-black/[0.06] dark:border-white/[0.08] pb-safe">
          <div className="grid grid-cols-5 h-16 items-center">
            {navTabs.map(({ id, label, Icon, badge }) => {
              const active = activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setActiveTab(id);
                    if (id !== 'chats') setActiveChatId(null);
                  }}
                  className={`relative min-h-[44px] flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                    active ? 'text-[#007AFF]' : 'text-zinc-500 dark:text-zinc-400'
                  }`}
                >
                  <div className="relative">
                    <Icon className="w-[22px] h-[22px]" />
                    {badge && badge > 0 ? (
                      <span className="absolute -top-1 -right-2 min-w-[15px] h-[15px] px-1 rounded-full bg-[#007AFF] text-white text-[9px] font-bold flex items-center justify-center tabular-nums">
                        {badge}
                      </span>
                    ) : null}
                  </div>
                  <span className="text-[10px] font-medium tracking-tight">{label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      )}

      {/* Modals */}
      {showNewChat && (
        <NewChatModal
          myUser={myPublicUser}
          users={acceptedContactUsers}
          contacts={contacts}
          onClose={() => setShowNewChat(false)}
          onStartChat={handleStartDirectChat}
        />
      )}

      {showNewGroup && (
        <NewGroupModal
          myUid={myPublicUser.uid}
          users={acceptedContactUsers}
          contacts={contacts}
          onClose={() => setShowNewGroup(false)}
          onCreateGroup={async (data) => {
            const chatId = await createGroupChat({
              myUid: myPublicUser.uid,
              ...data,
            });
            setActiveTab('chats');
            setActiveChatId(chatId);
          }}
        />
      )}

      {forwardingMessage && (
        <ForwardModal
          myUid={myPublicUser.uid}
          message={forwardingMessage}
          chats={chats}
          usersById={usersById}
          contacts={contacts}
          onClose={() => setForwardingMessage(null)}
          onForwardToChats={async (targets) => {
            await Promise.all(
              targets.map((targetChat) =>
                sendMessage({
                  chat: targetChat,
                  senderId: myPublicUser.uid,
                  type: forwardingMessage.type === 'system' ? 'text' : forwardingMessage.type,
                  text: forwardingMessage.text,
                  mediaData: forwardingMessage.mediaData,
                  fileName: forwardingMessage.fileName,
                  fileSize: forwardingMessage.fileSize,
                  mimeType: forwardingMessage.mimeType,
                  voiceDuration: forwardingMessage.voiceDuration,
                  location: forwardingMessage.location,
                  forwardedFrom: true,
                })
              )
            );
          }}
        />
      )}
    </div>
  );
}
