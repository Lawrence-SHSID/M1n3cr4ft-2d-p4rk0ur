<script setup lang="ts">
import type { SkinId } from '../shared/types'
import { SKINS } from './game/appearance'
defineProps<{ modelValue: SkinId; label: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: SkinId] }>()
</script>
<template>
  <fieldset class="skin-picker">
    <legend>{{ label }} skin</legend>
    <div class="skin-options">
      <button v-for="skin in SKINS" :key="skin.id" :aria-label="`${label} skin: ${skin.name}`" :aria-pressed="modelValue === skin.id" @click="emit('update:modelValue', skin.id)">
        <img v-if="skin.image" :src="skin.image" alt="" />
        <span v-else :class="['default-skin-icon', skin.id]">{{ skin.id === 'alex' ? 'A' : 'S' }}</span>
        <span>{{ skin.name }}</span>
      </button>
    </div>
  </fieldset>
</template>
<style scoped>
.skin-picker { margin: 0; border: 0; padding: 0; min-width: 0; }
legend { font-size: 11px; font-weight: 700; color: #617361; padding: 0 0 8px; }
.skin-options { display: flex; gap: 8px; flex-wrap: wrap; }
button { display: flex; align-items: center; gap: 7px; border: 1px solid #e1e6dc; border-radius: 8px; background: #f7f8f2; padding: 5px 10px; color: #526553; font: inherit; font-size: 12px; cursor: pointer; }
button[aria-pressed='true'] { background: #e4efd9; border-color: #7c9a61; box-shadow: inset 0 0 0 1px #7c9a61; }
img { width: 23px; height: 33px; object-fit: contain; image-rendering: pixelated; }
.default-skin-icon { width: 23px; height: 33px; display: grid; place-items: center; color: white; background: #40a4aa; font-weight: 800; }
.default-skin-icon.alex { background: #85a760; }
</style>
