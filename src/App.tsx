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
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { audioBufferToWav } from './utils/audio';
import { readStoredUser, persistUser, clearUser, sendMagicLink, verifyMagicToken, type AuthUser, type AuthStatus } from './lib/auth';

const PORTFOLIO_API = 'https://audio-portfolio-worker.torarnehave.workers.dev';
const UPLOAD_API = 'https://norwegian-transcription-worker.torarnehave.workers.dev';

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

interface ClippingControlsProps {
  activeRegion: { start: number; end: number } | null;
  duration: number;
  isExporting: boolean;
  isSaving: boolean;
  isPlaying: boolean;
  isLoggedIn: boolean;
  onPlayRegion: () => void;
  onManualChange: (type: 'start' | 'end', value: string) => void;
  onDownload: () => void;
  onSaveToPortfolio: () => void;
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
  isPlaying,
  isLoggedIn,
  onPlayRegion,
  onManualChange,
  onDownload,
  onSaveToPortfolio,
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

  const openSaveDialog = () => {
    const defaultName = loadedRecordingName
      ? `Clip of ${loadedRecordingName}`
      : `Clip ${Math.floor(activeRegion?.start ?? 0)}s-${Math.floor(activeRegion?.end ?? 0)}s`;
    setClipName(defaultName);
    setClipCategory('clip');
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
    
    ws.on('error', (err) => {
      console.error('WaveSurfer error:', err);
      setError('Failed to load audio. Please check the URL or file format.');
      setIsLoading(false);
    });

    wavesurfer.current = ws;
  }, []);

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

  const togglePlay = () => {
    if (!wavesurfer.current) return;
    
    if (currentRegionRef.current && !isPlaying) {
      currentRegionRef.current.play();
    } else {
      wavesurfer.current.playPause();
    }
  };

  const stopAudio = () => {
    wavesurfer.current?.stop();
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

  const handleZoomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value);
    setZoom(val);
    wavesurfer.current?.zoom(val);
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
      
      // 1. Fetch the audio data
      const response = await fetch(audioUrl);
      const arrayBuffer = await response.arrayBuffer();
      
      // 2. Decode the audio
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      
      // 3. Extract the segment
      const startSample = Math.floor(activeRegion.start * audioBuffer.sampleRate);
      const endSample = Math.floor(activeRegion.end * audioBuffer.sampleRate);
      const frameCount = endSample - startSample;
      
      const newBuffer = audioCtx.createBuffer(
        audioBuffer.numberOfChannels,
        frameCount,
        audioBuffer.sampleRate
      );
      
      for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
        const channelData = audioBuffer.getChannelData(i);
        const newChannelData = newBuffer.getChannelData(i);
        for (let j = 0; j < frameCount; j++) {
          newChannelData[j] = channelData[startSample + j];
        }
      }
      
      // 4. Encode to WAV
      const wavBlob = audioBufferToWav(newBuffer);
      
      // 5. Trigger download
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

  const saveClipToPortfolio = async () => {
    if (!activeRegion || !audioUrl || !wavesurfer.current || !authUser) return;

    try {
      setIsSaving(true);
      setSaveMessage(null);

      // 1. Extract clip (same logic as downloadClip)
      const response = await fetch(audioUrl);
      const arrayBuffer = await response.arrayBuffer();
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      const startSample = Math.floor(activeRegion.start * audioBuffer.sampleRate);
      const endSample = Math.floor(activeRegion.end * audioBuffer.sampleRate);
      const frameCount = endSample - startSample;
      const newBuffer = audioCtx.createBuffer(audioBuffer.numberOfChannels, frameCount, audioBuffer.sampleRate);
      for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
        const channelData = audioBuffer.getChannelData(i);
        const newChannelData = newBuffer.getChannelData(i);
        for (let j = 0; j < frameCount; j++) {
          newChannelData[j] = channelData[startSample + j];
        }
      }
      const wavBlob = audioBufferToWav(newBuffer);
      audioCtx.close();

      // 2. Upload WAV to R2 (raw blob + X-File-Name header, same as AudioClipModal)
      const fileName = `clip-${Date.now()}.wav`;
      const uploadRes = await fetch(`${UPLOAD_API}/upload`, {
        method: 'POST',
        headers: { 'X-File-Name': encodeURIComponent(fileName) },
        body: wavBlob,
      });
      if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status}`);
      const { r2Key, audioUrl: r2Url } = await uploadRes.json();

      // 3. Save metadata to portfolio (same format as AudioClipModal)
      const clipDuration = activeRegion.end - activeRegion.start;
      const tags = ['clip', 'audio-studio'];
      if (loadedRecordingId) tags.push(`clipped-from:${loadedRecordingId}`);

      const recordingData = {
        userEmail: authUser.email,
        fileName,
        displayName: clipName || `Clip of ${loadedRecordingName || 'Untitled'}`,
        fileSize: wavBlob.size,
        duration: Math.round(clipDuration),
        r2Key,
        r2Url,
        transcriptionText: '',
        category: clipCategory || 'clip',
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
      setSaveMessage('Clip saved to portfolio!');
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      console.error('Save to portfolio error:', err);
      setSaveMessage(`Error: ${err instanceof Error ? err.message : 'Failed to save clip'}`);
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
                <h3 className="text-lg font-bold mb-4">Save Clip to Portfolio</h3>
                <div className="space-y-3 mb-5">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">Clip Name</label>
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
                  {activeRegion && (
                    <p className="text-xs text-zinc-400">
                      Region: {Math.floor(activeRegion.start / 60)}:{(activeRegion.start % 60).toFixed(1).padStart(4, '0')} &ndash; {Math.floor(activeRegion.end / 60)}:{(activeRegion.end % 60).toFixed(1).padStart(4, '0')} ({(activeRegion.end - activeRegion.start).toFixed(1)}s)
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
            <div className="grid md:grid-cols-2 gap-6">
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
            <div className="flex items-center justify-between mb-6">
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

              <div ref={waveformRef} className="w-full min-h-[148px] rounded-lg overflow-hidden border border-zinc-100 bg-zinc-50/50" />
            </div>

            {/* Controls */}
            {audioUrl && (
              <div className="mt-8 pt-6 border-t border-zinc-100 flex flex-wrap items-center justify-between gap-6">
                {/* Playback Controls */}
                <div className="flex items-center gap-3">
                  <button 
                    onClick={togglePlay}
                    className="w-12 h-12 bg-indigo-600 text-white rounded-full flex items-center justify-center hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all active:scale-95"
                  >
                    {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} className="ml-1" fill="currentColor" />}
                  </button>
                  <button 
                    onClick={stopAudio}
                    className="w-10 h-10 bg-zinc-100 text-zinc-600 rounded-full flex items-center justify-center hover:bg-zinc-200 transition-all"
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
                    isPlaying={isPlaying}
                    isLoggedIn={authStatus === 'authed'}
                    onPlayRegion={playRegion}
                    onManualChange={handleRegionManualChange}
                    onDownload={downloadClip}
                    onSaveToPortfolio={openSaveDialog}
                    onClear={clearRegion}
                    onAdd={addRegion}
                  />
                </div>

                {/* Volume & Zoom Controls */}
                <div className="flex flex-col gap-4 min-w-[200px]">
                  {/* Zoom Slider */}
                  <div className="flex items-center gap-3">
                    <ZoomIn size={18} className="text-zinc-400" />
                    <input 
                      type="range" 
                      min="10" 
                      max="500" 
                      step="1" 
                      value={zoom}
                      onChange={handleZoomChange}
                      className="flex-1 h-1.5 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                  </div>
                  
                  {/* Volume Slider */}
                  <div className="flex items-center gap-3">
                    <button onClick={toggleMute} className="text-zinc-400 hover:text-zinc-600 transition-colors">
                      {isMuted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
                    </button>
                    <input 
                      type="range" 
                      min="0" 
                      max="1" 
                      step="0.01" 
                      value={volume}
                      onChange={handleVolumeChange}
                      className="flex-1 h-1.5 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                  </div>
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
