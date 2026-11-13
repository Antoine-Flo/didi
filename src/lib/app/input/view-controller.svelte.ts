// The canvas's view, driven by the editor: the commands (fit, zoom, turn, mirror) and the size
// dialog's preview go through here, and the camera is followed here. The canvas shown
// (CanvasView) attaches to it while it is mounted; until then, the commands do nothing.

import { ViewNavigation, type Insets } from "#lib/app/input/view-navigation.js";
import type { ViewControls } from "#lib/app/commands/view-commands.js";
import type { Camera } from "#lib/render/camera.js";
import type { DrawingView } from "#lib/render/drawing-view.js";

export type ResizePreview = Parameters<DrawingView["setResizePreview"]>[0];

export interface ViewControllerHost {
  /** The canvas's size, to fit it. */
  canvas(): { width: number; height: number };
  /** Panels over the view: fitting and zooming use the area between them. */
  insets(): Insets | undefined;
}

/** The canvas shown, attached to the controller. */
export interface ViewTarget {
  /** Its size, in window pixels. */
  size(): { width: number; height: number };
  /** Shows the drawing through `camera`. */
  show(camera: Camera): void;
  previewResize(preview: ResizePreview): void;
}

const START: Camera = { x: 0, y: 0, zoom: 1, rotation: 0 };

export class ViewController implements ViewControls {
  /** Moves the view: the commands, and the canvas's own gestures (see CanvasInput). */
  readonly navigation: ViewNavigation;
  private cameraNow = $state.raw<Camera>(START);
  private target: ViewTarget | null = null;

  constructor(private readonly host: ViewControllerHost) {
    this.navigation = new ViewNavigation({
      size: () => this.target?.size() ?? { width: 0, height: 0 },
      insets: () => host.insets(),
      changed: (camera) => {
        this.cameraNow = camera;
        this.target?.show(camera);
      },
    });
  }

  /** How the drawing is seen now. */
  get camera(): Camera {
    return this.cameraNow;
  }

  /**
   * Shows the view through `target`, from the start: a new canvas (another document, a new
   * size) is not seen turned or mirrored. Returns what detaches it.
   */
  attach(target: ViewTarget): () => void {
    this.target = target;
    this.navigation.set(START);
    return () => {
      if (this.target === target) {
        this.target = null;
      }
    };
  }

  /** Fits the canvas in the view, unturned; a mirrored view stays mirrored. */
  fitView() {
    if (this.target) {
      this.navigation.fit(this.host.canvas());
    }
  }

  /** One step in (1) or out (-1), around the center of the view. */
  zoomStep(direction: 1 | -1) {
    if (this.target) {
      this.navigation.zoomStep(direction);
    }
  }

  /** Sets the zoom to an absolute value (the nearest level in pixel art), around the center. */
  zoomTo(zoom: number) {
    if (this.target) {
      this.navigation.zoomTo(zoom);
    }
  }

  rotateBy(angle: number) {
    if (this.target) {
      this.navigation.rotateBy(angle);
    }
  }

  resetRotation() {
    if (this.target) {
      this.navigation.resetRotation();
    }
  }

  /** Shows the drawing reversed, left to right, or back: the drawing doesn't change. */
  mirrorView() {
    if (this.target) {
      this.navigation.mirror();
    }
  }

  /** Shows the document's new size while the size dialog is open; null when it closes. */
  previewResize(preview: ResizePreview) {
    this.target?.previewResize(preview);
  }
}
