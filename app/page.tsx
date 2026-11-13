"use client";

import {
  Camera,
  CameraOff,
  Check,
  ChevronLeft,
  Clipboard,
  Copy,
  Headphones,
  LoaderCircle,
  Maximize2,
  MessageCircle,
  Minimize2,
  LockKeyhole,
  Mic,
  MicOff,
  MonitorUp,
  Phone,
  PhoneOff,
  Plus,
  ShieldCheck,
  Signal,
  Share2,
  Smile,
  Sparkles,
  Sun,
  Video,
  Volume2,
  X,
} from "lucide-react";
import { Room, RoomEvent, Track, VideoQuality } from "livekit-client";
import { type FormEvent, type PointerEvent, useCallback, useEffect, useRef, useState } from "react";

type Stage = "home" | "prejoin" | "connecting" | "call";
type RemoteMedia = {
  id: string;
  identity: string;
  name: string;
  track: any;
  source: Track.Source;
  kind: Track.Kind;
};
type ChatMessage = {
  id: number;
  sender: string;
  text: string;
  own: boolean;
};

function makePrivateKey() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function readKey(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    return url.searchParams.get("key") || trimmed;
  } catch {
    return trimmed;
  }
}

function VideoSurface({ track, muted = false, label }: { track?: any; muted?: boolean; label: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!track || !videoRef.current) return;
    videoRef.current.muted = muted;
    videoRef.current.autoplay = true;
    videoRef.current.playsInline = true;
    track.attach(videoRef.current);
    return () => {
      try {
        track.detach(videoRef.current);
      } catch {
        // Track may already have been detached after a network transition.
      }
    };
  }, [track, muted]);

  return <video ref={videoRef} className="video-feed" autoPlay playsInline muted={muted} aria-label={label} />;
}

function AudioSurface({ track }: { track: any }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (!track || !audioRef.current) return;
    const element = track.attach(audioRef.current);
    element.autoplay = true;
    return () => {
      try {
        track.detach(element);
      } catch {
        // Ignore already-detached tracks.
      }
    };
  }, [track]);
  return <audio ref={audioRef} autoPlay />;
}

function Avatar({ name, large = false }: { name: string; large?: boolean }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "G";
  return <div className={`avatar ${large ? "avatar-large" : ""}`}>{initials}</div>;
}

