import fs from 'fs';
import type { ExtractedMetadata } from '../../shared/types';

export function extractMetadata(filePath: string): ExtractedMetadata | null {
  try {
    const buffer = fs.readFileSync(filePath);

    // Verify PNG signature
    const sig = [137, 80, 78, 71, 13, 10, 26, 10];
    for (let i = 0; i < 8; i++) { if (buffer[i] !== sig[i]) return null; }

    const imgWidth = buffer.readUInt32BE(16);
    const imgHeight = buffer.readUInt32BE(20);

    // Read tEXt chunks
    const texts: Record<string, string> = {};
    let offset = 8;
    while (offset < buffer.length) {
      const length = buffer.readUInt32BE(offset);
      const type = buffer.toString('ascii', offset + 4, offset + 8);
      if (type === 'IEND') break;
      const start = offset + 8, end = start + length;
      if (type === 'tEXt') {
        const data = buffer.toString('latin1', start, end);
        const n = data.indexOf('\0');
        if (n > 0) texts[data.substring(0, n)] = data.substring(n + 1);
      }
      offset = end + 4;
    }

    const wfText = texts['workflow'] || texts['prompt'];
    if (!wfText) return null;

    const wf = JSON.parse(wfText);
    return extractFromWorkflow(wf, imgWidth, imgHeight, wfText);
  } catch (err) {
    console.error('[EXTRACT] Error:', (err as Error).message);
    return null;
  }
}

function extractFromWorkflow(
  wf: any, imgW: number, imgH: number, rawWf: string
): ExtractedMetadata {
  let positive = '', negative = '', model = '', sampler = '';
  let steps = 0, cfg = 0, seed = 0, width = imgW, height = imgH;

  const nodes: any[] = Array.isArray(wf.nodes) ? wf.nodes : Object.values(wf.nodes || wf);

  for (const n of nodes) {
    if (!n || typeof n !== 'object') continue;
    const ct = (n.type || n.class_type || '');
    const wv = n.widgets_values || [];
    const title = (n.title || '').toLowerCase();

    switch (ct) {
      case 'CLIPTextEncode': {
        const text = String(wv[0] || '');
        if (!text) break;
        if (title.includes('负面') || title.includes('negative')) {
          negative = text;
        } else {
          positive = text;
        }
        break;
      }

      case 'CheckpointLoaderSimple':
      case 'CheckpointLoader':
      case 'LoadCheckpoint':
      case 'UNETLoader':
        model = String(wv[0] || model);
        break;

      case 'KSampler':
      case 'KSamplerAdvanced':
      case 'KSampler (Efficient)': {
        // KSampler widgets_values order varies. Scan all values by type.
        let foundSampler = false, foundSteps = false, foundCfg = false, foundSeed = false;

        for (const val of wv) {
          if (typeof val === 'number' || (typeof val === 'string' && /^\d+$/.test(val))) {
            const n = Number(val);
            // Detect seed: large number > 100000
            if (!foundSeed && n > 100000) { seed = n; foundSeed = true; }
            // Detect cfg: float OR low-range integer (0.5-10)
            else if (!foundCfg && n >= 0.5 && n <= 10) { cfg = n; foundCfg = true; }
            // Detect steps: integer in 5-200 range
            else if (!foundSteps && n >= 5 && n <= 200 && Number.isInteger(n)) { steps = n; foundSteps = true; }
            // Catch-all: higher-range cfg (10-100), typically float
            else if (!foundCfg && n >= 0.5 && n <= 100) { cfg = n; foundCfg = true; }
          } else if (typeof val === 'string' && val.length > 0) {
            // Skip known non-sampler strings
            const skip = ['sgm_uniform', 'normal', 'karras', 'exponential',
                          'decrement', 'increment', 'randomize', 'fixed',
                          'ddim_uniform', 'lcm', 'simple', 'beta'];
            if (!skip.includes(val.toLowerCase()) && !foundSampler) {
              sampler = val;
              foundSampler = true;
            }
          }
        }
        break;
      }

      case 'EmptyLatentImage':
        if (wv.length >= 2) {
          width = Number(wv[0]) || width;
          height = Number(wv[1]) || height;
        }
        break;
    }
  }

  const result: ExtractedMetadata = {
    positive: positive.trim(),
    negative: negative.trim(),
    model: model.trim(),
    sampler: sampler.trim(),
    steps: Number(steps) || 0,
    cfg: Number(cfg) || 0,
    seed: Number(seed) || 0,
    width, height,
    workflow: rawWf,
  };

  console.log('[EXTRACT]', JSON.stringify({
    model: result.model, sampler: result.sampler,
    steps: result.steps, cfg: result.cfg, seed: result.seed,
    w: result.width, h: result.height,
    posLen: result.positive.length, negLen: result.negative.length,
  }));

  return result;
}
