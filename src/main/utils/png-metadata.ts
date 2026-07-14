import fs from 'fs';
import zlib from 'zlib';
import type { ExtractedMetadata } from '../../shared/types';

/**
 * Reads a PNG file and extracts ComfyUI workflow metadata from tEXt/iTXt/zTXt chunks.
 * This is the core auto-extraction feature that reads parameters from ComfyUI-generated PNGs.
 */
export function extractMetadata(filePath: string): ExtractedMetadata | null {
  try {
    const buffer = fs.readFileSync(filePath);

    // Verify PNG signature
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    for (let i = 0; i < 8; i++) {
      if (buffer[i] !== signature[i]) {
        console.log('Not a valid PNG file:', filePath);
        return null;
      }
    }

    // Get image dimensions from IHDR
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);

    // Read all chunks and find text metadata
    const textChunks: Record<string, string> = {};
    let offset = 8; // skip PNG signature

    while (offset < buffer.length) {
      const length = buffer.readUInt32BE(offset);
      const type = buffer.toString('ascii', offset + 4, offset + 8);

      if (type === 'IEND') break;

      const dataStart = offset + 8;
      const dataEnd = dataStart + length;

      if (type === 'tEXt') {
        // Uncompressed text chunk
        const data = buffer.toString('latin1', dataStart, dataEnd);
        const nullIndex = data.indexOf('\0');
        if (nullIndex > 0) {
          const keyword = data.substring(0, nullIndex);
          const text = data.substring(nullIndex + 1);
          textChunks[keyword] = text;
        }
      } else if (type === 'zTXt') {
        // Compressed text chunk
        const data = buffer.subarray(dataStart, dataEnd);
        const nullIndex = data.indexOf(0);
        if (nullIndex > 0) {
          const keyword = data.toString('latin1', 0, nullIndex);
          // Skip compression method byte (should be 0 = deflate)
          const compressedData = data.subarray(nullIndex + 2);
          try {
            const decompressed = zlib.inflateSync(compressedData);
            textChunks[keyword] = decompressed.toString('utf-8');
          } catch (e) {
            console.log('Failed to decompress zTXt chunk:', keyword);
          }
        }
      } else if (type === 'iTXt') {
        // International text chunk (UTF-8)
        const data = buffer.subarray(dataStart, dataEnd);
        const nullIndex1 = data.indexOf(0);
        if (nullIndex1 > 0) {
          const keyword = data.toString('latin1', 0, nullIndex1);
          // Skip compression flag + method + language tag + null + translated keyword + null
          let pos = nullIndex1 + 1 + 1; // keyword null + compression flag + method
          // skip language tag
          const nullIndex2 = data.indexOf(0, pos);
          if (nullIndex2 < 0) continue;
          pos = nullIndex2 + 1;
          // skip translated keyword
          const nullIndex3 = data.indexOf(0, pos);
          if (nullIndex3 < 0) continue;
          pos = nullIndex3 + 1;
          // text data
          const textData = data.subarray(pos);
          try {
            textChunks[keyword] = textData.toString('utf-8');
          } catch (e) {
            console.log('Failed to decode iTXt chunk:', keyword);
          }
        }
      }

      offset = dataEnd + 4; // skip 4-byte CRC
    }

    // Extract image dimensions from file
    const imgWidth = width;
    const imgHeight = height;

    // Try to parse ComfyUI workflow from metadata
    const workflowText =
      textChunks['workflow'] ||
      textChunks['prompt'] ||
      textChunks['comfyui_workflow'] ||
      textChunks['parameters'];

    if (workflowText) {
      try {
        const parsed = JSON.parse(workflowText);
        return extractFromWorkflow(parsed, workflowText, imgWidth, imgHeight);
      } catch {
        // Not valid JSON, try parsing as text parameters
        return extractFromParamsText(workflowText, imgWidth, imgHeight);
      }
    }

    // Try to find any tEXt chunk that looks like parameters
    const parametersText =
      textChunks['parameters'] ||
      textChunks['Description'] ||
      textChunks['Comment'];

    if (parametersText) {
      return extractFromParamsText(parametersText, imgWidth, imgHeight);
    }

    return null;
  } catch (err) {
    console.error('Error extracting PNG metadata:', err);
    return null;
  }
}

/**
 * Extract metadata from a ComfyUI workflow JSON object.
 */
