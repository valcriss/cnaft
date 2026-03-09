<script setup lang="ts">
import { computed } from "vue";
import { useCanvasStore } from "../../stores/useCanvasStore";

const canvas = useCanvasStore();
const selectedCount = computed(() => canvas.state.selectedIds.length);

const selectedType = computed(() => {
  if (selectedCount.value === 0) return "Aucun";
  if (selectedCount.value > 1) return "Multiple";

  if (!canvas.selectedElement.value) return "Aucun";
  if (canvas.selectedElement.value.type === "rectangle") return "Rectangle";
  if (canvas.selectedElement.value.type === "text") return "Texte";
  return "Note";
});

function onFillInput(event: Event) {
  const target = event.target as HTMLInputElement;
  canvas.updateSelectedFill(target.value);
}

function onStrokeInput(event: Event) {
  const target = event.target as HTMLInputElement;
  canvas.updateSelectedStroke(target.value);
}
</script>

<template>
  <aside class="inspector" aria-label="Properties panel">
    <h2>Proprietes</h2>
    <div class="row">
      <span>Selection</span>
      <span>{{ selectedType }} ({{ selectedCount }})</span>
    </div>
    <div class="row">
      <span>Elements</span>
      <span>{{ canvas.state.elements.length }}</span>
    </div>
    <div class="row">
      <span>Couleur</span>
      <input
        type="color"
        :disabled="selectedCount === 0"
        :value="canvas.selectedElement.value?.fill ?? '#000000'"
        @input="onFillInput"
      />
    </div>
    <div class="row">
      <span>Contour</span>
      <input
        type="color"
        :disabled="selectedCount === 0"
        :value="canvas.selectedElement.value?.stroke ?? '#000000'"
        @input="onStrokeInput"
      />
    </div>
    <button type="button" :disabled="selectedCount === 0" @click="canvas.deleteSelected">
      Supprimer
    </button>
  </aside>
</template>

<style scoped>
.inspector {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-strong);
  border-radius: 12px;
  padding: 12px;
  color: var(--color-text-primary);
  font: 500 0.84rem/1.3 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
}

h2 {
  margin: 0 0 12px;
  font-size: 0.9rem;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  border-top: 1px solid var(--color-border-muted);
}

.row:first-of-type {
  border-top: 0;
}

input[type="color"] {
  width: 32px;
  height: 24px;
  border: 0;
  background: transparent;
  padding: 0;
}

button {
  margin-top: 10px;
  width: 100%;
  border: 1px solid var(--color-border-strong);
  border-radius: 8px;
  background: var(--color-button-bg);
  color: var(--color-text-primary);
  padding: 8px 10px;
  cursor: pointer;
}

button:hover:not(:disabled) {
  background: var(--color-button-hover);
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 980px) {
  .inspector {
    display: none;
  }
}
</style>

