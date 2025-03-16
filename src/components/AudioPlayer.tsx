import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, Download } from 'lucide-react';
import type { PodcastScript } from '../types';
import { generateAudioForSegment, downloadFullPodcast, initializeVoiceAssignments, clearAudioCache } from '../utils/audioGenerator';

interface AudioPlayerProps {
  script: PodcastScript | null;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  apiKey: string;
}

function AudioPlayer({ script, isPlaying, setIsPlaying, apiKey }: AudioPlayerProps) {
  const [currentSegment, setCurrentSegment] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const isInitializedRef = useRef(false);

  useEffect(() => {
    if (!isInitializedRef.current && script) {
      initializeVoiceAssignments(script);
      clearAudioCache();
      isInitializedRef.current = true;
    }

    return () => {
      if (sourceRef.current) {
        sourceRef.current.stop();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [script]);

  useEffect(() => {
    if (isPlaying && script) {
      playSegment(currentSegment);
    } else {
      if (sourceRef.current) {
        sourceRef.current.stop();
      }
    }
  }, [isPlaying]);

  const playSegment = async (index: number) => {
    if (!script || index < 0 || index >= script.segments.length) return;
    
    try {
      setIsLoading(true);
      setError(null);

      // Create a new AudioContext if needed
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new AudioContext();
      }

      // Resume the AudioContext if it's suspended
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      
      const arrayBuffer = await generateAudioForSegment(script.segments[index], apiKey);
      const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
      
      if (sourceRef.current) {
        sourceRef.current.stop();
      }
      
      sourceRef.current = audioContextRef.current.createBufferSource();
      sourceRef.current.buffer = audioBuffer;
      sourceRef.current.connect(audioContextRef.current.destination);
      
      sourceRef.current.onended = () => {
        if (index < script.segments.length - 1) {
          setCurrentSegment(index + 1);
          playSegment(index + 1);
        } else {
          setIsPlaying(false);
          setCurrentSegment(0);
        }
      };
      
      sourceRef.current.start();
      setCurrentSegment(index);
      setIsPlaying(true);
      
    } catch (err) {
      console.error('Audio generation error:', err);
      setError('Failed to generate audio. Please check your API key and try again.');
      setIsPlaying(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!script) return;
    
    try {
      setIsDownloading(true);
      setError(null);
      await downloadFullPodcast(script, apiKey);
    } catch (err) {
      console.error('Download error:', err);
      setError('Failed to download podcast. Please try again.');
    } finally {
      setIsDownloading(false);
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

  if (!script || !script.segments || script.segments.length === 0) {
    return (
      <div className="bg-white/5 p-6 rounded-lg">
        <p className="text-purple-200">No podcast script available.</p>
      </div>
    );
  }

  const currentSpeaker = script.segments[currentSegment]?.speaker || 'Unknown';
  const progress = ((currentSegment + 1) / script.segments.length) * 100;

  return (
    <div className="bg-white/5 p-6 rounded-lg space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-purple-200">Audio Player</h3>
        <div className="flex items-center space-x-4">
          <button
            onClick={handlePrevious}
            disabled={currentSegment === 0 || isLoading}
            className="p-2 rounded-full bg-purple-500/50 hover:bg-purple-600/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <SkipBack className="w-5 h-5" />
          </button>
          
          <button
            onClick={handlePlayPause}
            disabled={isLoading}
            className="p-3 rounded-full bg-purple-500 hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : isPlaying ? (
              <Pause className="w-5 h-5" />
            ) : (
              <Play className="w-5 h-5" />
            )}
          </button>
          
          <button
            onClick={handleNext}
            disabled={currentSegment === script.segments.length - 1 || isLoading}
            className="p-2 rounded-full bg-purple-500/50 hover:bg-purple-600/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <SkipForward className="w-5 h-5" />
          </button>

          <button
            onClick={handleDownload}
            disabled={isDownloading}
            className="p-2 rounded-full bg-purple-500/50 hover:bg-purple-600/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isDownloading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Download className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-sm text-purple-300">
          Now playing: <span className="font-medium">{currentSpeaker}</span>
        </div>
        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-purple-500 transition-all duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-200 text-sm">
          {error}
        </div>
      )}
    </div>
  );
}

export default AudioPlayer;