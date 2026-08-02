<script lang="ts">
  import type { Tab } from '$lib/stores/tabs';
  import { t } from '$lib/i18n';
  
  const {
    isDiffMode,
    diffLineCount,
    diffLeftStats,
    diffRightStats,
    diffOriginal,
    diffModified,
    activeTab,
    stats,
    lineCount,
    isMixedMode,
    isJsonlMode,
    jsonlViewMode,
    jsonlSummary,
  } = $props<{
    isDiffMode: boolean;
    diffLineCount: number;
    diffLeftStats: import('$lib/services/json').JsonStats;
    diffRightStats: import('$lib/services/json').JsonStats;
    diffOriginal: string;
    diffModified: string;
    activeTab: Tab | null;
    stats: import('$lib/services/json').JsonStats;
    lineCount: number;
    isMixedMode: boolean;
    isJsonlMode: boolean;
    jsonlViewMode: 'records' | 'source';
    jsonlSummary: {
      recordCount: number;
      validCount: number;
      invalidCount: number;
      emptyCount: number;
    } | null;
  }>();

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }
</script>

<div class="flex items-center gap-3 bg-(--bg-secondary) border-t border-(--border)" style="padding: 4px 12px; font-size: 12px;">
  {#if isDiffMode}
    <!-- Left side stats -->
    <span class="text-(--text-secondary)">
      {diffLeftStats.key_count} {$t('status.keys')} · {diffLeftStats.depth} {$t('status.levels')} · {formatBytes(diffLeftStats.byte_size)} · {diffOriginal ? diffOriginal.split('\n').length : 0} {$t('status.lines')}
    </span>
    
    <!-- Center diff info -->
    <span class="flex-1 text-center text-(--text-secondary)">
      {$t('status.diff')} <span class="text-(--success) font-bold">{diffLineCount}</span> {$t('status.lines')}
    </span>
    
    <!-- Right side stats -->
    <span class="text-(--text-secondary)">
      {diffRightStats.key_count} {$t('status.keys')} · {diffRightStats.depth} {$t('status.levels')} · {formatBytes(diffRightStats.byte_size)} · {diffModified ? diffModified.split('\n').length : 0} {$t('status.lines')}
    </span>
  {:else if isJsonlMode}
    {#if activeTab?.fileName}
      <span class="text-(--text-primary) font-medium">{activeTab.fileName}</span>
      {#if activeTab.isModified}
        <span class="text-(--warning)" title={$t('status.modified')}>●</span>
      {/if}
      <div class="w-px h-3.5 bg-(--divider-strong)"></div>
    {/if}

    <span class="text-(--accent) font-medium">JSONL</span>
    <div class="w-px h-3.5 bg-(--divider-strong)"></div>
    {#if jsonlViewMode === 'source'}
      <span class="text-(--text-secondary)" data-testid="editor-line-count">
        {lineCount} {$t('status.lines')}
      </span>
    {:else if jsonlSummary}
      <span class="text-(--text-secondary)" data-testid="editor-jsonl-record-count">{jsonlSummary.recordCount} {$t('status.records')}</span>
      <div class="w-px h-3.5 bg-(--divider-strong)"></div>
      <span class="text-(--success)">{jsonlSummary.validCount} {$t('status.valid')}</span>
      <div class="w-px h-3.5 bg-(--divider-strong)"></div>
      <span class="text-(--error)">{jsonlSummary.invalidCount} {$t('status.errors')}</span>
      <div class="w-px h-3.5 bg-(--divider-strong)"></div>
      <span class="text-(--text-secondary)">{jsonlSummary.emptyCount} {$t('status.empty')}</span>
    {:else}
      <span class="text-(--text-secondary)">{$t('status.parsing')}</span>
    {/if}

    <span class="flex-1"></span>
  {:else}
    <!-- File info on the left -->
    {#if activeTab?.fileName}
      <span class="text-(--text-primary) font-medium">{activeTab.fileName}</span>
      {#if activeTab.isModified}
        <span class="text-(--warning)" title={$t('status.modified')}>●</span>
      {/if}
      <div class="w-px h-3.5 bg-(--divider-strong)"></div>
    {/if}

    {#if stats}
      <span class="text-(--text-secondary)">{stats.key_count} {$t('status.keys')}</span>
      <div class="w-px h-3.5 bg-(--divider-strong)"></div>
      <span class="text-(--text-secondary)">{stats.depth} {$t('status.levels')}</span>
      <div class="w-px h-3.5 bg-(--divider-strong)"></div>
      <span class="text-(--text-secondary)">{formatBytes(stats.byte_size)}</span>
    {/if}

    <div class="w-px h-3.5 bg-(--divider-strong)"></div>
    <span class="text-(--text-secondary)" data-testid="editor-line-count">
      {lineCount} {$t('status.lines')}
    </span>

    {#if isMixedMode || stats?.format_type}
      <div class="w-px h-3.5 bg-(--divider-strong)"></div>
      <span
        data-testid="editor-format-type"
        style="color: {isMixedMode ? '#f59e0b' : stats.format_type === 'JSON5' ? '#8b5cf6' : '#10b981'}; font-weight: 600;"
      >
        {isMixedMode ? 'Mixed' : stats.format_type}
      </span>
    {/if}

    <span class="flex-1"></span>
  {/if}
</div>
