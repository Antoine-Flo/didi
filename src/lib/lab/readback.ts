// Reads pixels of a render texture back from the GPU, synchronously or asynchronously.
// Used by the render lab page to measure the cost of GPU → CPU transfers.

import type {
  GlRenderTarget,
  GlRenderTargetAdaptor,
  Rectangle,
  Texture,
  WebGLRenderer,
} from "pixi.js";

export interface ReadResult {
  /** Time the main thread was blocked, in ms. */
  blocked: number;
  /** Time until the pixels were available, in ms. */
  total: number;
  pixels: Uint8Array;
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

// Binds the texture's framebuffer through Pixi, so its state cache stays coherent.
function bindForRead(renderer: WebGLRenderer, texture: Texture) {
  const target = renderer.renderTarget.getRenderTarget(texture);
  const glTarget = renderer.renderTarget.getGpuRenderTarget(target) as GlRenderTarget;
  const adaptor = renderer.renderTarget.adaptor as unknown as GlRenderTargetAdaptor;
  adaptor.bindFramebuffer(glTarget.resolveTargetFramebuffer);
}

/** Blocking read: waits for all pending GPU work, then copies the pixels. */
export function readSync(renderer: WebGLRenderer, texture: Texture, frame: Rectangle): ReadResult {
  const gl = renderer.gl;
  const start = performance.now();
  const pixels = new Uint8Array(frame.width * frame.height * 4);
  bindForRead(renderer, texture);
  gl.readPixels(frame.x, frame.y, frame.width, frame.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  const elapsed = performance.now() - start;
  return { blocked: elapsed, total: elapsed, pixels };
}

/**
 * Non-blocking read: the copy goes into a GPU buffer, and we poll a fence each frame
 * until it is done, so the main thread never waits for the GPU.
 */
export async function readAsync(
  renderer: WebGLRenderer,
  texture: Texture,
  frame: Rectangle,
): Promise<ReadResult> {
  const gl = renderer.gl;
  const size = frame.width * frame.height * 4;
  const start = performance.now();

  bindForRead(renderer, texture);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer);
  gl.bufferData(gl.PIXEL_PACK_BUFFER, size, gl.STREAM_READ);
  gl.readPixels(frame.x, frame.y, frame.width, frame.height, gl.RGBA, gl.UNSIGNED_BYTE, 0);
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
  const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)!;
  gl.flush();
  let blocked = performance.now() - start;

  while (gl.getSyncParameter(fence, gl.SYNC_STATUS) !== gl.SIGNALED) {
    await nextFrame();
  }

  const copyStart = performance.now();
  const pixels = new Uint8Array(size);
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer);
  gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, pixels);
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
  blocked += performance.now() - copyStart;

  gl.deleteSync(fence);
  gl.deleteBuffer(buffer);
  return { blocked, total: performance.now() - start, pixels };
}
