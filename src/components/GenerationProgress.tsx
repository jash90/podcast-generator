import React from 'react';
import { CheckCircle2, Circle, Loader2 } from 'lucide-react';

export type GenerationStage = 
  | 'detecting-language'
  | 'creating-personas'
  | 'generating-topics'
  | 'generating-opening-responses'
  | 'generating-background-responses'
  | 'generating-discussion-responses'
  | 'generating-conclusion-responses'
  | 'initializing-voices'
  | 'complete'
  | null;

interface GenerationProgressProps {
  currentStage: GenerationStage;
  currentSegment?: number;
  totalSegments?: number;
}

function GenerationProgress({ currentStage, currentSegment, totalSegments }: GenerationProgressProps) {
  const stages = [
    { id: 'detecting-language', label: 'Detecting Language' },
    { id: 'creating-personas', label: 'Creating Personas' },
    { id: 'generating-topics', label: 'Generating Discussion Topics' },
    { id: 'generating-opening-responses', label: 'Generating Opening Responses' },
    { id: 'generating-background-responses', label: 'Generating Background Responses' },
    { id: 'generating-discussion-responses', label: 'Generating Discussion Responses' },
    { id: 'generating-conclusion-responses', label: 'Generating Conclusion Responses' },
    { id: 'initializing-voices', label: 'Initializing Voices' },
  ];

  const getStageLabel = (stage: typeof stages[0]) => {
    if (currentStage === stage.id && currentSegment && totalSegments) {
      return `${stage.label} (${currentSegment}/${totalSegments})`;
    }
    return stage.label;
  };

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-purple-200">Generation Progress</h3>
      <div className="space-y-3">
        {stages.map((stage) => (
          <div
            key={stage.id}
            className={`flex items-center space-x-3 p-2 rounded-lg transition-colors ${
              currentStage === stage.id
                ? 'bg-purple-600/20'
                : currentStage === 'complete' && stages.findIndex(s => s.id === stage.id) <= stages.findIndex(s => s.id === currentStage)
                ? 'bg-purple-600/10'
                : 'bg-purple-900/20'
            }`}
          >
            {currentStage === stage.id ? (
              <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
            ) : currentStage === 'complete' && stages.findIndex(s => s.id === stage.id) <= stages.findIndex(s => s.id === currentStage) ? (
              <CheckCircle2 className="w-5 h-5 text-purple-400" />
            ) : (
              <Circle className="w-5 h-5 text-purple-700" />
            )}
            <span className={`text-sm ${
              currentStage === stage.id
                ? 'text-purple-100'
                : currentStage === 'complete' && stages.findIndex(s => s.id === stage.id) <= stages.findIndex(s => s.id === currentStage)
                ? 'text-purple-200'
                : 'text-purple-400'
            }`}>
              {getStageLabel(stage)}
            </span>
          </div>
        ))}
      </div>
      
      {currentStage && currentStage.includes('generating-') && currentStage !== 'generating-topics' && (
        <div className="text-xs text-purple-400 mt-2 px-2">
          Generating detailed individual responses for natural conversation flow
        </div>
      )}
    </div>
  );
}

export default GenerationProgress;