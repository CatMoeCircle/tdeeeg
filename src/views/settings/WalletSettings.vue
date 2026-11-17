<template>
    <div class="h-full flex flex-col">
        <!-- 顶部返回栏：返回设置列表，右侧刷新 + 更多（助记词 / 云端备份 / 免手续费额度） -->
        <div class="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3 shrink-0">
            <button type="button" class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                @click="goBack">
                <ChevronLeftIcon class="w-5 h-5 text-gray-500" />
            </button>
            <h2 class="text-lg font-semibold">{{ t('walletPage.title') }}</h2>
            <div class="ml-auto flex items-center gap-1">
                <button type="button"
                    class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
                    :disabled="refreshing || loading" :title="t('walletPage.refresh')" @click="refresh">
                    <RefreshCwIcon class="w-4 h-4 text-gray-500" :class="{ 'animate-spin': refreshing }" />
                </button>
                <div class="relative">
                    <button type="button"
                        class="p-2 rounded-full transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                        :class="{ 'bg-gray-100 dark:bg-gray-800': moreOpen }" :title="t('walletPage.more')"
                        :aria-expanded="moreOpen" @click="moreOpen = !moreOpen">
                        <MoreIcon class="w-4 h-4 text-gray-500" />
                    </button>

                    <template v-if="moreOpen">
                        <div class="fixed inset-0 z-40" @click="moreOpen = false"></div>
                        <div
                            class="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800">
                            <button type="button"
                                class="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-200 dark:hover:bg-gray-700/50"
                                :disabled="!canExportPhrase" @click="openPhrase">
                                <KeyRoundIcon class="w-4 h-4 shrink-0 text-gray-400" />
                                <span>{{ t('walletPage.actions.backupPhrase') }}</span>
                            </button>
                            <button type="button"
                                class="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-200 dark:hover:bg-gray-700/50"
                                :disabled="!address" @click="copyAddress">
                                <CopyIcon class="w-4 h-4 shrink-0 text-gray-400" />
                                <span>{{ addressCopied ? t('walletPage.common.copied') : t('walletPage.copyAddress') }}</span>
                            </button>
                            <div class="border-t border-gray-100 px-4 py-2.5 dark:border-gray-700/70">
                                <p class="text-xs text-gray-400">
                                    <span class="text-gray-500 dark:text-gray-300">{{ t('walletPage.backup.statusLabel') }}</span>
                                    {{ walletState?.isBackupEnabled ? t('walletPage.backup.enabled') : t('walletPage.backup.disabled') }}
                                </p>
                                <p v-if="gasless && gasless.leftCount > 0" class="mt-1 text-xs text-[var(--app-brand)]">
                                    {{ t('walletPage.gasless.left', { count: gasless.leftCount }) }}
                                </p>
                            </div>
                        </div>
                    </template>
                </div>
            </div>
        </div>

        <div class="flex-1 overflow-y-auto custom-scrollbar" v-smooth-wheel>
            <div class="w-full max-w-2xl mx-auto px-4 sm:px-6 py-5 space-y-5">
                <p v-if="errorText" class="text-xs text-red-500 break-words">{{ errorText }}</p>

                <!-- 首次加载 -->
                <LoadingSkeleton v-if="loading" variant="form" :rows="4" :label="t('walletPage.loading')" />

                <!-- 账号不支持 Gram 钱包（can_use_ton_wallet = false） -->
                <section v-else-if="walletUnavailable"
                    class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md px-6 py-10 text-center">
                    <ShieldAlertIcon class="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600" />
                    <h3 class="mt-3 text-sm font-semibold text-gray-800 dark:text-gray-100">
                        {{ t('walletPage.unavailableTitle') }}
                    </h3>
                    <p class="mt-1.5 text-xs leading-snug text-gray-400 max-w-sm mx-auto">
                        {{ t('walletPage.unavailableDesc') }}
                    </p>
                    <BaseButton class="mt-4" size="sm" type="button" @click="load">
                        {{ t('walletPage.retry') }}
                    </BaseButton>
                </section>

                <!-- 状态未确认：TDLib 超时未推送钱包状态，不能据此断言钱包不存在 -->
                <section v-else-if="walletUnconfirmed"
                    class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md px-6 py-10 text-center">
                    <ShieldAlertIcon class="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600" />
                    <h3 class="mt-3 text-sm font-semibold text-gray-800 dark:text-gray-100">
                        {{ t('walletPage.unconfirmedTitle') }}
                    </h3>
                    <p class="mt-1.5 text-xs leading-snug text-gray-400 max-w-sm mx-auto">
                        {{ t('walletPage.unconfirmedDesc') }}
                    </p>
                    <BaseButton class="mt-4" size="sm" type="button" @click="load">
                        {{ t('walletPage.retry') }}
                    </BaseButton>
                </section>

                <!-- 钱包尚未创建 -->
                <section v-else-if="walletMissing"
                    class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md px-6 py-10 text-center">
                    <TgGramColoredIcon class="mx-auto opacity-40" />
                    <h3 class="mt-3 text-sm font-semibold text-gray-800 dark:text-gray-100">
                        {{ t('walletPage.missingTitle') }}
                    </h3>
                    <p class="mt-1.5 text-xs leading-snug text-gray-400 max-w-sm mx-auto">
                        {{ t('walletPage.missingDesc') }}
                    </p>
                    <BaseButton class="mt-4" size="sm" type="button" @click="load">
                        {{ t('walletPage.retry') }}
                    </BaseButton>
                </section>

                <!-- 钱包正在创建 -->
                <section v-else-if="walletCreating"
                    class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md px-6 py-10 text-center">
                    <LoaderIcon class="w-9 h-9 mx-auto animate-spin text-[var(--app-brand)]" />
                    <h3 class="mt-3 text-sm font-semibold text-gray-800 dark:text-gray-100">
                        {{ t('walletPage.creatingTitle') }}
                    </h3>
                    <p class="mt-1.5 text-xs text-gray-400">{{ t('walletPage.creatingDesc') }}</p>
                    <BaseButton class="mt-4" size="sm" type="button" @click="load">
                        {{ t('walletPage.retry') }}
                    </BaseButton>
                </section>

                <template v-else>
                    <!-- 主视觉：钱包卡（地址 / 余额 / QR 芯片），宽度 min(400px, 100%) -->
                    <section class="relative flex justify-center">
                        <div
                            class="pointer-events-none absolute inset-x-8 top-3 h-40 rounded-full bg-blue-500/10 blur-3xl dark:bg-blue-400/10">
                        </div>
                        <div class="relative w-full max-w-[400px]">
                            <TonWalletCard :address="address" :balance="gramAmount" :name="cardName"
                                :stickers="cardStickers" :palette="cardPalette"
                                :symbol-sticker="cardSymbolSticker"
                                :actionable="!!address" :qr-label="t('walletPage.actions.receive')"
                                @qr-click="openReceive" />
                        </div>
                    </section>

                    <!-- 操作按钮：收款（品牌蓝实心）/ 转账（浅色描边），48px 高、8px 间距 -->
                    <section class="mx-auto grid w-full max-w-[400px] grid-cols-2 gap-2">
                        <button type="button"
                            class="flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--app-brand)] text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                            :disabled="!address" @click="openReceive">
                            <QrCodeIcon class="w-5 h-5" />
                            <span>{{ t('walletPage.actions.receive') }}</span>
                        </button>
                        <button type="button"
                            class="flex h-12 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white/70 text-sm font-semibold text-gray-700 backdrop-blur-md transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:bg-gray-800/70 dark:text-gray-200 dark:hover:bg-white/5"
                            :disabled="!address" @click="sendOpen = true">
                            <TgGramColoredIcon class="h-5 w-5" />
                            <span>{{ t('walletPage.actions.send') }}</span>
                        </button>
                    </section>

                    <!-- 交易记录 / 收藏品 Tab：仅当钱包里有收藏品时出现，滚动时吸顶 -->
                    <div v-if="nftTabAvailable" class="sticky top-0 z-20 -mx-4 px-4 py-2 backdrop-blur-md sm:-mx-6 sm:px-6"
                        :style="{ backgroundColor: 'color-mix(in srgb, var(--app-bg-elevated, #fff) 88%, transparent)' }">
                        <div
                            class="mx-auto flex w-full max-w-[400px] items-center gap-1 rounded-full border border-gray-200/70 bg-white/70 p-1 dark:border-gray-700/60 dark:bg-gray-800/70">
                            <button v-for="tab in walletTabs" :key="tab.id" type="button"
                                class="h-9 flex-1 rounded-full text-sm font-medium transition-colors" :class="activeTab === tab.id
                                    ? 'bg-blue-500 text-white shadow-sm shadow-blue-500/30'
                                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'"
                                @click="switchTab(tab.id)">
                                {{ t(tab.labelKey) }}
                            </button>
                        </div>
                    </div>

                    <!-- 交易记录 -->
                    <section v-if="activeTab === 'tx'">
                        <LoadingSkeleton v-if="txLoading" variant="list" :rows="3" avatar
                            :label="t('walletPage.tx.loading')" />
                        <p v-else-if="txError" class="text-xs text-red-500 break-words">{{ txError }}</p>
                        <p v-else-if="!transactions.length" class="py-10 text-center text-xs text-gray-400">
                            {{ t('walletPage.tx.empty') }}
                        </p>
                        <div v-else class="space-y-2">
                            <button v-for="item in transactions" :key="item.id" type="button"
                                class="flex w-full items-center gap-3 rounded-2xl border border-gray-200/70 bg-white/70 px-3 py-2.5 text-left backdrop-blur-md transition-colors hover:bg-black/5 dark:border-gray-700/60 dark:bg-gray-800/70 dark:hover:bg-white/5"
                                @click="openTransaction(item)">
                                <span
                                    class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-700/70">
                                    <component :is="transactionIcon(item)" class="h-6 w-6" />
                                </span>
                                <div class="min-w-0 flex-1">
                                    <div class="flex items-center gap-1.5">
                                        <span class="truncate text-[15px] font-semibold text-gray-800 dark:text-gray-100">
                                            {{ transactionTitle(item) }}
                                        </span>
                                        <span v-if="item.failed"
                                            class="shrink-0 rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] text-red-500">
                                            {{ t('walletPage.tx.failed') }}
                                        </span>
                                    </div>
                                    <p v-if="transactionSubtitle(item)" class="mt-0.5 truncate text-[13px] text-gray-400">
                                        {{ transactionSubtitle(item) }}
                                    </p>
                                </div>
                                <div class="shrink-0 text-right">
                                    <div v-if="transactionAmount(item)" class="text-[15px] font-semibold"
                                        :class="transactionAmountClass(item)">
                                        {{ transactionAmount(item)?.sign }}{{ transactionAmount(item)?.whole }}<span
                                            class="text-[0.75em]">{{ transactionAmount(item)?.fraction }}</span>
                                        <span class="ml-0.5 text-[10px] font-normal text-gray-400">{{ t('walletPage.ticker') }}</span>
                                    </div>
                                    <div v-else class="text-[15px] text-gray-400">—</div>
                                    <p class="mt-0.5 text-[11px] text-gray-400">{{ transactionDate(item) }}</p>
                                </div>
                            </button>
                        </div>

                        <div v-if="txHasMore && !txLoading" class="mt-3 text-center">
                            <button type="button"
                                class="rounded-full border border-gray-200 px-4 py-2 text-xs text-[var(--app-brand)] transition-colors hover:bg-black/5 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-white/5"
                                :disabled="txLoadingMore" @click="loadTransactions(false)">
                                {{ txLoadingMore ? t('walletPage.tx.loading') : t('walletPage.tx.loadMore') }}
                            </button>
                        </div>
                    </section>

                    <!-- 收藏品：正方形圆角卡片，名称 + 属性副标题 -->
                    <section v-else>
                        <LoadingSkeleton v-if="nftLoading" variant="tiles" :rows="4"
                            :label="t('walletPage.nft.loading')" />
                        <p v-else-if="!nftTiles.length" class="py-10 text-center text-xs text-gray-400">
                            {{ t('walletPage.nft.empty') }}
                        </p>
                        <div v-else class="grid grid-cols-3 gap-3 sm:grid-cols-4">
                            <div v-for="tile in nftTiles" :key="tile.key" class="min-w-0">
                                <div
                                    class="flex aspect-square items-center justify-center overflow-hidden rounded-2xl border border-gray-200/70 bg-white/70 p-2 backdrop-blur-md dark:border-gray-700/60 dark:bg-gray-800/60">
                                    <MessageStickerContent v-if="tile.content" :content="tile.content" :size="72"
                                        :static="true" />
                                    <img v-else-if="tile.image" :src="tile.image" :alt="tile.name"
                                        class="h-full w-full object-contain" />
                                    <TgGiftIcon v-else class="h-10 w-10 opacity-40" />
                                </div>
                                <p class="mt-1.5 truncate text-[13px] font-medium text-gray-800 dark:text-gray-100"
                                    :title="tile.name">{{ tile.name || t('walletPage.nft.unnamed') }}</p>
                                <p v-if="tile.subtitle" class="truncate text-[11px] text-gray-400" :title="tile.subtitle">
                                    {{ tile.subtitle }}
                                </p>
                            </div>
                        </div>

                        <div v-if="nftHasMore && !nftLoading" class="mt-3 text-center">
                            <button type="button"
                                class="rounded-full border border-gray-200 px-4 py-2 text-xs text-[var(--app-brand)] transition-colors hover:bg-black/5 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-white/5"
                                :disabled="nftLoadingMore" @click="loadNfts(false)">
                                {{ nftLoadingMore ? t('walletPage.nft.loading') : t('walletPage.nft.loadMore') }}
                            </button>
                        </div>
                    </section>
                </template>
            </div>
        </div>

        <!-- 收款二维码 -->
        <GramReceiveDialog :open="receiveOpen" :address="address" @close="receiveOpen = false" />

        <!-- 转账 -->
        <TonTransferSendDialog :open="sendOpen" :balance-units="gramAmount" :min-amount-units="minTransferUnits"
            :gasless-left="gasless ? gasless.leftCount : null" @close="sendOpen = false" @sent="onSent" />

        <!-- 转账详情：复用聊天里的交易详情弹窗（content 始终有值，靠 open 控制显隐） -->
        <TonTransferDetailDialog :open="!!transferDetail" :content="transferDialogContent"
            :date="transferDetail ? transferDetail.date : 0" :outgoing="!!transferDetail && transferDetail.isOutgoing"
            @close="transferDetail = null" />

        <!-- 非转账类交易的详情（NFT / 礼物 / on-ramp / 换钥） -->
        <ModalDialog :model-value="!!plainDetail" :title="t('walletPage.detail.title')"
            @update:model-value="onPlainDetailToggle">
            <div v-if="plainDetail" class="overflow-hidden rounded-xl border border-gray-200 text-[13px] dark:border-gray-700">
                <div class="flex border-b border-gray-200 dark:border-gray-700">
                    <div class="flex w-24 shrink-0 items-center bg-gray-50 px-2.5 py-2 text-gray-700 dark:bg-gray-700/60 dark:text-gray-200">
                        {{ t('walletPage.detail.type') }}
                    </div>
                    <div class="min-w-0 flex-1 px-2.5 py-2 text-gray-800 dark:text-gray-100">
                        {{ t(walletTransactionTitleKey(plainDetail)) }}
                    </div>
                </div>
                <div v-if="plainDetail.amount !== null" class="flex border-b border-gray-200 dark:border-gray-700">
                    <div class="flex w-24 shrink-0 items-center bg-gray-50 px-2.5 py-2 text-gray-700 dark:bg-gray-700/60 dark:text-gray-200">
                        {{ t('walletPage.detail.amount') }}
                    </div>
                    <div class="min-w-0 flex-1 px-2.5 py-2 text-gray-800 dark:text-gray-100">
                        {{ transactionAmountText(plainDetail) }} {{ t('walletPage.ticker') }}
                    </div>
                </div>
                <div v-if="plainDetail.peerAddress" class="flex border-b border-gray-200 dark:border-gray-700">
                    <div class="flex w-24 shrink-0 items-center bg-gray-50 px-2.5 py-2 text-gray-700 dark:bg-gray-700/60 dark:text-gray-200">
                        {{ t('walletPage.detail.peer') }}
                    </div>
                    <div class="min-w-0 flex-1 px-2.5 py-2 break-all font-mono text-[11px] text-gray-800 dark:text-gray-100">
                        {{ plainDetail.peerDomain || plainDetail.peerAddress }}
                    </div>
                </div>
                <div v-if="plainNftName" class="flex border-b border-gray-200 dark:border-gray-700">
                    <div class="flex w-24 shrink-0 items-center bg-gray-50 px-2.5 py-2 text-gray-700 dark:bg-gray-700/60 dark:text-gray-200">
                        {{ t('walletPage.detail.nft') }}
                    </div>
                    <div class="min-w-0 flex-1 px-2.5 py-2 break-words text-gray-800 dark:text-gray-100">
                        {{ plainNftName }}
                    </div>
                </div>
                <div v-if="plainDetail.providerName" class="flex border-b border-gray-200 dark:border-gray-700">
                    <div class="flex w-24 shrink-0 items-center bg-gray-50 px-2.5 py-2 text-gray-700 dark:bg-gray-700/60 dark:text-gray-200">
                        {{ t('walletPage.detail.provider') }}
                    </div>
                    <div class="min-w-0 flex-1 px-2.5 py-2 text-gray-800 dark:text-gray-100">
                        {{ plainDetail.providerName }}
                    </div>
                </div>
                <div v-if="plainDetail.comment" class="flex border-b border-gray-200 dark:border-gray-700">
                    <div class="flex w-24 shrink-0 items-center bg-gray-50 px-2.5 py-2 text-gray-700 dark:bg-gray-700/60 dark:text-gray-200">
                        {{ t('walletPage.detail.comment') }}
                    </div>
                    <div class="min-w-0 flex-1 px-2.5 py-2 break-words text-gray-800 dark:text-gray-100">
                        {{ plainDetail.isCommentEncrypted ? t('walletPage.detail.encryptedComment') : plainDetail.comment }}
                    </div>
                </div>
                <div class="flex border-b border-gray-200 dark:border-gray-700">
                    <div class="flex w-24 shrink-0 items-center bg-gray-50 px-2.5 py-2 text-gray-700 dark:bg-gray-700/60 dark:text-gray-200">
                        {{ t('walletPage.detail.fee') }}
                    </div>
                    <div class="min-w-0 flex-1 px-2.5 py-2 text-gray-800 dark:text-gray-100">
                        {{ plainDetail.isGasless ? t('walletPage.detail.feeFree') : transactionFeeText(plainDetail) }}
                    </div>
                </div>
                <div class="flex border-b border-gray-200 dark:border-gray-700">
                    <div class="flex w-24 shrink-0 items-center bg-gray-50 px-2.5 py-2 text-gray-700 dark:bg-gray-700/60 dark:text-gray-200">
                        {{ t('walletPage.detail.date') }}
                    </div>
                    <div class="min-w-0 flex-1 px-2.5 py-2 text-gray-800 dark:text-gray-100">
                        {{ transactionDate(plainDetail) }}
                    </div>
                </div>
                <div class="flex">
                    <div class="flex w-24 shrink-0 items-center bg-gray-50 px-2.5 py-2 text-gray-700 dark:bg-gray-700/60 dark:text-gray-200">
                        {{ t('walletPage.detail.state') }}
                    </div>
                    <div class="min-w-0 flex-1 px-2.5 py-2"
                        :class="plainDetail.failed ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'">
                        {{ plainDetail.failed ? t('walletPage.detail.stateFailed') : t('walletPage.detail.stateSucceeded') }}
                    </div>
                </div>
            </div>
            <template #footer>
                <BaseButton variant="ghost" size="sm" type="button" @click="plainDetail = null">
                    {{ t('walletPage.common.close') }}
                </BaseButton>
            </template>
        </ModalDialog>

        <!-- 备份助记词：二次确认 → （可选两步验证密码）→ 展示词条 -->
        <ModalDialog :model-value="phraseOpen" :title="phraseTitle" @update:model-value="onPhraseToggle">
            <div v-if="phraseStep === 'confirm'" class="space-y-3 text-sm leading-relaxed text-gray-700 dark:text-gray-200">
                <div class="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                    <ShieldAlertIcon class="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{{ t('walletPage.backup.warning') }}</span>
                </div>
                <p class="text-xs text-gray-500 dark:text-gray-400">{{ t('walletPage.backup.confirmHint') }}</p>
                <p v-if="phraseError" class="text-xs text-red-500 break-words">{{ phraseError }}</p>
            </div>

            <div v-else-if="phraseStep === 'password'" class="space-y-3">
                <p class="text-xs text-gray-500 dark:text-gray-400">{{ t('walletPage.backup.passwordHint') }}</p>
                <input type="password" v-model="phrasePassword" :placeholder="t('walletPage.backup.passwordPlaceholder')"
                    class="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[var(--app-brand)]"
                    @keydown.enter.prevent="fetchPhrase" />
                <p v-if="phraseError" class="text-xs text-red-500 break-words">{{ phraseError }}</p>
            </div>

            <div v-else class="space-y-3">
                <p class="text-xs text-gray-500 dark:text-gray-400">{{ t('walletPage.backup.phraseHint') }}</p>
                <div class="grid grid-cols-3 gap-2">
                    <div v-for="(word, index) in phraseWords" :key="index"
                        class="flex items-center gap-1.5 rounded-lg bg-gray-100 px-2 py-1.5 dark:bg-gray-700/60">
                        <span class="text-[10px] text-gray-400 w-3 text-right">{{ index + 1 }}</span>
                        <span class="font-mono text-xs text-gray-800 dark:text-gray-100 select-text">{{ word }}</span>
                    </div>
                </div>
                <div class="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                    <ShieldAlertIcon class="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{{ t('walletPage.backup.warning') }}</span>
                </div>
                <p v-if="phraseError" class="text-xs text-red-500 break-words">{{ phraseError }}</p>
            </div>

            <template #footer>
                <template v-if="phraseStep === 'confirm'">
                    <BaseButton variant="ghost" size="sm" type="button" @click="phraseOpen = false">
                        {{ t('walletPage.common.cancel') }}
                    </BaseButton>
                    <BaseButton size="sm" type="button" :disabled="phraseBusy" @click="fetchPhrase">
                        {{ phraseBusy ? t('walletPage.backup.loading') : t('walletPage.backup.reveal') }}
                    </BaseButton>
                </template>
                <template v-else-if="phraseStep === 'password'">
                    <BaseButton variant="ghost" size="sm" type="button" :disabled="phraseBusy" @click="phraseStep = 'confirm'">
                        {{ t('walletPage.common.back') }}
                    </BaseButton>
                    <BaseButton size="sm" type="button" :disabled="phraseBusy" @click="fetchPhrase">
                        {{ phraseBusy ? t('walletPage.backup.loading') : t('walletPage.backup.submit') }}
                    </BaseButton>
                </template>
                <template v-else>
                    <BaseButton variant="ghost" size="sm" type="button" @click="phraseOpen = false">
                        {{ t('walletPage.common.close') }}
                    </BaseButton>
                    <BaseButton size="sm" type="button" @click="copyPhrase">
                        {{ phraseCopied ? t('walletPage.common.copied') : t('walletPage.common.copy') }}
                    </BaseButton>
                </template>
            </template>
        </ModalDialog>
    </div>
