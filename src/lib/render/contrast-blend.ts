// A blend mode that stays visible on anything: what is under it gets darker if it is light,
// lighter if it is dark. Needs `useBackBuffer` on the renderer, like any shader blend mode.

import { BlendModeFilter, ExtensionType, extensions, type BLEND_MODES } from "pixi.js";

export const CONTRAST_BLEND = "contrast" as BLEND_MODES;

class ContrastBlend extends BlendModeFilter {
  static extension = { name: CONTRAST_BLEND, type: ExtensionType.BlendMode };

  constructor() {
    super({
      gl: {
        functions: `
          vec3 contrast(vec3 base, float amount) {
            float light = dot(base, vec3(0.299, 0.587, 0.114));
            return mix(base, light > 0.5 ? vec3(0.0) : vec3(1.0), amount);
          }
        `,
        main: `finalColor = vec4(contrast(back.rgb, front.a * 0.5), blendedAlpha) * uBlend;`,
      },
      gpu: {
        functions: `
          fn contrast(base: vec3<f32>, amount: f32) -> vec3<f32> {
            let light = dot(base, vec3<f32>(0.299, 0.587, 0.114));
            let target_color = select(vec3<f32>(1.0), vec3<f32>(0.0), light > 0.5);
            return mix(base, target_color, vec3<f32>(amount));
          }
        `,
        main: `out = vec4<f32>(contrast(back.rgb, front.a * 0.5), blendedAlpha) * blendUniforms.uBlend;`,
      },
    });
    // Each screen pixel, on any display.
    this.resolution = "inherit";
  }
}

extensions.add(ContrastBlend);
