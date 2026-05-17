/**
 * embeddings.ts — local sentence embeddings via @xenova/transformers.
 *
 * Model: Xenova/all-MiniLM-L6-v2 (384 dims, ~25MB, ONNX-backed).
 * Lazy-loaded on first call; subsequent calls reuse the same pipeline.
 *
 * No API calls. The model file is cached under
 * ~/.cache/transformers/Xenova/all-MiniLM-L6-v2/ on first download.
 */

import { pipeline, type FeatureExtractionPipeline } from "@xenova/transformers";

let _pipe: FeatureExtractionPipeline | null = null;

async function getPipe(): Promise<FeatureExtractionPipeline> {
  if (_pipe) return _pipe;
  _pipe = (await pipeline(
    "feature-extraction",
    "Xenova/all-MiniLM-L6-v2",
  )) as FeatureExtractionPipeline;
  return _pipe;
}

export async function embed(text: string): Promise<Float32Array> {
  const pipe = await getPipe();
  const out = await pipe(text, { pooling: "mean", normalize: true });
  // out.data is the flattened tensor; for a single string with mean pooling
  // it has shape [1, 384] flattened to length 384.
  return out.data as Float32Array;
}

export function cosine(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`cosine: length mismatch (${a.length} vs ${b.length})`);
  }
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}