</template>


<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
    ChevronLeft as ChevronLeftIcon,
    Copy as CopyIcon,
    EllipsisVertical as MoreIcon,
    KeyRound as KeyRoundIcon,
    Loader as LoaderIcon,
    QrCode as QrCodeIcon,
    RefreshCw as RefreshCwIcon,
    ShieldAlert as ShieldAlertIcon,
} from 'lucide-vue-next';
import { convertFileSrc } from '@tauri-apps/api/core';
import type {
    getTonWalletTransactions as GetTonWalletTransactionsRequest,
    messageSticker,
    messageTonWalletTransfer,
    sticker,
    tonNft,
    tonWalletCard,
    tonWalletGaslessTransfersInfo,
    tonWalletState,
    user,
} from 'tdlib-types';
import type { Component } from 'vue';
import TonWalletCard from '../../components/common/TonWalletCard.vue';
import GramReceiveDialog from '../../components/common/GramReceiveDialog.vue';
import TonTransferDetailDialog from '../../components/common/TonTransferDetailDialog.vue';
import TonTransferSendDialog from '../../components/common/TonTransferSendDialog.vue';
import LoadingSkeleton from '../../components/common/LoadingSkeleton.vue';
import ModalDialog from '../../components/ui/modal/ModalDialog.vue';
import BaseButton from '../../components/ui/button/BaseButton.vue';
import MessageStickerContent from '../../components/chat/ChatDetail/MessageContent/content/MessageStickerContent.vue';
import {
    TgCoinIcon,
    TgDiamondIcon,
    TgGiftIcon,
    TgGramColoredIcon,
} from '../../components/common/telegramIconComponents';
import { onTdlibUpdate, type TdlibUpdate } from '../../store/session/tdlibBus';
import { ensureLocalFilePath, tdlibSend } from '../../utils/session/tdlib';
import { toast } from '../../utils/ui/toast';
import { formatGramDate, formatGramFee } from '../../utils/message/tonTransfer';
import {
    walletCardPaletteFromCard,
    walletCardPatternSticker,
    walletCardStickerViews,
} from '../../utils/wallet/walletCard';
import {
    WALLET_NFT_PAGE_SIZE,
    WALLET_TX_PAGE_SIZE,
    formatWalletTransactionAmount,
    isWalletMissing,
    mapTonWalletState,
    mapTonWalletTransaction,
    walletTransactionPeerLabel,
    walletTransactionTitleKey,
    type WalletStateView,
    type WalletTransactionView,
} from '../../utils/wallet/tonWallet';

