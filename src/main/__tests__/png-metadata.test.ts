import { describe, it, expect } from 'vitest';
import { extractMetadata } from '../utils/png-metadata';

// Build a minimal valid PNG buffer with a tEXt chunk containing ComfyUI workflow JSON
function makeTestPng(workflowJson: string): Buffer {
  const wfStr = 'workflow\0' + workflowJson;

  // PNG signature
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk (13 bytes: width, height, bit depth, color type, etc.)
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(512, 0);  // width
  ihdrData.writeUInt32BE(512, 4);  // height
  ihdrData.writeUInt8(8, 8);       // bit depth
  ihdrData.writeUInt8(2, 9);       // color type (RGB)
  ihdrData.writeUInt8(0, 10);      // compression
  ihdrData.writeUInt8(0, 11);      // filter
  ihdrData.writeUInt8(0, 12);      // interlace

  // IEND chunk
  const makeChunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeB = Buffer.from(type, 'ascii');
    const crc = crc32(Buffer.concat([typeB, data]));
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc >>> 0, 0);
    return Buffer.concat([len, typeB, data, crcBuf]);
  };

  const tEXtData = Buffer.from(wfStr, 'latin1');
  const ihdrChunk = makeChunk('IHDR', ihdrData);
  const textChunk = makeChunk('tEXt', tEXtData);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdrChunk, textChunk, iendChunk]);
}

// Simple CRC32 implementation for test PNG generation
function crc32(buf: Buffer): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      if (crc & 1) crc = (crc >>> 1) ^ 0xEDB88320;
      else crc >>>= 1;
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// Minimal ComfyUI workflow JSON
const validWorkflow = JSON.stringify({
  nodes: [
    {
      type: 'CheckpointLoaderSimple',
      widgets_values: ['dreamshaper_8.safetensors'],
    },
    {
      type: 'CLIPTextEncode',
      title: 'positive prompt',
      widgets_values: ['a beautiful landscape'],
    },
    {
      type: 'CLIPTextEncode',
      title: 'negative prompt',
      widgets_values: ['ugly, blurry'],
    },
    {
      type: 'KSampler',
        widgets_values: ['euler_ancestral', 20, 'karras', 7.5, 1234567890],
    },
    {
      type: 'EmptyLatentImage',
      widgets_values: [512, 768],
    },
  ],
});

describe('extractMetadata', () => {
  it('extracts model, sampler, steps, cfg, seed from a valid workflow PNG', () => {
    const buf = makeTestPng(validWorkflow);
    // Write to temp file for the test
    const fs = require('fs');
    const path = require('path');
    const tmpPath = path.join(require('os').tmpdir(), 'test_comfyui_workflow.png');
    fs.writeFileSync(tmpPath, buf);

    try {
      const result = extractMetadata(tmpPath);
      expect(result).not.toBeNull();
      expect(result!.model).toBe('dreamshaper_8.safetensors');
      expect(result!.sampler).toBe('euler_ancestral');
      expect(result!.steps).toBe(20);
      expect(result!.cfg).toBe(7.5);
      expect(result!.seed).toBe(1234567890);
      expect(result!.width).toBe(512);
      expect(result!.height).toBe(768);
      expect(result!.positive).toBe('a beautiful landscape');
      expect(result!.negative).toBe('ugly, blurry');
    } finally {
      try { fs.unlinkSync(tmpPath); } catch {}
    }
  });

  it('returns null for non-PNG files', () => {
    const fs = require('fs');
    const path = require('path');
    const tmpPath = path.join(require('os').tmpdir(), 'test_not_png.txt');
    fs.writeFileSync(tmpPath, 'hello world');

    try {
      const result = extractMetadata(tmpPath);
      expect(result).toBeNull();
    } finally {
      try { fs.unlinkSync(tmpPath); } catch {}
    }
  });

  it('returns null for PNG without workflow metadata', () => {
    // PNG with only IHDR + IEND, no tEXt
    const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdrData = Buffer.alloc(13);
    ihdrData.writeUInt32BE(512, 0);
    ihdrData.writeUInt32BE(512, 4);
    ihdrData.writeUInt8(8, 8);
    ihdrData.writeUInt8(2, 9);
    ihdrData.writeUInt8(0, 10);
    ihdrData.writeUInt8(0, 11);
    ihdrData.writeUInt8(0, 12);

    const makeChunk = (type: string, data: Buffer): Buffer => {
      const len = Buffer.alloc(4);
      len.writeUInt32BE(data.length, 0);
      const typeB = Buffer.from(type, 'ascii');
      const c = crc32(Buffer.concat([typeB, data]));
      const crcBuf = Buffer.alloc(4);
      crcBuf.writeUInt32BE(c >>> 0, 0);
      return Buffer.concat([len, typeB, data, crcBuf]);
    };

    const buf = Buffer.concat([sig, makeChunk('IHDR', ihdrData), makeChunk('IEND', Buffer.alloc(0))]);

    const fs = require('fs');
    const path = require('path');
    const tmpPath = path.join(require('os').tmpdir(), 'test_no_meta.png');
    fs.writeFileSync(tmpPath, buf);

    try {
      const result = extractMetadata(tmpPath);
      expect(result).toBeNull();
    } finally {
      try { fs.unlinkSync(tmpPath); } catch {}
    }
  });

  it('returns object with empty strings for empty workflow', () => {
    const wf = JSON.stringify({ nodes: [] });
    const buf = makeTestPng(wf);
    const fs = require('fs');
    const path = require('path');
    const tmpPath = path.join(require('os').tmpdir(), 'test_empty_wf.png');
    fs.writeFileSync(tmpPath, buf);

    try {
      const result = extractMetadata(tmpPath);
      expect(result).not.toBeNull();
      expect(result!.model).toBe('');
      expect(result!.positive).toBe('');
      expect(result!.negative).toBe('');
    } finally {
      try { fs.unlinkSync(tmpPath); } catch {}
    }
  });
});
