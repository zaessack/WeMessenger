import React, { useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Image as ImageIcon,
  Lock,
  Plus,
  Trash2,
  Type,
  Video,
  X,
} from 'lucide-react';
import {
  createStatusUpdate,
  deleteStatusUpdate,
  markStatusViewed,
} from '../lib/chatActions';
import { compressImageFile, fileToDataUrl, formatChatListTime } from '../lib/media';
import { getVisiblePhoto } from '../lib/privacy';
import {
  Contact,
  PublicUser,
  StatusPrivacy,
  StatusUpdate,
} from '../types/youmessage';
import { Avatar } from './Avatar';

const BG_SWATCHES = [
  '#007AFF',
  '#34C759',
  '#5856D6',
  '#AF52DE',
  '#FF2D55',
  '#FF9500',
  '#1C1C1E',
];

interface StatusViewProps {
  myUser: PublicUser;
  statuses: StatusUpdate[];
  usersById: Record<string, PublicUser>;
  allUsers: PublicUser[];
  contacts: Record<string, Contact>;
}

export const StatusView: React.FC<StatusViewProps> = ({
  myUser,
  statuses,
  usersById,
  allUsers,
  contacts,
}) => {
  const [creating, setCreating] = useState(false);
  const [statusType, setStatusType] = useState<'text' | 'image' | 'video'>('text');
  const [text, setText] = useState('');
  const [bgColor, setBgColor] = useState(BG_SWATCHES[0]);
  const [mediaData, setMediaData] = useState('');
  const [privacy, setPrivacy] = useState<StatusPrivacy>('contacts');
  const [selectedUids, setSelectedUids] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [posting, setPosting] = useState(false);

  // Story viewer state
  const [viewerItems, setViewerItems] = useState<StatusUpdate[] | null>(null);
  const [viewerIndex, setViewerIndex] = useState(0);

  const activeStatuses = useMemo(() => {
    const now = Date.now();
    return statuses.filter((s) => s.expiresAt.toMillis() > now);
  }, [statuses]);

  const myStatuses = useMemo(
    () => activeStatuses.filter((s) => s.authorId === myUser.uid),
    [activeStatuses, myUser.uid]
  );

  const contactUidSet = useMemo(() => new Set(allUsers.map((u) => u.uid)), [allUsers]);

  const groupedByAuthor = useMemo(() => {
    const groups: Record<string, StatusUpdate[]> = {};
    activeStatuses
      .filter(
        (s) =>
          s.authorId !== myUser.uid &&
          !contacts[s.authorId]?.isBlocked &&
          (contactUidSet.has(s.authorId) || Boolean(contacts[s.authorId]))
      )
      .forEach((s) => {
        if (!groups[s.authorId]) groups[s.authorId] = [];
        groups[s.authorId].push(s);
      });
    return Object.entries(groups).map(([authorId, items]) => ({
      authorId,
      items: items.sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis()),
    }));
  }, [activeStatuses, myUser.uid, contacts, contactUidSet]);

  const handleMediaFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    try {
      if (statusType === 'image') {
        const compressed = await compressImageFile(file, 1080, 0.78);
        setMediaData(compressed);
      } else {
        const dataUrl = await fileToDataUrl(file, 520000);
        setMediaData(dataUrl);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load media.');
    }
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (statusType === 'text' && !text.trim()) {
      setError('Enter status text to publish.');
      return;
    }
    if ((statusType === 'image' || statusType === 'video') && !mediaData) {
      setError(`Choose a ${statusType} file to publish.`);
      return;
    }

    let allowedUids: string[] = [];
    if (privacy === 'contacts') {
      allowedUids = Object.values(contacts)
        .filter((c) => !c.isBlocked)
        .map((c) => c.contactUid);
    } else if (privacy === 'selected') {
      allowedUids = selectedUids;
    }

    setPosting(true);
    try {
      await createStatusUpdate({
        author: myUser,
        type: statusType,
        text: text.trim(),
        backgroundColor: bgColor,
        mediaData: mediaData || undefined,
        privacy,
        allowedUids,
      });
      setCreating(false);
      setText('');
      setMediaData('');
      setSelectedUids([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post status.');
    } finally {
      setPosting(false);
    }
  };

  const openViewer = (items: StatusUpdate[], startIndex = 0) => {
    if (items.length === 0) return;
    setViewerItems(items);
    setViewerIndex(startIndex);
    const current = items[startIndex];
    if (current && !current.viewedBy.includes(myUser.uid)) {
      markStatusViewed(current.id, myUser.uid);
    }
  };

  const stepViewer = (delta: number) => {
    if (!viewerItems) return;
    const next = viewerIndex + delta;
    if (next < 0 || next >= viewerItems.length) {
      setViewerItems(null);
      return;
    }
    setViewerIndex(next);
    const item = viewerItems[next];
    if (item && !item.viewedBy.includes(myUser.uid)) {
      markStatusViewed(item.id, myUser.uid);
    }
  };

  const currentStory = viewerItems ? viewerItems[viewerIndex] : null;

  return (
    <div className="h-full flex flex-col bg-white/75 dark:bg-zinc-950/75 backdrop-blur-2xl overflow-hidden">
      <header className="px-6 py-5 border-b border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-zinc-900 dark:text-white">
            Status
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Temporary 24-hour updates shared with your chosen audience
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="min-h-[40px] px-4 rounded-xl bg-[#007AFF] hover:bg-[#0066D6] text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Add Status
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-5 pb-24 lg:pb-6 max-w-3xl w-full mx-auto space-y-6">
        {/* My Status Card */}
        <section>
          <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-2.5 px-1">
            My Status
          </h2>
          <div className="p-4 rounded-3xl bg-white/85 dark:bg-zinc-900/85 border border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={() =>
                myStatuses.length > 0 ? openViewer(myStatuses, 0) : setCreating(true)
              }
              className="flex items-center gap-3.5 text-left flex-1 min-w-0 cursor-pointer"
            >
              <div
                className={`p-0.5 rounded-full ${
                  myStatuses.length > 0 ? 'ring-2 ring-[#007AFF]' : ''
                }`}
              >
                <Avatar src={myUser.photoURL} name={myUser.displayName} size="md" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                  {myStatuses.length > 0 ? 'View My Status' : 'Add a Status Update'}
                </p>
                <p className="text-xs text-zinc-500">
                  {myStatuses.length > 0
                    ? `${myStatuses.length} active · Last updated ${formatChatListTime(
                        myStatuses[myStatuses.length - 1].createdAt
                      )}`
                    : 'Share text, photo, or video for 24 hours'}
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setCreating(true)}
              className="min-h-[40px] px-3.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-200 cursor-pointer"
            >
              New
            </button>
          </div>
        </section>

        {/* Contacts Updates */}
        <section>
          <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-2.5 px-1">
            Recent Updates
          </h2>
          {groupedByAuthor.length === 0 ? (
            <div className="p-10 rounded-3xl bg-white/60 dark:bg-zinc-900/60 border border-black/[0.05] dark:border-white/[0.06] text-center">
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                No recent status updates
              </p>
              <p className="text-xs text-zinc-500 mt-1">
                Status updates from contacts will appear here for 24 hours.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {groupedByAuthor.map(({ authorId, items }) => {
                const author = usersById[authorId];
                const hasUnviewed = items.some((it) => !it.viewedBy.includes(myUser.uid));
                const latest = items[items.length - 1];
                return (
                  <button
                    key={authorId}
                    type="button"
                    onClick={() => openViewer(items, 0)}
                    className="w-full p-3.5 rounded-2xl bg-white/80 dark:bg-zinc-900/80 hover:bg-white dark:hover:bg-zinc-900 border border-black/[0.05] dark:border-white/[0.07] flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div
                        className={`p-0.5 rounded-full ${
                          hasUnviewed
                            ? 'ring-2 ring-[#007AFF]'
                            : 'ring-2 ring-zinc-300 dark:ring-zinc-700'
                        }`}
                      >
                        <Avatar
                          src={getVisiblePhoto(author, myUser.uid, contacts) || latest.authorPhoto}
                          name={author?.displayName || latest.authorName}
                          size="md"
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">
                          {contacts[authorId]?.nickname || author?.displayName || latest.authorName}
                        </p>
                        <p className="text-xs text-zinc-500 tabular-nums">
                          {items.length} update{items.length > 1 ? 's' : ''} ·{' '}
                          {formatChatListTime(latest.createdAt)}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Create Status Modal */}
      {creating && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handlePublish}
            className="w-full max-w-md rounded-3xl bg-white/95 dark:bg-zinc-900/95 backdrop-blur-2xl border border-black/[0.06] dark:border-white/[0.08] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          >
            <div className="px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold">New Status Update</h3>
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="p-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto">
              {/* Type Selector */}
              <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-zinc-100 dark:bg-zinc-800">
                {(
                  [
                    { id: 'text', label: 'Text', Icon: Type },
                    { id: 'image', label: 'Photo', Icon: ImageIcon },
                    { id: 'video', label: 'Video', Icon: Video },
                  ] as const
                ).map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setStatusType(id);
                      setMediaData('');
                      setError('');
                    }}
                    className={`py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                      statusType === id
                        ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm'
                        : 'text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </button>
                ))}
              </div>

              {statusType === 'text' ? (
                <div className="space-y-3">
                  <div
                    className="rounded-2xl p-6 min-h-[180px] flex items-center justify-center text-white transition-colors"
                    style={{ backgroundColor: bgColor }}
                  >
                    <textarea
                      rows={4}
                      maxLength={500}
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder="Type a status update..."
                      className="w-full bg-transparent text-center text-lg font-semibold placeholder:text-white/70 focus:outline-none resize-none"
                    />
                  </div>
                  <div className="flex items-center justify-center gap-2">
                    {BG_SWATCHES.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setBgColor(c)}
                        className={`w-7 h-7 rounded-full cursor-pointer transition-transform ${
                          bgColor === c ? 'ring-2 ring-offset-2 ring-[#007AFF] scale-110' : ''
                        }`}
                        style={{ backgroundColor: c }}
                        aria-label={`Color ${c}`}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <label className="block border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-2xl p-6 text-center cursor-pointer hover:border-[#007AFF] transition-colors">
                    {mediaData ? (
                      statusType === 'image' ? (
                        <img
                          src={mediaData}
                          alt="Status preview"
                          className="max-h-52 mx-auto rounded-xl object-contain"
                        />
                      ) : (
                        <video src={mediaData} controls className="max-h-52 mx-auto rounded-xl" />
                      )
                    ) : (
                      <span className="text-xs text-zinc-500">
                        Click to choose a {statusType}
                      </span>
                    )}
                    <input
                      type="file"
                      accept={statusType === 'image' ? 'image/*' : 'video/*'}
                      onChange={handleMediaFile}
                      className="sr-only"
                    />
                  </label>
                  <input
                    type="text"
                    maxLength={500}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Add a caption (optional)"
                    className="w-full h-10 px-3.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-sm focus:outline-none"
                  />
                </div>
              )}

              {/* Privacy Selector */}
              <div className="space-y-2">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                  <Lock className="w-3.5 h-3.5" /> Who can view this status
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      { id: 'everyone', label: 'Everyone' },
                      { id: 'contacts', label: 'My Contacts' },
                      { id: 'selected', label: 'Selected' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setPrivacy(opt.id)}
                      className={`py-2 px-2 rounded-xl text-xs font-medium cursor-pointer ${
                        privacy === opt.id
                          ? 'bg-[#007AFF] text-white'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {privacy === 'selected' && (
                  <div className="max-h-32 overflow-y-auto p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 space-y-1">
                    {allUsers
                      .filter((u) => u.uid !== myUser.uid)
                      .map((u) => {
                        const checked = selectedUids.includes(u.uid);
                        return (
                          <label
                            key={u.uid}
                            className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-xs cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setSelectedUids((prev) =>
                                  checked ? prev.filter((x) => x !== u.uid) : [...prev, u.uid]
                                )
                              }
                            />
                            <span>{u.displayName}</span>
                          </label>
                        );
                      })}
                  </div>
                )}
              </div>

              {error && <p className="text-xs text-red-500">{error}</p>}
            </div>

            <div className="px-5 py-4 border-t border-black/[0.06] dark:border-white/[0.08] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="px-4 py-2 rounded-xl text-sm text-zinc-600 dark:text-zinc-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={posting}
                className="px-5 py-2 rounded-xl bg-[#007AFF] text-white text-sm font-medium disabled:opacity-60 cursor-pointer"
              >
                {posting ? 'Sharing...' : 'Share Status'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Fullscreen Story Viewer */}
      {viewerItems && currentStory && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          {/* Progress bars */}
          <div className="px-4 pt-4 flex gap-1.5">
            {viewerItems.map((it, idx) => (
              <div
                key={it.id}
                className="flex-1 h-1 rounded-full bg-white/25 overflow-hidden"
              >
                <div
                  className={`h-full bg-white transition-all ${
                    idx <= viewerIndex ? 'w-full' : 'w-0'
                  }`}
                />
              </div>
            ))}
          </div>

          <div className="px-4 py-3 flex items-center justify-between text-white">
            <div className="flex items-center gap-3">
              <Avatar src={currentStory.authorPhoto} name={currentStory.authorName} size="sm" />
              <div>
                <p className="text-sm font-semibold">{currentStory.authorName}</p>
                <p className="text-[11px] text-white/70">
                  {formatChatListTime(currentStory.createdAt)} · {currentStory.privacy}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {currentStory.authorId === myUser.uid && (
                <button
                  type="button"
                  onClick={async () => {
                    await deleteStatusUpdate(currentStory.id);
                    setViewerItems(null);
                  }}
                  aria-label="Delete status"
                  className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-red-400 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setViewerItems(null)}
                aria-label="Close viewer"
                className="p-2 rounded-full bg-white/10 hover:bg-white/20 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Story Stage */}
          <div className="flex-1 relative flex items-center justify-center p-4 overflow-hidden">
            <button
              type="button"
              onClick={() => stepViewer(-1)}
              aria-label="Previous status"
              className="absolute left-3 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            {currentStory.type === 'text' && (
              <div
                className="max-w-lg w-full min-h-[340px] rounded-3xl p-8 flex items-center justify-center text-center text-white text-2xl font-semibold"
                style={{ backgroundColor: currentStory.backgroundColor || '#007AFF' }}
              >
                {currentStory.text}
              </div>
            )}

            {currentStory.type === 'image' && currentStory.mediaData && (
              <div className="max-w-2xl max-h-full flex flex-col items-center gap-3">
                <img
                  src={currentStory.mediaData}
                  alt="Status"
                  referrerPolicy="no-referrer"
                  className="max-h-[72vh] rounded-2xl object-contain"
                />
                {currentStory.text && (
                  <p className="text-white text-sm bg-black/50 px-4 py-2 rounded-xl">
                    {currentStory.text}
                  </p>
                )}
              </div>
            )}

            {currentStory.type === 'video' && currentStory.mediaData && (
              <div className="max-w-2xl max-h-full flex flex-col items-center gap-3">
                <video
                  src={currentStory.mediaData}
                  controls
                  autoPlay
                  className="max-h-[72vh] rounded-2xl"
                />
                {currentStory.text && (
                  <p className="text-white text-sm bg-black/50 px-4 py-2 rounded-xl">
                    {currentStory.text}
                  </p>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => stepViewer(1)}
              aria-label="Next status"
              className="absolute right-3 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {currentStory.authorId === myUser.uid && (
            <div className="px-6 py-4 bg-black/60 text-white flex items-center justify-center gap-2 text-xs">
              <Eye className="w-4 h-4 text-white/70" />
              <span className="tabular-nums">
                {Math.max(0, currentStory.viewedBy.length - 1)} views
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