const router = useRouter();
const { t } = useI18n();

function goBack() {
    router.back();
}

/** 把 TDLib error（不是 Error 实例）转成可读文案 */
function tdlibErrorMessage(error: unknown): string {
    const message = (error as { message?: unknown } | null)?.message;
    if (typeof message === 'string' && message.trim()) return message.trim();
    if (error instanceof Error && error.message) return error.message;
    return t('walletPage.common.unknownError');
}

// ---------- 基础状态 ----------
const loading = ref(true);
const refreshing = ref(false);
const errorText = ref('');
/** null = 还在确认；false = 账号不支持 Gram 钱包 */
const canUseWallet = ref<boolean | null>(null);
const walletState = ref<WalletStateView | null>(null);
/** loadTonWalletState 在超时内没拿到状态：不能据此断言「钱包不存在」，单独给出未确认空态 */
const stateTimedOut = ref(false);
const address = ref('');
const gramAmount = ref('0');
const myUser = ref<user | null>(null);
/** 当前用户的 TON 钱包卡（贴纸 / 背景礼物只在 getUserFullInfo 里返回，getMe 是 null） */
const walletCard = ref<tonWalletCard | null>(null);
const minTransferUnits = ref<string | null>(null);
const gasless = ref<{ leftCount: number; resetDate: number } | null>(null);
/** 右上「更多」菜单：助记词导出 / 复制地址 / 云端备份与免手续费状态 */
const moreOpen = ref(false);

