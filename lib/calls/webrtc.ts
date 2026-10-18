/*
 * Intima call signaling protocol (Supabase Realtime broadcast).
 *
 * Every user subscribes to a personal channel named `calls:{userId}`.
 * To reach a peer, a client sends broadcast events on `calls:{peerUserId}`.
 *
 * Event flow for a 1:1 voice or video call:
 *   1. Caller builds an offer with CallManager.startCall(kind), then sends:
 *        'call:ring'  { from, fromName, fromAvatar, kind, callId }
 *        'call:offer' { sdp, kind, callId }
 *   2. Callee shows the incoming UI on 'call:ring' and buffers the offer.
 *      On accept it sends 'call:accept' { callId }, applies the offer with
 *      CallManager.handleOffer(), and replies 'call:answer' { sdp, callId }.
 *      On decline it sends 'call:reject' { callId, reason? }.
 *   3. Caller applies the answer with CallManager.handleAnswer().
 *   4. Both sides trickle ICE candidates with 'call:ice' { candidate, callId }.
 *   5. Either side hangs up with 'call:end' { callId }.
 *
 * Media never touches our servers. Once signaling completes, audio and video
 * flow peer to peer over WebRTC. STUN only for now; add a TURN server (or a
 * managed provider such as LiveKit) before production for symmetric NATs.
 */

export type CallKind = 'voice' | 'video';

export type CallConnectionState =
  | 'new'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed'
  | 'closed';

export interface CallManagerCallbacks {
  onRemoteStream: (stream: MediaStream) => void;
  onStateChange: (state: CallConnectionState) => void;
  onIceCandidate: (candidate: RTCIceCandidateInit) => void;
}

const STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
];

export class CallManager {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private callbacks: CallManagerCallbacks;
  private disposed = false;

  constructor(callbacks: CallManagerCallbacks) {
    this.callbacks = callbacks;
  }

  private ensurePeerConnection(): RTCPeerConnection {
    if (this.pc) return this.pc;
    const pc = new RTCPeerConnection({ iceServers: STUN_SERVERS });

    pc.onicecandidate = (event) => {
      if (event.candidate && !this.disposed) {
        this.callbacks.onIceCandidate(event.candidate.toJSON());
      }
    };

    pc.ontrack = (event) => {
      const [stream] = event.streams;
      if (stream && !this.disposed) this.callbacks.onRemoteStream(stream);
    };

    pc.onconnectionstatechange = () => {
      if (!this.disposed) {
        this.callbacks.onStateChange(pc.connectionState as CallConnectionState);
      }
    };

    this.pc = pc;
    return pc;
  }

  private async acquireMedia(kind: CallKind): Promise<MediaStream> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: kind === 'video' ? { facingMode: 'user', width: { ideal: 720 } } : false,
    });
    this.localStream = stream;
    return stream;
  }

  private attachLocalTracks(pc: RTCPeerConnection, stream: MediaStream): void {
    stream.getTracks().forEach((track) => {
      pc.addTrack(track, stream);
    });
  }

  /** Caller: acquire media, create an offer, return it for signaling. */
  async startCall(kind: CallKind): Promise<RTCSessionDescriptionInit> {
    const pc = this.ensurePeerConnection();
    const stream = await this.acquireMedia(kind);
    this.attachLocalTracks(pc, stream);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    return { type: offer.type, sdp: offer.sdp };
  }

  /** Callee: apply the remote offer, acquire media, return an answer for signaling. */
  async handleOffer(
    offer: RTCSessionDescriptionInit,
    kind: CallKind,
  ): Promise<RTCSessionDescriptionInit> {
    const pc = this.ensurePeerConnection();
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const stream = await this.acquireMedia(kind);
    this.attachLocalTracks(pc, stream);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    return { type: answer.type, sdp: answer.sdp };
  }

  /** Caller: apply the callee's answer. */
  async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    const pc = this.ensurePeerConnection();
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
  }

  /** Either side: apply a trickled ICE candidate. */
  async handleIce(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.pc || this.disposed) return;
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch {
      // Late or duplicate candidates are safe to ignore.
    }
  }

  /** Toggle the microphone. Returns true when now muted. */
  toggleMute(): boolean {
    const tracks = this.localStream?.getAudioTracks() ?? [];
    if (tracks.length === 0) return false;
    const nextMuted = tracks[0].enabled;
    tracks.forEach((t) => {
      t.enabled = !nextMuted;
    });
    return nextMuted;
  }

  /** Toggle the camera. Returns true when the camera is now off. */
  toggleCamera(): boolean {
    const tracks = this.localStream?.getVideoTracks() ?? [];
    if (tracks.length === 0) return false;
    const nextOff = tracks[0].enabled;
    tracks.forEach((t) => {
      t.enabled = !nextOff;
    });
    return nextOff;
  }

  /** Best effort camera switch (front/back). No-op with a single camera. */
  async switchCamera(): Promise<void> {
    const stream = this.localStream;
    const pc = this.pc;
    if (!stream || !pc) return;
    const [videoTrack] = stream.getVideoTracks();
    if (!videoTrack) return;
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter((d) => d.kind === 'videoinput');
    if (cameras.length < 2) return;
    const currentId = videoTrack.getSettings().deviceId;
    const next = cameras.find((d) => d.deviceId !== currentId) ?? cameras[0];
    const nextStream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: next.deviceId } },
      audio: false,
    });
    const [nextTrack] = nextStream.getVideoTracks();
    if (!nextTrack) return;
    const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
    if (sender) await sender.replaceTrack(nextTrack);
    videoTrack.stop();
    stream.removeTrack(videoTrack);
    stream.addTrack(nextTrack);
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  /** Stop all media and close the connection. Safe to call twice. */
  endCall(): void {
    this.disposed = true;
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    if (this.pc) {
      try {
        this.pc.close();
      } catch {
        // Already closed.
      }
      this.pc = null;
    }
  }
}
