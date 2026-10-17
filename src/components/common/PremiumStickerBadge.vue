<template>
    <!-- 会员专属贴纸角标：圆形灰半透明底 + 白色会员星标 -->
    <span class="premium-sticker-badge">
        <PremiumStatusIcon class="premium-sticker-star" />
    </span>
</template>

<script setup lang="ts">
import PremiumStatusIcon from './PremiumStatusIcon.vue';
</script>

<style scoped>
.premium-sticker-badge {
    position: absolute;
    top: 2px;
    right: 2px;
    z-index: 2;
    display: grid;
    place-items: center;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.45);
    overflow: hidden;
    pointer-events: none;
}

.premium-sticker-star {
    font-size: 10px;
    line-height: 1;
}

/* 星标改白色（子组件默认品牌色，双类选择器提高特指度覆盖 scoped ::before） */
.premium-sticker-star.premium-sticker-star::before {
    color: #fff;
}
</style>
