/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.js';
import TimelinePlugin from 'wavesurfer.js/dist/plugins/timeline.js';
import {
  Play,
  Pause,
  Scissors,
  Download,
  Upload,
  Link as LinkIcon,
  Volume2,
  VolumeX,
  RotateCcw,
  Trash2,
  Music,
  FileAudio,
  Loader2,
  ZoomIn,
  LogIn,
  LogOut,
  FolderOpen,
  Save,
  X,
  Search,
  ChevronRight,
  Mic,
  MicOff,
  Square,
  ScissorsLineDashed,
  Layers
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { audioBufferToWav } from './utils/audio';
import { readStoredUser, persistUser, clearUser, sendMagicLink, verifyMagicToken, type AuthUser, type AuthStatus } from './lib/auth';

const PORTFOLIO_API = 'https://audio-portfolio-worker.torarnehave.workers.dev';
const UPLOAD_API = 'https://norwegian-transcription-worker.torarnehave.workers.dev';

/** Mix two AudioBuffers together with per-track volume. Returns a new AudioBuffer. */
function mixTwoBuffers(
  audioCtx: AudioContext,
  buf1: AudioBuffer,
  buf2: AudioBuffer,
  vol1: number,
  vol2: number
): AudioBuffer {
  const sampleRate = buf1.sampleRate;
  const channels = Math.max(buf1.numberOfChannels, buf2.numberOfChannels);

  // Resample buf2 if needed
  let buf2Length = buf2.length;
  if (buf2.sampleRate !== sampleRate) {
    buf2Length = Math.round(buf2.length * sampleRate / buf2.sampleRate);
  }

  const outLength = Math.max(buf1.length, buf2Length);
  const mixed = audioCtx.createBuffer(channels, outLength, sampleRate);

  for (let ch = 0; ch < channels; ch++) {
    const out = mixed.getChannelData(ch);
    const ch1 = ch < buf1.numberOfChannels ? buf1.getChannelData(ch) : buf1.getChannelData(0);
    const ch2 = ch < buf2.numberOfChannels ? buf2.getChannelData(ch) : buf2.getChannelData(0);
    const ratio = buf2.sampleRate !== sampleRate ? buf2.sampleRate / sampleRate : 1;

    for (let i = 0; i < outLength; i++) {
      let s1 = i < buf1.length ? ch1[i] * vol1 : 0;
      let s2 = 0;
      if (ratio === 1 && i < buf2.length) {
        s2 = ch2[i] * vol2;
      } else if (ratio !== 1) {
        const srcIdx = i * ratio;
        const idx = Math.floor(srcIdx);
        if (idx < buf2.length) {
          const frac = srcIdx - idx;
          const a = ch2[idx];
          const b = idx + 1 < buf2.length ? ch2[idx + 1] : a;
          s2 = (a + frac * (b - a)) * vol2;
        }
      }
      out[i] = Math.max(-1, Math.min(1, s1 + s2));
    }
  }

  return mixed;
}

interface PortfolioRecording {
  id: string;
  displayName: string;
  duration: number;
  category: string;
  createdAt: string;
  audioUrl?: string;
  r2Key?: string;
  tags?: string[];
}

/* ── Portfolio Browser Panel ── */
const PortfolioBrowser = ({ email, onSelect, onClose }: {
  email: string;
  onSelect: (rec: PortfolioRecording) => void;
  onClose: () => void;
}) => {
  const [recordings, setRecordings] = useState<PortfolioRecording[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchRecordings = async () => {
      try {
        setLoading(true);
        // Fetch all recordings (Superadmin view, same as Agent Builder)
        const res = await fetch(`${PORTFOLIO_API}/list-recordings?userEmail=${encodeURIComponent(email)}&userRole=Superadmin&limit=200`);
        if (!res.ok) throw new Error('Failed to fetch recordings');
        const data = await res.json();
        setRecordings(data.recordings || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load portfolio');
      } finally {
        setLoading(false);
      }
    };
    fetchRecordings();
  }, [email]);

  const filtered = recordings.filter(r =>
    r.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.category?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatDuration = (sec: number) => {
    if (!sec) return '--:--';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="bg-white border border-zinc-200 rounded-2xl shadow-lg p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-600 flex items-center gap-2">
          <FolderOpen size={16} className="text-indigo-500" />
          My Portfolio Recordings
        </h3>
        <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 transition-colors" title="Close portfolio">
          <X size={18} />
        </button>
      </div>

      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
        <input
          type="text"
          placeholder="Search recordings..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-9 pr-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
        />
      </div>

      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} className="animate-spin text-indigo-500" />
          <span className="ml-2 text-sm text-zinc-500">Loading recordings...</span>
        </div>
      )}

      {error && (
        <div className="text-center py-6 text-red-500 text-sm">{error}</div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="text-center py-6 text-zinc-400 text-sm">
          {recordings.length === 0 ? 'No recordings in your portfolio yet.' : 'No recordings match your search.'}
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="max-h-64 overflow-y-auto space-y-1">
          {filtered.map((rec) => (
            <button
              key={rec.id}
              onClick={() => onSelect(rec)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-indigo-50 transition-colors text-left group"
            >
              <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center text-indigo-500 group-hover:bg-indigo-200 transition-colors">
                <Music size={14} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-800 truncate">{rec.displayName || rec.id}</p>
                <p className="text-xs text-zinc-400">
                  {rec.category || 'Uncategorized'} &middot; {formatDuration(rec.duration)} &middot; {new Date(rec.createdAt).toLocaleDateString()}
                </p>
              </div>
              <ChevronRight size={16} className="text-zinc-300 group-hover:text-indigo-400 transition-colors" />
            </button>
          ))}
        </div>
      )}
    </motion.div>
  );
};

/* ── Voice Recorder ── */
type RecorderState = 'idle' | 'recording' | 'paused';

