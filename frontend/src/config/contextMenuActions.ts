export type ContextMenuTarget = "element" | "canvas";

export type ContextMenuActionId =
  | "duplicate"
  | "copy"
  | "paste"
  | "delete"
  | "toggleLock"
  | "toggleGrid"
  | "toggleSnap"
  | "selectAll";

export type ContextMenuActionDefinition = {
  id: ContextMenuActionId;
  target: ContextMenuTarget;
  variant?: "default" | "danger";
};

export const CONTEXT_MENU_ACTIONS: ContextMenuActionDefinition[] = [
  { id: "duplicate", target: "element" },
  { id: "copy", target: "element" },
  { id: "paste", target: "element" },
  { id: "delete", target: "element", variant: "danger" },
  { id: "toggleLock", target: "element" },
  { id: "toggleGrid", target: "canvas" },
  { id: "toggleSnap", target: "canvas" },
  { id: "selectAll", target: "canvas" },
  { id: "paste", target: "canvas" },
];
