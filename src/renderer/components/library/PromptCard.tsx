import React, { useState, useEffect } from 'react';
import type { PromptListItem } from '../../../shared/types';
import { getAPI } from '../../lib/ipc';

interface PromptCardProps {
  prompt: PromptListItem;
  onClick: () => void;
}

export function PromptCard({ prompt, onClick }: PromptCardProps) {
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);

  // Load thumbnail when card is visible
  useEffect(() => {
    let cancelled = false;
    async function loadThumbnail() {
      // Find first image with thumb_path
      if (prompt.primary_thumb_path) {
        try {
          // For now, use the image ID from the prompt's images
          // In full implementation, we'd get the image ID from the list query
          const images = await getAPI().images.getForPrompt(prompt.id);
          if (!cancelled && images.length > 0) {
            const thumbData = await getAPI().images.getThumbnail(images[0].id);
            if (!cancelled && thumbData) {
              setThumbnail(thumbData);
            } else {
              setImageError(true);
            }
          }
        } catch {
          if (!cancelled) setImageError(true);
        }
      } else {
        setImageError(true);
      }
    }
    loadThumbnail();
    return () => { cancelled = true; };
  }, [prompt.id, prompt.primary_thumb_path]);

  // Truncate prompt text to ~2 lines
  const previewText = prompt.positive.length > 100
    ? prompt.positive.substring(0, 100) + '...'
    : prompt.positive;

  return (
    <div className="prompt-card" onClick={onClick}>
      {/* Thumbnail */}
      <div className="aspect-square bg-surface-hover overflow-hidden relative">
        {thumbnail && !imageError ? (
          <img
            src={thumbnail}
            alt={previewText}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
            <svg className="w-10 h-10 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-xs">No image</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3 space-y-1.5">
        {/* Prompt preview text */}
        <p className="text-xs text-gray-700 dark:text-gray-300 line-clamp-2 leading-relaxed">
          {previewText || <span className="text-gray-400 italic">No prompt</span>}
        </p>

        {/* Model + params */}
        <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate">
          {[
            prompt.model && `🧠 ${prompt.model}`,
            prompt.steps > 0 && `Steps: ${prompt.steps}`,
            `${prompt.width}×${prompt.height}`,
          ].filter(Boolean).join(' · ')}
        </p>

        {/* Tags */}
        {prompt.tag_names && prompt.tag_names.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {prompt.tag_names.slice(0, 3).map(name => (
              <span key={name} className="tag-chip text-[10px]">
                {name}
              </span>
            ))}
            {prompt.tag_names.length > 3 && (
              <span className="text-[10px] text-gray-400">
                +{prompt.tag_names.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
