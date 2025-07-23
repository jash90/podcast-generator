import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Pause, SkipBack, SkipForward, Download, Volume2, RotateCcw, Loader2, CheckCircle } from 'lucide-react';
import type { PodcastScript } from '../types';
import { generateAudioForSegment, downloadFullPodcast, initializeVoiceAssignments, clearAudioCache } from '../utils/audioGenerator';

interface AudioPlayerProps {
  script: PodcastScript | null;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  apiKey: string;
  ttsModel: string;
}

interface AudioSegmentState {
  index: number;
  isLoading: boolean;
  isLoaded: boolean;
  error: string | null;
  buffer: AudioBuffer | null;
}

function AudioPlayer({ script, isPlaying, setIsPlaying, apiKey, ttsModel }: AudioPlayerProps) {
  const [currentSegment, setCurrentSegment] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState(1);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioSegments, setAudioSegments] = useState<AudioSegmentState[]>([]);
  const [isPreloading, setIsPreloading] = useState(false);
  const [preloadProgress, setPreloadProgress] = useState(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const isInitializedRef = useRef(false);
  const playStartTimeRef = useRef<number>(0);
  const pausedAtRef = useRef<number>(0);
  const animationFrameRef = useRef<number>();

  // Initialize audio segments state
  useEffect(() => {
    if (!script?.segments) return;

    const segments = script.segments.map((_, index) => ({
      index,
      isLoading: false,
      isLoaded: false,
      error: null,
      buffer: null,
    }));
    setAudioSegments(segments);
  }, [script]);

  // Initialize audio context and voice assignments
  useEffect(() => {
    if (!isInitializedRef.current && script) {
      initializeVoiceAssignments(script);
      clearAudioCache();
      isInitializedRef.current = true;
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (sourceRef.current) {
        try {
          sourceRef.current.stop();
        } catch {
          // Ignore if already stopped
        }
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, [script]);

  // Update current time animation
  const updateCurrentTime = useCallback(() => {
    if (isPlaying && audioContextRef.current && sourceRef.current?.buffer) {
      const elapsed = audioContextRef.current.currentTime - playStartTimeRef.current + pausedAtRef.current;
      const segmentDuration = sourceRef.current.buffer.duration;
      
      if (elapsed >= segmentDuration) {
        setCurrentTime(segmentDuration);
      } else {
        setCurrentTime(elapsed);
        animationFrameRef.current = requestAnimationFrame(updateCurrentTime);
      }
    }
  }, [isPlaying]);

  // Start time update animation
  useEffect(() => {
    if (isPlaying) {
      updateCurrentTime();
    } else {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    }
  }, [isPlaying, updateCurrentTime]);

  // Preload all audio segments in parallel
  const preloadAllSegments = useCallback(async () => {
    if (!script?.segments || audioSegments.length === 0) return;

    setIsPreloading(true);
    setPreloadProgress(0);
    setError(null);

    try {
      // Create audio context if needed
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new AudioContext();
      }

      const loadPromises = script.segments.map(async (segment, index) => {
        if (audioSegments[index]?.isLoaded) return; // Skip if already loaded

        // Update segment state to loading
        setAudioSegments(prev => prev.map(seg => 
          seg.index === index 
            ? { ...seg, isLoading: true, error: null }
            : seg
        ));

        try {
          const arrayBuffer = await generateAudioForSegment(segment, apiKey, ttsModel);
          const audioBuffer = await audioContextRef.current!.decodeAudioData(arrayBuffer);
          
          // Update segment state with loaded buffer
          setAudioSegments(prev => prev.map(seg => 
            seg.index === index 
              ? { ...seg, isLoading: false, isLoaded: true, buffer: audioBuffer }
              : seg
          ));

          // Update progress
          setPreloadProgress(prev => prev + (100 / script.segments.length));
          
        } catch (err) {
          console.error(`Failed to load segment ${index}:`, err);
          setAudioSegments(prev => prev.map(seg => 
            seg.index === index 
              ? { ...seg, isLoading: false, error: 'Failed to load audio' }
              : seg
          ));
        }
      });

      await Promise.all(loadPromises);
      
    } catch (err) {
      console.error('Preload error:', err);
      setError('Failed to preload audio segments');
    } finally {
      setIsPreloading(false);
    }
  }, [script, audioSegments, apiKey, ttsModel]);

  // Auto-preload when script changes
  useEffect(() => {
    if (script?.segments && audioSegments.length > 0) {
      preloadAllSegments();
    }
  }, [script, preloadAllSegments]);

  const playSegment = useCallback(async (index: number) => {
    if (!script || index < 0 || index >= script.segments.length) return;
    
    try {
      setError(null);

      // Create audio context if needed
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new AudioContext();
      }

      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      // Check if segment is already loaded
      const segmentState = audioSegments[index];
      let audioBuffer: AudioBuffer;

      if (segmentState?.isLoaded && segmentState.buffer) {
        audioBuffer = segmentState.buffer;
      } else {
        // Load segment if not preloaded
        const arrayBuffer = await generateAudioForSegment(script.segments[index], apiKey, ttsModel);
        audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
      }

      // Stop current playback
      if (sourceRef.current) {
        try {
          sourceRef.current.stop();
        } catch {
          // Ignore if already stopped
        }
      }

      // Create new source
      sourceRef.current = audioContextRef.current.createBufferSource();
      sourceRef.current.buffer = audioBuffer;
      sourceRef.current.playbackRate.value = 1; // Fixed playback rate

      // Create gain node for volume control
      if (!gainNodeRef.current) {
        gainNodeRef.current = audioContextRef.current.createGain();
        gainNodeRef.current.connect(audioContextRef.current.destination);
      }
      gainNodeRef.current.gain.value = volume;
      
      sourceRef.current.connect(gainNodeRef.current);

      sourceRef.current.onended = () => {
        if (index < script.segments.length - 1) {
          setCurrentSegment(index + 1);
          playSegment(index + 1);
        } else {
          setIsPlaying(false);
          setCurrentSegment(0);
          setCurrentTime(0);
          pausedAtRef.current = 0;
        }
      };

      sourceRef.current.start();
      playStartTimeRef.current = audioContextRef.current.currentTime;
      setCurrentSegment(index);
      setDuration(audioBuffer.duration);
      setCurrentTime(0);
      pausedAtRef.current = 0;
      setIsPlaying(true);
      
    } catch (err) {
      console.error('Audio playback error:', err);
      setError('Failed to play audio. Please check your API key and try again.');
      setIsPlaying(false);
    }
  }, [script, audioSegments, apiKey, ttsModel, volume]);

  // Handle play/pause
  useEffect(() => {
    if (isPlaying && script) {
      if (currentSegment >= 0) {
        playSegment(currentSegment);
      }
    } else {
      if (sourceRef.current) {
        try {
          sourceRef.current.stop();
          pausedAtRef.current = currentTime;
        } catch {
          // Ignore if already stopped
        }
      }
    }
  }, [isPlaying]);

  // Update volume
  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = volume;
    }
  }, [volume]);

  const handleDownload = async () => {
    if (!script) return;
    
    console.log('Download button clicked');
    
    setIsDownloading(true);
    setDownloadProgress(0);
    setError(null);

    try {
      // Test download support first
      const testBlob = new Blob(['test'], { type: 'text/plain' });
      const testUrl = URL.createObjectURL(testBlob);
      const testSupported = typeof document.createElement('a').download !== 'undefined';
      URL.revokeObjectURL(testUrl);
      
      if (!testSupported) {
        throw new Error('Your browser does not support file downloads');
      }

      console.log('Starting enhanced download with progress tracking');
      
      // Enhanced download with progress tracking
      await downloadFullPodcastWithProgress(script, apiKey, ttsModel, (progress) => {
        console.log(`Download progress: ${progress}%`);
        setDownloadProgress(progress);
      });
      
      console.log('Download completed successfully');
      
    } catch (err) {
      console.error('Download error:', err);
      
      // Provide more specific error messages
      let errorMessage = 'Failed to download podcast';
      
      if (err instanceof Error) {
        if (err.message.includes('API key')) {
          errorMessage = 'Invalid API key. Please check your OpenAI API key.';
        } else if (err.message.includes('quota')) {
          errorMessage = 'API quota exceeded. Please check your OpenAI account.';
        } else if (err.message.includes('network')) {
          errorMessage = 'Network error. Please check your internet connection.';
        } else if (err.message.includes('browser')) {
          errorMessage = 'Browser does not support downloads. Please try a different browser.';
        } else {
          errorMessage = `Download failed: ${err.message}`;
        }
      }
      
      setError(errorMessage + ' Please try again.');
      
    } finally {
      setIsDownloading(false);
      setDownloadProgress(0);
    }
  };

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handlePrevious = () => {
    if (currentSegment > 0) {
      setIsPlaying(false);
      setTimeout(() => {
        setCurrentSegment(currentSegment - 1);
        setIsPlaying(true);
      }, 100);
    }
  };

  const handleNext = () => {
    if (script && currentSegment < script.segments.length - 1) {
      setIsPlaying(false);
      setTimeout(() => {
        setCurrentSegment(currentSegment + 1);
        setIsPlaying(true);
      }, 100);
    }
  };

  const handleReplay = () => {
    setIsPlaying(false);
    setTimeout(() => {
      setCurrentSegment(currentSegment);
      setIsPlaying(true);
    }, 100);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getSpeakerName = (type: string) => {
    switch (type) {
      case 'host': return 'Host';
      case 'guest1': return 'Guest 1';
      case 'guest2': return 'Guest 2';
      default: return 'Unknown';
    }
  };

  const getSpeakerColor = (type: string) => {
    switch (type) {
      case 'host': return 'bg-purple-500';
      case 'guest1': return 'bg-blue-500';
      case 'guest2': return 'bg-pink-500';
      default: return 'bg-gray-500';
    }
  };

  if (!script || !script.segments || script.segments.length === 0) {
    return (
      <div className="bg-white/5 p-6 rounded-lg">
        <p className="text-purple-200">No podcast script available.</p>
      </div>
    );
  }

  const currentSpeaker = script.segments[currentSegment]?.type || 'Unknown';
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const totalProgress = ((currentSegment + 1) / script.segments.length) * 100;

  return (
    <div className="bg-purple-800/30 p-6 rounded-xl border border-purple-700/50 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-purple-100">Audio Player</h3>
        <div className="flex items-center space-x-2">
          {isPreloading && (
            <div className="flex items-center space-x-2 text-sm text-purple-300">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Loading {Math.round(preloadProgress)}%</span>
            </div>
          )}
          <button
            onClick={preloadAllSegments}
            disabled={isPreloading}
            className="px-3 py-1 bg-purple-600/50 hover:bg-purple-600/70 disabled:opacity-50 disabled:cursor-not-allowed text-purple-100 rounded text-sm transition-colors"
          >
            Preload All
          </button>
        </div>
      </div>

      {/* Current Speaker and Segment Info */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className={`w-3 h-3 rounded-full ${getSpeakerColor(currentSpeaker)}`}></div>
          <span className="text-purple-200">{getSpeakerName(currentSpeaker)}</span>
          <span className="text-purple-400 text-sm">
            Segment {currentSegment + 1} of {script.segments.length}
          </span>
        </div>
        <div className="text-purple-300 text-sm">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>
      </div>

      {/* Progress Bars */}
      <div className="space-y-2">
        {/* Current Segment Progress */}
        <div className="w-full bg-purple-900/50 rounded-full h-2">
          <div 
            className="bg-purple-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          ></div>
        </div>
        
        {/* Total Progress */}
        <div className="w-full bg-purple-900/30 rounded-full h-1">
          <div 
            className="bg-purple-400 h-1 rounded-full transition-all duration-300"
            style={{ width: `${totalProgress}%` }}
          ></div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center space-x-4">
        <button
          onClick={handlePrevious}
          disabled={currentSegment === 0}
          className="p-2 bg-purple-700/50 hover:bg-purple-700/70 disabled:opacity-50 disabled:cursor-not-allowed text-purple-100 rounded-lg transition-colors"
        >
          <SkipBack className="w-5 h-5" />
        </button>

        <button
          onClick={handleReplay}
          className="p-2 bg-purple-700/50 hover:bg-purple-700/70 text-purple-100 rounded-lg transition-colors"
        >
          <RotateCcw className="w-5 h-5" />
        </button>

        <button
          onClick={handlePlayPause}
          className="p-3 bg-purple-600 hover:bg-purple-700 text-white rounded-full transition-colors"
        >
          {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
        </button>

        <button
          onClick={handleNext}
          disabled={currentSegment >= script.segments.length - 1}
          className="p-2 bg-purple-700/50 hover:bg-purple-700/70 disabled:opacity-50 disabled:cursor-not-allowed text-purple-100 rounded-lg transition-colors"
        >
          <SkipForward className="w-5 h-5" />
        </button>
      </div>

      {/* Advanced Controls */}
      <div className="flex items-center justify-between">
        {/* Volume Control */}
        <div className="flex items-center space-x-2">
          <Volume2 className="w-4 h-4 text-purple-300" />
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="w-20 h-2 bg-purple-700 rounded-lg appearance-none cursor-pointer"
          />
          <span className="text-xs text-purple-400 w-8">{Math.round(volume * 100)}%</span>
        </div>

        {/* Download Button */}
        <button
          onClick={handleDownload}
          disabled={isDownloading}
          className="flex items-center space-x-2 px-4 py-2 bg-green-600/80 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
        >
          {isDownloading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">{Math.round(downloadProgress)}%</span>
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              <span className="text-sm">Download</span>
            </>
          )}
        </button>
      </div>

      {/* Segment Status */}
      <div className="grid grid-cols-8 gap-1">
        {audioSegments.map((segment, index) => (
          <div
            key={index}
            className={`h-2 rounded-full ${
              segment.isLoaded 
                ? 'bg-green-500' 
                : segment.isLoading 
                ? 'bg-yellow-500 animate-pulse' 
                : segment.error 
                ? 'bg-red-500' 
                : 'bg-purple-700/50'
            }`}
            title={`Segment ${index + 1}: ${
              segment.isLoaded ? 'Loaded' : segment.isLoading ? 'Loading...' : segment.error ? 'Error' : 'Not loaded'
            }`}
          />
        ))}
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-600/50 rounded-lg p-3">
          <p className="text-red-200 text-sm">{error}</p>
        </div>
      )}
    </div>
  );
}

