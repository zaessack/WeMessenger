import React, { useMemo, useState } from 'react';
import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  Ban,
  Bell,
  Camera,
  Check,
  HardDrive,
  Lock,
  LogOut,
  Palette,
  Shield,
  User,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { compressImageFile, formatFileSize } from '../lib/media';
import { addOrUpdateContact } from '../lib/chatActions';
import { WALLPAPER_PRESETS } from '../lib/wallpapers';
import {
  Chat,
  Contact,
  PrivacyLevel,
  PrivateUser,
  PublicUser,
  ThemeMode,
} from '../types/youmessage';
import { Avatar } from './Avatar';

type SettingsSection =
  | 'account'
  | 'privacy'
  | 'security'
  | 'notifications'
  | 'appearance'
  | 'storage';

interface SettingsViewProps {
  myUser: PublicUser;
  privateUser: PrivateUser;
  contacts: Record<string, Contact>;
  usersById: Record<string, PublicUser>;
  chats: Chat[];
  onSignOut: () => void;
  onLockNow: () => void;
}

const PRIVACY_OPTIONS: { label: string; value: PrivacyLevel }[] = [
  { label: 'Everyone', value: 'everyone' },
  { label: 'Contacts', value: 'contacts' },
  { label: 'Nobody', value: 'nobody' },
];

