// What the render lab page shows about the GPU.

import type { Renderer } from "pixi.js";

export interface GpuInfo {
  renderer: string;
  gpu: string;
  maxTexture: number;
}

export function readGpuInfo(renderer: Renderer): GpuInfo {
  const info: GpuInfo = { renderer: "-", gpu: "-", maxTexture: 0 };
  const gl = (renderer as unknown as { gl?: WebGL2RenderingContext }).gl;
  info.renderer = renderer.name;
  if (!gl) {
    return info;
  }
  info.maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  info.gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  return info;
}