const cardName = computed(() => {
    const me = myUser.value;
    if (!me) return '';
    return [me.first_name, me.last_name].filter(Boolean).join(' ').trim();
});
const canExportPhrase = computed(() => walletState.value?.canExportPhrase === true);

const walletUnavailable = computed(() => canUseWallet.value === false);
const walletCreating = computed(() => walletState.value?.isBeingCreated === true);
const walletMissing = computed(() => (
    canUseWallet.value === true
    && !loading.value
    // 创建中也算「没有状态」，但要让位于创建中面板
    && walletState.value?.isBeingCreated !== true
    // 状态没拿到时无法断言钱包不存在，交给「未确认」面板
    && !stateTimedOut.value
    && isWalletMissing(walletState.value)
    && !address.value
    && transactions.value.length === 0
));

/** 状态请求超时且没有任何兜底数据：提示「无法确认」而不是「尚未创建」 */
const walletUnconfirmed = computed(() => (
    canUseWallet.value === true
    && !loading.value
    && !walletState.value
    && stateTimedOut.value
    && !address.value
    && transactions.value.length === 0
));

// ---------- 钱包状态（update 推送 + load 请求） ----------
/**
 * 等待 updateTonWalletState 的挂起回调集合。
 * 用集合而不是单个变量：刷新 / 发送成功等场景可能并发调用 loadTonWalletState，
 * 单 waiter 会被后一次覆盖，导致前一次永远挂起。
 */
