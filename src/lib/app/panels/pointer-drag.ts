// A drag with the pointer (mouse, pen, finger) on an element of the color panel: the
// element keeps the pointer until it is released, even outside it.

export interface PointerDrag {
  /** The position in the element, 0 to 1 on each axis; `down` on the first one. */
  update(x: number, y: number, down: boolean): void;
  /** Positions outside the element are brought back to its edges. True by default. */
  clamped?: boolean;
  onstart?(): void;
  onend?(): void;
}

const clamp = (x: number) => Math.min(1, Math.max(0, x));

/** The event handlers to spread on the element. */
export function pointerDrag({ update, clamped = true, onstart, onend }: PointerDrag) {
  const at = (e: PointerEvent, down: boolean) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    update(clamped ? clamp(x) : x, clamped ? clamp(y) : y, down);
  };
  let dragging = false;
  const stop = () => {
    if (!dragging) {
      return;
    }
    dragging = false;
    onend?.();
  };
  return {
    onpointerdown(e: PointerEvent) {
      if (e.button !== 0) {
        return;
      }
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      dragging = true;
      onstart?.();
      at(e, true);
    },
    onpointermove(e: PointerEvent) {
      if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
        at(e, false);
      }
    },
    onpointerup: stop,
    onlostpointercapture: stop,
  };
}
