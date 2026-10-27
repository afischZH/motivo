"use client";

import { useRef, type MouseEvent, type PointerEvent } from "react";

export interface BackdropCloseHandlers {
  onPointerDown(event: PointerEvent<HTMLDialogElement>): void;
  onClick(event: MouseEvent<HTMLDialogElement>): void;
}

/**
 * Closes a modal `<dialog>` on a backdrop click. A click on the backdrop
 * targets the dialog element itself, but so does the click that ends a drag
 * started inside the dialog (e.g. selecting text in a field and releasing
 * outside). Only a press that also started on the dialog element counts.
 */
export function useBackdropClose(onClose: () => void): BackdropCloseHandlers {
  const pressedOnBackdrop = useRef(false);
  return {
    onPointerDown(event) {
      pressedOnBackdrop.current = event.target === event.currentTarget;
    },
    onClick(event) {
      const startedOnBackdrop = pressedOnBackdrop.current;
      pressedOnBackdrop.current = false;
      if (startedOnBackdrop && event.target === event.currentTarget) onClose();
    },
  };
}