const stateWaiters = new Set<(state: tonWalletState | null) => void>();

/** 把一条钱包状态（或 null 表示超时 / 放弃）广播给全部等待者 */
function settleStateWaiters(state: tonWalletState | null) {
    for (const resolve of [...stateWaiters]) {
        stateWaiters.delete(resolve);
        resolve(state);
    }
}

function applyWalletState(state: tonWalletState) {
    walletState.value = mapTonWalletState(state);
    stateTimedOut.value = false;
    if (state.address) address.value = state.address;
    if (state.gram_amount) gramAmount.value = state.gram_amount;
    settleStateWaiters(state);
}

/** 等一条 updateTonWalletState；超时返回 null（余额 / 地址仍有流水与地址接口兜底） */
function waitForWalletState(timeoutMs = 3000): Promise<tonWalletState | null> {
    return new Promise((resolve) => {
        let done = false;
        let timer = 0;
        const finish = (state: tonWalletState | null) => {
            if (done) return;
            done = true;
            window.clearTimeout(timer);
            stateWaiters.delete(finish);
            resolve(state);
        };
        timer = window.setTimeout(() => finish(null), timeoutMs);
        stateWaiters.add(finish);
    });
}

/** 先订阅再请求：loadTonWalletState 返回后 TDLib 会推送 updateTonWalletState */
async function loadWalletStateOnce(): Promise<void> {
    if (canUseWallet.value !== true) return;
    const waited = waitForWalletState();
    try {
        await tdlibSend({ _: 'loadTonWalletState' });
    } catch (error) {
        // 钱包不可用时这里会直接报错：不影响流水 / 地址兜底，页面按空态处理
        console.warn('[WalletSettings] loadTonWalletState failed:', tdlibErrorMessage(error));
        // 请求直接失败就不必再等 3 秒；状态同样算「未确认」
        settleStateWaiters(null);
        if (!walletState.value) stateTimedOut.value = true;
        return;
    }
    const state = await waited;
    // 两者都为空才说明「状态确实没确认」，避免已有钱包被误判成未创建
    if (!state && !walletState.value) stateTimedOut.value = true;
}

/** 地址兜底：getUserTonWalletAddresses 返回当前用户的钱包地址 */
async function loadFallbackAddress(): Promise<void> {
    const id = myUser.value?.id;
    if (!id || address.value) return;
    try {
        const result = await tdlibSend({ _: 'getUserTonWalletAddresses', user_ids: [id] });
        const found = result.addresses.find((item) => item.user_id === id);
        if (found?.wallet_address) address.value = found.wallet_address;
    } catch {
        // 没有地址时页面显示「暂无地址」，收款 / 转账按钮置灰
    }
}

/** 读取当前用户信息（卡面名字）与钱包卡贴纸 */
async function loadMe(): Promise<void> {
    try {
        myUser.value = await tdlibSend({ _: 'getMe' });
    } catch {
        myUser.value = null;
    }
    const id = myUser.value?.id;
    if (!id) {
        walletCard.value = null;
        return;
    }
    try {
        // 卡片（贴纸 / 背景礼物 / 图案）只在 getUserFullInfo 里下发
        const full = await tdlibSend({ _: 'getUserFullInfo', user_id: id });
        walletCard.value = full.ton_wallet_card ?? null;
    } catch {
        walletCard.value = null;
    }
}

/** 卡面贴纸（真实礼物贴纸，位置来自 TDLib areaPosition） */
const cardStickers = computed(() => (walletCard.value ? walletCardStickerViews(walletCard.value) : []));
/** 卡面配色：背景礼物的 backdrop 颜色；没有时用品牌蓝 */
const cardPalette = computed(() => (walletCard.value ? walletCardPaletteFromCard(walletCard.value) : null));
/** 卡面符号图案：背景礼物的 symbol 贴纸 */
const cardSymbolSticker = computed(() => (walletCard.value ? walletCardPatternSticker(walletCard.value) : null));

