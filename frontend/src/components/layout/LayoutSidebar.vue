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
  background: #ffffff;
  border: 1px solid #d0d7de;
  border-right: 0;
  border-radius: 12px 0 0 12px;
}

button {
  width: 40px;
  height: 40px;
  border: 1px solid #d0d7de;
  border-radius: 10px;
  background: #f6f8fa;
  color: #1f2328;
  font: 600 0.78rem/1 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
  cursor: pointer;
}

button :deep(svg) {
  font-size: 1.1rem;
}

button:hover {
  background: #eef2f6;
}

button.active {
  background: #dbeafe;
  border-color: #3b82f6;
  color: #1e3a8a;
}

@media (max-width: 760px) {
  .sidebar {
    display: none;
  }
}
</style>

