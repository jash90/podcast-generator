import React, { useState } from 'react';
import { ChevronDown, ChevronUp, FileText, Clock, AlertTriangle, CheckCircle, Bug, Download } from 'lucide-react';
import { splitTextForTTS, validateTextChunk, estimateSpeakingDuration } from '../utils/textSplitter';
import { debugDownload, testDownloadSupport, getCacheStats } from '../utils/audioGenerator';
import type { PodcastScript } from '../types';

interface TextStatsProps {
  script: PodcastScript | null;
}

function TextStats({ script }: TextStatsProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  if (!script?.segments || script.segments.length === 0) {
    return null;
  }

  // Calculate overall statistics
  const totalText = script.segments.map(s => s.text).join(' ');
  const totalChars = totalText.length;
  const totalWords = totalText.trim().split(/\s+/).length;
  const estimatedDuration = estimateSpeakingDuration(totalText);

  // Analyze each segment for chunking
  const segmentAnalysis = script.segments.map((segment, index) => {
    const chunks = splitTextForTTS(segment.text);
    const validation = validateTextChunk(segment.text);
    return {
      index,
      segment,
      chunks,
      validation,
      needsSplitting: chunks.length > 1
    };
  });

  const totalChunks = segmentAnalysis.reduce((acc, analysis) => acc + analysis.chunks.length, 0);
  const segmentsNeedingSplit = segmentAnalysis.filter(a => a.needsSplitting).length;
  const hasWarnings = segmentAnalysis.some(a => a.validation.warnings.length > 0);

  const handleDebugDownload = () => {
    console.log('=== DOWNLOAD DEBUG TEST ===');
    debugDownload(script);
    testDownloadSupport();
    console.log('Cache stats:', getCacheStats());
    console.log('Browser info:', {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      cookieEnabled: navigator.cookieEnabled,
      onLine: navigator.onLine
    });
  };

  return (
    <div className="bg-purple-800/20 rounded-xl border border-purple-700/30">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 flex items-center justify-between text-left hover:bg-purple-700/20 transition-colors rounded-xl"
      >
        <div className="flex items-center space-x-2">
          <FileText className="w-5 h-5 text-purple-400" />
          <span className="font-medium text-purple-200">Text Analysis</span>
          {hasWarnings && (
            <AlertTriangle className="w-4 h-4 text-yellow-400" />
          )}
        </div>
        <div className="flex items-center space-x-4">
          <div className="text-xs text-purple-300">
            {totalChars.toLocaleString()} chars • {totalChunks} chunks
          </div>
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-purple-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-purple-400" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-purple-700/30 mt-4 pt-4">
          {/* Overall Statistics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-purple-900/30 p-3 rounded-lg">
              <div className="text-xs text-purple-300">Total Characters</div>
              <div className="text-lg font-semibold text-purple-100">
                {totalChars.toLocaleString()}
              </div>
            </div>
            <div className="bg-purple-900/30 p-3 rounded-lg">
              <div className="text-xs text-purple-300">Total Words</div>
              <div className="text-lg font-semibold text-purple-100">
                {totalWords.toLocaleString()}
              </div>
            </div>
            <div className="bg-purple-900/30 p-3 rounded-lg">
              <div className="text-xs text-purple-300">Est. Duration</div>
              <div className="text-lg font-semibold text-purple-100 flex items-center">
                <Clock className="w-4 h-4 mr-1" />
                {Math.round(estimatedDuration)}s
              </div>
            </div>
            <div className="bg-purple-900/30 p-3 rounded-lg">
              <div className="text-xs text-purple-300">API Chunks</div>
              <div className="text-lg font-semibold text-purple-100">
                {totalChunks}
              </div>
            </div>
          </div>

          {/* Chunking Summary */}
          {segmentsNeedingSplit > 0 && (
            <div className="bg-yellow-900/20 border border-yellow-600/30 rounded-lg p-3">
              <div className="flex items-center space-x-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-yellow-400" />
                <span className="text-sm font-medium text-yellow-200">
                  Text Splitting Required
                </span>
              </div>
              <p className="text-xs text-yellow-300">
                {segmentsNeedingSplit} segment(s) exceed 4096 characters and will be split into smaller chunks for TTS processing.
              </p>
            </div>
          )}

          {/* Segment Details */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-purple-200">Segment Analysis</h4>
            <div className="grid gap-2">
              {segmentAnalysis.map((analysis) => (
                <div
                  key={analysis.index}
                  className={`p-3 rounded-lg border ${
                    analysis.needsSplitting
                      ? 'bg-yellow-900/20 border-yellow-600/30'
                      : analysis.validation.warnings.length > 0
                      ? 'bg-orange-900/20 border-orange-600/30'
                      : 'bg-green-900/20 border-green-600/30'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-medium text-purple-200">
                        Segment {analysis.index + 1}
                      </span>
                      <span className="text-xs text-purple-400">
                        ({analysis.segment.type})
                      </span>
                      {analysis.needsSplitting ? (
                        <AlertTriangle className="w-3 h-3 text-yellow-400" />
                      ) : (
                        <CheckCircle className="w-3 h-3 text-green-400" />
                      )}
                    </div>
                    <div className="text-xs text-purple-300">
                      {analysis.segment.text.length} chars → {analysis.chunks.length} chunk(s)
                    </div>
                  </div>

                  {analysis.chunks.length > 1 && (
                    <div className="text-xs text-purple-300 mb-2">
                      Chunk sizes: {analysis.chunks.map(chunk => chunk.length).join(', ')} characters
                    </div>
                  )}

                  {analysis.validation.warnings.length > 0 && (
                    <div className="text-xs text-orange-300">
                      Warnings: {analysis.validation.warnings.join(', ')}
                    </div>
                  )}

                  <div className="text-xs text-purple-400 mt-1">
                    Est. duration: {Math.round(analysis.validation.estimatedDuration)}s
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* API Impact */}
          <div className="bg-purple-900/30 p-3 rounded-lg">
            <h4 className="text-sm font-medium text-purple-200 mb-2">API Impact</h4>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-purple-300">Original segments:</span>
                <span className="ml-2 text-purple-100">{script.segments.length}</span>
              </div>
              <div>
                <span className="text-purple-300">API calls required:</span>
                <span className="ml-2 text-purple-100">{totalChunks}</span>
              </div>
              <div>
                <span className="text-purple-300">Parallel efficiency:</span>
                <span className="ml-2 text-purple-100">
                  {totalChunks > script.segments.length ? 'Chunked' : 'Optimal'}
                </span>
              </div>
              <div>
                <span className="text-purple-300">Cache entries:</span>
                <span className="ml-2 text-purple-100">{script.segments.length}</span>
              </div>
            </div>
          </div>

          {/* Debug Section */}
          <div className="bg-gray-900/20 border border-gray-600/30 rounded-lg">
            <button
              onClick={() => setShowDebug(!showDebug)}
              className="w-full p-3 flex items-center justify-between text-left hover:bg-gray-700/20 transition-colors rounded-lg"
            >
              <div className="flex items-center space-x-2">
                <Bug className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-medium text-gray-200">Debug Information</span>
              </div>
              {showDebug ? (
                <ChevronUp className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              )}
            </button>

            {showDebug && (
              <div className="px-3 pb-3 space-y-2 border-t border-gray-600/30 mt-3 pt-3">
                <p className="text-xs text-gray-300">
                  Use these tools to troubleshoot download issues. Check the browser console for detailed logs.
                </p>
                
                <div className="flex space-x-2">
                  <button
                    onClick={handleDebugDownload}
                    className="flex items-center space-x-1 px-3 py-1 bg-gray-600/50 hover:bg-gray-600/70 text-gray-100 rounded text-xs transition-colors"
                  >
                    <Bug className="w-3 h-3" />
                    <span>Run Debug Test</span>
                  </button>
                  
                  <button
                    onClick={() => console.log('User Agent:', navigator.userAgent)}
                    className="flex items-center space-x-1 px-3 py-1 bg-gray-600/50 hover:bg-gray-600/70 text-gray-100 rounded text-xs transition-colors"
                  >
                    <FileText className="w-3 h-3" />
                    <span>Browser Info</span>
                  </button>
                </div>
                
                <div className="text-xs text-gray-400">
                  If downloads aren't working, try:
                  <ul className="list-disc list-inside mt-1 space-y-1">
                    <li>Check browser console for errors</li>
                    <li>Disable ad blockers or extensions</li>
                    <li>Allow downloads in browser settings</li>
                    <li>Try a different browser (Chrome, Firefox, Safari)</li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default TextStats; 