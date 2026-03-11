// ─── providers/vedaBrainProvider.ts ─────────────────────────────────────────
//
// Sidebar webview provider for the VEDA Brain Diagnostics panel.
// Renders Phase 1 mismatch diagnostics from:
//
//   GET /api/veda-brain/project-diagnostics
//
// Panels rendered:
//   Brain Overview          (readinessClassification categoryCounts)
//   Archetype Mismatches    (archetypeAlignment.entries where !aligned)
//   Entity Coverage Gaps    (entityGapAnalysis.entries where missingFromProject.length > 0)
//   Topic Territory Gaps    (topicTerritoryGaps.untrackedTopics + uncategorizedKeywords)
//   Authority Opportunities (authorityOpportunity.opportunities where type !== 'none')
//   Schema Opportunities    (schemaOpportunity.entries where missingSchemaTypes.length > 0)
//
// Interactive: scripts enabled for section nav + cross-panel linking
// to Page Command Center.
//
// Phase 1.10: diagnostic-to-next-step continuity — Overview and section renderers
// now surface explicit next-step directions when actionable issues are present.
//
// Read-only. No mutations. No recomputation. No caching.
// The extension is a visualization surface only.

import * as vscode from 'vscode';
import { VedaClient } from '../services/vedaClient';
import { StateService } from '../services/stateService';
import { escapeHtml } from '../utils/formatting';
import {
  VedaBrainDiagnosticsResponse,
  VedaBrainDiagnostics,
  ReadinessClassification,
  ArchetypeAlignment,
  EntityGapAnalysis,
  TopicTerritoryGaps,
  AuthorityOpportunity,
  SchemaOpportunity,
  ProposalsResponse,
  ArchetypeProposal,
  SchemaProposal,
} from '../types/vedaBrain';

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

export class VedaBrainProvider implements vscode.WebviewViewProvider {
  public static readonly VIEW_ID = 'veda.vedaBrain';

  private _view?: vscode.WebviewView;
  private _data: VedaBrainDiagnosticsResponse | null | undefined = undefined;
  // undefined = not yet loaded; null = load failed; object = loaded
  private _proposals: ProposalsResponse | null | undefined = undefined;
  // undefined = not yet loaded; null = load failed; object = loaded
  private _loading = false;
  private _stateDisposable: vscode.Disposable;

  constructor(
    private readonly client: VedaClient,
    private readonly state: StateService
  ) {
    this._stateDisposable = state.onStateChange(() => {
      this._data = undefined;
      this._proposals = undefined;
      this._load();
    });
  }

  dispose(): void {
    this._stateDisposable.dispose();
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage((msg: { command?: string; url?: string }) => {
      if (msg.command === 'openPageCommandCenter' && msg.url) {
        vscode.commands.executeCommand('veda.brainOpenPageCommandCenter', msg.url);
      }
    });

    this._render();
    if (this.state.activeProject && this._data === undefined) {
      this._load();
    }
  }

