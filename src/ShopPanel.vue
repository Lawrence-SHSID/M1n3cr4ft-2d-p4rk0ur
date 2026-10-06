<script setup lang="ts">
import { SHOP, type ItemId, type Wallet } from './game/economy'
defineProps<{ wallet: Wallet; error: string; message: string }>()
const emit = defineEmits<{ buy: [id: ItemId]; back: [] }>()
</script>
<template>
  <section class="shop-page" aria-label="Coin shop">
    <div class="builder-heading"><div><span class="eyebrow">A LITTLE HELP FOR YOUR NEXT LEAP</span><h1>The coin shop<span>.</span></h1><p>Finish new levels. Earn coins. Pack something useful.</p></div><button class="secondary-button" @click="emit('back')">← Back</button></div>
    <div class="shop-wallet"><span class="coin-icon">●</span><strong>{{ wallet.coins }} coins</strong><span>Saved in this browser</span></div>
    <p class="shop-message" role="status">{{ error || message }}</p>
    <div class="shop-grid"><article v-for="item in SHOP" :key="item.id" class="shop-card"><span :class="['shop-item-icon', item.id]">{{ item.icon }}</span><h2>{{ item.name }}</h2><p>{{ item.description }}</p><span class="shop-owned">In your bag: {{ wallet.inventory[item.id] }}</span><button class="primary-button" :aria-label="`Buy ${item.name}`" :disabled="!!error || wallet.coins < item.price" @click="emit('buy', item.id)">Buy · {{ item.price }} {{ item.price === 1 ? 'coin' : 'coins' }}</button></article></div>
    <div class="shop-rewards"><h2>Every new finish pays.</h2><p>Levels 1–5: <strong>5 coins</strong> · 6–10: <strong>8 coins</strong> · 11–15: <strong>11 coins</strong> · 16–20: <strong>14 coins</strong> · 21–25: <strong>17 coins</strong>…</p><p>The reward rises by 3 every five levels. Each numbered level pays once across all modes. Replays and your editor levels are for fun.</p></div>
  </section>
</template>
