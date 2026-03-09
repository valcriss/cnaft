<script setup lang="ts">
import LayoutTopbar from "./layout/LayoutTopbar.vue";
import LayoutSidebar from "./layout/LayoutSidebar.vue";
import CanvasStage from "./canvas/CanvasStage.vue";
import { ref, watch } from "vue";
import { useCanvasStore } from "../stores/useCanvasStore";

const props = withDefaults(
  defineProps<{
    title?: string;
    username: string;
    userAvatar?: string;
    userId?: string;
    timerSoundMp3?: string;
    timerSoundOgg?: string;
    titleEditable?: boolean;
  }>(),
  {
    title: "Canvas Notes",
    userAvatar: "",
    userId: "",
    timerSoundMp3: "",
    timerSoundOgg: "",
    titleEditable: false,
  },
);
const emits = defineEmits<{
  (event: "titleCommit", title: string): void;
}>();

const stageRef = ref<InstanceType<typeof CanvasStage> | null>(null);
const canvasStore = useCanvasStore();

watch(
  () => [props.timerSoundMp3, props.timerSoundOgg],
  ([mp3, ogg]) => {
    canvasStore.setTimerSoundSources(mp3, ogg);
  },
  { immediate: true },
);

watch(
  () => [props.username, props.userAvatar, props.userId],
  () => {
    canvasStore.setLocalIdentity(props.username, props.userAvatar ?? "", props.userId ?? "");
  },
  { immediate: true },
);

function exportPng() {
  stageRef.value?.exportAsPng();
}

function exportSvg() {
  stageRef.value?.exportAsSvg();
}

function onTitleCommit(title: string) {
  emits("titleCommit", title);
}
</script>

<template>
  <main class="workspace">
    <LayoutSidebar class="workspace-sidebar" />
    <LayoutTopbar
      class="workspace-topbar"
      :title="props.title"
      :title-editable="props.titleEditable"
      @title-commit="onTitleCommit"
      @export-png="exportPng"
      @export-svg="exportSvg"
    />
    <CanvasStage ref="stageRef" class="workspace-canvas" />
  </main>
</template>

<style scoped>
.workspace {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  grid-template-rows: 56px minmax(0, 1fr);
  column-gap: 0;
  padding: 12px;
  background: var(--color-bg-app-alt);
}

.workspace-sidebar {
  grid-column: 1;
  grid-row: 1 / span 2;
}

.workspace-topbar {
  grid-column: 2;
  grid-row: 1;
}

.workspace-canvas {
  grid-column: 2;
  grid-row: 2;
}

@media (max-width: 980px) {
  .workspace {
    grid-template-columns: 64px minmax(0, 1fr);
  }
}

@media (max-width: 760px) {
  .workspace {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: 56px minmax(0, 1fr);
  }

  .workspace-sidebar {
    display: none;
  }

  .workspace-topbar,
  .workspace-canvas {
    grid-column: 1;
  }

  .workspace-topbar {
    grid-row: 1;
  }

  .workspace-canvas {
    grid-row: 2;
  }
}
</style>