  refresh(): void {
    this._data = undefined;
    this._proposals = undefined;
    this._load();
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private async _load(): Promise<void> {
    if (!this.state.activeProject) {
      this._render();
      return;
    }
    this._loading = true;
    this._render();

    try {
      const [diagRes, propRes] = await Promise.allSettled([
        this.client.getVedaBrainDiagnostics(),
        this.client.getProposals(),
      ]);
      this._data      = diagRes.status === 'fulfilled' ? diagRes.value.data : null;
      this._proposals = propRes.status === 'fulfilled' ? propRes.value.data : null;
    } finally {
      this._loading = false;
      this._render();
    }
  }

  private _render(): void {
    if (!this._view) return;
    this._view.webview.html = this._buildHtml();
  }

  // ── HTML builder ─────────────────────────────────────────────────────────

  private _buildHtml(): string {
    if (!this.state.activeProject) {
      return _shell(_richEmptyState(
        'VEDA Brain',
        'Shows structural diagnostics: archetype alignment, entity gaps, topic territory, authority and schema opportunities for tracked keywords.',
        'No project selected.',
        'Run <em>VEDA: Select Project</em> to activate a project.'
      ), false);
    }
    if (this._loading || this._data === undefined) {
      return _shell(_emptyState('Loading Brain diagnostics…'), false);
    }
    if (this._data === null) {
      const { envLabel, baseUrl } = _readEnvContext();
      const reachHint = baseUrl
        ? `Could not reach ${envLabel} at ${baseUrl}.`
        : `Could not load diagnostics — ${envLabel} may not be running or base URL is not configured.`;
      return _shell(_richEmptyState(
        'VEDA Brain',
        'Shows structural diagnostics: archetype alignment, entity gaps, topic territory, authority and schema opportunities for tracked keywords.',
        reachHint,
        'Confirm the environment is running, then use <em>VEDA: Switch Environment</em> or ensure the project has keyword targets and mapped pages.'
      ), false);
    }

    const d: VedaBrainDiagnostics = this._data.diagnostics;

    // Build section nav + sections
    const navItems: { id: string; label: string; count: number | null }[] = [];
    const sections: string[] = [];

    // Overview
    navItems.push({ id: 'overview', label: 'Overview', count: null });
    sections.push(_renderOverview(d.readinessClassification));

    // Archetype Mismatches
    const archetypeMismatches = d.archetypeAlignment.entries.filter(e =>
      !e.aligned &&
      e.mismatchReason !== 'no_serp_archetype_signal' &&
      e.mismatchReason !== 'no_mapped_page'
    );
    navItems.push({ id: 'archetypes', label: 'Archetypes', count: archetypeMismatches.length });
    sections.push(_renderArchetypeMismatches(d.archetypeAlignment, archetypeMismatches));

    // Entity Coverage Gaps
    const entityGaps = d.entityGapAnalysis.entries.filter(e => e.missingFromProject.length > 0);
    navItems.push({ id: 'entities', label: 'Entities', count: entityGaps.length });
    sections.push(_renderEntityGaps(d.entityGapAnalysis, entityGaps));

    // Topic Territory Gaps
    const topicS = d.topicTerritoryGaps.summary;
    const topicIssues = topicS.untrackedTopicCount + topicS.thinTopicCount + topicS.uncategorizedKeywordCount;
    navItems.push({ id: 'topics', label: 'Topics', count: topicIssues > 0 ? topicIssues : 0 });
    sections.push(_renderTopicTerritoryGaps(d.topicTerritoryGaps));

    // Authority Opportunities
    const authActionable = d.authorityOpportunity.opportunities.filter(o => o.opportunityType !== 'none');
    navItems.push({ id: 'authority', label: 'Authority', count: authActionable.length });
    sections.push(_renderAuthorityOpportunities(d.authorityOpportunity, authActionable));

    // Schema Opportunities
    const schemaGaps = d.schemaOpportunity.entries.filter(e => e.missingSchemaTypes.length > 0);
    navItems.push({ id: 'schema', label: 'Schema', count: schemaGaps.length });
    sections.push(_renderSchemaOpportunities(d.schemaOpportunity, schemaGaps));

    // Proposals (Phase C1)
    const proposals = this._proposals;
    const proposalTotal = proposals?.summary.totalProposals ?? null;
    navItems.push({ id: 'proposals', label: 'Proposals', count: proposalTotal });
    sections.push(_renderProposals(proposals));

    const nav = _renderNav(navItems);
    return _shell(nav + sections.join('\n'), true);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Section nav
// ─────────────────────────────────────────────────────────────────────────────

function _renderNav(items: { id: string; label: string; count: number | null }[]): string {
  const pills = items.map(i => {
    const badge = i.count !== null && i.count > 0
      ? `<span class="nav-badge">${i.count}</span>`
      : '';
    return `<button class="nav-pill" data-target="${i.id}">${escapeHtml(i.label)}${badge}</button>`;
  }).join('');
  return `<div class="brain-nav">${pills}</div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Page link helper
// ─────────────────────────────────────────────────────────────────────────────

function _pageLinkIcon(url: string | null): string {
  if (!url) return '<span class="no-page muted" title="No mapped page">—</span>';
  return `<button class="page-link-icon" data-url="${escapeHtml(url)}" title="Open Page Command Center — page-level SERP actions for this URL">↗</button>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Section renderers (pure functions)
// ─────────────────────────────────────────────────────────────────────────────

function _renderOverview(rc: ReadinessClassification): string {
  const c = rc.categoryCounts;
  const total = rc.classifications.length;

  const rows = [
    _statRow('Total Keywords', String(total)),
    _statRow('Structurally Aligned', String(c.structurally_aligned), 'good'),
    _statRow('Archetype Misaligned', String(c.archetype_misaligned), c.archetype_misaligned > 0 ? 'warn' : 'good'),
    _statRow('Entity Incomplete', String(c.entity_incomplete), c.entity_incomplete > 0 ? 'warn' : 'good'),
    _statRow('Under Covered', String(c.under_covered), c.under_covered > 0 ? 'warn' : 'good'),
    _statRow('Weak Authority', String(c.weak_authority_support), c.weak_authority_support > 0 ? 'warn' : 'good'),
    _statRow('Schema Underpowered', String(c.schema_underpowered), c.schema_underpowered > 0 ? 'warn' : 'good'),
    _statRow('Unmapped', String(c.unmapped), c.unmapped > 0 ? 'error' : 'good'),
  ].join('');

  // Build a directional next-step note when actionable issues exist.
  const hasIssues = c.archetype_misaligned > 0 || c.entity_incomplete > 0 ||
    c.schema_underpowered > 0 || c.weak_authority_support > 0 || c.unmapped > 0;
  const nextStepNote = hasIssues
    ? `<div class="overview-next-step">Use the section nav above to drill into each issue type. Click <strong>\u2197</strong> on any keyword row to open its <strong>Page Command Center</strong> — the page-level action surface where you review SERP signals, run keyword diagnostics, and plan structural work for that specific page.</div>`
    : '';

  return _section('overview', 'Brain Overview', `<div class="stat-grid">${rows}</div>${nextStepNote}`);
}

function _renderArchetypeMismatches(
  aa: ArchetypeAlignment,
  mismatches: ArchetypeAlignment['entries']
): string {
  if (mismatches.length === 0) {
    const msg = aa.entries.length === 0
      ? '<p class="muted">No keyword data available.</p>'
      : '<p class="muted all-clear">✓ No archetype mismatches detected.</p>';
    return _section('archetypes', 'Archetype Mismatches', msg);
  }

  // Next-step note: archetype mismatches → Page Command Center for structural work.
  const nextStep = `<div class="section-next-step">\u2192 Click \u2197 on any row to open Page Command Center for that page. Review the page archetype against SERP-dominant signals and adjust accordingly.</div>`;

  const items = mismatches.map(e => {
    const topSerp = e.serpDominantArchetypes[0]?.archetype ?? '—';
    const pageArch = e.mappedPageArchetype ?? '(none)';
    return `<div class="mismatch-item">
  <div class="item-header">
    <span class="item-query">${escapeHtml(e.query)}</span>
    ${_pageLinkIcon(e.mappedPageUrl)}
  </div>
  <div class="mismatch-detail">
    <span class="lbl">Page</span> <span class="arch-val arch-page">${escapeHtml(pageArch)}</span>
    <span class="arrow">→</span>
    <span class="lbl">SERP</span> <span class="arch-val arch-serp">${escapeHtml(topSerp)}</span>
  </div>
</div>`;
  }).join('');

  return _section('archetypes', `Archetype Mismatches (${mismatches.length})`, items + nextStep);
}

function _renderEntityGaps(
  eg: EntityGapAnalysis,
  withGaps: EntityGapAnalysis['entries']
): string {
  if (withGaps.length === 0) {
    const msg = eg.entries.length === 0
      ? '<p class="muted">No keyword data available.</p>'
      : '<p class="muted all-clear">✓ No entity gaps detected.</p>';
    return _section('entities', 'Entity Coverage Gaps', msg);
  }

  const items = withGaps.slice(0, 20).map(e => {
    const missing = e.missingFromProject.map(m => `<span class="entity-tag entity-missing">${escapeHtml(m)}</span>`).join('');
    return `<div class="gap-item">
  <div class="item-header">
    <span class="item-query">${escapeHtml(e.query)}</span>
    ${_pageLinkIcon(e.mappedPageUrl)}
  </div>
  <div class="gap-missing">${missing}</div>
</div>`;
  }).join('');

  const extra = withGaps.length > 20
    ? `<p class="muted extra-note">…and ${withGaps.length - 20} more keywords with gaps.</p>`
    : '';

  const nextStep = `<div class="section-next-step">\u2192 Click <strong>\u2197</strong> to open <strong>Page Command Center</strong> for that page — review SERP signals and add the missing entities to the page content or schema.</div>`;

  return _section('entities', `Entity Coverage Gaps (${eg.keywordsWithGaps} keywords, ${eg.totalGaps} gaps)`, items + extra + nextStep);
}

function _renderTopicTerritoryGaps(ttg: TopicTerritoryGaps): string {
  const s = ttg.summary;
  const hasIssues = s.untrackedTopicCount > 0 || s.uncategorizedKeywordCount > 0 || s.thinTopicCount > 0;

  if (!hasIssues) {
    return _section('topics', 'Topic Territory Gaps', '<p class="muted all-clear">✓ No topic territory gaps detected.</p>');
  }

  let body = '';

  if (ttg.untrackedTopics.length > 0) {
    const tags = ttg.untrackedTopics.map(t => `<span class="entity-tag entity-missing">${escapeHtml(t)}</span>`).join('');
    body += `<div class="sub-header">Untracked Topics (${ttg.untrackedTopics.length})</div>
<div class="tag-row">${tags}</div>`;
  }

  if (ttg.thinTopics.length > 0) {
    const tags = ttg.thinTopics.map(t => `<span class="entity-tag entity-warn">${escapeHtml(t)}</span>`).join('');
    body += `<div class="sub-header" style="margin-top:8px">Thin Topics ≤1 page (${ttg.thinTopics.length})</div>
<div class="tag-row">${tags}</div>`;
  }

  if (ttg.uncategorizedKeywords.length > 0) {
    const shown = ttg.uncategorizedKeywords.slice(0, 15);
    const items = shown.map(u =>
      `<div class="uncategorized-item">
  <span class="kw-bullet">•</span>
  <span class="uncategorized-query">${escapeHtml(u.query)}</span>
  <span class="muted" style="font-size:0.75em">${u.hasMapping ? 'mapped' : 'unmapped'}</span>
</div>`
    ).join('');
    const extra = ttg.uncategorizedKeywords.length > 15
      ? `<p class="muted extra-note">…and ${ttg.uncategorizedKeywords.length - 15} more.</p>`
      : '';
    body += `<div class="sub-header" style="margin-top:8px">Uncategorized Keywords (${ttg.uncategorizedKeywords.length})</div>${items}${extra}`;
  }

  const nextStep = `<div class="section-next-step">\u2192 Assign untracked and thin topics to pages, then open <strong>Page Command Center</strong> via <strong>\u2197</strong> on related keyword rows to plan structural coverage work.</div>`;
  return _section('topics', 'Topic Territory Gaps', body + nextStep);
}

function _renderAuthorityOpportunities(
  ao: AuthorityOpportunity,
  actionable: AuthorityOpportunity['opportunities']
): string {
  if (actionable.length === 0) {
    return _section('authority', 'Authority Opportunities', '<p class="muted all-clear">✓ No authority gaps detected.</p>');
  }

  const TYPE_LABELS: Record<string, string> = {
    isolated_target: 'Isolated',
    high_value_undersupported: 'High Value',
    weak_support: 'Weak Support',
  };
  const TYPE_CLS: Record<string, string> = {
    isolated_target: 'badge-error',
    high_value_undersupported: 'badge-warn',
    weak_support: 'badge-muted',
  };

  const items = actionable.slice(0, 20).map(o => {
    const label = TYPE_LABELS[o.opportunityType] ?? o.opportunityType;
    const cls = TYPE_CLS[o.opportunityType] ?? 'badge-muted';
    return `<div class="auth-item">
  <span class="auth-badge ${cls}">${escapeHtml(label)}</span>
  <div class="auth-body">
    <div class="item-header">
      <span class="item-query">${escapeHtml(o.query)}</span>
      ${_pageLinkIcon(o.mappedPageUrl)}
    </div>
    <div class="auth-meta">
      <span class="auth-links">${o.inboundLinkCount} inbound</span>
    </div>
  </div>
</div>`;
  }).join('');

  const extra = actionable.length > 20
    ? `<p class="muted extra-note">…and ${actionable.length - 20} more.</p>`
    : '';

  const s = ao.summary;
  const summaryLine = `<div class="auth-summary muted">
  ${s.isolatedTargets > 0 ? `<span>${s.isolatedTargets} isolated</span>` : ''}
  ${s.highValueUndersupported > 0 ? `<span>${s.highValueUndersupported} high-value</span>` : ''}
  ${s.weaklySupported > 0 ? `<span>${s.weaklySupported} weak</span>` : ''}
</div>`;

  const nextStep = `<div class="section-next-step">\u2192 Click <strong>\u2197</strong> on any row to open <strong>Page Command Center</strong> for that page — review inbound link profile and plan internal linking or authority-support work.</div>`;
  return _section('authority', `Authority Opportunities (${actionable.length})`, summaryLine + items + extra + nextStep);
}

function _renderSchemaOpportunities(
  so: SchemaOpportunity,
  withGaps: SchemaOpportunity['entries']
): string {
  if (withGaps.length === 0) {
    const msg = so.entries.length === 0
      ? '<p class="muted">No keyword data available.</p>'
      : '<p class="muted all-clear">✓ No schema gaps detected.</p>';
    return _section('schema', 'Schema Opportunities', msg);
  }

  let freqBlock = '';
  if (so.serpSchemaFrequency.length > 0) {
    const top = so.serpSchemaFrequency.slice(0, 5)
      .map(f => `<span class="entity-tag entity-schema">${escapeHtml(f.schemaType)} ×${f.count}</span>`)
      .join('');
    freqBlock = `<div class="sub-header">SERP Schema Signals</div><div class="tag-row" style="margin-bottom:8px">${top}</div>`;
  }

  const items = withGaps.slice(0, 20).map(e => {
    const missing = e.missingSchemaTypes.map(s => `<span class="entity-tag entity-missing">${escapeHtml(s)}</span>`).join('');
    const pageSchemas = e.pageSchemaTypes.length > 0
      ? e.pageSchemaTypes.map(s => `<span class="entity-tag entity-present">${escapeHtml(s)}</span>`).join('')
      : '<span class="muted" style="font-size:0.78em">none</span>';
    return `<div class="gap-item">
  <div class="item-header">
    <span class="item-query">${escapeHtml(e.query)}</span>
    ${_pageLinkIcon(e.mappedPageUrl)}
  </div>
  <div class="schema-row">
    <span class="lbl">Has</span> ${pageSchemas}
    <span class="lbl" style="margin-left:6px">Missing</span> ${missing}
  </div>
</div>`;
  }).join('');

  const extra = withGaps.length > 20
    ? `<p class="muted extra-note">…and ${withGaps.length - 20} more keywords with schema gaps.</p>`
    : '';

  const nextStep = `<div class="section-next-step">\u2192 Click \u2197 on any row to open Page Command Center for that page. Add or expand schema markup to match SERP-dominant schema signals above.</div>`;

  return _section(
    'schema',
    `Schema Opportunities (${so.totalMissingSchemaOpportunities} gaps, ${so.pagesWithoutSchema} pages no schema)`,
    freqBlock + items + extra + nextStep
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Proposals renderer (Phase C1)
// ─────────────────────────────────────────────────────────────────────────────

function _renderProposals(proposals: ProposalsResponse | null | undefined): string {
  // Load failure — proposals endpoint returned an error
  if (proposals === null) {
    const { envLabel, baseUrl } = _readEnvContext();
    const msg = baseUrl
      ? `Could not load proposals — could not reach ${envLabel} at ${baseUrl}.`
      : `Could not load proposals — ${envLabel} base URL is not configured. Check Settings › veda.environments.`;
    return _section('proposals', 'Proposals', `<p class="muted">${escapeHtml(msg)}</p>`);
  }

  // Not yet loaded (should not normally reach render in this state, but guard it)
  if (proposals === undefined) {
    return _section('proposals', 'Proposals', '<p class="muted">Loading proposals…</p>');
  }

  const { archetypeProposals, schemaProposals } = proposals.proposals;
  const total = proposals.summary.totalProposals;

  if (total === 0) {
    return _section(
      'proposals',
      'Proposals',
      `<p class="muted all-clear">✓ No structural proposals at this time.</p>
       <p class="muted" style="font-size:0.8em;margin-top:5px">Proposals are generated when archetype or schema mismatches exist on mapped pages. Run <em>VEDA: Refresh Brain Diagnostics</em> after adding keyword targets and mapping pages.</p>`
    );
  }

  let body = '';

  // ── Archetype proposals block ─────────────────────────────────────────────────────────
  if (archetypeProposals.length > 0) {
    body += `<div class="sub-header">Archetype Proposals (${archetypeProposals.length})</div>`;
    body += archetypeProposals.map((p: ArchetypeProposal) => {
      const actionLabel = p.suggestedAction === 'consider_archetype_aligned_page'
        ? 'Consider archetype-aligned page'
        : 'Review archetype alignment';
      const existingLabel = p.existingArchetype ?? '(none assigned)';
      return `<div class="proposal-item">
  <div class="item-header">
    <span class="item-query">${escapeHtml(p.query)}</span>
    ${_pageLinkIcon(p.existingPageUrl)}
  </div>
  <div class="proposal-detail">
    <span class="lbl">Page</span> <span class="arch-val arch-page">${escapeHtml(existingLabel)}</span>
    <span class="arrow">→</span>
    <span class="lbl">SERP</span> <span class="arch-val arch-serp">${escapeHtml(p.serpDominantArchetype)}</span>
    <span class="proposal-action-badge">${escapeHtml(actionLabel)}</span>
  </div>
  <div class="proposal-id muted">${escapeHtml(p.proposalId)}</div>
</div>`;
    }).join('');
  }

  // ── Schema proposals block ──────────────────────────────────────────────────────────────
  if (schemaProposals.length > 0) {
    if (archetypeProposals.length > 0) body += '<div style="margin-top:10px"></div>';
    body += `<div class="sub-header">Schema Proposals (${schemaProposals.length})</div>`;
    body += schemaProposals.map((p: SchemaProposal) => {
      const missing = p.missingSchemaTypes
        .map(s => `<span class="entity-tag entity-missing">${escapeHtml(s)}</span>`)
        .join('');
      const existing = p.existingSchemaTypes.length > 0
        ? p.existingSchemaTypes.map(s => `<span class="entity-tag entity-present">${escapeHtml(s)}</span>`).join('')
        : '<span class="muted" style="font-size:0.78em">none</span>';
      return `<div class="proposal-item">
  <div class="item-header">
    <span class="item-query">${escapeHtml(p.query)}</span>
    ${_pageLinkIcon(p.pageUrl)}
  </div>
  <div class="schema-row">
    <span class="lbl">Has</span> ${existing}
    <span class="lbl" style="margin-left:6px">Missing</span> ${missing}
  </div>
  <div class="proposal-id muted">${escapeHtml(p.proposalId)}</div>
</div>`;
    }).join('');
  }

  const proposalNextStep = `<div class="section-next-step">Review each proposal, then click <strong>↗</strong> to open the <strong>Page Command Center</strong> for that page.</div>`;
  return _section('proposals', `Proposals (${total})`, body + proposalNextStep);
}

// ─────────────────────────────────────────────────────────────────────────────
// Shell + section helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read active environment name and base URL from VS Code workspace configuration.
 */
function _readEnvContext(): { envLabel: string; baseUrl: string | null } {
  const cfg    = vscode.workspace.getConfiguration('veda');
  const envKey = cfg.get<string>('activeEnvironment') ?? 'local';
  const envs   = cfg.get<Record<string, { baseUrl?: string }>>('environments') ?? {};
  const baseUrl = envs[envKey]?.baseUrl ?? null;
  return { envLabel: envKey.toUpperCase(), baseUrl };
}

function _statRow(label: string, value: string, emphasis?: 'good' | 'warn' | 'error'): string {
  const cls = emphasis === 'good' ? 'stat-good'
    : emphasis === 'warn' ? 'stat-warn'
    : emphasis === 'error' ? 'stat-error'
    : '';
  return `<div class="stat-row">
  <span class="stat-lbl">${escapeHtml(label)}</span>
  <span class="stat-val ${cls}">${escapeHtml(value)}</span>
</div>`;
}

function _section(id: string, heading: string, body: string): string {
  return `<div class="brain-section" id="section-${id}">
  <div class="brain-section-heading" data-toggle="${id}">${escapeHtml(heading)}<span class="collapse-icon">▾</span></div>
  <div class="brain-section-body" id="body-${id}">${body}</div>
</div>`;
}

function _emptyState(msg: string): string {
  return `<div class="empty-state">${escapeHtml(msg)}</div>`;
}

/**
 * Richer empty/error state: panel purpose + current reason + next step.
 * `nextHtml` is trusted HTML (no user data) — keep to static strings only.
 */
function _richEmptyState(
  panelName: string,
  purpose: string,
  reason: string,
  nextHtml: string
): string {
  return `<div class="rich-empty">
  <div class="rich-empty-name">${escapeHtml(panelName)}</div>
  <div class="rich-empty-purpose">${escapeHtml(purpose)}</div>
  <div class="rich-empty-reason">${escapeHtml(reason)}</div>
  <div class="rich-empty-next">${nextHtml}</div>
</div>`;
}

function _shell(body: string, hasData: boolean): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  :root {
    --bg:      var(--vscode-sideBar-background);
    --fg:      var(--vscode-sideBar-foreground, var(--vscode-editor-foreground));
    --border:  var(--vscode-panel-border);
    --muted:   var(--vscode-descriptionForeground);
    --accent:  var(--vscode-textLink-foreground);
    --warn:    var(--vscode-editorWarning-foreground);
    --error:   var(--vscode-editorError-foreground);
    --green:   var(--vscode-terminal-ansiGreen);
    --section: var(--vscode-editor-background);
    --btn-bg:  var(--vscode-button-secondaryBackground);
    --btn-fg:  var(--vscode-button-secondaryForeground);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--vscode-font-family, sans-serif);
    font-size: var(--vscode-font-size, 12px);
    color: var(--fg);
    background: var(--bg);
    padding: 0 0 16px 0;
    line-height: 1.5;
  }

  /* ── Section nav ──────────────────────────────────────────── */
  .brain-nav {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    padding: 6px 10px;
    background: var(--bg);
    border-bottom: 1px solid var(--border);
  }
  .nav-pill {
    background: var(--btn-bg);
    color: var(--btn-fg);
    border: none;
    border-radius: 10px;
    padding: 2px 8px;
    font-size: 0.72em;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }
  .nav-pill:hover { opacity: 0.85; }
  .nav-badge {
    background: var(--warn);
    color: var(--bg);
    border-radius: 7px;
    padding: 0 4px;
    font-size: 0.85em;
    min-width: 14px;
    text-align: center;
    line-height: 1.4;
  }

  /* ── Sections ─────────────────────────────────────────────── */
  .brain-section {
    margin: 6px 10px 0 10px;
    background: var(--section);
    border: 1px solid var(--border);
    border-radius: 3px;
    overflow: hidden;
  }
  .brain-section-heading {
    font-size: 0.75em;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--muted);
    padding: 6px 10px;
    border-bottom: 1px solid var(--border);
    background: var(--bg);
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    align-items: center;
    user-select: none;
  }
  .brain-section-heading:hover { color: var(--fg); }
  .collapse-icon {
    font-size: 0.9em;
    transition: transform 0.15s;
  }
  .brain-section-body { padding: 8px 10px; }
  .brain-section-body.collapsed {
    display: none;
  }
  .brain-section-heading.is-collapsed .collapse-icon {
    transform: rotate(-90deg);
  }

  /* ── Sub-heading ──────────────────────────────────────────── */
  .sub-header {
    font-size: 0.72em;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--accent);
    margin-bottom: 4px;
  }

  /* ── Overview stat grid ───────────────────────────────────── */
  .stat-grid { display: flex; flex-direction: column; gap: 2px; }
  .stat-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 2px 0;
    font-size: 0.88em;
    border-bottom: 1px solid var(--border);
  }
  .stat-row:last-child { border-bottom: none; }
  .stat-lbl { color: var(--muted); }
  .stat-val { font-weight: 600; }
  .stat-good  { color: var(--green); }
  .stat-warn  { color: var(--warn); }
  .stat-error { color: var(--error); }

  /* ── Item header (query + page link) ──────────────────────── */
  .item-header {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-bottom: 2px;
  }
  .item-query { font-size: 0.88em; font-weight: 600; flex: 1; min-width: 0; }

  /* ── Page link buttons ────────────────────────────────────── */
  .page-link-icon {
    background: none;
    border: 1px solid var(--border);
    color: var(--accent);
    border-radius: 2px;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .page-link-icon:hover {
    background: color-mix(in srgb, var(--accent) 15%, transparent);
  }
  .page-link-icon {
    font-size: 0.82em;
    padding: 0 3px;
    line-height: 1.2;
  }
  .no-page { font-size: 0.78em; }

  /* ── Mismatch items ───────────────────────────────────────── */
  .mismatch-item {
    padding: 5px 0;
    border-bottom: 1px solid var(--border);
  }
  .mismatch-item:last-child { border-bottom: none; }
  .mismatch-detail {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 0.82em;
    flex-wrap: wrap;
  }
  .lbl { color: var(--muted); font-size: 0.9em; }
  .arrow { color: var(--muted); }
  .arch-val {
    font-weight: 600;
    padding: 1px 5px;
    border-radius: 2px;
    font-size: 0.9em;
  }
  .arch-page { color: var(--warn); background: color-mix(in srgb, var(--warn) 15%, transparent); }
  .arch-serp { color: var(--green); background: color-mix(in srgb, var(--green) 15%, transparent); }

  /* ── Gap items ────────────────────────────────────────────── */
  .gap-item {
    padding: 5px 0;
    border-bottom: 1px solid var(--border);
  }
  .gap-item:last-child { border-bottom: none; }
  .gap-missing { display: flex; flex-wrap: wrap; gap: 3px; }
  .schema-row { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; font-size: 0.82em; }

  /* ── Entity / schema tags ─────────────────────────────────── */
  .tag-row { display: flex; flex-wrap: wrap; gap: 4px; }
  .entity-tag {
    font-size: 0.75em;
    padding: 1px 5px;
    border-radius: 10px;
    font-weight: 600;
  }
  .entity-missing { background: color-mix(in srgb, var(--error) 20%, transparent); color: var(--error); }
  .entity-warn    { background: color-mix(in srgb, var(--warn) 20%, transparent); color: var(--warn); }
  .entity-present { background: color-mix(in srgb, var(--green) 20%, transparent); color: var(--green); }
  .entity-schema  { background: color-mix(in srgb, var(--accent) 20%, transparent); color: var(--accent); }

  /* ── Uncategorized keywords ───────────────────────────────── */
  .uncategorized-item {
    display: flex;
    align-items: baseline;
    gap: 5px;
    padding: 2px 0;
    font-size: 0.88em;
  }
  .kw-bullet { color: var(--muted); flex-shrink: 0; }
  .uncategorized-query { flex: 1; }

  /* ── Authority items ──────────────────────────────────────── */
  .auth-summary { font-size: 0.8em; display: flex; gap: 10px; margin-bottom: 6px; }
  .auth-summary span::before { content: "• "; }
  .auth-item {
    display: flex;
    align-items: flex-start;
    gap: 7px;
    padding: 5px 0;
    border-bottom: 1px solid var(--border);
  }
  .auth-item:last-child { border-bottom: none; }
  .auth-badge {
    font-size: 0.7em;
    font-weight: 700;
    letter-spacing: 0.04em;
    padding: 2px 5px;
    border-radius: 2px;
    white-space: nowrap;
    flex-shrink: 0;
    margin-top: 1px;
  }
  .badge-error { background: var(--error); color: var(--bg); }
  .badge-warn  { background: var(--warn); color: var(--bg); }
  .badge-muted { color: var(--muted); border: 1px solid var(--border); }
  .auth-body { flex: 1; min-width: 0; }
  .auth-meta  { display: flex; align-items: center; gap: 8px; font-size: 0.78em; margin-top: 1px; }
  .auth-links { color: var(--accent); }

  /* ── All-clear state ──────────────────────────────────────── */
  .all-clear { color: var(--green); }

  /* ── Utility ──────────────────────────────────────────────── */
  .muted { color: var(--muted); font-size: 0.88em; }
  .extra-note { font-size: 0.8em; color: var(--muted); font-style: italic; margin-top: 4px; }
  .empty-state {
    color: var(--muted);
    font-size: 0.88em;
    text-align: center;
    padding: 24px 10px;
  }
  .rich-empty {
    padding: 20px 12px;
  }
  .rich-empty-name {
    font-size: 0.72em;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--muted);
    margin-bottom: 6px;
  }
  .rich-empty-purpose {
    font-size: 0.84em;
    color: var(--fg);
    margin-bottom: 10px;
    line-height: 1.5;
  }
  .rich-empty-reason {
    font-size: 0.82em;
    color: var(--warn);
    margin-bottom: 6px;
  }
  .rich-empty-next {
    font-size: 0.82em;
    color: var(--muted);
  }
  .rich-empty-next em {
    color: var(--accent);
    font-style: normal;
  }

  /* ── Next-step continuity notes ────────────────────────────────────────── */
  .overview-next-step, .section-next-step {
    margin-top: 8px;
    padding-top: 7px;
    border-top: 1px solid var(--border);
    font-size: 0.8em;
    color: var(--muted);
    line-height: 1.5;
  }
  .overview-next-step strong, .section-next-step strong {
    color: var(--accent);
    font-weight: 600;
  }

  /* ── Proposal items ───────────────────────────────────────────────────── */
  .proposal-item {
    padding: 5px 0;
    border-bottom: 1px solid var(--border);
  }
  .proposal-item:last-child { border-bottom: none; }
  .proposal-detail {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 0.82em;
    flex-wrap: wrap;
    margin-top: 2px;
  }
  .proposal-action-badge {
    font-size: 0.78em;
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--accent) 15%, transparent);
    color: var(--accent);
    margin-left: 4px;
  }
  .proposal-id {
    font-size: 0.7em;
    font-family: var(--vscode-editor-font-family, monospace);
    margin-top: 2px;
    opacity: 0.6;
  }
