import React, { useState } from 'react';
import {
  Info,
  Phone,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  Video,
  X,
} from 'lucide-react';
import { formatChatListTime, formatDuration } from '../lib/media';
import { getVisiblePhoto } from '../lib/privacy';
import { CallSession, CallType, Contact, PublicUser } from '../types/youmessage';
import { Avatar } from './Avatar';

interface CallsViewProps {
  myUid: string;
  calls: CallSession[];
  usersById: Record<string, PublicUser>;
  contacts: Record<string, Contact>;
  onStartCall: (targetUser: PublicUser, callType: CallType) => void;
}

export const CallsView: React.FC<CallsViewProps> = ({
  myUid,
  calls,
  usersById,
  contacts,
  onStartCall,
}) => {
  const [showConfigModal, setShowConfigModal] = useState(false);

  const contactUsers = Object.values(contacts)
    .filter((c) => !c.isBlocked)
    .map((c) => usersById[c.contactUid])
    .filter((u): u is PublicUser => Boolean(u));

  return (
    <div className="h-full flex flex-col bg-white/75 dark:bg-zinc-950/75 backdrop-blur-2xl overflow-hidden">
      <header className="px-6 py-5 border-b border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-bold text-zinc-900 dark:text-white">
            Calls
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Peer-to-peer WebRTC voice & video calling
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowConfigModal(true)}
          className="min-h-[40px] px-3.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5 cursor-pointer"
        >
          <Info className="w-4 h-4 text-[#007AFF]" />
          Calling Setup
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-5 pb-24 lg:pb-6 max-w-3xl w-full mx-auto space-y-6">
        {contactUsers.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-2.5 px-1">
              Quick Call
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {contactUsers.slice(0, 6).map((user) => (
                <div
                  key={user.uid}
                  className="p-3 rounded-2xl bg-white/85 dark:bg-zinc-900/85 border border-black/[0.05] dark:border-white/[0.07] flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar
                      src={getVisiblePhoto(user, myUid, contacts)}
                      name={user.displayName}
                      size="sm"
                    />
                    <span className="text-sm font-medium text-zinc-900 dark:text-white truncate">
                      {contacts[user.uid]?.nickname || user.displayName}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => onStartCall(user, 'voice')}
                      aria-label={`Voice call ${user.displayName}`}
                      className="min-h-[36px] min-w-[36px] rounded-full bg-[#007AFF]/10 hover:bg-[#007AFF]/20 text-[#007AFF] flex items-center justify-center cursor-pointer"
                    >
                      <Phone className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onStartCall(user, 'video')}
                      aria-label={`Video call ${user.displayName}`}
                      className="min-h-[36px] min-w-[36px] rounded-full bg-[#007AFF]/10 hover:bg-[#007AFF]/20 text-[#007AFF] flex items-center justify-center cursor-pointer"
                    >
                      <Video className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-2.5 px-1">
            Recent Calls
          </h2>
          {calls.length === 0 ? (
            <div className="p-10 rounded-3xl bg-white/60 dark:bg-zinc-900/60 border border-black/[0.05] dark:border-white/[0.06] text-center">
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                No recent calls
              </p>
              <p className="text-xs text-zinc-500 mt-1">
                Start a voice or video call from any direct chat or contact.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {calls.map((c) => {
                const outgoing = c.callerId === myUid;
                const peerUid = outgoing ? c.calleeId : c.callerId;
                const peerUser = usersById[peerUid];
                const peerName =
                  contacts[peerUid]?.nickname ||
                  peerUser?.displayName ||
                  (outgoing ? c.calleeName : c.callerName);
                const missed = c.status === 'missed' || c.status === 'declined';

                return (
                  <div
                    key={c.id}
                    className="p-3.5 rounded-2xl bg-white/85 dark:bg-zinc-900/85 border border-black/[0.05] dark:border-white/[0.07] flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar
                        src={getVisiblePhoto(peerUser, myUid, contacts)}
                        name={peerName}
                        size="md"
                      />
                      <div className="min-w-0">
                        <p
                          className={`text-sm font-semibold truncate ${
                            missed && !outgoing
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-zinc-900 dark:text-white'
                          }`}
                        >
                          {peerName}
                        </p>
                        <div className="flex items-center gap-1.5 text-xs text-zinc-500 tabular-nums">
                          {missed ? (
                            <PhoneMissed className="w-3.5 h-3.5 text-red-500" />
                          ) : outgoing ? (
                            <PhoneOutgoing className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <PhoneIncoming className="w-3.5 h-3.5 text-[#007AFF]" />
                          )}
                          <span>
                            {outgoing ? 'Outgoing' : 'Incoming'} {c.callType}
                          </span>
                          {c.durationSec > 0 && (
                            <>
                              <span>·</span>
                              <span>{formatDuration(c.durationSec)}</span>
                            </>
                          )}
                          <span>·</span>
                          <span>{formatChatListTime(c.createdAt)}</span>
                        </div>
                      </div>
                    </div>

                    {peerUser && !contacts[peerUid]?.isBlocked && (
                      <button
                        type="button"
                        onClick={() => onStartCall(peerUser, c.callType)}
                        aria-label={`Call ${peerName} back`}
                        className="min-h-[40px] min-w-[40px] rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 text-[#007AFF] flex items-center justify-center cursor-pointer"
                      >
                        {c.callType === 'video' ? (
                          <Video className="w-4 h-4" />
                        ) : (
                          <Phone className="w-4 h-4" />
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {showConfigModal && (
        <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-white/95 dark:bg-zinc-900/95 backdrop-blur-2xl border border-black/[0.06] dark:border-white/[0.08] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold">Voice & Video Calling Setup</h3>
              <button
                type="button"
                onClick={() => setShowConfigModal(false)}
                className="p-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3 text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
              <p>
                YouMessage uses native browser <strong>WebRTC</strong> with real-time signaling over Cloud Firestore and preconfigured public STUN servers (<code className="font-mono">stun.l.google.com:19302</code>).
              </p>
              <p>
                <strong>What works out of the box:</strong> Direct peer-to-peer voice and video calls between devices on standard home/mobile networks once camera and microphone permissions are granted.
              </p>
              <p>
                <strong>Optional TURN Server Configuration:</strong> For users behind strict symmetric NATs or corporate firewalls, configure a hosted TURN relay (e.g., Metered, Twilio NTS, or self-hosted coturn) inside <code className="font-mono">RTC_CONFIG.iceServers</code> in <code className="font-mono">ActiveCallModal.tsx</code>.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowConfigModal(false)}
              className="w-full py-2.5 rounded-xl bg-[#007AFF] text-white text-sm font-medium cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
