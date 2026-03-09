<script setup lang="ts">
import { useCanvasStore } from "../../stores/useCanvasStore";
import { ADDABLE_ELEMENTS } from "../../config/elementCatalog";

const canvas = useCanvasStore();

const tools = [
  { id: "select", icon: "arrow-pointer", title: "Select tool (V)" },
  ...ADDABLE_ELEMENTS.map((element) => ({
    id: element.id,
    icon: element.icon,
    title:
      element.id === "rectangle"
        ? "Rectangle tool (R)"
        : element.id === "text"
          ? "Text tool (T)"
          : element.id === "note"
            ? "Square note tool (N)"
            : element.id === "line"
              ? "Line tool (L)"
              : element.id === "image"
                ? "Image tool (I)"
                : "Envelope tool (E)",
  })),
] as const;
</script>

<template>
  <aside class="sidebar" aria-label="Drawing tools">
    <button
      v-for="tool in tools"
      :key="tool.id"
      type="button"
      :aria-label="tool.title"
      :class="{ active: canvas.state.tool === tool.id }"
      @click="canvas.setTool(tool.id)"
    >
      <font-awesome-icon :icon="tool.icon" />
    </button>
  </aside>
</template>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 10px 8px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-strong);
  border-right: 0;
  border-radius: 12px 0 0 12px;
}

button {
  width: 40px;
  height: 40px;
  border: 1px solid var(--color-border-strong);
  border-radius: 10px;
  background: var(--color-button-bg);
  color: var(--color-text-primary);
  font: 600 0.78rem/1 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
  cursor: pointer;
}

button :deep(svg) {
  font-size: 1.1rem;
}

button:hover {
  background: var(--color-button-hover);
}

button.active {
  background: var(--color-bg-selected);
  border-color: var(--color-border-primary);
  color: var(--color-text-accent);
}

@media (max-width: 760px) {
  .sidebar {
    display: none;
  }
}
</style>