/** 读取最小转账金额（ton_wallet_transfer_amount_min，最小单位） */
async function loadMinTransferAmount(): Promise<void> {
    try {
        const option = await tdlibSend({ _: 'getOption', name: 'ton_wallet_transfer_amount_min' });
        if (option._ === 'optionValueInteger') {
            minTransferUnits.value = String(option.value);
        } else if (option._ === 'optionValueString') {
            minTransferUnits.value = option.value;
        } else {
            minTransferUnits.value = null;
        }
    } catch {
        minTransferUnits.value = null;
    }
}

/** 请求刷新 gasless 信息（结果通过 updateTonWalletGaslessTransfersInfo 推送） */
async function requestGaslessInfo(): Promise<void> {
    try {
        await tdlibSend({ _: 'loadTonWalletGaslessTransfersInfo' });
    } catch {
        // 选项不可用时不显示免手续费提示
    }
}

// ---------- 交易记录 ----------
const transactions = ref<WalletTransactionView[]>([]);
const txLoading = ref(false);
const txLoadingMore = ref(false);
const txError = ref('');
const txOffset = ref('');
const txHasMore = ref(false);

async function loadTransactions(reset: boolean): Promise<void> {
    if (canUseWallet.value !== true) return;
    if (reset) {
        txLoading.value = true;
        txError.value = '';
    } else {
        txLoadingMore.value = true;
    }
    try {
        // direction 是必填的可空参数（null = 全部方向）：类型文件只标了可选，这里显式补 null
        const request = {
            _: 'getTonWalletTransactions',
            direction: null,
            offset: reset ? '' : txOffset.value,
            limit: WALLET_TX_PAGE_SIZE,
        } as unknown as GetTonWalletTransactionsRequest;
        const result = await tdlibSend(request);
        const list = (result.transactions ?? []).map(mapTonWalletTransaction);
        transactions.value = reset ? list : transactions.value.concat(list);
        txOffset.value = result.next_offset ?? '';
        txHasMore.value = !!txOffset.value;
        if (result.gram_amount) gramAmount.value = result.gram_amount;
    } catch (error) {
        if (reset) {
            transactions.value = [];
            txError.value = tdlibErrorMessage(error);
        } else {
            toast.error(tdlibErrorMessage(error));
        }
    } finally {
        txLoading.value = false;
        txLoadingMore.value = false;
    }
}

function transactionAmount(view: WalletTransactionView) {
    return formatWalletTransactionAmount(view);
}

/** 金额文案（详情弹窗用，无符号不带 +/-） */
function transactionAmountText(view: WalletTransactionView): string {
    const amount = formatWalletTransactionAmount(view);
    if (!amount) return '—';
    return amount.sign + amount.whole + amount.fraction;
}

/** 金额颜色：失败红、入账绿、支出普通色（对齐 Android 交易列表） */
function transactionAmountClass(view: WalletTransactionView): string {
    if (view.failed) return 'text-red-500';
    return view.isOutgoing ? 'text-gray-800 dark:text-gray-100' : 'text-emerald-500';
}

function transactionDate(view: WalletTransactionView): string {
    return formatGramDate(view.date);
}

function transactionFeeText(view: WalletTransactionView): string {
    return formatGramFee(view.feeAmount) + ' ' + t('walletPage.ticker');
}

/** 列表标题：优先 NFT 名 / 对方域名或缩写地址，没有对方信息时回退到交易类型 */
function transactionTitle(view: WalletTransactionView): string {
    if (view.nft) return nftDisplayName(view.nft);
    const peer = walletTransactionPeerLabel(view);
    if (peer) return peer;
    return t(walletTransactionTitleKey(view));
}

/** 列表副标题：标题已是对方 / NFT 时显示交易类型，再补服务商与备注；无附加信息时回退到时间 */
function transactionSubtitle(view: WalletTransactionView): string {
    const parts: string[] = [];
    const peer = view.nft ? '' : walletTransactionPeerLabel(view);
    if (view.nft || peer) parts.push(t(walletTransactionTitleKey(view)));
    if (view.kind === 'onRampDeposit' && view.providerName) parts.push(view.providerName);
    if (view.comment) parts.push(view.isCommentEncrypted ? t('walletPage.tx.encryptedComment') : view.comment);
    if (!parts.length) parts.push(transactionDate(view));
    return parts.join(' · ');
}

/** 交易类型图标：Gram 转账用 Gram 图标，NFT 用钻石，礼物用礼物，on-ramp 用金币 */
function transactionIcon(view: WalletTransactionView): Component {
    switch (view.kind) {
        case 'transfer':
            return TgGramColoredIcon;
        case 'onRampDeposit':
            return TgCoinIcon;
        case 'nftTransfer':
            return TgDiamondIcon;
        case 'telegramGiftTransfer':
            return TgGiftIcon;
        default:
            return KeyRoundIcon;
    }
}

// ---------- 交易详情 ----------
const transferDetail = ref<WalletTransactionView | null>(null);
const plainDetail = ref<WalletTransactionView | null>(null);

/** 转账详情复用 messageTonWalletTransfer 结构（TonTransferDetailDialog 的入参） */
const transferContent = computed<messageTonWalletTransfer | null>(() => {
    const view = transferDetail.value;
    if (!view || view.kind !== 'transfer' || view.amount === null) return null;
    return {
        _: 'messageTonWalletTransfer',
        sender_user_id: view.isOutgoing ? (myUser.value?.id ?? 0) : view.peerUserId,
        transaction_id: view.id,
        peer_address: view.peerAddress,
        amount: view.amount,
        comment: view.comment,
        is_comment_encrypted: view.isCommentEncrypted,
    };
});

const plainNftName = computed(() => (plainDetail.value?.nft ? nftDisplayName(plainDetail.value.nft) : ''));

/** 详情弹窗的兜底入参：TonTransferDetailDialog 的 content 是必填 prop，用空对象占位、靠 open 控制显隐 */
const EMPTY_TRANSFER_CONTENT: messageTonWalletTransfer = {
    _: 'messageTonWalletTransfer',
    sender_user_id: 0,
    transaction_id: '',
    peer_address: '',
    amount: '0',
    comment: '',
    is_comment_encrypted: false,
};
const transferDialogContent = computed<messageTonWalletTransfer>(() => transferContent.value ?? EMPTY_TRANSFER_CONTENT);

function openTransaction(view: WalletTransactionView) {
    if (view.kind === 'transfer' && view.amount !== null) {
        transferDetail.value = view;
    } else {
        plainDetail.value = view;
    }
}

function onPlainDetailToggle(open: boolean) {
    if (!open) plainDetail.value = null;
}