export const SettingsView: React.FC<SettingsViewProps> = ({
  myUser,
  privateUser,
  contacts,
  usersById,
  chats,
  onSignOut,
  onLockNow,
}) => {
  const [section, setSection] = useState<SettingsSection>('account');
  const [displayName, setDisplayName] = useState(myUser.displayName);
  const [username, setUsername] = useState(myUser.username);
  const [aboutStatus, setAboutStatus] = useState(myUser.aboutStatus || '');
  const [photoURL, setPhotoURL] = useState(myUser.photoURL || '');
  const [pinInput, setPinInput] = useState(privateUser.securityPin || '');
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [saving, setSaving] = useState(false);

  const blockedUsers = useMemo(
    () =>
      Object.values(contacts)
        .filter((c) => c.isBlocked)
        .map((c) => ({ contact: c, user: usersById[c.contactUid] })),
    [contacts, usersById]
  );

  const estimatedBytes = useMemo(() => {
    const profileBytes = JSON.stringify(myUser).length + JSON.stringify(privateUser).length;
    const chatBytes = chats.reduce((acc, c) => acc + JSON.stringify(c).length, 0);
    return profileBytes + chatBytes;
  }, [myUser, privateUser, chats]);

  const showToast = (msg: string) => {
    setErrorMsg('');
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(''), 3000);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageFile(file, 480, 0.8);
      setPhotoURL(compressed);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to process image.');
    }
  };

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const cleanName = displayName.trim();
    const cleanUsername = username.trim().toLowerCase();
    if (!cleanName || cleanName.length > 64) {
      setErrorMsg('Display name must be 1–64 characters.');
      return;
    }
    if (!/^[a-z0-9_.]{3,32}$/.test(cleanUsername)) {
      setErrorMsg('Username must be 3–32 lowercase letters, numbers, dots, or underscores.');
      return;
    }
    setSaving(true);
    try {
      if (cleanUsername !== myUser.username) {
        const snap = await getDocs(
          query(collection(db, 'users_public'), where('username', '==', cleanUsername), limit(1))
        );
        if (snap.docs.some((d) => d.id !== myUser.uid)) {
          setErrorMsg(`@${cleanUsername} is already taken.`);
          setSaving(false);
          return;
        }
      }
      await updateDoc(doc(db, 'users_public', myUser.uid), {
        displayName: cleanName,
        username: cleanUsername,
        aboutStatus: aboutStatus.trim().slice(0, 160),
        photoURL: photoURL || '',
        updatedAt: serverTimestamp(),
      });
      showToast('Profile saved');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users_public/${myUser.uid}`);
    } finally {
      setSaving(false);
    }
  };

  const updatePublicField = async (patch: Partial<PublicUser>) => {
    try {
      await updateDoc(doc(db, 'users_public', myUser.uid), {
        ...patch,
        updatedAt: serverTimestamp(),
      });
      showToast('Privacy updated');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users_public/${myUser.uid}`);
    }
  };

  const updatePrivateField = async (patch: Partial<PrivateUser>) => {
    try {
      await updateDoc(doc(db, 'users_private', myUser.uid), {
        ...patch,
        updatedAt: serverTimestamp(),
      });
      showToast('Preferences saved');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users_private/${myUser.uid}`);
    }
  };

  const handleSaveSecurityPin = async () => {
    if (!/^\d{4}$/.test(pinInput)) {
      setErrorMsg('Passcode must be exactly 4 digits.');
      return;
    }
    await updatePrivateField({
      securityLockEnabled: true,
      securityPin: pinInput,
    });
  };

  const requestBrowserNotifications = async () => {
    if (!('Notification' in window)) {
      setErrorMsg('Browser notifications are not supported on this device.');
      return;
    }
    const perm = await Notification.requestPermission();
    showToast(`Browser notifications: ${perm}`);
  };

  const navItems: { id: SettingsSection; label: string; Icon: React.FC<{ className?: string }> }[] = [
    { id: 'account', label: 'Account', Icon: User },
    { id: 'privacy', label: 'Privacy', Icon: Shield },
    { id: 'security', label: 'Security', Icon: Lock },
    { id: 'notifications', label: 'Notifications', Icon: Bell },
    { id: 'appearance', label: 'Appearance & Wallpaper', Icon: Palette },
    { id: 'storage', label: 'Storage', Icon: HardDrive },
  ];

  return (
    <div className="h-full flex flex-col bg-white/75 dark:bg-zinc-950/75 backdrop-blur-2xl overflow-hidden">
      <header className="px-6 py-5 border-b border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-zinc-900 dark:text-white">
            Settings
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Account, privacy, security, notifications, appearance, and storage
          </p>
        </div>

        <button
          type="button"
          onClick={onSignOut}
          className="min-h-[40px] px-3.5 rounded-xl bg-red-500/10 hover:bg-red-500/15 text-red-600 dark:text-red-400 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </header>

      <div className="flex-1 overflow-y-auto pb-24 lg:pb-6">
        <div className="max-w-4xl mx-auto p-5 grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Left Sub-nav */}
          <nav className="md:col-span-4 space-y-1">
            {navItems.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setSection(id);
                  setErrorMsg('');
                }}
                className={`w-full px-3.5 py-2.5 rounded-2xl flex items-center gap-3 text-sm font-medium transition-colors cursor-pointer ${
                  section === id
                    ? 'bg-[#007AFF] text-white shadow-sm'
                    : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{label}</span>
              </button>
            ))}
          </nav>

          {/* Right Panel */}
          <div className="md:col-span-8 space-y-4">
            {statusMsg && (
              <div className="px-4 py-2.5 rounded-2xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs font-medium flex items-center gap-2">
                <Check className="w-4 h-4" />
                {statusMsg}
              </div>
            )}
            {errorMsg && (
              <div className="px-4 py-2.5 rounded-2xl bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-medium">
                {errorMsg}
              </div>
            )}

            {section === 'account' && (
              <form
                onSubmit={handleSaveAccount}
                className="p-6 rounded-3xl bg-white/85 dark:bg-zinc-900/85 border border-black/[0.06] dark:border-white/[0.08] space-y-5"
              >
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <Avatar src={photoURL} name={displayName} size="xl" />
                    <label className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-[#007AFF] text-white flex items-center justify-center shadow cursor-pointer">
                      <Camera className="w-4 h-4" />
                      <input type="file" accept="image/*" onChange={handlePhotoUpload} className="sr-only" />
                    </label>
                  </div>
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-zinc-900 dark:text-white truncate">
                      {myUser.displayName}
                    </p>
                    <p className="text-xs text-zinc-500 truncate">{privateUser.email}</p>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">
                    Display Name
                  </label>
                  <input
                    type="text"
                    maxLength={64}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full h-10 px-3.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-[#007AFF]/40"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">
                    Username
                  </label>
                  <input
                    type="text"
                    maxLength={32}
                    value={username}
                    onChange={(e) =>
                      setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''))
                    }
                    className="w-full h-10 px-3.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-[#007AFF]/40"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">
                    About / Status
                  </label>
                  <input
                    type="text"
                    maxLength={160}
                    value={aboutStatus}
                    onChange={(e) => setAboutStatus(e.target.value)}
                    className="w-full h-10 px-3.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-[#007AFF]/40"
                  />
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 rounded-xl bg-[#007AFF] hover:bg-[#0066D6] text-white text-sm font-medium cursor-pointer disabled:opacity-60"
                >
                  {saving ? 'Saving...' : 'Save Account'}
                </button>
              </form>
            )}

            {section === 'privacy' && (
              <div className="space-y-4">
                <div className="p-5 rounded-3xl bg-white/85 dark:bg-zinc-900/85 border border-black/[0.06] dark:border-white/[0.08] space-y-4">
                  {(
                    [
                      { key: 'privacyLastSeen', label: 'Last Seen' },
                      { key: 'privacyOnline', label: 'Online Visibility' },
                      { key: 'privacyPhoto', label: 'Profile Photo' },
                      { key: 'privacyAbout', label: 'About Status' },
                    ] as const
                  ).map((row) => (
                    <div key={row.key} className="flex items-center justify-between gap-4">
                      <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                        {row.label}
                      </span>
                      <div className="flex items-center gap-1 p-1 rounded-xl bg-zinc-100 dark:bg-zinc-800">
                        {PRIVACY_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => updatePublicField({ [row.key]: opt.value })}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer ${
                              myUser[row.key] === opt.value
                                ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm'
                                : 'text-zinc-500'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}

                  <div className="pt-2 border-t border-black/[0.05] dark:border-white/[0.06] flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                        Read Receipts
                      </p>
                      <p className="text-xs text-zinc-500">
                        If turned off, you won’t send or receive read receipts.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        updatePublicField({ privacyReadReceipts: !myUser.privacyReadReceipts })
                      }
                      className={`w-12 h-7 rounded-full transition-colors p-0.5 cursor-pointer ${
                        myUser.privacyReadReceipts ? 'bg-[#007AFF]' : 'bg-zinc-300 dark:bg-zinc-700'
                      }`}
                      aria-label="Toggle read receipts"
                    >
                      <div
                        className={`w-6 h-6 rounded-full bg-white shadow transition-transform ${
                          myUser.privacyReadReceipts ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                <div className="p-5 rounded-3xl bg-white/85 dark:bg-zinc-900/85 border border-black/[0.06] dark:border-white/[0.08]">
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-white mb-3 flex items-center gap-2">
                    <Ban className="w-4 h-4 text-red-500" />
                    Blocked Users ({blockedUsers.length})
                  </h3>
                  {blockedUsers.length === 0 ? (
                    <p className="text-xs text-zinc-500">You have no blocked contacts.</p>
                  ) : (
                    <div className="space-y-2">
                      {blockedUsers.map(({ contact, user }) => (
                        <div
                          key={contact.contactUid}
                          className="flex items-center justify-between py-2"
                        >
                          <span className="text-sm font-medium">
                            {user?.displayName || contact.contactUid}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              addOrUpdateContact(myUser.uid, contact.contactUid, {
                                isBlocked: false,
                              })
                            }
                            className="px-3 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-xs font-medium cursor-pointer"
                          >
                            Unblock
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {section === 'security' && (
              <div className="p-6 rounded-3xl bg-white/85 dark:bg-zinc-900/85 border border-black/[0.06] dark:border-white/[0.08] space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
                      App Passcode Lock
                    </h3>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      Require a 4-digit passcode to open YouMessage.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      updatePrivateField({
                        securityLockEnabled: !privateUser.securityLockEnabled,
                      })
                    }
                    className={`w-12 h-7 rounded-full transition-colors p-0.5 cursor-pointer ${
                      privateUser.securityLockEnabled
                        ? 'bg-[#007AFF]'
                        : 'bg-zinc-300 dark:bg-zinc-700'
                    }`}
                  >
                    <div
                      className={`w-6 h-6 rounded-full bg-white shadow transition-transform ${
                        privateUser.securityLockEnabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-zinc-500 mb-1">
                      4-Digit Passcode
                    </label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      value={pinInput}
                      onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="1234"
                      className="w-full h-10 px-3.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-sm tracking-widest tabular-nums"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveSecurityPin}
                    className="h-10 px-4 rounded-xl bg-[#007AFF] text-white text-xs font-medium cursor-pointer"
                  >
                    Save PIN
                  </button>
                </div>

                {privateUser.securityLockEnabled && privateUser.securityPin && (
                  <button
                    type="button"
                    onClick={onLockNow}
                    className="px-4 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs font-semibold cursor-pointer"
                  >
                    Lock App Now
                  </button>
                )}
              </div>
            )}

            {section === 'notifications' && (
              <div className="p-6 rounded-3xl bg-white/85 dark:bg-zinc-900/85 border border-black/[0.06] dark:border-white/[0.08] space-y-4">
                {(
                  [
                    { key: 'notifyMessages', label: 'New Message Notifications' },
                    { key: 'notifyCalls', label: 'Incoming Call Alerts' },
                    { key: 'notifySounds', label: 'In-App Notification Sounds' },
                    { key: 'notifyPreview', label: 'Show Message Preview' },
                  ] as const
                ).map((item) => (
                  <div key={item.key} className="flex items-center justify-between py-1">
                    <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                      {item.label}
                    </span>
                    <button
                      type="button"
                      onClick={() => updatePrivateField({ [item.key]: !privateUser[item.key] })}
                      className={`w-12 h-7 rounded-full transition-colors p-0.5 cursor-pointer ${
                        privateUser[item.key] ? 'bg-[#007AFF]' : 'bg-zinc-300 dark:bg-zinc-700'
                      }`}
                    >
                      <div
                        className={`w-6 h-6 rounded-full bg-white shadow transition-transform ${
                          privateUser[item.key] ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                ))}

                <div className="pt-3 border-t border-black/[0.05] dark:border-white/[0.06]">
                  <button
                    type="button"
                    onClick={requestBrowserNotifications}
                    className="px-4 py-2 rounded-xl bg-[#007AFF]/10 text-[#007AFF] text-xs font-semibold cursor-pointer"
                  >
                    Enable Browser Push Alerts
                  </button>
                </div>
              </div>
            )}

            {section === 'appearance' && (
              <div className="space-y-5">
                <div className="p-6 rounded-3xl bg-white/85 dark:bg-zinc-900/85 border border-black/[0.06] dark:border-white/[0.08]">
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-white mb-3">
                    Theme Mode
                  </h3>
                  <div className="grid grid-cols-3 gap-2">
                    {(['light', 'dark', 'system'] as ThemeMode[]).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => updatePrivateField({ themeMode: mode })}
                        className={`py-2.5 rounded-xl text-xs font-semibold capitalize cursor-pointer ${
                          privateUser.themeMode === mode
                            ? 'bg-[#007AFF] text-white'
                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                        }`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-6 rounded-3xl bg-white/85 dark:bg-zinc-900/85 border border-black/[0.06] dark:border-white/[0.08]">
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-white mb-3">
                    Chat Wallpaper
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {WALLPAPER_PRESETS.map((wp) => {
                      const active = privateUser.wallpaperId === wp.id;
                      return (
                        <button
                          key={wp.id}
                          type="button"
                          onClick={() => updatePrivateField({ wallpaperId: wp.id })}
                          className={`group rounded-2xl overflow-hidden border text-left transition-all cursor-pointer ${
                            active
                              ? 'border-[#007AFF] ring-2 ring-[#007AFF]/30'
                              : 'border-black/[0.06] dark:border-white/[0.08]'
                          }`}
                        >
                          <div className={`h-24 w-full ${wp.lightClass} dark:${wp.darkClass} relative`}>
                            {wp.imageUrl && (
                              <img
                                src={wp.imageUrl}
                                alt={wp.name}
                                className="w-full h-full object-cover"
                              />
                            )}
                          </div>
                          <div className="p-2.5 bg-white dark:bg-zinc-900">
                            <p className="text-xs font-semibold truncate">{wp.name}</p>
                            <p className="text-[10px] text-zinc-500 truncate">{wp.description}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {section === 'storage' && (
              <div className="p-6 rounded-3xl bg-white/85 dark:bg-zinc-900/85 border border-black/[0.06] dark:border-white/[0.08] space-y-4">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
                  Storage & Data Usage
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-4 rounded-2xl bg-zinc-100/80 dark:bg-zinc-800/80">
                    <p className="text-xs text-zinc-500">Active Conversations</p>
                    <p className="text-xl font-bold tabular-nums mt-1">{chats.length}</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-zinc-100/80 dark:bg-zinc-800/80">
                    <p className="text-xs text-zinc-500">Synced Index Footprint</p>
                    <p className="text-xl font-bold tabular-nums mt-1">
                      {formatFileSize(estimatedBytes)}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-zinc-500 leading-relaxed">
                  Messages, voice notes, and compressed photos are synced via Cloud Firestore. Clearing local browser cache refreshes local state without deleting your account data.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    localStorage.clear();
                    showToast('Local preference cache cleared');
                  }}
                  className="px-4 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-xs font-semibold cursor-pointer"
                >
                  Clear Local Cache
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
