import React, { useEffect, useRef, useState } from 'react';
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import {
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  RefreshCw,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { db } from '../lib/firebase';
import { formatDuration } from '../lib/media';
import { CallSession } from '../types/youmessage';
import { Avatar } from './Avatar';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ],
};

interface ActiveCallModalProps {
  call: CallSession;
  myUid: string;
  playSounds: boolean;
  onClosed: () => void;
}

export const ActiveCallModal: React.FC<ActiveCallModalProps> = ({
  call,
  myUid,
  playSounds,
  onClosed,
}) => {
  const isCaller = call.callerId === myUid;
  const peerName = isCaller ? call.calleeName : call.callerName;
  const peerPhoto = isCaller ? call.calleePhoto : call.callerPhoto;

  const [callState, setCallState] = useState<CallSession>(call);
  const [micMuted, setMicMuted] = useState(false);
  const [speakerOff, setSpeakerOff] = useState(false);
  const [cameraOff, setCameraOff] = useState(call.callType === 'voice');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [elapsed, setElapsed] = useState(0);
  const [mediaError, setMediaError] = useState('');

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const startedWebRtcRef = useRef(false);
  const appliedAnswerRef = useRef(false);
  const durationRef = useRef(0);

  // Sync live call doc
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'calls', call.id), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as CallSession;
      setCallState(data);
      if (data.status === 'ended' || data.status === 'declined' || data.status === 'missed') {
        cleanupMedia();
        setTimeout(onClosed, 600);
      }
    });
    return () => unsub();
  }, [call.id]);

  // Call duration timer when active
  useEffect(() => {
    if (callState.status !== 'active') return;
    const timer = window.setInterval(() => {
      setElapsed((s) => {
        const next = s + 1;
        durationRef.current = next;
        return next;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [callState.status]);

  // Subtle Web Audio ringtone during ringing
  useEffect(() => {
    if (!playSounds || callState.status !== 'ringing') return;
    let timer: number | null = null;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const ring = () => {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(isCaller ? 440 : 660, now);
        gain.gain.setValueAtTime(0.04, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.65);
      };
      ring();
      timer = window.setInterval(ring, 2400);
      return () => {
        if (timer) window.clearInterval(timer);
        ctx.close().catch(() => {});
      };
    } catch {
      return;
    }
  }, [playSounds, callState.status, isCaller]);

  const cleanupMedia = () => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
  };

  useEffect(() => {
    return () => {
      cleanupMedia();
    };
  }, []);

  const setupPeerConnection = async (isVideo: boolean) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: isVideo ? { facingMode } : false,
    });
    localStreamRef.current = stream;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }

    const pc = new RTCPeerConnection(RTC_CONFIG);
    pcRef.current = pc;

    const remoteStream = new MediaStream();
    remoteStreamRef.current = remoteStream;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = remoteStream;

    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    pc.ontrack = (event) => {
      event.streams[0]?.getTracks().forEach((track) => {
        remoteStream.addTrack(track);
      });
    };

    return pc;
  };

  // Caller auto-starts WebRTC offer
  useEffect(() => {
    if (!isCaller || startedWebRtcRef.current) return;
    startedWebRtcRef.current = true;

    let unsubAnswers = () => {};
    (async () => {
      try {
        const pc = await setupPeerConnection(call.callType === 'video');
        pc.onicecandidate = (ev) => {
          if (ev.candidate) {
            addDoc(collection(db, 'calls', call.id, 'offerCandidates'), {
              candidate: ev.candidate.candidate,
              sdpMid: ev.candidate.sdpMid ?? null,
              sdpMLineIndex: ev.candidate.sdpMLineIndex ?? null,
              senderId: myUid,
              createdAt: serverTimestamp(),
            }).catch(() => {});
          }
        };

        const offerDesc = await pc.createOffer();
        await pc.setLocalDescription(offerDesc);

        await updateDoc(doc(db, 'calls', call.id), {
          offer: { type: 'offer', sdp: offerDesc.sdp || '' },
          updatedAt: serverTimestamp(),
        });

        unsubAnswers = onSnapshot(collection(db, 'calls', call.id, 'answerCandidates'), (snap) => {
          snap.docChanges().forEach((change) => {
            if (change.type === 'added') {
              const data = change.doc.data();
              pc.addIceCandidate(
                new RTCIceCandidate({
                  candidate: data.candidate,
                  sdpMid: data.sdpMid,
                  sdpMLineIndex: data.sdpMLineIndex,
                })
              ).catch(() => {});
            }
          });
        });
      } catch (err) {
        setMediaError(
          err instanceof Error
            ? err.message
            : 'Camera or microphone access denied.'
        );
      }
    })();

    return () => unsubAnswers();
  }, [isCaller, call.id, call.callType, myUid]);

  // Apply remote answer when caller receives it
  useEffect(() => {
    if (!isCaller || !callState.answer || appliedAnswerRef.current || !pcRef.current) return;
    appliedAnswerRef.current = true;
    pcRef.current
      .setRemoteDescription(new RTCSessionDescription(callState.answer))
      .catch(() => {});
  }, [isCaller, callState.answer]);

  const handleAnswerCall = async () => {
    try {
      const pc = await setupPeerConnection(call.callType === 'video');
      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          addDoc(collection(db, 'calls', call.id, 'answerCandidates'), {
            candidate: ev.candidate.candidate,
            sdpMid: ev.candidate.sdpMid ?? null,
            sdpMLineIndex: ev.candidate.sdpMLineIndex ?? null,
            senderId: myUid,
            createdAt: serverTimestamp(),
          }).catch(() => {});
        }
      };

      if (callState.offer) {
        await pc.setRemoteDescription(new RTCSessionDescription(callState.offer));
      }
      const answerDesc = await pc.createAnswer();
      await pc.setLocalDescription(answerDesc);

      await updateDoc(doc(db, 'calls', call.id), {
        answer: { type: 'answer', sdp: answerDesc.sdp || '' },
        status: 'active',
        updatedAt: serverTimestamp(),
      });

      onSnapshot(collection(db, 'calls', call.id, 'offerCandidates'), (snap) => {
        snap.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const data = change.doc.data();
            pc.addIceCandidate(
              new RTCIceCandidate({
                candidate: data.candidate,
                sdpMid: data.sdpMid,
                sdpMLineIndex: data.sdpMLineIndex,
              })
            ).catch(() => {});
          }
        });
      });
    } catch (err) {
      setMediaError(
        err instanceof Error ? err.message : 'Unable to access microphone/camera.'
      );
    }
  };

  const handleEndOrDecline = async () => {
    cleanupMedia();
    const nextStatus =
      callState.status === 'ringing'
        ? isCaller
          ? 'missed'
          : 'declined'
        : 'ended';
    try {
      await updateDoc(doc(db, 'calls', call.id), {
        status: nextStatus,
        durationSec: durationRef.current,
        updatedAt: serverTimestamp(),
      });
    } catch {
      // Call already ended
    }
    onClosed();
  };

  const toggleMic = () => {
    const next = !micMuted;
    setMicMuted(next);
    localStreamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !next;
    });
  };

  const toggleCamera = () => {
    const next = !cameraOff;
    setCameraOff(next);
    localStreamRef.current?.getVideoTracks().forEach((t) => {
      t.enabled = !next;
    });
  };

  const toggleSpeaker = () => {
    const next = !speakerOff;
    setSpeakerOff(next);
    if (remoteVideoRef.current) remoteVideoRef.current.muted = next;
    if (remoteAudioRef.current) remoteAudioRef.current.muted = next;
  };

  const switchCamera = async () => {
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextMode);
    if (call.callType !== 'video' || !pcRef.current) return;
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: nextMode },
      });
      const newTrack = newStream.getVideoTracks()[0];
      const sender = pcRef.current
        .getSenders()
        .find((s) => s.track && s.track.kind === 'video');
      if (sender && newTrack) {
        await sender.replaceTrack(newTrack);
        localStreamRef.current?.getVideoTracks().forEach((t) => t.stop());
        if (localVideoRef.current) localVideoRef.current.srcObject = newStream;
      }
    } catch {
      // Ignore if device has single camera
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950/95 backdrop-blur-2xl text-white flex flex-col justify-between p-6">
      <audio ref={remoteAudioRef} autoPlay />

      {/* Remote Video Background (for video calls) */}
      {call.callType === 'video' && (
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="absolute inset-0 w-full h-full object-cover opacity-90"
        />
      )}

      {/* Top Info */}
      <div className="relative z-10 flex flex-col items-center pt-8 text-center">
        <Avatar src={peerPhoto} name={peerName} size="xl" />
        <h2 className="font-display text-2xl font-bold mt-4">{peerName}</h2>
        <p className="text-sm text-zinc-300 mt-1 tabular-nums">
          {callState.status === 'ringing'
            ? isCaller
              ? 'Calling...'
              : `Incoming ${call.callType} call`
            : callState.status === 'active'
              ? formatDuration(elapsed)
              : callState.status}
        </p>
        {mediaError && (
          <p className="mt-3 px-4 py-2 rounded-xl bg-red-500/20 text-xs text-red-200 max-w-sm">
            {mediaError}
          </p>
        )}
      </div>

      {/* Local PiP Video */}
      {call.callType === 'video' && !cameraOff && (
        <div className="relative z-10 self-end w-28 sm:w-36 aspect-[3/4] rounded-2xl overflow-hidden border border-white/20 shadow-xl bg-zinc-900">
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* Bottom Controls */}
      <div className="relative z-10 pb-6 flex items-center justify-center gap-4 flex-wrap">
        {!isCaller && callState.status === 'ringing' ? (
          <>
            <button
              type="button"
              onClick={handleEndOrDecline}
              className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-lg cursor-pointer"
              aria-label="Decline call"
            >
              <PhoneOff className="w-7 h-7" />
            </button>
            <button
              type="button"
              onClick={handleAnswerCall}
              className="w-16 h-16 rounded-full bg-emerald-500 hover:bg-emerald-600 flex items-center justify-center shadow-lg cursor-pointer"
              aria-label="Accept call"
            >
              <Phone className="w-7 h-7" />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={toggleMic}
              aria-label={micMuted ? 'Unmute microphone' : 'Mute microphone'}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                micMuted ? 'bg-white text-zinc-900' : 'bg-white/15 hover:bg-white/25'
              }`}
            >
              {micMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
            </button>

            <button
              type="button"
              onClick={toggleSpeaker}
              aria-label={speakerOff ? 'Enable speaker' : 'Mute speaker'}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                speakerOff ? 'bg-white text-zinc-900' : 'bg-white/15 hover:bg-white/25'
              }`}
            >
              {speakerOff ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
            </button>

            {call.callType === 'video' && (
              <>
                <button
                  type="button"
                  onClick={toggleCamera}
                  aria-label={cameraOff ? 'Turn camera on' : 'Turn camera off'}
                  className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                    cameraOff ? 'bg-white text-zinc-900' : 'bg-white/15 hover:bg-white/25'
                  }`}
                >
                  {cameraOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
                </button>
                <button
                  type="button"
                  onClick={switchCamera}
                  aria-label="Switch camera"
                  className="w-14 h-14 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-5 h-5" />
                </button>
              </>
            )}

            <button
              type="button"
              onClick={handleEndOrDecline}
              aria-label="End call"
              className="w-16 h-14 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-lg cursor-pointer"
            >
              <PhoneOff className="w-6 h-6" />
            </button>
          </>
        )}
      </div>
    </div>
  );
};
