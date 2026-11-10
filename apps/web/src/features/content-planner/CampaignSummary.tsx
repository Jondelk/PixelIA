import type { Campaign } from '@pixel/contracts';
import { useResource } from '../../lib/useResource';
import { campaignPeriod } from '../campaigns/campaignLogic';
import { getStrategy } from '../campaigns/campaignsApi';

/**
 * Resumen compacto de la campaña elegida en el formulario del planner: lo justo para decidir, no
 * la estrategia entera. El concepto sale de su estrategia vigente.
 */
export function CampaignSummary({
  workspaceId,
  campaign,
}: {
  workspaceId: string;
  campaign: Campaign;
}) {
  const { state } = useResource(
    `planner-campaign-strategy:${workspaceId}:${campaign.id}:${campaign.currentStrategyVersion ?? 0}`,
    (signal) => getStrategy(workspaceId, campaign.id, undefined, signal),
  );
  const concept = state.status === 'success' ? (state.data.strategy?.concept ?? null) : null;
  return (
    <CampaignSummaryView
      campaign={campaign}
      concept={concept}
      loading={state.status === 'loading'}
    />
  );
}

export function CampaignSummaryView({
  campaign,
  concept,
  loading = false,
}: {
  campaign: Campaign;
  concept: string | null;
  loading?: boolean;
}) {
  const facts: [string, string | null][] = [
    ['Campaña', campaign.name],
    ['Objetivo', campaign.objective],
    ['Concepto', loading ? '…' : concept],
    ['Mensaje principal', campaign.keyMessage],
    ['Periodo', campaignPeriod(campaign)],
  ];
  return (
    <div className="rounded-xl border border-line-strong bg-elevated px-5 py-4">
      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        {facts
          .filter((fact): fact is [string, string] => Boolean(fact[1]))
          .map(([label, value]) => (
            <div key={label}>
              <dt className="text-[11px] font-medium uppercase tracking-[0.18em] text-subtle">
                {label}
              </dt>
              <dd className="mt-1 text-fg">{value}</dd>
            </div>
          ))}
      </dl>
      {!campaign.currentStrategyVersion && (
        <p className="mt-3 text-xs text-subtle">
          Esta campaña aún no tiene estrategia: créala en Campañas antes de planificar su contenido.
        </p>
      )}
    </div>
  );
}
