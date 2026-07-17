import React, { useState } from 'react';
import type { PromptListItem } from '../../../shared/types';

interface PromptCardProps {
  prompt: PromptListItem;
  onClick: () => void;
  refreshKey?: number;
}

export function PromptCard({ prompt, onClick, refreshKey = 0 }: PromptCardProps) {
  const [imageError, setImageError] = useState(false);

  // Construct direct URL from primary_thumb_path (returned by list query)
  // Avoids 2 extra IPC roundtrips (getForPrompt + getThumbnail)
  const thumbUrl = prompt.primary_thumb_path
    ? `prompt-image://${prompt.primary_thumb_path}`
    : null;

  const previewText = prompt.positive.length > 100
    ? prompt.positive.substring(0, 100) + '...'
    : prompt.positive;

  return (
    <div className="prompt-card group" onClick={onClick}>
      <div className="w-full bg-gray-100 dark:bg-gray-900 flex items-center justify-center overflow-hidden">
        {thumbUrl && !imageError ? (
          <img
            src={thumbUrl}
            alt={previewText}
            className="w-full h-auto object-contain max-h-[300px]"
            loading="lazy"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-full aspect-[4/3] flex flex-col items-center justify-center text-gray-300 dark:text-gray-600">
            <svg className="w-12 h-12 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-xs">No image</span>
          </div>
        )}
      </div>

      <div className="p-3 space-y-1.5">
        <p className="text-xs text-gray-700 dark:text-gray-300 line-clamp-2 leading-relaxed">
          {previewText || <span className="text-gray-400 italic">No prompt</span>}
        </p>
        <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate">
          {[
            prompt.model && `Model: ${prompt.model.split('\\').pop()?.split('/').pop()}`,
            prompt.steps > 0 && `Steps: ${prompt.steps}`,
            `${prompt.width}\u00d7${prompt.height}`,
          ].filter(Boolean).join(' \u00b7 ')}
        </p>
      </div>
    </div>
  );
}
