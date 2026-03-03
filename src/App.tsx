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
  ZoomIn
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { audioBufferToWav } from './utils/audio';

interface ClippingControlsProps {
  activeRegion: { start: number; end: number } | null;
  duration: number;
  isExporting: boolean;
  isPlaying: boolean;
  onPlayRegion: () => void;
  onManualChange: (type: 'start' | 'end', value: string) => void;
  onDownload: () => void;
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
  isPlaying,
  onPlayRegion,
  onManualChange, 
  onDownload, 
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
        onClick={onClear}
        className="w-9 h-9 flex items-center justify-center text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
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
  const [error, setError] = useState<string | null>(null);
  const [activeRegion, setActiveRegion] = useState<{ start: number; end: number } | null>(null);

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
        </header>

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
                    isPlaying={isPlaying}
                    onPlayRegion={playRegion}
                    onManualChange={handleRegionManualChange}
                    onDownload={downloadClip}
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
          <p>&copy; 2024 Audio Studio. Built with WaveSurfer.js</p>
        </footer>
      </div>
    </div>
  );
}