// ---------- 收藏品 ----------
const nfts = ref<tonNft[]>([]);
const nftLoading = ref(false);
const nftLoadingMore = ref(false);
const nftOffset = ref('');
const nftHasMore = ref(false);
const nftImageUrls = ref<Record<string, string>>({});

interface NftTile {
    key: string;
    name: string;
    subtitle: string;
    content: messageSticker | null;
    image: string;
}

function nftDisplayName(nft: tonNft): string {
    return nft.gift?.title || nft.name || nft.gift?.name || nft.collection_address || '';
}

/** 收藏品副标题：优先 Model / Backdrop 属性，其次 NFT 描述（对齐 Android CollectibleCell） */
function nftSubtitle(nft: tonNft): string {
    const attributes = nft.attributes ?? [];
    const model = attributes.find((item) => item.trait_type === 'Model')?.value ?? '';
    const backdrop = attributes.find((item) => item.trait_type === 'Backdrop')?.value ?? '';
    const parts = [model, backdrop].filter(Boolean);
    if (parts.length) return parts.join(' · ');
    return nft.description ?? '';
}

/** NFT 主体贴纸：礼物 NFT 用 gift.model.sticker，普通 NFT 用 sticker */
function nftSticker(nft: tonNft): sticker | null {
    return nft.gift?.model?.sticker ?? nft.sticker ?? null;
}

function stickerMessage(stickerData: sticker | null): messageSticker | null {
    if (!stickerData) return null;
    return { _: 'messageSticker', sticker: stickerData, is_premium: false };
}

const nftTiles = computed<NftTile[]>(() => nfts.value.map((nft) => {
    const key = nft.address || nft.name || String(nft.index);
    return {
        key,
        name: nftDisplayName(nft),
        subtitle: nftSubtitle(nft),
        content: stickerMessage(nftSticker(nft)),
        image: nftImageUrls.value[key] ?? '',
    };
}));

// ---------- 交易 / 收藏品 Tab ----------
/**
 * 当前 Tab：交易记录 / 收藏品。
 * 两块数据都**进入对应 Tab 后才加载**：进页面只用 limit 1 轻量探测收藏品是否存在，
 * 交易列表与收藏品列表分别等用户切到该 Tab 时再拉，避免一进钱包页就打一串请求。
 */
const activeTab = ref<'tx' | 'nft'>('tx');
/** 收藏品 Tab 是否存在：进页面时 limit 1 探测决定，不加载整页 */
const nftTabAvailable = ref(false);
/** 交易 / 收藏品是否已加载过（懒加载标记；刷新时复位） */
const txLoaded = ref(false);
const nftLoaded = ref(false);

const walletTabs = computed<Array<{ id: 'tx' | 'nft'; labelKey: string }>>(() => {
    const tabs: Array<{ id: 'tx' | 'nft'; labelKey: string }> = [
        { id: 'tx', labelKey: 'walletPage.tx.title' },
    ];
    if (nftTabAvailable.value) tabs.push({ id: 'nft', labelKey: 'walletPage.nft.title' });
    return tabs;
});

/** 切 Tab：只加载该 Tab 尚未加载的数据 */
function switchTab(tab: 'tx' | 'nft'): void {
    activeTab.value = tab;
    ensureTabData(tab);
}

function ensureTabData(tab: 'tx' | 'nft'): void {
    if (tab === 'tx' && !txLoaded.value) {
        txLoaded.value = true;
        void loadTransactions(true);
    } else if (tab === 'nft' && !nftLoaded.value) {
        nftLoaded.value = true;
        void loadNfts(true);
    }
}

/**
 * 余额兜底：TDLib 1.8.70 的 loadTonWalletState 返回 ok 后不会主动推 updateTonWalletState，
 * 所以钱包卡余额必须从交易接口的 gram_amount 回填（limit 1 足够，且不会触发分页体积限制）。
 */
async function loadWalletBalance(): Promise<void> {
    if (canUseWallet.value !== true) return;
    try {
        const result = await tdlibSend({
            _: 'getTonWalletTransactions',
            direction: null,
            offset: '',
            limit: 1,
        } as unknown as GetTonWalletTransactionsRequest);
        if (result.gram_amount) gramAmount.value = result.gram_amount;
    } catch {
        // 交易接口失败时余额保持现状（不把已知余额清零）
    }
}

/** 进页面时的收藏品探测：只取 1 条，用来决定收藏品 Tab 是否出现 */
async function probeNfts(): Promise<void> {
    if (canUseWallet.value !== true) return;
    try {
        const result = await tdlibSend({ _: 'getTonWalletNfts', offset: '', limit: 1 });
        nftTabAvailable.value = (result.nfts ?? []).length > 0;
    } catch {
        nftTabAvailable.value = false;
    }
}

async function loadNfts(reset: boolean): Promise<void> {
    if (canUseWallet.value !== true) return;
    if (reset) {
        nftLoading.value = true;
    } else {
        nftLoadingMore.value = true;
    }
    try {
        const result = await tdlibSend({
            _: 'getTonWalletNfts',
            offset: reset ? '' : nftOffset.value,
            limit: WALLET_NFT_PAGE_SIZE,
        });
        const list = result.nfts ?? [];
        nfts.value = reset ? list : nfts.value.concat(list);
        nftOffset.value = result.next_offset ?? '';
        nftHasMore.value = !!nftOffset.value;
        void prefetchNftImages(list);
    } catch (error) {
        if (reset) {
            nfts.value = [];
        }
        console.warn('[WalletSettings] getTonWalletNfts failed:', tdlibErrorMessage(error));
    } finally {
        nftLoading.value = false;
        nftLoadingMore.value = false;
    }
}

/** NFT 缩略图预取并发上限：一次拉 20 张会挤占下载队列 */
const NFT_IMAGE_CONCURRENCY = 4;
/** 组件卸载标记：下载回调晚到时不写进已销毁的响应式状态 */
let disposed = false;

/** 预取 NFT 缩略图（贴纸型不需要下载） */
async function prefetchNftImages(list: tonNft[]): Promise<void> {
    const queue = list.filter((nft) => !nftSticker(nft));
    let cursor = 0;
    async function worker(): Promise<void> {
        while (!disposed && cursor < queue.length) {
            const nft = queue[cursor++];
            const key = nft.address || nft.name || String(nft.index);
            if (disposed || nftImageUrls.value[key]) continue;
            // photoSize.photo 本身就是 TDLib 的 file 节点，直接交给按需下载
            const photoFile = nft.thumbnail?.photo ?? nft.image?.photo;
            if (!photoFile) continue;
            try {
                const path = await ensureLocalFilePath(photoFile);
                if (disposed || !path) continue;
                nftImageUrls.value = { ...nftImageUrls.value, [key]: convertFileSrc(path) };
            } catch {
                // 图片拿不到时 tile 显示占位图标
            }
        }
    }
    const workers = Math.min(NFT_IMAGE_CONCURRENCY, queue.length);
    await Promise.all(Array.from({ length: workers }, () => worker()));
}

