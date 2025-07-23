import React, { useState } from 'react';
import { ChevronDown, ChevronRight, MessageCircle, HelpCircle, Users, Target } from 'lucide-react';
import type { PodcastTopics, DiscussionTopic } from '../types';

interface TopicsDisplayProps {
  topics: PodcastTopics;
}

function TopicsDisplay({ topics }: TopicsDisplayProps) {
  const [expandedTopics, setExpandedTopics] = useState<Set<number>>(new Set());
  const [showAllSections, setShowAllSections] = useState(false);

  const toggleTopic = (index: number) => {
    const newExpanded = new Set(expandedTopics);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedTopics(newExpanded);
  };

  const getPerspectiveIcon = (perspective: DiscussionTopic['perspective']) => {
    switch (perspective) {
      case 'neutral':
        return <Target className="w-4 h-4 text-blue-400" />;
      case 'controversial':
        return <Users className="w-4 h-4 text-red-400" />;
      case 'analytical':
        return <MessageCircle className="w-4 h-4 text-green-400" />;
      default:
        return <MessageCircle className="w-4 h-4 text-purple-400" />;
    }
  };

  const getPerspectiveColor = (perspective: DiscussionTopic['perspective']) => {
    switch (perspective) {
      case 'neutral':
        return 'border-blue-500/30 bg-blue-500/10';
      case 'controversial':
        return 'border-red-500/30 bg-red-500/10';
      case 'analytical':
        return 'border-green-500/30 bg-green-500/10';
      default:
        return 'border-purple-500/30 bg-purple-500/10';
    }
  };

  return (
    <div className="bg-purple-800/30 p-6 rounded-xl border border-purple-700/50 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <MessageCircle className="w-5 h-5 text-purple-400" />
          <h3 className="text-lg font-semibold text-purple-100">Discussion Structure</h3>
        </div>
        <button
          onClick={() => setShowAllSections(!showAllSections)}
          className="text-sm text-purple-300 hover:text-purple-200 transition-colors"
        >
          {showAllSections ? 'Show Less' : 'Show All Sections'}
        </button>
      </div>

      <div className="text-sm text-purple-300">
        Generated {topics.subtopics.length} discussion topics with structured questions for natural conversation flow
      </div>

      {/* Opening Questions */}
      {showAllSections && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-purple-200 flex items-center space-x-2">
            <HelpCircle className="w-4 h-4" />
            <span>Opening Questions</span>
          </h4>
          <div className="bg-purple-900/30 p-3 rounded-lg border border-purple-700/30">
            <ul className="space-y-1 text-sm text-purple-200">
              {topics.openingQuestions.map((question, index) => (
                <li key={index} className="flex items-start space-x-2">
                  <span className="text-purple-400 text-xs mt-1">•</span>
                  <span>{question}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Main Discussion Topics */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-purple-200">Main Discussion Topics</h4>
        {topics.subtopics.map((subtopic, index) => (
          <div
            key={index}
            className={`border rounded-lg transition-all ${getPerspectiveColor(subtopic.perspective)}`}
          >
            <button
              onClick={() => toggleTopic(index)}
              className="w-full p-4 text-left flex items-center justify-between hover:bg-white/5 transition-colors rounded-lg"
            >
              <div className="flex items-center space-x-3">
                {getPerspectiveIcon(subtopic.perspective)}
                <div>
                  <div className="font-medium text-purple-100">{subtopic.title}</div>
                  <div className="text-sm text-purple-300 mt-1">{subtopic.description}</div>
                  <div className="flex items-center space-x-4 text-xs text-purple-400 mt-2">
                    <span className="capitalize bg-purple-900/30 px-2 py-1 rounded">
                      {subtopic.perspective}
                    </span>
                    {subtopic.targetGuest && (
                      <span className="bg-purple-900/30 px-2 py-1 rounded">
                        Target: {subtopic.targetGuest === 'both' ? 'Both Guests' : subtopic.targetGuest.toUpperCase()}
                      </span>
                    )}
                    <span>{subtopic.hostQuestions.length} questions</span>
                  </div>
                </div>
              </div>
              {expandedTopics.has(index) ? (
                <ChevronDown className="w-5 h-5 text-purple-400" />
              ) : (
                <ChevronRight className="w-5 h-5 text-purple-400" />
              )}
            </button>

            {expandedTopics.has(index) && (
              <div className="px-4 pb-4 space-y-3">
                <div>
                  <h5 className="text-sm font-medium text-purple-300 mb-2">Host Questions:</h5>
                  <ul className="space-y-1.5">
                    {subtopic.hostQuestions.map((question, qIndex) => (
                      <li key={qIndex} className="flex items-start space-x-2 text-sm text-purple-200">
                        <span className="text-purple-400 text-xs mt-1">{qIndex + 1}.</span>
                        <span>{question}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {subtopic.followUpQuestions.length > 0 && (
                  <div>
                    <h5 className="text-sm font-medium text-purple-300 mb-2">Follow-up Questions:</h5>
                    <ul className="space-y-1.5">
                      {subtopic.followUpQuestions.map((question, qIndex) => (
                        <li key={qIndex} className="flex items-start space-x-2 text-sm text-purple-200/80">
                          <span className="text-purple-400/80 text-xs mt-1">↳</span>
                          <span>{question}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Closing Questions */}
      {showAllSections && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-purple-200 flex items-center space-x-2">
            <HelpCircle className="w-4 h-4" />
            <span>Closing Questions</span>
          </h4>
          <div className="bg-purple-900/30 p-3 rounded-lg border border-purple-700/30">
            <ul className="space-y-1 text-sm text-purple-200">
              {topics.closingQuestions.map((question, index) => (
                <li key={index} className="flex items-start space-x-2">
                  <span className="text-purple-400 text-xs mt-1">•</span>
                  <span>{question}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="text-xs text-purple-400 border-t border-purple-700/30 pt-3">
        This structure guides the host's questions and ensures comprehensive topic coverage with natural conversation flow.
      </div>
    </div>
  );
}

export default TopicsDisplay; 