const VoiceRecorder = ({ onRecordingComplete, hasAudio, onAppendRecording }: {
  onRecordingComplete: (blob: Blob) => void;
  hasAudio: boolean;
  onAppendRecording: (blob: Blob) => void;
}) => {
  const [recorderState, setRecorderState] = useState<RecorderState>('idle');
  const [recordingTime, setRecordingTime] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const [isAppendMode, setIsAppendMode] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const formatRecTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const startTimer = () => {
    timerRef.current = setInterval(() => {
      setRecordingTime((prev) => prev + 1);
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startRecording = async () => {
    try {
      setMicError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        stopTimer();
        const blob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        // Stop all mic tracks
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const wasAppend = isAppendMode;
        setRecorderState('idle');
        setRecordingTime(0);
        setIsAppendMode(false);
        if (wasAppend) {
          onAppendRecording(blob);
        } else {
          onRecordingComplete(blob);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250); // collect data every 250ms for smooth pause/resume
      setRecorderState('recording');
      setRecordingTime(0);
      startTimer();
    } catch (err) {
      console.error('Mic access error:', err);
      setMicError('Microphone access denied. Please allow mic permissions.');
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.pause();
      stopTimer();
      setRecorderState('paused');
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current?.state === 'paused') {
      mediaRecorderRef.current.resume();
      startTimer();
      setRecorderState('recording');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTimer();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const startAppendRecording = () => {
    setIsAppendMode(true);
    startRecording();
  };

  if (recorderState === 'idle') {
    return (
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Record Voice</label>
        <button
          type="button"
          onClick={startRecording}
          className="flex items-center justify-center w-full h-11 px-4 bg-zinc-50 border-2 border-dashed border-zinc-200 rounded-lg cursor-pointer hover:border-red-400 hover:bg-red-50/30 transition-all group"
        >
          <div className="flex items-center gap-2 text-zinc-500 group-hover:text-red-600">
            <Mic size={18} />
            <span className="text-sm font-medium">New Recording</span>
          </div>
        </button>
        {hasAudio && (
          <button
            type="button"
            onClick={startAppendRecording}
            className="flex items-center justify-center w-full h-9 mt-2 px-4 bg-indigo-50 border border-indigo-200 rounded-lg cursor-pointer hover:bg-indigo-100 transition-all group"
          >
            <div className="flex items-center gap-2 text-indigo-500 group-hover:text-indigo-700">
              <Mic size={14} />
              <span className="text-xs font-medium">Continue Recording</span>
            </div>
          </button>
        )}
        {micError && (
          <div className="mt-2 flex items-center gap-1 text-xs text-red-500">
            <MicOff size={12} /> {micError}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Recording</label>
      <div className="flex items-center gap-3 h-11 px-4 bg-red-50 border border-red-200 rounded-lg">
        {/* Animated recording dot */}
        <div className={`w-3 h-3 rounded-full ${recorderState === 'recording' ? 'bg-red-500 animate-pulse' : 'bg-amber-400'}`} />
        {/* Timer */}
        <span className="font-mono text-sm font-bold text-red-700 min-w-[48px]">
          {formatRecTime(recordingTime)}
        </span>
        <span className="text-xs text-red-400 uppercase font-semibold">
          {recorderState === 'paused' ? 'Paused' : isAppendMode ? 'Appending' : 'Recording'}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {recorderState === 'recording' ? (
            <button
              type="button"
              onClick={pauseRecording}
              className="w-8 h-8 flex items-center justify-center bg-white text-amber-600 rounded-lg hover:bg-amber-50 transition-colors border border-amber-200"
              title="Pause recording"
            >
              <Pause size={16} />
            </button>
          ) : (
            <button
              type="button"
              onClick={resumeRecording}
              className="w-8 h-8 flex items-center justify-center bg-white text-emerald-600 rounded-lg hover:bg-emerald-50 transition-colors border border-emerald-200"
              title="Resume recording"
            >
              <Play size={16} />
            </button>
          )}
          <button
            type="button"
            onClick={stopRecording}
            className="w-8 h-8 flex items-center justify-center bg-white text-red-600 rounded-lg hover:bg-red-100 transition-colors border border-red-200"
            title="Stop recording"
          >
            <Square size={14} fill="currentColor" />
          </button>
        </div>
      </div>
    </div>
  );
};

interface ClippingControlsProps {
  activeRegion: { start: number; end: number } | null;
  duration: number;
  isExporting: boolean;
  isSaving: boolean;
  isCutting: boolean;
  isPlaying: boolean;
  isLoggedIn: boolean;
  onPlayRegion: () => void;
  onManualChange: (type: 'start' | 'end', value: string) => void;
  onDownload: () => void;
  onSaveToPortfolio: () => void;
  onCutRegion: () => void;
  onClear: () => void;
  onAdd: () => void;
}

const TimeInput = ({ value, onChange, label, max }: { value: number, onChange: (val: string) => void, label: string, max: number }) => {
  const [localValue, setLocalValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);

  const format = (val: number) => {
    const m = Math.floor(val / 60);
    const s = (val % 60).toFixed(2);
    return `${m}:${s.padStart(5, '0')}`;
  };

  useEffect(() => {
    if (!isFocused) {
      setLocalValue(format(value));
    }
  }, [value, isFocused]);

  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase font-bold text-indigo-400 leading-none mb-1">{label}</span>
      <input 
        type="text"
        value={localValue}
        onFocus={() => setIsFocused(true)}
        onBlur={() => {
          setIsFocused(false);
          setLocalValue(format(value));
        }}
        onChange={(e) => {
          setLocalValue(e.target.value);
          onChange(e.target.value);
        }}
        className="text-sm font-mono font-bold text-indigo-700 bg-transparent border-none focus:ring-0 w-24 p-0"
        placeholder="0:00.00"
      />
    </div>
  );
};

const ClippingControls = React.memo(({
  activeRegion,
  duration,
  isExporting,
  isSaving,
  isCutting,
  isPlaying,
  isLoggedIn,
  onPlayRegion,
  onManualChange,
  onDownload,
  onSaveToPortfolio,
  onCutRegion,
  onClear,
  onAdd
}: ClippingControlsProps) => {
  if (!activeRegion) {
    return (
      <button 
        onClick={onAdd}
        className="flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition-all text-sm font-medium"
      >
        <Scissors size={16} />
        Create Clip Region
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="bg-indigo-50 border border-indigo-100 px-3 py-2 rounded-lg flex items-center gap-4 mr-2">
        <TimeInput 
          label="Start (m:ss)"
          value={activeRegion.start}
          max={activeRegion.end - 0.01}
          onChange={(val) => onManualChange('start', val)}
        />
        <div className="w-px h-6 bg-indigo-200" />
        <TimeInput 
          label="End (m:ss)"
          value={activeRegion.end}
          max={duration}
          onChange={(val) => onManualChange('end', val)}
        />
      </div>
      <button 
        onClick={onPlayRegion}
        className="w-9 h-9 flex items-center justify-center bg-indigo-100 text-indigo-600 hover:bg-indigo-200 rounded-lg transition-all mr-1"
        title="Play Region"
      >
        {isPlaying ? <Pause size={18} /> : <Play size={18} />}
      </button>
      <button
        onClick={onDownload}
        disabled={isExporting}
        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-all text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
        {isExporting ? 'Exporting...' : 'Export Clip'}
      </button>
      <button
        onClick={onCutRegion}
        disabled={isCutting}
        className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        title="Remove selected region from the audio"
      >
        {isCutting ? <Loader2 size={16} className="animate-spin" /> : <ScissorsLineDashed size={16} />}
        {isCutting ? 'Cutting...' : 'Cut Out'}
      </button>
      {isLoggedIn && (
        <button
          onClick={onSaveToPortfolio}
          disabled={isSaving}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          title="Save clip to your Vegvisr audio portfolio"
        >
          {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {isSaving ? 'Saving...' : 'Save to Portfolio'}
        </button>
      )}
      <button
        onClick={onClear}
        className="w-9 h-9 flex items-center justify-center text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
        title="Clear region"
      >
        <Trash2 size={18} />
      </button>
    </div>
  );
});

export default function App() {
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurfer = useRef<WaveSurfer | null>(null);
  const regions = useRef<any>(null);
  const currentRegionRef = useRef<any>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [zoom, setZoom] = useState(10);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [inputUrl, setInputUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCutting, setIsCutting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeRegion, setActiveRegion] = useState<{ start: number; end: number } | null>(null);

  // Auth state
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>('checking');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginMessage, setLoginMessage] = useState('');
  const [loginError, setLoginError] = useState('');

  // Portfolio state
  const [showPortfolio, setShowPortfolio] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [loadedRecordingId, setLoadedRecordingId] = useState<string | null>(null);
  const [loadedRecordingName, setLoadedRecordingName] = useState<string | null>(null);

  // Save dialog state
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [clipName, setClipName] = useState('');
  const [clipCategory, setClipCategory] = useState('clip');

  // Track 2 (overlay) state
  const waveformRef2 = useRef<HTMLDivElement>(null);
  const wavesurfer2 = useRef<WaveSurfer | null>(null);
  const [track2Url, setTrack2Url] = useState<string | null>(null);
  const [track2Volume, setTrack2Volume] = useState(1);
  const [track2Muted, setTrack2Muted] = useState(false);
  const [track2Loading, setTrack2Loading] = useState(false);

  // Bootstrap auth from localStorage + handle magic token in URL
  useEffect(() => {
    const stored = readStoredUser();
    if (stored) {
      setAuthUser(stored);
      setAuthStatus('authed');
    } else {
      setAuthStatus('anonymous');
    }

    // Check for magic token in URL
    const url = new URL(window.location.href);
    const magic = url.searchParams.get('magic');
    if (magic) {
      setAuthStatus('checking');
      verifyMagicToken(magic)
        .then((user) => {
          setAuthUser(user);
          setAuthStatus('authed');
          url.searchParams.delete('magic');
          window.history.replaceState({}, '', url.toString());
        })
        .catch(() => {
          setAuthStatus('anonymous');
        });
    }
  }, []);

  const handleSendMagicLink = async () => {
    if (!loginEmail.trim()) return;
    setLoginError('');
    setLoginMessage('');
    setLoginLoading(true);
    try {
      await sendMagicLink(loginEmail);
      setLoginMessage('Magic link sent! Check your email.');
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Failed to send magic link.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    clearUser();
    setAuthUser(null);
    setAuthStatus('anonymous');
    setShowPortfolio(false);
  };

  const handlePortfolioSelect = (rec: PortfolioRecording) => {
    const url = rec.audioUrl || (rec.r2Key ? `${UPLOAD_API}/audio/${rec.r2Key}` : null);
    if (url) {
      setAudioUrl(url);
      setLoadedRecordingId(rec.id);
      setLoadedRecordingName(rec.displayName || 'Untitled');
      initWaveSurfer(url);
      setShowPortfolio(false);
    }
  };

  const handleRecordingComplete = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    setAudioUrl(url);
    setLoadedRecordingId(null);
    setLoadedRecordingName('Voice Recording');
    initWaveSurfer(url);
  };

  const handleAppendRecording = async (newBlob: Blob) => {
    if (!audioUrl) {
      // No existing audio — treat as new recording
      handleRecordingComplete(newBlob);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();

      // Decode existing audio
      const existingResponse = await fetch(audioUrl);
      const existingArrayBuffer = await existingResponse.arrayBuffer();
      const existingBuffer = await audioCtx.decodeAudioData(existingArrayBuffer);

      // Decode new recording
      const newArrayBuffer = await newBlob.arrayBuffer();
      const newBuffer = await audioCtx.decodeAudioData(newArrayBuffer);

      // Concatenate: use existing sample rate, mono or match channels
      const sampleRate = existingBuffer.sampleRate;
      const channels = Math.max(existingBuffer.numberOfChannels, newBuffer.numberOfChannels);
      const totalLength = existingBuffer.length + Math.round(newBuffer.length * sampleRate / newBuffer.sampleRate);

      const combined = audioCtx.createBuffer(channels, totalLength, sampleRate);

      for (let ch = 0; ch < channels; ch++) {
        const outData = combined.getChannelData(ch);
        // Copy existing
        const existCh = ch < existingBuffer.numberOfChannels ? existingBuffer.getChannelData(ch) : existingBuffer.getChannelData(0);
        outData.set(existCh, 0);

        // Copy new (resample if needed)
        const newCh = ch < newBuffer.numberOfChannels ? newBuffer.getChannelData(ch) : newBuffer.getChannelData(0);
        if (newBuffer.sampleRate === sampleRate) {
          outData.set(newCh, existingBuffer.length);
        } else {
          // Simple linear resample
          const ratio = newBuffer.sampleRate / sampleRate;
          const newLen = totalLength - existingBuffer.length;
          for (let i = 0; i < newLen; i++) {
            const srcIdx = i * ratio;
            const idx = Math.floor(srcIdx);
            const frac = srcIdx - idx;
            const s0 = newCh[idx] || 0;
            const s1 = newCh[idx + 1] || s0;
            outData[existingBuffer.length + i] = s0 + frac * (s1 - s0);
          }
        }
      }

      // Encode to WAV and reload
      const wavBlob = audioBufferToWav(combined);
      audioCtx.close();

      const combinedUrl = URL.createObjectURL(wavBlob);
      setAudioUrl(combinedUrl);
      setLoadedRecordingName(loadedRecordingName || 'Voice Recording');
      initWaveSurfer(combinedUrl);
    } catch (err) {
      console.error('Append recording error:', err);
      setError('Failed to append recording. The new recording will be loaded separately.');
      // Fallback: just load the new recording
      handleRecordingComplete(newBlob);
    } finally {
      setIsLoading(false);
    }
  };

  const openSaveDialog = () => {
    const isClip = !!activeRegion;
    const defaultName = isClip
      ? (loadedRecordingName ? `Clip of ${loadedRecordingName}` : `Clip ${Math.floor(activeRegion.start)}s-${Math.floor(activeRegion.end)}s`)
      : (loadedRecordingName || 'Untitled Recording');
    setClipName(defaultName);
    setClipCategory(isClip ? 'clip' : 'recording');
    setShowSaveDialog(true);
  };

  const initWaveSurfer = useCallback((url: string) => {
    if (!waveformRef.current) return;

    // Cleanup previous instance
    if (wavesurfer.current) {
      wavesurfer.current.destroy();
    }

    setIsLoading(true);
    setError(null);
    setZoom(10); // Reset zoom on new load
    currentRegionRef.current = null;
    setActiveRegion(null);

    const ws = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: '#4f46e5',
      progressColor: '#818cf8',
      cursorColor: '#312e81',
      barWidth: 2,
      barRadius: 3,
      height: 128,
      normalize: true,
      url: url,
      minPxPerSec: 10,
      autoCenter: true,
    });

    const regionsPlugin = ws.registerPlugin(RegionsPlugin.create());
    regions.current = regionsPlugin;

    ws.registerPlugin(TimelinePlugin.create({
      height: 20,
      style: {
        fontSize: '10px',
        color: '#4f46e5',
      },
    }));

    ws.on('ready', () => {
      setIsLoading(false);
      setDuration(ws.getDuration());
    });

    ws.on('play', () => setIsPlaying(true));
    ws.on('pause', () => setIsPlaying(false));
    ws.on('timeupdate', (time) => setCurrentTime(time));
    ws.on('seeking', (time) => {
      // Sync Track 2 position when user seeks on Track 1
      if (wavesurfer2.current) {
        wavesurfer2.current.setTime(time);
      }
    });

    ws.on('error', (err) => {
      console.error('WaveSurfer error:', err);
      setError('Failed to load audio. Please check the URL or file format.');
      setIsLoading(false);
    });

    wavesurfer.current = ws;
  }, []);

  const initWaveSurfer2 = useCallback((url: string) => {
    if (!waveformRef2.current) return;

    if (wavesurfer2.current) {
      wavesurfer2.current.destroy();
    }

    setTrack2Loading(true);

    const ws2 = WaveSurfer.create({
      container: waveformRef2.current,
      waveColor: '#059669',
      progressColor: '#34d399',
      cursorColor: '#064e3b',
      barWidth: 2,
      barRadius: 3,
      height: 80,
      normalize: true,
      url: url,
      minPxPerSec: 10,
      autoCenter: true,
    });

    ws2.on('ready', () => {
      setTrack2Loading(false);
      // Sync zoom with Track 1
      ws2.zoom(zoom);
    });

    ws2.on('seeking', (time) => {
      // Sync Track 1 position when user seeks on Track 2
      if (wavesurfer.current) {
        wavesurfer.current.setTime(time);
      }
    });

    ws2.on('error', (err) => {
      console.error('WaveSurfer Track 2 error:', err);
      setTrack2Loading(false);
    });

    wavesurfer2.current = ws2;
  }, [zoom]);

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputUrl.trim()) {
      setAudioUrl(inputUrl);
      initWaveSurfer(inputUrl);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setAudioUrl(url);
      initWaveSurfer(url);
    }
  };

  const handleTrack2FileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setTrack2Url(url);
      initWaveSurfer2(url);
    }
  };

  const removeTrack2 = () => {
    if (wavesurfer2.current) {
      wavesurfer2.current.destroy();
      wavesurfer2.current = null;
    }
    setTrack2Url(null);
    setTrack2Volume(1);
    setTrack2Muted(false);
  };

  const togglePlay = () => {
    if (!wavesurfer.current) return;

    if (currentRegionRef.current && !isPlaying) {
      currentRegionRef.current.play();
      // Also play Track 2 from region start
      if (wavesurfer2.current) {
        wavesurfer2.current.setTime(currentRegionRef.current.start);
        wavesurfer2.current.play();
      }
    } else {
      wavesurfer.current.playPause();
      // Sync Track 2
      if (wavesurfer2.current) {
        if (wavesurfer.current.isPlaying()) {
          // Track 1 just started playing, so play Track 2 too
          wavesurfer2.current.play();
        } else {
          wavesurfer2.current.pause();
        }
      }
    }
  };

  const stopAudio = () => {
    wavesurfer.current?.stop();
    wavesurfer2.current?.stop();
  };

  const toggleMute = () => {
    if (wavesurfer.current) {
      const newMute = !isMuted;
      setIsMuted(newMute);
      wavesurfer.current.setMuted(newMute);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    wavesurfer.current?.setVolume(val);
  };

  const handleTrack2VolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setTrack2Volume(val);
    wavesurfer2.current?.setVolume(val);
  };

  const toggleTrack2Mute = () => {
    if (wavesurfer2.current) {
      const newMute = !track2Muted;
      setTrack2Muted(newMute);
      wavesurfer2.current.setMuted(newMute);
    }
  };

  const handleZoomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value);
    setZoom(val);
    wavesurfer.current?.zoom(val);
    wavesurfer2.current?.zoom(val);
  };

  const addRegion = () => {
    if (!regions.current || !wavesurfer.current) return;
    
    // Clear existing regions first
    regions.current.clearRegions();
    
    const duration = wavesurfer.current.getDuration();
    const span = Math.min(10, duration);
    const mid = duration / 2;
    const start = Math.max(0, mid - span / 2);
    const end = Math.min(duration, start + span);

    const region = regions.current.addRegion({
      start,
      end,
      color: 'rgba(79, 70, 229, 0.2)',
      drag: true,
      resize: true,
    });

    currentRegionRef.current = region;
    setActiveRegion({ start: region.start, end: region.end });

    // Seek and scroll to the start of the region
    wavesurfer.current.setTime(start);

    // Use update for real-time feedback
    region.on('update', () => {
      setActiveRegion({ start: region.start, end: region.end });
    });
  };

  const handleRegionManualChange = (type: 'start' | 'end', value: string) => {
    if (!currentRegionRef.current || !wavesurfer.current) return;
    
    let numValue: number;
    
    // Parse mm:ss or mm.ss or ss.ss
    const parts = value.split(/[:]/);
    if (parts.length === 2) {
      numValue = (parseInt(parts[0]) || 0) * 60 + (parseFloat(parts[1]) || 0);
    } else {
      // Handle mm.ss if user uses dot as minute separator
      const dotParts = value.split('.');
      if (dotParts.length >= 2 && value.includes('.') && !value.startsWith('.') && !value.endsWith('.')) {
        // If it looks like mm.ss (e.g. 1.30) and not just a float with leading/trailing dot
        // We'll try to guess if it's minutes or just seconds.
        // But since the user specifically asked for mm.ss, let's treat it as minutes if it has a dot.
        // To avoid breaking normal floats, we only do this if it's clearly intended as mm.ss
        // For now, let's stick to a more robust parser.
        numValue = (parseInt(dotParts[0]) || 0) * 60 + (parseFloat(dotParts.slice(1).join('.')) || 0);
      } else {
        numValue = parseFloat(value);
      }
    }

    if (isNaN(numValue)) return;

    const duration = wavesurfer.current.getDuration();
    let newStart = activeRegion?.start ?? 0;
    let newEnd = activeRegion?.end ?? duration;

    if (type === 'start') {
      newStart = Math.max(0, Math.min(numValue, newEnd - 0.01));
    } else {
      newEnd = Math.min(duration, Math.max(numValue, newStart + 0.01));
    }

    currentRegionRef.current.setOptions({
      start: newStart,
      end: newEnd
    });
    setActiveRegion({ start: newStart, end: newEnd });
  };

  const clearRegion = () => {
    regions.current?.clearRegions();
    currentRegionRef.current = null;
    setActiveRegion(null);
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const playRegion = () => {
    if (currentRegionRef.current) {
      currentRegionRef.current.play();
    }
  };

  const downloadClip = async () => {
    if (!activeRegion || !audioUrl || !wavesurfer.current) return;

    try {
      setIsExporting(true);

      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();

      // Decode Track 1
      const response = await fetch(audioUrl);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

      // Extract the clip segment from Track 1
      const startSample = Math.floor(activeRegion.start * audioBuffer.sampleRate);
      const endSample = Math.floor(activeRegion.end * audioBuffer.sampleRate);
      const frameCount = endSample - startSample;

      const clipBuffer = audioCtx.createBuffer(
        audioBuffer.numberOfChannels,
        frameCount,
        audioBuffer.sampleRate
      );

      for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
        const channelData = audioBuffer.getChannelData(i);
        const newChannelData = clipBuffer.getChannelData(i);
        for (let j = 0; j < frameCount; j++) {
          newChannelData[j] = channelData[startSample + j];
        }
      }

      let finalBuffer = clipBuffer;

      // Mix with Track 2 if loaded
      if (track2Url) {
        const res2 = await fetch(track2Url);
        const ab2 = await res2.arrayBuffer();
        const buf2Full = await audioCtx.decodeAudioData(ab2);

        // Extract same time range from Track 2
        const sr2 = buf2Full.sampleRate;
        const start2 = Math.floor(activeRegion.start * sr2);
        const end2 = Math.min(Math.floor(activeRegion.end * sr2), buf2Full.length);
        const len2 = Math.max(0, end2 - start2);

        if (len2 > 0) {
          const clip2 = audioCtx.createBuffer(buf2Full.numberOfChannels, len2, sr2);
          for (let ch = 0; ch < buf2Full.numberOfChannels; ch++) {
            const src = buf2Full.getChannelData(ch);
            const dst = clip2.getChannelData(ch);
            for (let j = 0; j < len2; j++) {
              dst[j] = src[start2 + j];
            }
          }
          finalBuffer = mixTwoBuffers(audioCtx, clipBuffer, clip2, volume, track2Volume);
        }
      }

      audioCtx.close();
      const wavBlob = audioBufferToWav(finalBuffer);

      const url = URL.createObjectURL(wavBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `clip-${Math.floor(activeRegion.start)}-${Math.floor(activeRegion.end)}.wav`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setIsExporting(false);
    } catch (err) {
      console.error('Export error:', err);
      alert('Failed to export clip. This might be due to CORS restrictions on the source URL or an unsupported audio format.');
      setIsExporting(false);
    }
  };

  const cutRegion = async () => {
    if (!activeRegion || !audioUrl || !wavesurfer.current) return;

    try {
      setIsCutting(true);

      // 1. Fetch and decode the full audio
      const response = await fetch(audioUrl);
      const arrayBuffer = await response.arrayBuffer();
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

      // 2. Calculate samples for before + after the cut region
      const startSample = Math.floor(activeRegion.start * audioBuffer.sampleRate);
      const endSample = Math.floor(activeRegion.end * audioBuffer.sampleRate);
      const beforeLength = startSample;
      const afterLength = audioBuffer.length - endSample;
      const newLength = beforeLength + afterLength;

      if (newLength <= 0) {
        alert('Cannot cut the entire audio.');
        setIsCutting(false);
        return;
      }

      // 3. Create new buffer without the selected region
      const newBuffer = audioCtx.createBuffer(
        audioBuffer.numberOfChannels,
        newLength,
        audioBuffer.sampleRate
      );

      for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
        const oldData = audioBuffer.getChannelData(ch);
        const newData = newBuffer.getChannelData(ch);
        // Copy before region
        for (let i = 0; i < beforeLength; i++) {
          newData[i] = oldData[i];
        }
        // Copy after region
        for (let i = 0; i < afterLength; i++) {
          newData[beforeLength + i] = oldData[endSample + i];
        }
      }

      // 4. Encode to WAV and reload
      const wavBlob = audioBufferToWav(newBuffer);
      audioCtx.close();

      const newUrl = URL.createObjectURL(wavBlob);
      setAudioUrl(newUrl);
      initWaveSurfer(newUrl);
      // Region is gone after the cut
      clearRegion();
    } catch (err) {
      console.error('Cut error:', err);
      alert('Failed to cut region. This might be due to CORS restrictions or an unsupported format.');
    } finally {
      setIsCutting(false);
    }
  };

  const saveClipToPortfolio = async () => {
    if (!audioUrl || !wavesurfer.current || !authUser) return;

    try {
      setIsSaving(true);
      setSaveMessage(null);

      const response = await fetch(audioUrl);
      const arrayBuffer = await response.arrayBuffer();
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

      // Optionally decode Track 2 for mixing
      let track2Buffer: AudioBuffer | null = null;
      if (track2Url) {
        const res2 = await fetch(track2Url);
        const ab2 = await res2.arrayBuffer();
        track2Buffer = await audioCtx.decodeAudioData(ab2);
      }

      let wavBlob: Blob;
      let saveDuration: number;

      if (activeRegion) {
        // Extract clip from selected region
        const startSample = Math.floor(activeRegion.start * audioBuffer.sampleRate);
        const endSample = Math.floor(activeRegion.end * audioBuffer.sampleRate);
        const frameCount = endSample - startSample;
        const clipBuf = audioCtx.createBuffer(audioBuffer.numberOfChannels, frameCount, audioBuffer.sampleRate);
        for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
          const channelData = audioBuffer.getChannelData(i);
          const newChannelData = clipBuf.getChannelData(i);
          for (let j = 0; j < frameCount; j++) {
            newChannelData[j] = channelData[startSample + j];
          }
        }

        let finalBuf = clipBuf;
        if (track2Buffer) {
          const sr2 = track2Buffer.sampleRate;
          const s2 = Math.floor(activeRegion.start * sr2);
          const e2 = Math.min(Math.floor(activeRegion.end * sr2), track2Buffer.length);
          const len2 = Math.max(0, e2 - s2);
          if (len2 > 0) {
            const clip2 = audioCtx.createBuffer(track2Buffer.numberOfChannels, len2, sr2);
            for (let ch = 0; ch < track2Buffer.numberOfChannels; ch++) {
              const src = track2Buffer.getChannelData(ch);
              const dst = clip2.getChannelData(ch);
              for (let j = 0; j < len2; j++) dst[j] = src[s2 + j];
            }
            finalBuf = mixTwoBuffers(audioCtx, clipBuf, clip2, volume, track2Volume);
          }
        }

        wavBlob = audioBufferToWav(finalBuf);
        saveDuration = activeRegion.end - activeRegion.start;
      } else {
        // Save full audio (mixed if Track 2 present)
        const finalBuf = track2Buffer
          ? mixTwoBuffers(audioCtx, audioBuffer, track2Buffer, volume, track2Volume)
          : audioBuffer;
        wavBlob = audioBufferToWav(finalBuf);
        saveDuration = finalBuf.duration;
      }
      audioCtx.close();

      // Upload WAV to R2
      const fileName = `${activeRegion ? 'clip' : 'audio'}-${Date.now()}.wav`;
      const uploadRes = await fetch(`${UPLOAD_API}/upload`, {
        method: 'POST',
        headers: { 'X-File-Name': encodeURIComponent(fileName) },
        body: wavBlob,
      });
      if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status}`);
      const { r2Key, audioUrl: r2Url } = await uploadRes.json();

      // Save metadata to portfolio
      const tags = [activeRegion ? 'clip' : 'full-audio', 'audio-studio'];
      if (track2Url) tags.push('mixed-2-tracks');
      if (loadedRecordingId) tags.push(`${activeRegion ? 'clipped' : 'saved'}-from:${loadedRecordingId}`);

      const recordingData = {
        userEmail: authUser.email,
        fileName,
        displayName: clipName || (activeRegion ? `Clip of ${loadedRecordingName || 'Untitled'}` : loadedRecordingName || 'Untitled'),
        fileSize: wavBlob.size,
        duration: Math.round(saveDuration),
        r2Key,
        r2Url,
        transcriptionText: '',
        category: clipCategory || (activeRegion ? 'clip' : 'recording'),
        tags,
        audioFormat: 'wav',
        aiService: 'none',
        aiModel: 'none',
        processingTime: 0,
      };

      const metaRes = await fetch(`${PORTFOLIO_API}/save-recording`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': authUser.email,
        },
        body: JSON.stringify(recordingData),
      });
      if (!metaRes.ok) throw new Error(`Save failed: ${metaRes.status}`);

      setShowSaveDialog(false);
      setSaveMessage(activeRegion ? 'Clip saved to portfolio!' : 'Audio saved to portfolio!');
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      console.error('Save to portfolio error:', err);
      setSaveMessage(`Error: ${err instanceof Error ? err.message : 'Failed to save'}`);
      setTimeout(() => setSaveMessage(null), 5000);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <header className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
              <Music size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Audio Studio</h1>
              <p className="text-zinc-500 text-sm italic">Visualize, play, and trim your audio</p>
            </div>
          </div>

          {/* Auth Controls */}
          <div className="flex items-center gap-3">
            {authStatus === 'checking' && (
              <div className="flex items-center gap-2 text-zinc-400 text-sm">
                <Loader2 size={16} className="animate-spin" /> Checking...
              </div>
            )}
            {authStatus === 'authed' && authUser && (
              <>
                <button
                  type="button"
                  onClick={() => setShowPortfolio(!showPortfolio)}
                  className="flex items-center gap-2 px-3 py-2 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-colors text-sm font-medium"
                >
                  <FolderOpen size={16} />
                  Portfolio
                </button>
                <span className="text-xs text-zinc-500">{authUser.email}</span>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex items-center gap-1 px-3 py-2 text-zinc-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors text-sm"
                  title="Log out"
                >
                  <LogOut size={16} />
                </button>
              </>
            )}
            {authStatus === 'anonymous' && (
              <div className="flex items-center gap-2">
                <input
                  type="email"
                  placeholder="email@example.com"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMagicLink()}
                  className="px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm w-48 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={handleSendMagicLink}
                  disabled={loginLoading}
                  className="flex items-center gap-1 px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium disabled:opacity-50"
                >
                  {loginLoading ? <Loader2 size={14} className="animate-spin" /> : <LogIn size={14} />}
                  Login
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Login feedback */}
        {(loginMessage || loginError) && (
          <div className={`mb-4 px-4 py-2 rounded-lg text-sm ${loginError ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
            {loginError || loginMessage}
          </div>
        )}

        {/* Save feedback */}
        <AnimatePresence>
          {saveMessage && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className={`mb-4 px-4 py-2 rounded-lg text-sm ${saveMessage.startsWith('Error') ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}
            >
              {saveMessage}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Save to Portfolio Dialog */}
        <AnimatePresence>
          {showSaveDialog && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
              onClick={() => setShowSaveDialog(false)}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="text-lg font-bold mb-4">Save {activeRegion ? 'Clip' : 'Audio'} to Portfolio</h3>
                <div className="space-y-3 mb-5">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">Name</label>
                    <input
                      type="text"
                      value={clipName}
                      onChange={(e) => setClipName(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      placeholder="e.g. Intro segment"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">Category</label>
                    <input
                      type="text"
                      value={clipCategory}
                      onChange={(e) => setClipCategory(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      placeholder="e.g. clip, podcast, music"
                    />
                  </div>
                  {activeRegion ? (
                    <p className="text-xs text-zinc-400">
                      Region: {Math.floor(activeRegion.start / 60)}:{(activeRegion.start % 60).toFixed(1).padStart(4, '0')} &ndash; {Math.floor(activeRegion.end / 60)}:{(activeRegion.end % 60).toFixed(1).padStart(4, '0')} ({(activeRegion.end - activeRegion.start).toFixed(1)}s)
                    </p>
                  ) : (
                    <p className="text-xs text-zinc-400">
                      Full audio &mdash; {Math.floor(duration / 60)}:{(duration % 60).toFixed(1).padStart(4, '0')} ({duration.toFixed(1)}s)
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 justify-end">
                  <button
                    type="button"
                    onClick={() => setShowSaveDialog(false)}
                    className="px-4 py-2 text-zinc-500 hover:text-zinc-700 text-sm font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveClipToPortfolio}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium disabled:opacity-50"
                  >
                    {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    {isSaving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <main className="grid gap-6">
          {/* Input Section */}
          <section className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm">
            <div className="grid md:grid-cols-3 gap-6">
              {/* URL Input */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Load from URL</label>
                <form onSubmit={handleUrlSubmit} className="flex gap-2">
                  <div className="relative flex-1">
                    <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                    <input
                      type="url"
                      placeholder="https://example.com/audio.mp3"
                      className="w-full pl-10 pr-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                      value={inputUrl}
                      onChange={(e) => setInputUrl(e.target.value)}
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2"
                  >
                    Load
                  </button>
                </form>
              </div>

              {/* File Upload */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Upload Local File</label>
                <label className="flex items-center justify-center w-full h-11 px-4 bg-zinc-50 border-2 border-dashed border-zinc-200 rounded-lg cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition-all group">
                  <div className="flex items-center gap-2 text-zinc-500 group-hover:text-indigo-600">
                    <Upload size={18} />
                    <span className="text-sm font-medium">Choose audio file</span>
                  </div>
                  <input type="file" className="hidden" accept="audio/*" onChange={handleFileUpload} />
                </label>
              </div>

              {/* Voice Recorder */}
              <VoiceRecorder
                onRecordingComplete={handleRecordingComplete}
                hasAudio={!!audioUrl}
                onAppendRecording={handleAppendRecording}
              />
            </div>
          </section>

          {/* Portfolio Browser */}
          <AnimatePresence>
            {showPortfolio && authUser && (
              <PortfolioBrowser
                email={authUser.email}
                onSelect={handlePortfolioSelect}
                onClose={() => setShowPortfolio(false)}
              />
            )}
          </AnimatePresence>

          {/* Waveform Section */}
          <section className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm min-h-[300px] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-zinc-400">
                <FileAudio size={18} />
                <span className="text-xs font-semibold uppercase tracking-wider">Waveform Visualization</span>
              </div>
              {audioUrl && (
                <div className="text-sm font-mono text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </div>
              )}
            </div>

            {/* Track 1 (Main) */}
            <div className="flex-1 flex flex-col justify-center relative">
              {!audioUrl && !isLoading && (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-4 text-zinc-400">
                    <Music size={32} />
                  </div>
                  <p className="text-zinc-400">Load an audio file to start editing</p>
                </div>
              )}

              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-sm font-medium text-zinc-500">Processing audio...</p>
                  </div>
                </div>
              )}

              {error && (
                <div className="text-center py-12 text-red-500">
                  <p>{error}</p>
                </div>
              )}

              {/* Track 1 header with per-track volume */}
              {audioUrl && (
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-indigo-500">Track 1 — Main</span>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={toggleMute} className="text-zinc-400 hover:text-zinc-600 transition-colors" title="Mute/unmute Track 1">
                      {isMuted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
                    </button>
                    <input
                      type="range" min="0" max="1" step="0.01" value={volume}
                      onChange={handleVolumeChange}
                      title="Track 1 volume"
                      className="w-24 h-1 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                  </div>
                </div>
              )}

              <div ref={waveformRef} className="w-full min-h-[148px] rounded-lg overflow-hidden border border-zinc-100 bg-zinc-50/50" />
            </div>

            {/* Track 2 (Overlay) */}
            {audioUrl && (
              <div className="mt-4">
                {!track2Url ? (
                  <label className="flex items-center justify-center w-full h-10 px-4 bg-emerald-50 border-2 border-dashed border-emerald-200 rounded-lg cursor-pointer hover:border-emerald-400 hover:bg-emerald-100/50 transition-all group">
                    <div className="flex items-center gap-2 text-emerald-500 group-hover:text-emerald-700">
                      <Layers size={16} />
                      <span className="text-xs font-medium">Add Overlay Track</span>
                    </div>
                    <input type="file" className="hidden" accept="audio/*" onChange={handleTrack2FileUpload} />
                  </label>
                ) : (
                  <div className="relative">
                    {/* Track 2 header */}
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-emerald-600">Track 2 — Overlay</span>
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-1 px-2 py-1 text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 rounded cursor-pointer transition-colors" title="Replace overlay audio">
                          <Upload size={14} />
                          <input type="file" className="hidden" accept="audio/*" onChange={handleTrack2FileUpload} title="Replace overlay audio file" />
                        </label>
                        <button type="button" onClick={toggleTrack2Mute} className="text-zinc-400 hover:text-zinc-600 transition-colors" title="Mute/unmute Track 2">
                          {track2Muted || track2Volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
                        </button>
                        <input
                          type="range" min="0" max="1" step="0.01" value={track2Volume}
                          onChange={handleTrack2VolumeChange}
                          title="Track 2 volume"
                          className="w-24 h-1 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                        />
                        <button
                          type="button"
                          onClick={removeTrack2}
                          className="w-6 h-6 flex items-center justify-center text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                          title="Remove overlay track"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>

                    {track2Loading && (
                      <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10 rounded-lg">
                        <Loader2 size={20} className="animate-spin text-emerald-500" />
                      </div>
                    )}

                    <div ref={waveformRef2} className="w-full min-h-[100px] rounded-lg overflow-hidden border border-emerald-100 bg-emerald-50/30" />
                  </div>
                )}
              </div>
            )}

            {/* Controls */}
            {audioUrl && (
              <div className="mt-6 pt-6 border-t border-zinc-100 flex flex-wrap items-center justify-between gap-6">
                {/* Playback Controls */}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={togglePlay}
                    className="w-12 h-12 bg-indigo-600 text-white rounded-full flex items-center justify-center hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all active:scale-95"
                    title={isPlaying ? 'Pause' : 'Play'}
                  >
                    {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} className="ml-1" fill="currentColor" />}
                  </button>
                  <button
                    type="button"
                    onClick={stopAudio}
                    className="w-10 h-10 bg-zinc-100 text-zinc-600 rounded-full flex items-center justify-center hover:bg-zinc-200 transition-all"
                    title="Stop and reset"
                  >
                    <RotateCcw size={20} />
                  </button>
                </div>

                {/* Clipping Controls */}
                <div className="flex items-center gap-2">
                  <ClippingControls
                    activeRegion={activeRegion}
                    duration={duration}
                    isExporting={isExporting}
                    isSaving={isSaving}
                    isCutting={isCutting}
                    isPlaying={isPlaying}
                    isLoggedIn={authStatus === 'authed'}
                    onPlayRegion={playRegion}
                    onManualChange={handleRegionManualChange}
                    onDownload={downloadClip}
                    onSaveToPortfolio={openSaveDialog}
                    onCutRegion={cutRegion}
                    onClear={clearRegion}
                    onAdd={addRegion}
                  />
                  {/* Save full audio to portfolio (shown when no clip region is active) */}
                  {authStatus === 'authed' && !activeRegion && (
                    <button
                      type="button"
                      onClick={openSaveDialog}
                      disabled={isSaving}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Save full audio to your Vegvisr audio portfolio"
                    >
                      {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                      {isSaving ? 'Saving...' : 'Save to Portfolio'}
                    </button>
                  )}
                </div>

                {/* Zoom Control */}
                <div className="flex items-center gap-3 min-w-[200px]">
                  <ZoomIn size={18} className="text-zinc-400" />
                  <input
                    type="range"
                    min="10"
                    max="500"
                    step="1"
                    value={zoom}
                    onChange={handleZoomChange}
                    title="Zoom level"
                    className="flex-1 h-1.5 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                </div>
              </div>
            )}
          </section>

          {/* Info Section */}
          <section className="grid md:grid-cols-3 gap-6">
            <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm">
              <h3 className="text-sm font-bold mb-2 flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-indigo-100 text-indigo-600 flex items-center justify-center"><Music size={14} /></div>
                Visual Editor
              </h3>
              <p className="text-xs text-zinc-500 leading-relaxed">
                High-precision waveform visualization allows you to see the dynamics of your audio in real-time.
              </p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm">
              <h3 className="text-sm font-bold mb-2 flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-emerald-100 text-emerald-600 flex items-center justify-center"><Scissors size={14} /></div>
                Smart Clipping
              </h3>
              <p className="text-xs text-zinc-500 leading-relaxed">
                Drag and resize the selection region to precisely define the segment you want to extract.
              </p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm">
              <h3 className="text-sm font-bold mb-2 flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-amber-100 text-amber-600 flex items-center justify-center"><Upload size={14} /></div>
                Universal Input
              </h3>
              <p className="text-xs text-zinc-500 leading-relaxed">
                Load audio from any public URL or upload directly from your local device storage.
              </p>
            </div>
          </section>
        </main>

        <footer className="mt-12 text-center text-zinc-400 text-xs">
          <p>&copy; 2024 Audio Studio &mdash; Vegvisr. Built with WaveSurfer.js</p>
        </footer>
      </div>
    </div>
  );
}
