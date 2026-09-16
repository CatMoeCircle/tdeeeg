<template>
  <Teleport to="body">
    <div v-if="visible" class="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      @mousedown.self="onClose">
      <div class="absolute inset-0 bg-black/40 backdrop-blur-sm"></div>
      <div
        class="relative w-full max-w-sm max-h-[min(720px,90vh)] flex flex-col rounded-2xl bg-white dark:bg-gray-800 shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden">
        <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700 shrink-0">
          <h3 class="text-base font-semibold text-gray-900 dark:text-gray-100">
            {{ t('secretChat.encryptionKeyTitle') }}
          </h3>
          <button type="button" :aria-label="t('lng_close')"
            class="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
            @click="onClose">
            <XIcon class="w-4 h-4" />
          </button>
        </div>

        <div class="flex-1 overflow-y-auto custom-scrollbar px-5 py-4">
          <div class="flex flex-col items-center">
            <canvas ref="canvasEl" width="192" height="192"
              class="rounded-lg border border-gray-200 dark:border-gray-600 bg-white"
              style="image-rendering: pixelated" />

            <!-- 密钥 hex：32 字节，4 行 × 8 组，行中留空隙 -->
            <div class="mt-4 w-full font-mono text-[13px] leading-5 text-gray-800 dark:text-gray-100 select-all">
              <div v-for="(row, i) in hexRows" :key="i" class="flex justify-center gap-x-4">
                <span v-for="(group, j) in row" :key="j" class="tracking-wide">{{ group }}</span>
              </div>
            </div>

            <p class="mt-4 text-sm text-gray-700 dark:text-gray-300 leading-relaxed text-center">
              {{ t('secretChat.encryptionKeyDesc', { name: partnerName }) }}
            </p>
            <p class="mt-3 text-sm text-gray-700 dark:text-gray-300 leading-relaxed text-center">
              {{ t('secretChat.encryptionKeyHint', { name: partnerName }) }}
            </p>
            <button type="button"
              class="mt-4 text-sm text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
              @click="openLearnMore">
              {{ t('secretChat.encryptionKeyLearnMore') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { X as XIcon } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import { confirmAndOpenExternalLink } from '../../utils/openExternalLink';

const props = defineProps<{
  visible: boolean;
  /** secretChat.key_hash（base64） */
  keyHash: string;
  partnerName: string;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
}>();

const { t } = useI18n();
const canvasEl = ref<HTMLCanvasElement | null>(null);

/** TDLib 固定 4 色：白 / 浅蓝 / 深蓝 / 亮蓝 */
const IDENTICON_COLORS = ['#FFFFFF', '#D5E6F3', '#2D5775', '#2F99C9'];

function decodeBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** 前 32 字节 → 4 行 × 2 组（每组 4 hex） */
const hexRows = computed(() => {
  try {
    const bytes = decodeBase64(props.keyHash);
    const hexes: string[] = [];
    for (let i = 0; i < Math.min(32, bytes.length); i++) {
      hexes.push(bytes[i].toString(16).padStart(2, '0').toUpperCase());
    }
    while (hexes.length < 32) hexes.push('00');
    const rows: string[][] = [];
    for (let r = 0; r < 4; r++) {
      const slice = hexes.slice(r * 8, r * 8 + 8);
      rows.push([slice.slice(0, 4).join(' '), slice.slice(4, 8).join(' ')]);
    }
    return rows;
  } catch {
    return [];
  }
});

/**
 * Unigram / TDLib Identicon：
 * - hash 16 字节 → 8×8，否则 12×12
 * - 按顺序每次取 2 bit 作颜色索引（字节内 LSB 优先）
 */
function drawIdenticon() {
  const canvas = canvasEl.value;
  if (!canvas || !props.keyHash) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let hash: Uint8Array;
  try {
    hash = decodeBase64(props.keyHash);
  } catch {
    return;
  }

  const gridSize = hash.length <= 16 ? 8 : 12;
  const size = 192;
  const cell = size / gridSize;

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = IDENTICON_COLORS[0];
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < gridSize * gridSize; i++) {
    const byteIndex = i >> 2;
    if (byteIndex >= hash.length) break;
    const colorIdx = (hash[byteIndex] >> ((i % 4) * 2)) & 0x3;
    const col = i % gridSize;
    const row = Math.floor(i / gridSize);
    ctx.fillStyle = IDENTICON_COLORS[colorIdx] || IDENTICON_COLORS[0];
    ctx.fillRect(col * cell, row * cell, Math.ceil(cell), Math.ceil(cell));
  }
}

function onClose() {
  emit('update:visible', false);
}

function openLearnMore() {
  void confirmAndOpenExternalLink('https://telegram.org/').catch(() => { });
}

watch(
  () => props.visible,
  (v) => {
    if (!v) return;
    void nextTick(() => drawIdenticon());
  },
);

watch(
  () => props.keyHash,
  () => {
    if (props.visible) void nextTick(() => drawIdenticon());
  },
);
</script>
