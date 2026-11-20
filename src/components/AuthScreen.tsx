import React, { useState } from 'react';
import { User as FirebaseUser, signInWithPopup, signOut } from 'firebase/auth';
import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { Camera, Check, LogOut, MessageCircle, Moon, Sun, ShieldCheck } from 'lucide-react';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../lib/firebase';
import { compressImageFile } from '../lib/media';
import { Avatar } from './Avatar';

interface AuthScreenProps {
  firebaseUser: FirebaseUser | null;
  needsProfileSetup: boolean;
  isDark: boolean;
  onToggleTheme: () => void;
  onProfileCompleted: () => void;
}

const STATUS_SUGGESTIONS = [
  'Available',
  'At work',
  'In a meeting',
  'Battery about to die',
  'Can’t talk, message only',
];

export const AuthScreen: React.FC<AuthScreenProps> = ({
  firebaseUser,
  needsProfileSetup,
  isDark,
  onToggleTheme,
  onProfileCompleted,
}) => {
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState('');

  // Profile setup state
  const defaultName = firebaseUser?.displayName || 'YouMessage User';
  const defaultUsername = (firebaseUser?.email?.split('@')[0] || 'user')
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, '')
    .slice(0, 24) || 'user';

  const [displayName, setDisplayName] = useState(defaultName);
  const [username, setUsername] = useState(defaultUsername);
  const [aboutStatus, setAboutStatus] = useState('Available');
  const [photoURL, setPhotoURL] = useState(firebaseUser?.photoURL || '');
  const [saving, setSaving] = useState(false);

  const handleGoogleSignIn = async () => {
    setAuthError('');
    setSigningIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Unable to sign in with Google.');
    } finally {
      setSigningIn(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAuthError('');
    try {
      const compressed = await compressImageFile(file, 480, 0.8);
      setPhotoURL(compressed);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Could not process image.');
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) return;
    setAuthError('');

    const cleanName = displayName.trim();
    const cleanUsername = username.trim().toLowerCase();

    if (!cleanName || cleanName.length > 64) {
      setAuthError('Display name must be between 1 and 64 characters.');
      return;
    }
    if (!/^[a-z0-9_.]{3,32}$/.test(cleanUsername)) {
      setAuthError('Username must be 3–32 characters using lowercase letters, numbers, dots, or underscores.');
      return;
    }

    setSaving(true);
    try {
      // Check username availability
      const q = query(
        collection(db, 'users_public'),
        where('username', '==', cleanUsername),
        limit(1)
      );
      let existingSnap;
      try {
        existingSnap = await getDocs(q);
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'users_public');
      }
      const takenByOther = existingSnap.docs.some((d) => d.id !== firebaseUser.uid);
      if (takenByOther) {
        setAuthError(`@${cleanUsername} is already taken. Please choose another username.`);
        setSaving(false);
        return;
      }

      const publicPath = `users_public/${firebaseUser.uid}`;
      try {
        await setDoc(doc(db, 'users_public', firebaseUser.uid), {
          uid: firebaseUser.uid,
          username: cleanUsername,
          displayName: cleanName,
          photoURL: photoURL || '',
          aboutStatus: aboutStatus.trim().slice(0, 160) || 'Available',
          isOnline: true,
          lastSeen: serverTimestamp(),
          privacyLastSeen: 'everyone',
          privacyOnline: 'everyone',
          privacyPhoto: 'everyone',
          privacyAbout: 'everyone',
          privacyReadReceipts: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, publicPath);
      }

      const privatePath = `users_private/${firebaseUser.uid}`;
      try {
        await setDoc(doc(db, 'users_private', firebaseUser.uid), {
          uid: firebaseUser.uid,
          email: firebaseUser.email || `${firebaseUser.uid}@youmessage.local`,
          themeMode: 'system',
          wallpaperId: 'ios_frost',
          notifyMessages: true,
          notifyCalls: true,
          notifySounds: true,
          notifyPreview: true,
          securityLockEnabled: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, privatePath);
      }

      onProfileCompleted();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Failed to save profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen w-full relative overflow-hidden bg-[#F5F6F8] dark:bg-[#0B0D12] text-zinc-900 dark:text-zinc-100 flex flex-col">
      {/* Subtle architectural glass ambient backdrop */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-32 w-[520px] h-[520px] rounded-full bg-sky-400/12 dark:bg-sky-500/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-32 w-[480px] h-[480px] rounded-full bg-indigo-400/10 dark:bg-indigo-500/10 blur-3xl" />
      </div>

      {/* Top Bar */}
      <header className="relative z-10 flex items-center justify-between px-6 sm:px-10 py-5">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#007AFF] text-white flex items-center justify-center shadow-sm">
            <MessageCircle className="w-5 h-5" />
          </div>
          <span className="font-display text-lg font-bold tracking-tight whitespace-nowrap">
            YouMessage
          </span>
        </div>

        <button
          type="button"
          onClick={onToggleTheme}
          aria-label="Toggle light or dark appearance"
          className="min-h-[44px] min-w-[44px] px-3 rounded-xl bg-white/75 dark:bg-zinc-900/75 backdrop-blur-md border border-black/[0.06] dark:border-white/[0.08] flex items-center justify-center gap-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-white dark:hover:bg-zinc-800 transition-colors cursor-pointer"
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          <span className="hidden sm:inline">{isDark ? 'Light' : 'Dark'}</span>
        </button>
      </header>

      <main className="relative z-10 flex-1 flex items-center justify-center p-4 sm:p-8">
        {!firebaseUser || !needsProfileSetup ? (
          <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-7 space-y-5 px-2">
              <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-zinc-900 dark:text-white leading-[1.12] [text-wrap:balance]">
                Conversations, Connected.
              </h1>
              <p className="text-base sm:text-lg text-zinc-600 dark:text-zinc-400 max-w-xl leading-relaxed">
                Send instant messages, voice notes, media, locations, and temporary statuses. Add people directly by @username and accept requests before chatting or calling.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 text-sm text-zinc-600 dark:text-zinc-400">
                <div className="p-4 rounded-2xl bg-white/70 dark:bg-zinc-900/70 backdrop-blur-md border border-black/[0.05] dark:border-white/[0.07]">
                  <p className="font-semibold text-zinc-900 dark:text-zinc-100 mb-1">Real-Time Messaging</p>
                  <p className="text-xs leading-relaxed">Replies, reactions, edits, disappearing timers, and group chats.</p>
                </div>
                <div className="p-4 rounded-2xl bg-white/70 dark:bg-zinc-900/70 backdrop-blur-md border border-black/[0.05] dark:border-white/[0.07]">
                  <p className="font-semibold text-zinc-900 dark:text-zinc-100 mb-1">Voice & Video Calls</p>
                  <p className="text-xs leading-relaxed">Direct WebRTC calling with live camera, mic, and speaker controls.</p>
                </div>
                <div className="p-4 rounded-2xl bg-white/70 dark:bg-zinc-900/70 backdrop-blur-md border border-black/[0.05] dark:border-white/[0.07]">
                  <p className="font-semibold text-zinc-900 dark:text-zinc-100 mb-1">Granular Privacy</p>
                  <p className="text-xs leading-relaxed">Control last seen, online status, read receipts, and status audience.</p>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5">
              <div className="rounded-3xl bg-white/85 dark:bg-zinc-900/85 backdrop-blur-2xl border border-black/[0.06] dark:border-white/[0.08] p-7 sm:p-8 shadow-xl shadow-black/[0.04] dark:shadow-black/40">
                <div className="w-12 h-12 rounded-2xl bg-[#007AFF]/10 text-[#007AFF] flex items-center justify-center mb-5">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <h2 className="font-display text-2xl font-bold text-zinc-900 dark:text-white mb-2">
                  Sign in to YouMessage
                </h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-6 leading-relaxed">
                  Use your verified Google account to sign up or log in across devices.
                </p>

                {authError && (
                  <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400">
                    {authError}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={signingIn}
                  className="w-full min-h-[48px] px-5 py-3 rounded-2xl bg-[#007AFF] hover:bg-[#0066D6] active:scale-[0.99] text-white font-semibold text-sm flex items-center justify-center gap-3 shadow-md shadow-sky-500/20 transition-all disabled:opacity-60 cursor-pointer"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="currentColor"
                      d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81Z"
                    />
                  </svg>
                  {signingIn ? 'Connecting...' : 'Continue with Google'}
                </button>

                <p className="mt-5 text-xs text-zinc-500 dark:text-zinc-400 text-center">
                  New users complete profile setup right after signing in.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="w-full max-w-lg rounded-3xl bg-white/85 dark:bg-zinc-900/85 backdrop-blur-2xl border border-black/[0.06] dark:border-white/[0.08] p-7 sm:p-9 shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="font-display text-2xl font-bold text-zinc-900 dark:text-white">
                  Set up your profile
                </h2>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Choose how others see and find you on YouMessage.
                </p>
              </div>
              <button
                type="button"
                onClick={() => signOut(auth)}
                className="min-h-[40px] px-3 rounded-xl text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-black/5 dark:hover:bg-white/5 flex items-center gap-1.5 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign out
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-5">
              <div className="flex flex-col items-center gap-3">
                <div className="relative">
                  <Avatar src={photoURL} name={displayName} size="xl" />
                  <label className="absolute bottom-0 right-0 w-9 h-9 rounded-full bg-[#007AFF] text-white flex items-center justify-center shadow-md cursor-pointer hover:bg-[#0066D6] transition-colors">
                    <Camera className="w-4 h-4" />
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      className="sr-only"
                    />
                  </label>
                </div>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  Tap camera to upload a profile photo
                </span>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">
                  Display Name
                </label>
                <input
                  type="text"
                  required
                  maxLength={64}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Alex Morgan"
                  className="w-full h-11 px-4 rounded-xl bg-zinc-100/80 dark:bg-zinc-800/80 border border-black/[0.06] dark:border-white/[0.08] text-sm focus:outline-none focus:ring-2 focus:ring-[#007AFF]/40"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">
                  Username
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">@</span>
                  <input
                    type="text"
                    required
                    maxLength={32}
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''))}
                    placeholder="alex.morgan"
                    className="w-full h-11 pl-8 pr-4 rounded-xl bg-zinc-100/80 dark:bg-zinc-800/80 border border-black/[0.06] dark:border-white/[0.08] text-sm focus:outline-none focus:ring-2 focus:ring-[#007AFF]/40"
                  />
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">
                  3–32 characters: lowercase letters, numbers, dots, underscores.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">
                  Status / About
                </label>
                <input
                  type="text"
                  maxLength={160}
                  value={aboutStatus}
                  onChange={(e) => setAboutStatus(e.target.value)}
                  placeholder="Available"
                  className="w-full h-11 px-4 rounded-xl bg-zinc-100/80 dark:bg-zinc-800/80 border border-black/[0.06] dark:border-white/[0.08] text-sm focus:outline-none focus:ring-2 focus:ring-[#007AFF]/40"
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {STATUS_SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setAboutStatus(s)}
                      className={`px-2.5 py-1 rounded-lg text-xs transition-colors cursor-pointer ${
                        aboutStatus === s
                          ? 'bg-[#007AFF] text-white'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {authError && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400">
                  {authError}
                </div>
              )}

              <button
                type="submit"
                disabled={saving}
                className="w-full min-h-[48px] rounded-2xl bg-[#007AFF] hover:bg-[#0066D6] text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-md shadow-sky-500/20 transition-all disabled:opacity-60 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                {saving ? 'Creating Profile...' : 'Complete Setup'}
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
};