// Enhanced download function with progress tracking
async function downloadFullPodcastWithProgress(
  script: PodcastScript, 
  apiKey: string, 
  model: string,
  onProgress: (progress: number) => void
): Promise<void> {
  if (!script.segments.length) return;

  console.log('Starting podcast download...');

  try {
    // Initialize voice assignments if not already done
    await initializeVoiceAssignments(script);
    console.log('Voice assignments initialized');

    const audioBuffers: ArrayBuffer[] = [];
    const totalSegments = script.segments.length;

    console.log(`Generating audio for ${totalSegments} segments`);

    // Generate all audio in parallel with progress tracking
    const generatePromises = script.segments.map(async (segment, index) => {
      console.log(`Generating segment ${index + 1}/${totalSegments}`);
      const buffer = await generateAudioForSegment(segment, apiKey, model);
      onProgress(((index + 1) / totalSegments) * 80); // 80% for generation
      console.log(`Completed segment ${index + 1}/${totalSegments}`);
      return buffer;
    });

    const results = await Promise.all(generatePromises);
    audioBuffers.push(...results);

    console.log(`Generated ${audioBuffers.length} audio segments`);
    onProgress(90); // 90% for combining

    // Combine audio buffers using the same logic as audioGenerator
    const combinedBuffer = combineAudioBuffers(audioBuffers);
    console.log(`Combined buffer size: ${combinedBuffer.byteLength} bytes`);

    onProgress(95); // 95% for blob creation

    // Create blob with proper audio format
    const blob = new Blob([combinedBuffer], { type: 'audio/mpeg' });
    console.log(`Created blob: ${blob.size} bytes, type: ${blob.type}`);

    onProgress(100); // 100% complete

    // Download with better filename
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const filename = `podcast-${timestamp}.mp3`;
    
    console.log(`Downloading as: ${filename}`);

    // Create download link
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    
    // Trigger download
    document.body.appendChild(a);
    a.click();
    
    // Cleanup
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      console.log('Download cleanup completed');
    }, 100);

    console.log('Download initiated successfully');
    
  } catch (error) {
    console.error('Download error details:', error);
    throw error;
  }
}

// Helper function to combine audio buffers (same as in audioGenerator)
function combineAudioBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
  if (buffers.length === 0) {
    return new ArrayBuffer(0);
  }
  
  if (buffers.length === 1) {
    return buffers[0];
  }

  const totalLength = buffers.reduce((acc, buffer) => acc + buffer.byteLength, 0);
  const combinedBuffer = new Uint8Array(totalLength);
  
  let offset = 0;
  for (const buffer of buffers) {
    combinedBuffer.set(new Uint8Array(buffer), offset);
    offset += buffer.byteLength;
  }

  return combinedBuffer.buffer;
}

export default AudioPlayer;