export default function Home() {
  const [stage, setStage] = useState<Stage>("home");
  const [key, setKey] = useState("");
  const [joinInput, setJoinInput] = useState("");
  const [displayName, setDisplayName] = useState(`Guest ${Math.floor(10 + Math.random() * 89)}`);
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [screenAudioIncluded, setScreenAudioIncluded] = useState<boolean | null>(null);
  const [screenFocus, setScreenFocus] = useState(false);
  const [remoteMedia, setRemoteMedia] = useState<RemoteMedia[]>([]);
  const [localCameraTrack, setLocalCameraTrack] = useState<any>(null);
  const [localScreenTrack, setLocalScreenTrack] = useState<any>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [remoteCount, setRemoteCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mediaNotice, setMediaNotice] = useState("");
  const [copied, setCopied] = useState(false);
  const [lightTheme, setLightTheme] = useState(false);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const [reactionBubbles, setReactionBubbles] = useState<{ id: number; emoji: string }[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatDraft, setChatDraft] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatPosition, setChatPosition] = useState({ x: 0, y: 0 });
  const chatDrag = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const screenStageRef = useRef<HTMLDivElement>(null);
  const screenTracksRef = useRef<MediaStreamTrack[]>([]);

  useEffect(() => {
    const incomingKey = new URLSearchParams(window.location.search).get("key");
    if (incomingKey) {
      setKey(incomingKey);
      setStage("prejoin");
    }
  }, []);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem("vybe-theme");
    setLightTheme(storedTheme === "light");
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = lightTheme ? "light" : "dark";
    window.localStorage.setItem("vybe-theme", lightTheme ? "light" : "dark");
  }, [lightTheme]);

  useEffect(() => {
    if (stage !== "prejoin") return;
    let active = true;
    let acquiredStream: MediaStream | null = null;
    setPreviewStream(null);
    setMediaNotice("");

    if (!cameraOn && !micOn) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setMediaNotice("Camera and microphone access isn't available in this browser.");
      return;
    }

    navigator.mediaDevices.getUserMedia({
      video: cameraOn ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" } : false,
      audio: micOn ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true } : false,
    }).then((stream) => {
      if (!active) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      acquiredStream = stream;
      setPreviewStream(stream);
    }).catch(() => {
      if (active) setMediaNotice("Allow camera or microphone access in your browser to preview before joining.");
    });

    return () => {
      active = false;
      acquiredStream?.getTracks().forEach((track) => track.stop());
    };
  }, [stage, cameraOn, micOn]);

  useEffect(() => {
    if (!previewVideoRef.current) return;
    previewVideoRef.current.srcObject = previewStream;
  }, [previewStream, stage]);

  const inviteUrl = typeof window !== "undefined" && key
    ? `${window.location.origin}/?key=${encodeURIComponent(key)}`
    : "";

  const beginCreate = () => {
    const newKey = makePrivateKey();
    setKey(newKey);
    setError("");
    setStage("prejoin");
  };

  const beginJoin = () => {
    const parsed = readKey(joinInput);
    if (!/^[a-f0-9]{64}$/i.test(parsed)) {
      setError("Enter a valid private key or paste the full invite link.");
      return;
    }
    setKey(parsed);
    setError("");
    setStage("prejoin");
  };

  const copyInvite = useCallback(async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(`Join my private VYBE room:\n${inviteUrl}\n\nPrivate key: ${key}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Clipboard access was blocked. Copy the invite link from your browser address bar.");
    }
  }, [inviteUrl, key]);

  const shareInvite = useCallback(async () => {
    if (!inviteUrl) return;
    if (!navigator.share) {
      await copyInvite();
      return;
    }
    try {
      await navigator.share({
        title: "Join my private VYBE room",
        text: `Use this private key to join: ${key}`,
        url: inviteUrl,
      });
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === "AbortError") return;
      setError("The invite could not be shared. Try copying it instead.");
    }
  }, [copyInvite, inviteUrl, key]);

  const joinRoom = async () => {
    if (!key) return;
    setBusy(true);
    setError("");
    setMediaNotice("");
    setStage("connecting");

    // Stop the preview stream first; LiveKit will acquire exactly the tracks
    // selected by the participant in the pre-join screen.
    previewStream?.getTracks().forEach((track) => track.stop());
    setPreviewStream(null);

    let pendingRoom: Room | null = null;
    try {
      const response = await fetch("/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ key, name: displayName.trim() || "Guest" }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Couldn't enter this room.");

      const nextRoom = new Room({ adaptiveStream: true, dynacast: true });
      pendingRoom = nextRoom;
      nextRoom.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        if (publication.source === Track.Source.ScreenShare) publication.setVideoQuality(VideoQuality.HIGH);
        const item: RemoteMedia = {
          id: `${participant.identity}-${publication.trackSid}`,
          identity: participant.identity,
          name: participant.name || "Guest",
          track,
          source: publication.source,
          kind: track.kind,
        };
        setRemoteMedia((current) => current.some((media) => media.id === item.id) ? current : [...current, item]);
      });
      nextRoom.on(RoomEvent.TrackUnsubscribed, (_track, publication, participant) => {
        setRemoteMedia((current) => current.filter((item) => item.id !== `${participant.identity}-${publication.trackSid}`));
      });
      const updateCount = () => setRemoteCount(nextRoom.remoteParticipants.size);
      nextRoom.on(RoomEvent.ParticipantConnected, updateCount);
      nextRoom.on(RoomEvent.ParticipantDisconnected, updateCount);
      nextRoom.on(RoomEvent.Disconnected, () => {
        setRemoteMedia([]);
        setRemoteCount(0);
      });

      await nextRoom.prepareConnection(payload.serverUrl, payload.token);
      await nextRoom.connect(payload.serverUrl, payload.token);
      nextRoom.on(RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
        if (topic !== "chat") return;
        try {
          const message = JSON.parse(new TextDecoder().decode(payload)) as { text?: unknown };
          const text = typeof message.text === "string" ? message.text.trim().slice(0, 500) : "";
          if (!text) return;
          setChatMessages((current) => [...current.slice(-99), {
            id: Date.now() + Math.floor(Math.random() * 1000),
            sender: participant?.name || "Guest",
            text,
            own: false,
          }]);
        } catch {
          // Ignore data published by another feature or an incompatible client.
        }
      });
      const mediaWarnings: string[] = [];
      if (cameraOn) {
        try {
          await nextRoom.localParticipant.setCameraEnabled(true);
        } catch {
          setCameraOn(false);
          mediaWarnings.push("Camera access was denied, so you joined with your camera off.");
        }
      }
      if (micOn) {
        try {
          await nextRoom.localParticipant.setMicrophoneEnabled(true);
        } catch {
          setMicOn(false);
          mediaWarnings.push("Microphone access was denied, so you joined with your microphone off.");
        }
      }
      setRoom(nextRoom);
      setRemoteCount(nextRoom.remoteParticipants.size);
      const cameraPublication = nextRoom.localParticipant.getTrackPublication(Track.Source.Camera);
      setLocalCameraTrack(cameraPublication?.track || null);
      if (mediaWarnings.length) setMediaNotice(mediaWarnings.join(" "));
      window.history.replaceState({}, "", `/?key=${encodeURIComponent(key)}`);
      setStage("call");
    } catch (joinError) {
      await pendingRoom?.disconnect();
      const message = joinError instanceof Error ? joinError.message : "Something went wrong while joining.";
      setError(message);
      setStage("prejoin");
    } finally {
      setBusy(false);
    }
  };

  const toggleCamera = async () => {
    const next = !cameraOn;
    setCameraOn(next);
    if (room) {
      try {
        await room.localParticipant.setCameraEnabled(next);
        const publication = room.localParticipant.getTrackPublication(Track.Source.Camera);
        setLocalCameraTrack(publication?.track || null);
      } catch {
        setError("Couldn't change camera state. Check your browser permissions.");
      }
    }
  };

  const toggleMic = async () => {
    const next = !micOn;
    setMicOn(next);
    if (room) {
      try {
        await room.localParticipant.setMicrophoneEnabled(next);
      } catch {
        setError("Couldn't change microphone state. Check your browser permissions.");
      }
    }
  };

  const stopScreenShare = useCallback(async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    setScreenFocus(false);
    if (room) {
      for (const track of screenTracksRef.current) {
        try {
          await room.localParticipant.unpublishTrack(track);
        } catch {
          // It may already have been unpublished by a browser-level stop action.
        }
        track.stop();
      }
    } else {
      screenTracksRef.current.forEach((track) => track.stop());
    }
    screenTracksRef.current = [];
    setScreenStream(null);
    setLocalScreenTrack(null);
    setScreenAudioIncluded(null);
  }, [room]);

  const toggleScreenFocus = async () => {
    if (!screenFocus) {
      setScreenFocus(true);
      try {
        await screenStageRef.current?.requestFullscreen();
      } catch {
        // The layout focus mode remains available if browser fullscreen is blocked.
      }
      return;
    }
    if (document.fullscreenElement) await document.exitFullscreen();
    setScreenFocus(false);
  };

  const toggleScreenShare = async () => {
    if (screenStream) {
      await stopScreenShare();
      return;
    }
    if (!room) return;
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: { ideal: 3840, max: 3840 }, height: { ideal: 2160, max: 2160 }, frameRate: { ideal: 30, max: 30 } },
        audio: { autoGainControl: false, echoCancellation: false, noiseSuppression: false },
        systemAudio: "include",
      } as any);
      const videoTrack = displayStream.getVideoTracks()[0];
      const audioTrack = displayStream.getAudioTracks()[0];
      if (!videoTrack) throw new Error("No screen video was selected.");
      videoTrack.contentHint = "detail";
      await videoTrack.applyConstraints({ width: { ideal: 3840, max: 3840 }, height: { ideal: 2160, max: 2160 }, frameRate: { ideal: 30, max: 30 } });
      await room.localParticipant.publishTrack(videoTrack, {
        source: Track.Source.ScreenShare,
        screenShareEncoding: { maxBitrate: 12_000_000, maxFramerate: 30 },
        degradationPreference: "maintain-resolution",
      });
      if (audioTrack) {
        audioTrack.contentHint = "music";
        await room.localParticipant.publishTrack(audioTrack, { source: Track.Source.ScreenShareAudio });
      }
      screenTracksRef.current = displayStream.getTracks();
      setScreenStream(displayStream);
      setScreenAudioIncluded(Boolean(audioTrack));
      setLocalScreenTrack(videoTrack);
      videoTrack.addEventListener("ended", () => { void stopScreenShare(); }, { once: true });
      if (!audioTrack) setMediaNotice("No shared audio was provided. Choose a browser tab or window and enable its audio option in the share dialog.");
      else setMediaNotice("");
    } catch (shareError) {
      const message = shareError instanceof Error ? shareError.message : "Screen sharing was cancelled or unavailable.";
      if (!message.toLowerCase().includes("permission denied") && !message.toLowerCase().includes("cancel")) setError(message);
    }
  };

  const leaveRoom = async () => {
    await stopScreenShare();
    if (room) await room.disconnect();
    setRoom(null);
    setRemoteMedia([]);
    setLocalCameraTrack(null);
    setLocalScreenTrack(null);
    setRemoteCount(0);
    setChatMessages([]);
    setChatDraft("");
    setChatOpen(false);
    setChatPosition({ x: 0, y: 0 });
    setStage("home");
    setKey("");
    setError("");
    window.history.replaceState({}, "", "/");
  };

  const sendReaction = (emoji: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setReactionBubbles((current) => [...current.slice(-7), { id, emoji }]);
    setReactionPickerOpen(false);
    window.setTimeout(() => {
      setReactionBubbles((current) => current.filter((reaction) => reaction.id !== id));
    }, 3200);
  };

  const sendChatMessage = async (event: FormEvent) => {
    event.preventDefault();
    const text = chatDraft.trim().slice(0, 500);
    if (!room || !text) return;
    try {
      await room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify({ text })), {
        reliable: true,
        topic: "chat",
      });
      setChatMessages((current) => [...current.slice(-99), {
        id: Date.now() + Math.floor(Math.random() * 1000),
        sender: displayName || "You",
        text,
        own: true,
      }]);
      setChatDraft("");
    } catch {
      setError("Message could not be sent. Check your connection and try again.");
    }
  };

  const startChatDrag = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    chatDrag.current = { startX: event.clientX, startY: event.clientY, originX: chatPosition.x, originY: chatPosition.y };
  };

  const moveChatDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!chatDrag.current) return;
    const nextX = chatDrag.current.originX + event.clientX - chatDrag.current.startX;
    const nextY = chatDrag.current.originY + event.clientY - chatDrag.current.startY;
    setChatPosition({
      x: Math.max(-window.innerWidth + 360, Math.min(window.innerWidth - 40, nextX)),
      y: Math.max(-window.innerHeight + 150, Math.min(window.innerHeight - 130, nextY)),
    });
  };

  const stopChatDrag = () => {
    chatDrag.current = null;
  };

  const remoteVideo = remoteMedia.filter((item) => item.kind === Track.Kind.Video);
  const remoteAudio = remoteMedia.filter((item) => item.kind === Track.Kind.Audio);
  const remoteScreen = remoteVideo.find((item) => item.source === Track.Source.ScreenShare);
  const remoteCamera = remoteVideo.filter((item) => item.source !== Track.Source.ScreenShare);
  const connectedParticipants = room ? Array.from(room.remoteParticipants.values()) : [];
  const remoteWithoutVideo = connectedParticipants.filter((participant) => !remoteCamera.some((item) => item.identity === participant.identity));
  const oneToOneCall = !remoteScreen && !localScreenTrack && connectedParticipants.length === 1;

  return (
    <main className={`app-shell ${stage === "call" ? "call-app-shell" : ""}`}>
      <header className="topbar">
        <a className="brand" href="/" aria-label="VYBE home" onClick={(event) => { if (stage !== "home") { event.preventDefault(); void leaveRoom(); } }}>
          <span className="brand-mark"><span /></span>
          <span>VYBE</span>
        </a>
        <div className="topbar-right">
          <span className="privacy-label"><LockKeyhole size={13} /> PRIVATE BY KEY</span>
          <span className="topbar-divider" />
          <span className="no-account">NO ACCOUNT NEEDED</span>
          <button className="theme-toggle" onClick={() => setLightTheme((current) => !current)} aria-label={lightTheme ? "Use dark theme" : "Use light theme"} title={lightTheme ? "Use dark theme" : "Use light theme"}>
            <Sun size={14} />
          </button>
        </div>
      </header>

      {stage === "home" && (
        <section className="home-view">
          <div className="hero-copy">
            <div className="eyebrow"><span className="live-dot" /> SIMPLE. PRIVATE. REAL-TIME.</div>
            <h1>Just talk.<br /><span>No account. No noise.</span></h1>
            <p className="hero-subtitle">A private room for the people you choose. One key gets you in.</p>
          </div>

          <div className="home-panel">
            <button className="create-button" onClick={beginCreate}>
              <span className="button-icon"><Plus size={18} /></span>
              <span><strong>Create a private room</strong><small>Generate a secure private invite key</small></span>
              <span className="button-arrow">↗</span>
            </button>
            <div className="or-divider"><span /> OR JOIN A ROOM <span /></div>
            <form className="join-form" onSubmit={(event) => { event.preventDefault(); beginJoin(); }}>
              <label htmlFor="room-key">PRIVATE KEY OR INVITE LINK</label>
              <div className="key-input-wrap">
                <LockKeyhole size={16} />
                <input id="room-key" value={joinInput} onChange={(event) => setJoinInput(event.target.value)} placeholder="Paste your private key" autoComplete="off" spellCheck={false} />
                {joinInput && <button className="clear-input" type="button" onClick={() => setJoinInput("")} aria-label="Clear key"><X size={15} /></button>}
              </div>
              <button className="join-button" type="submit" disabled={!joinInput.trim()}><span>Join room</span><ChevronLeft className="join-arrow" size={17} /></button>
            </form>
            {error && <p className="inline-error">{error}</p>}
          </div>

          <div className="home-footnotes">
            <div><ShieldCheck size={15} /><span>Encrypted WebRTC media transport</span></div>
            <div><Signal size={15} /><span>Adaptive real-time media delivery</span></div>
            <div><Sparkles size={15} /><span>Nothing to install</span></div>
          </div>
          <footer className="page-footer"><span>VYBE © 2026</span><span>BUILT FOR THE MOMENT, NOT THE PROFILE.</span></footer>
        </section>
      )}

      {(stage === "prejoin" || stage === "connecting") && (
        <section className="prejoin-view">
          <button className="back-link" onClick={() => { setStage("home"); setError(""); }}><ChevronLeft size={16} /> Back</button>
          <div className="prejoin-heading">
            <div className="eyebrow">PRIVATE ROOM READY</div>
            <h2>Before you join.</h2>
            <p>Check your setup. You can turn everything off before entering.</p>
          </div>
          <div className="prejoin-layout">
            <div className="preview-card">
              <div className="preview-frame">
                {cameraOn && previewStream?.getVideoTracks().length ? (
                  <video ref={previewVideoRef} autoPlay playsInline muted className="video-feed preview-feed" />
                ) : (
                  <div className="preview-off"><Avatar name={displayName} large /><span>Camera is off</span></div>
                )}
                <div className="preview-live"><span className="live-dot" /> LOCAL PREVIEW</div>
                <div className="preview-name">{displayName || "Guest"}</div>
              </div>
              <div className="preview-controls">
                <button className={`round-control ${cameraOn ? "active" : "inactive"}`} onClick={toggleCamera} aria-label={cameraOn ? "Turn camera off" : "Turn camera on"}>{cameraOn ? <Camera size={18} /> : <CameraOff size={18} />}</button>
                <button className={`round-control ${micOn ? "active" : "inactive"}`} onClick={toggleMic} aria-label={micOn ? "Mute microphone" : "Unmute microphone"}>{micOn ? <Mic size={18} /> : <MicOff size={18} />}</button>
                <span className="preview-control-label">{cameraOn ? "Camera on" : "Camera off"} · {micOn ? "Mic on" : "Mic off"}</span>
              </div>
            </div>
            <div className="prejoin-side">
              <div className="setup-card">
                <label htmlFor="display-name">YOUR NAME</label>
                <input id="display-name" className="name-input" value={displayName} maxLength={32} onChange={(event) => setDisplayName(event.target.value)} />
                <div className="setup-divider" />
                <div className="device-row"><span className="device-icon"><Video size={17} /></span><span><strong>Camera</strong><small>{cameraOn ? "Ready to share" : "Off for this call"}</small></span><span className={`device-state ${cameraOn ? "state-on" : ""}`}>{cameraOn ? "ON" : "OFF"}</span></div>
                <div className="device-row"><span className="device-icon"><Headphones size={17} /></span><span><strong>Microphone</strong><small>{micOn ? "Echo cancellation enabled" : "Off for this call"}</small></span><span className={`device-state ${micOn ? "state-on" : ""}`}>{micOn ? "ON" : "OFF"}</span></div>
                {mediaNotice && <p className="media-notice">{mediaNotice}</p>}
              </div>
              <div className="invite-preview-card">
                <div><span className="invite-label">YOUR PRIVATE INVITE</span><span className="invite-key-preview">{key.slice(0, 9)}••••••••••••••••</span></div>
                <button className="copy-key-button" onClick={copyInvite}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "Copied" : "Copy invite"}</button>
              </div>
              {error && <p className="inline-error">{error}</p>}
              <button className="enter-button" onClick={joinRoom} disabled={busy || stage === "connecting"}>
                {busy || stage === "connecting" ? <><LoaderCircle className="spin" size={17} /> Connecting...</> : <><Phone size={17} /> Join private room <span>↗</span></>}
              </button>
              <p className="small-privacy"><LockKeyhole size={12} /> Only people with this private key can enter.</p>
            </div>
          </div>
        </section>
      )}

      {stage === "call" && room && (
        <section className="call-view">
          <div className="call-header">
            <div><span className="call-state-dot" /><span>ROOM ACTIVE</span><span className="call-header-separator">/</span><span className="call-room-name">PRIVATE SESSION</span></div>
            <button className="share-invite-button" onClick={shareInvite}>{copied ? <Check size={15} /> : <Share2 size={15} />}{copied ? "Copied" : "Share invite"}</button>
          </div>
          {chatOpen && (
            <aside className="chat-panel" style={{ transform: `translate3d(${chatPosition.x}px, ${chatPosition.y}px, 0)` }}>
              <div className="chat-panel-header" onPointerDown={startChatDrag} onPointerMove={moveChatDrag} onPointerUp={stopChatDrag} onPointerCancel={stopChatDrag}><span><MessageCircle size={15} /> ROOM CHAT <small>DRAG TO MOVE</small></span><button onClick={() => setChatOpen(false)} aria-label="Close chat"><X size={14} /></button></div>
              <div className="chat-messages" aria-live="polite">
                {chatMessages.length === 0 ? <p className="chat-empty">Say hello to everyone in the room.</p> : chatMessages.map((message) => (
                  <div className={`chat-message ${message.own ? "chat-message-own" : ""}`} key={message.id}>
                    <span className="chat-sender">{message.own ? "YOU" : message.sender}</span>
                    <p>{message.text}</p>
                  </div>
                ))}
              </div>
              <form className="chat-form" onSubmit={sendChatMessage}>
                <input value={chatDraft} onChange={(event) => setChatDraft(event.target.value)} maxLength={500} placeholder="Write a message..." aria-label="Message" />
                <button type="submit" disabled={!chatDraft.trim()} aria-label="Send message">↗</button>
              </form>
            </aside>
          )}

          <div className={`call-stage ${remoteScreen || localScreenTrack ? "has-screen" : ""} ${screenFocus ? "screen-focus" : ""}`}>
            {reactionBubbles.length > 0 && (
              <div className="reaction-bubbles" aria-live="polite">
                {reactionBubbles.map((reaction) => <span className="reaction-bubble" key={reaction.id}>{reaction.emoji}</span>)}
              </div>
            )}
            {(remoteScreen || localScreenTrack) && (
              <div className="screen-stage" ref={screenStageRef}>
                {localScreenTrack && screenStream ? <video className="video-feed" autoPlay playsInline muted ref={(element) => { if (element) element.srcObject = screenStream; }} /> : remoteScreen ? <VideoSurface track={remoteScreen.track} label="Shared screen" /> : null}
                <span className="screen-tag"><MonitorUp size={13} /> SCREEN SHARE {screenAudioIncluded ? "· AUDIO ON" : ""}</span>
                <button className="screen-focus-button" onClick={toggleScreenFocus} aria-label={screenFocus ? "Exit fullscreen shared screen" : "Fullscreen shared screen"}>{screenFocus ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button>
              </div>
            )}
            <div className={`participant-grid ${oneToOneCall ? "one-to-one" : ""}`}>
              <div className="participant-card local-participant">
                {cameraOn && localCameraTrack ? <VideoSurface track={localCameraTrack} muted label="Your camera" /> : <div className="participant-off"><Avatar name={displayName} large /><span>Camera off</span></div>}
                <span className="participant-name"><span className="you-label">YOU</span>{displayName}</span>
                <span className="participant-mic"><Mic size={12} className={micOn ? "mic-active" : "mic-muted"} /></span>
              </div>
              {remoteCamera.map((item) => (
                <div className="participant-card" key={item.id}>
                  <VideoSurface track={item.track} label={`${item.name}'s camera`} />
                  <span className="participant-name">{item.name}</span>
                </div>
              ))}
              {remoteWithoutVideo.map((participant) => (
                <div className="participant-card remote-audio-card" key={participant.identity}>
                  <div className="participant-off"><Avatar name={participant.name || "Guest"} large /><span>Camera off</span></div>
                  <span className="participant-name">{participant.name || "Guest"}</span>
                </div>
              ))}
              {remoteCount === 0 && (
                <div className="waiting-card">
                  <div className="waiting-pulse"><span /><span /><span /></div>
                  <strong>You're here first.</strong>
                  <p>Send the private invite to bring someone in.</p>
                  <button onClick={copyInvite}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Copied" : "Copy invite"}</button>
                </div>
              )}
            </div>
            {remoteAudio.map((item) => <AudioSurface key={item.id} track={item.track} />)}
          </div>

          {mediaNotice && <div className="call-notice">{mediaNotice}<button onClick={() => setMediaNotice("")}><X size={13} /></button></div>}
          {error && <div className="call-notice error-notice">{error}<button onClick={() => setError("")}><X size={13} /></button></div>}

          <div className="call-footer">
            <div className="connection-label"><span className="call-state-dot" /> SECURE CONNECTION <span>·</span> {remoteCount + 1} IN ROOM</div>
            <div className="call-controls">
              <button className={`call-control ${micOn ? "" : "control-off"}`} onClick={toggleMic} aria-label={micOn ? "Mute microphone" : "Unmute microphone"}>{micOn ? <Mic size={19} /> : <MicOff size={19} />}<small>{micOn ? "Mute" : "Unmute"}</small></button>
              <button className={`call-control ${cameraOn ? "" : "control-off"}`} onClick={toggleCamera} aria-label={cameraOn ? "Turn camera off" : "Turn camera on"}>{cameraOn ? <Camera size={19} /> : <CameraOff size={19} />}<small>{cameraOn ? "Camera" : "Camera off"}</small></button>
              <button className={`call-control ${screenStream ? "control-on" : ""}`} onClick={toggleScreenShare} aria-label={screenStream ? "Stop screen sharing" : "Share screen"}>{screenStream ? <MonitorUp size={19} /> : <MonitorUp size={19} />}<small>{screenStream ? "Stop share" : "Share screen"}</small></button>
              <div className="reaction-control">
                {reactionPickerOpen && (
                  <div className="reaction-picker" role="group" aria-label="Send a reaction">
                    {["👍", "👏", "❤️", "😂", "🎉", "🔥"].map((emoji) => <button key={emoji} onClick={() => sendReaction(emoji)} aria-label={`Send ${emoji} reaction`}>{emoji}</button>)}
                  </div>
                )}
                <button className={`call-control ${reactionPickerOpen ? "control-on" : ""}`} onClick={() => setReactionPickerOpen((open) => !open)} aria-label="Open emoji reactions"><Smile size={19} /><small>React</small></button>
              </div>
              <button className={`call-control ${chatOpen ? "control-on" : ""}`} onClick={() => setChatOpen((open) => !open)} aria-label={chatOpen ? "Close room chat" : "Open room chat"}><MessageCircle size={19} /><small>Chat</small></button>
              <button className="leave-control" onClick={leaveRoom} aria-label="Leave call"><PhoneOff size={19} /><small>Leave</small></button>
            </div>
            <div className="call-foot-right"><Volume2 size={14} /> LIVE AUDIO</div>
          </div>
        </section>
      )}

      <div className="ambient-glow" aria-hidden="true" />
    </main>
  );
}
