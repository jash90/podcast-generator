import React from 'react';
import type { PodcastScript } from '../types';
import { Clock, MessageSquare, Globe2 } from 'lucide-react';

interface ScriptProps {
  script: PodcastScript;
}

function Script({ script }: ScriptProps) {
  const totalWords = script.segments.reduce((acc, segment) => 
    acc + segment.text.split(/\s+/).length, 0);
  const estimatedMinutes = Math.ceil(totalWords / 150);

  const getSpeakerColor = (type: string) => {
    switch (type) {
      case 'host':
        return 'border-purple-500 text-purple-300';
      case 'guest1':
        return 'border-blue-500 text-blue-300';
      case 'guest2':
        return 'border-pink-500 text-pink-300';
      default:
        return 'border-gray-500 text-gray-300';
    }
  };

  const getSpeakerName = (type: string) => {
    switch (type) {
      case 'host':
        return 'Host';
      case 'guest1':
        return 'Guest 1';
      case 'guest2':
        return 'Guest 2';
      default:
        return 'Unknown';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-purple-200">Generated Script</h2>
        <div className="flex items-center space-x-4 text-sm text-purple-300">
          {script.language && (
            <div className="flex items-center">
              <Globe2 className="w-4 h-4 mr-1" />
              <span>{script.language}</span>
            </div>
          )}
          <div className="flex items-center">
            <Clock className="w-4 h-4 mr-1" />
            <span>~{estimatedMinutes} min</span>
          </div>
          <div className="flex items-center">
            <MessageSquare className="w-4 h-4 mr-1" />
            <span>{script.segments.length} segments</span>
          </div>
        </div>
      </div>
      
      <div className="space-y-3">
        {script.segments.map((segment, index) => (
          <div 
            key={index} 
            className={`bg-white/5 p-4 rounded-lg border-l-4 ${getSpeakerColor(segment.type)}`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className={`font-medium ${getSpeakerColor(segment.type)}`}>
                {getSpeakerName(segment.type)}
              </span>
              <span className="text-xs text-purple-400/60">
                ~{Math.ceil(segment.text.split(/\s+/).length / 2.5)}s
              </span>
            </div>
            <p className="text-purple-100">{segment.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Script;