</style>
</head>
<body>
${body}
${hasData ? _script() : ''}
</body>
</html>`;
}

function _script(): string {
  return `<script>
(function() {
  const vscode = acquireVsCodeApi();

  // Section nav: scroll to section
  document.querySelectorAll('.nav-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-target');
      const el = document.getElementById('section-' + target);
      if (el) {
        // Expand if collapsed
        const heading = el.querySelector('.brain-section-heading');
        const body = el.querySelector('.brain-section-body');
        if (heading && body && body.classList.contains('collapsed')) {
          body.classList.remove('collapsed');
          heading.classList.remove('is-collapsed');
        }
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // Section collapse/expand
  document.querySelectorAll('.brain-section-heading').forEach(heading => {
    heading.addEventListener('click', () => {
      const toggle = heading.getAttribute('data-toggle');
      if (!toggle) return;
      const body = document.getElementById('body-' + toggle);
      if (!body) return;
      body.classList.toggle('collapsed');
      heading.classList.toggle('is-collapsed');
    });
  });

  // Page link buttons: send message to extension
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.page-link-icon');
    if (!btn) return;
    const url = btn.getAttribute('data-url');
    if (url) {
      vscode.postMessage({ command: 'openPageCommandCenter', url: url });
    }
  });
})();
</script>`;
}
