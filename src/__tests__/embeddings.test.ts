import { test, expect } from "bun:test";
import { embed, cosine } from "../embeddings";

test("embed returns a 384-dim vector for short text", async () => {
  const v = await embed("hello world");
  expect(v).toBeInstanceOf(Float32Array);
  expect(v.length).toBe(384);
});

test("semantically similar text has higher cosine than dissimilar text", async () => {
  const dog = await embed("a small brown dog runs in the park");
  const puppy = await embed("a tiny puppy plays on the grass");
  const banking = await embed("interest rates dropped on Tuesday");
  const simNear = cosine(dog, puppy);
  const simFar = cosine(dog, banking);
  expect(simNear).toBeGreaterThan(simFar);
  expect(simNear).toBeGreaterThan(0.4); // loose floor — model-dependent
});