function extractFromWorkflow(
  workflow: any,
  rawWorkflow: string,
  imgWidth: number,
  imgHeight: number
): ExtractedMetadata {
  let positive = '';
  let negative = '';
  let model = '';
  let sampler = '';
  let steps = 0;
  let cfg = 0;
  let seed = 0;
  let width = imgWidth;
  let height = imgHeight;

  // ComfyUI workflow can be in different formats:
  // 1. Direct API format: { nodes: [...] } or { "1": {...}, "2": {...} }
  // 2. Legacy format: { "1": { inputs: {...}, class_type: "..." }, ... }

  const nodes = workflow.nodes || workflow;

  // Find all relevant nodes
  for (const [_key, node] of Object.entries(nodes)) {
    const n = node as any;
    const classType = n?.class_type || n?.type || '';

    switch (classType) {
      case 'CLIPTextEncode':
      case 'CLIPTextEncode (Prompt)': {
        const text = n?.inputs?.text || n?.widgets_values?.[0] || '';
        // Positive prompt is usually the longer one (or has "masterpiece" etc.)
        // Negative is usually shorter and contains "bad quality", "ugly", etc.
        if (text.length > positive.length) {
          // If we already had a longer one, it's negative
          if (positive && text.length > positive.length) {
            negative = positive;
            positive = text;
          } else if (!positive) {
            positive = text;
          } else {
            // Check which looks like a negative prompt
            if (
              text.toLowerCase().includes('bad') ||
              text.toLowerCase().includes('ugly') ||
              text.toLowerCase().includes('worst') ||
              text.toLowerCase().includes('low quality')
            ) {
              negative = text;
            } else if (!negative) {
              negative = text;
            }
          }
        } else if (text) {
          negative = text;
        }
        break;
      }
      case 'CheckpointLoaderSimple':
      case 'CheckpointLoader':
      case 'LoadCheckpoint': {
        model = n?.inputs?.ckpt_name || n?.widgets_values?.[0] || '';
        break;
      }
      case 'KSampler':
      case 'KSamplerAdvanced': {
        sampler = n?.inputs?.sampler_name || n?.widgets_values?.[0] || '';
        steps = n?.inputs?.steps || n?.widgets_values?.[1] || 0;
        cfg = n?.inputs?.cfg || n?.widgets_values?.[2] || 0;
        seed = n?.inputs?.seed || n?.widgets_values?.[3] || 0;
        break;
      }
      case 'EmptyLatentImage': {
        width = n?.inputs?.width || n?.widgets_values?.[0] || imgWidth;
        height = n?.inputs?.height || n?.widgets_values?.[1] || imgHeight;
        break;
      }
    }
  }

  return {
    positive: String(positive).trim(),
    negative: String(negative).trim(),
    model: String(model).trim(),
    sampler: String(sampler).trim(),
    steps: Number(steps) || 0,
    cfg: Number(cfg) || 0,
    seed: Number(seed) || 0,
    width: Number(width) || imgWidth,
    height: Number(height) || imgHeight,
    workflow: rawWorkflow,
  };
}

/**
 * Extract metadata from a text-based parameters string
 * (used by some ComfyUI nodes/plugins or Automatic1111-style parameter text)
 */
function extractFromParamsText(
  text: string,
  imgWidth: number,
  imgHeight: number
): ExtractedMetadata {
  let positive = text;
  let negative = '';
  let model = '';
  let sampler = '';
  let steps = 0;
  let cfg = 0;
  let seed = 0;

  // Try to split positive/negative prompt
  const negMatch = text.match(/Negative prompt:\s*(.+?)(?:\n|$)/is);
  if (negMatch) {
    negative = negMatch[1].trim();
    const negIndex = text.indexOf(negMatch[0]);
    positive = text.substring(0, negIndex).trim();
  }

  // Extract parameters
  const stepsMatch = text.match(/Steps:\s*(\d+)/i);
  if (stepsMatch) steps = parseInt(stepsMatch[1]);

  const samplerMatch = text.match(/Sampler:\s*(\S+)/i);
  if (samplerMatch) sampler = samplerMatch[1];

  const cfgMatch = text.match(/CFG scale:\s*([\d.]+)/i);
  if (cfgMatch) cfg = parseFloat(cfgMatch[1]);

  const seedMatch = text.match(/Seed:\s*(\d+)/i);
  if (seedMatch) seed = parseInt(seedMatch[1]);

  const modelMatch = text.match(/Model:\s*(.+?)(?:\n|$)/i);
  if (modelMatch) model = modelMatch[1].trim();

  return {
    positive: positive.trim(),
    negative: negative.trim(),
    model,
    sampler,
    steps,
    cfg,
    seed,
    width: imgWidth,
    height: imgHeight,
  };
}