// ---------- 收款 / 转账 ----------
const receiveOpen = ref(false);

function openReceive() {
    if (!address.value) return;
    receiveOpen.value = true;
}

const sendOpen = ref(false);

function onSent() {
    // 转账成功：刷新余额与流水（update 推送也会带来新状态）
    void Promise.all([loadTransactions(true), loadWalletStateOnce()]);
}

// ---------- 复制 ----------
const addressCopied = ref(false);
let addressCopiedTimer = 0;

async function copyAddress() {
    if (!address.value) return;
    moreOpen.value = false;
    try {
        await navigator.clipboard.writeText(address.value);
        addressCopied.value = true;
        window.clearTimeout(addressCopiedTimer);
        addressCopiedTimer = window.setTimeout(() => { addressCopied.value = false; }, 1500);
        toast.success(t('walletPage.common.copied'));
    } catch {
        toast.error(t('walletPage.common.copyFailed'));
    }
}

// ---------- 助记词 ----------
const phraseOpen = ref(false);
const phraseStep = ref<'confirm' | 'password' | 'phrase'>('confirm');
const phraseWords = ref<string[]>([]);
const phrasePassword = ref('');
const phraseBusy = ref(false);
const phraseError = ref('');
const phraseCopied = ref(false);

const phraseTitle = computed(() => {
    if (phraseStep.value === 'password') return t('walletPage.backup.passwordTitle');
    if (phraseStep.value === 'phrase') return t('walletPage.backup.phraseTitle');
    return t('walletPage.backup.title');
});

function openPhrase() {
    if (!canExportPhrase.value) return;
    moreOpen.value = false;
    phraseStep.value = 'confirm';
    phraseWords.value = [];
    phrasePassword.value = '';
    phraseError.value = '';
    phraseBusy.value = false;
    phraseCopied.value = false;
    phraseOpen.value = true;
}

function onPhraseToggle(open: boolean) {
    if (open) return;
    phraseOpen.value = false;
    // 关闭时立即丢弃明文助记词，不留在响应式状态里
    phraseWords.value = [];
    phrasePassword.value = '';
}

/** 取助记词：先不带密码试一次，返回 PASSWORD_MISSING 时切到密码输入 */
async function fetchPhrase() {
    phraseBusy.value = true;
    phraseError.value = '';
    try {
        const result = await tdlibSend({ _: 'getTonWalletSecretPhrase', password: phrasePassword.value });
        const words = (result.secret_phrase ?? '').split(' ').filter(Boolean);
        if (!words.length) {
            phraseError.value = t('walletPage.backup.phraseEmpty');
            return;
        }
        phraseWords.value = words;
        phraseStep.value = 'phrase';
    } catch (error) {
        const message = tdlibErrorMessage(error);
        if (message.indexOf('PASSWORD_MISSING') >= 0) {
            phraseStep.value = 'password';
            phrasePassword.value = '';
            phraseError.value = '';
        } else {
            phraseError.value = message;
        }
    } finally {
        phraseBusy.value = false;
    }
}

async function copyPhrase() {
    const phrase = phraseWords.value.join(' ');
    if (!phrase) return;
    try {
        await navigator.clipboard.writeText(phrase);
        phraseCopied.value = true;
        window.setTimeout(() => { phraseCopied.value = false; }, 1500);
        toast.success(t('walletPage.common.copied'));
    } catch {
        toast.error(t('walletPage.common.copyFailed'));
    }
}

// ---------- 数据加载 / 刷新 ----------
async function load(): Promise<void> {
    loading.value = true;
    errorText.value = '';
    stateTimedOut.value = false;
    try {
        let canUse = false;
        try {
            const option = await tdlibSend({ _: 'getOption', name: 'can_use_ton_wallet' });
            canUse = option._ === 'optionValueBoolean' && option.value === true;
        } catch {
            canUse = false;
        }
        canUseWallet.value = canUse;
        if (!canUse) return;

        await Promise.all([
            loadMe(),
            loadMinTransferAmount(),
            loadWalletStateOnce(),
            requestGaslessInfo(),
            loadWalletBalance(),
            probeNfts(),
        ]);
        await loadFallbackAddress();
        // 交易 / 收藏品按当前 Tab 懒加载
        ensureTabData(activeTab.value);
    } catch (error) {
        errorText.value = tdlibErrorMessage(error);
    } finally {
        loading.value = false;
    }
}

async function refresh(): Promise<void> {
    if (refreshing.value) return;
    moreOpen.value = false;
    refreshing.value = true;
    try {
        // 刷新：只重置懒加载标记并重拉当前 Tab，另一块等切过去再加载
        txLoaded.value = false;
        nftLoaded.value = false;
        await Promise.all([
            loadWalletStateOnce(),
            loadMinTransferAmount(),
            requestGaslessInfo(),
            loadWalletBalance(),
            probeNfts(),
        ]);
        await loadFallbackAddress();
        ensureTabData(activeTab.value);
    } catch (error) {
        errorText.value = tdlibErrorMessage(error);
    } finally {
        refreshing.value = false;
    }
}

// ---------- 更新订阅 ----------
let unsubscribe: (() => void) | null = null;

function handleUpdate(update: TdlibUpdate) {
    if (update._ === 'updateTonWalletState') {
        const state = (update as unknown as { state?: tonWalletState }).state;
        if (state) applyWalletState(state);
        return;
    }
    if (update._ === 'updateTonWalletGaslessTransfersInfo') {
        const info = (update as unknown as { info?: tonWalletGaslessTransfersInfo }).info;
        if (info) gasless.value = { leftCount: info.left_count ?? 0, resetDate: info.reset_date ?? 0 };
        return;
    }
    if (update._ === 'updateOwnedGramCount') {
        const amount = (update as unknown as { gram_amount?: number }).gram_amount;
        if (typeof amount === 'number' && Number.isFinite(amount)) gramAmount.value = String(amount);
    }
}

onMounted(() => {
    unsubscribe = onTdlibUpdate('other', handleUpdate);
    void load();
});

onBeforeUnmount(() => {
    disposed = true;
    if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
    }
    // 让仍在等待状态的调用立即结束，不留悬挂计时器
    settleStateWaiters(null);
    window.clearTimeout(addressCopiedTimer);
    phraseWords.value = [];
});
</script>
