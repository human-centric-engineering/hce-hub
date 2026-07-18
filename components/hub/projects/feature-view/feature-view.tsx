/**
 * The feature page body (f-feature-planning §18 t-3) — the deep, shareable view
 * of one feature at `/projects/<id>/features/<slug>`.
 *
 * Header (slug · title · status · planning-stage · help-wanted · owner), then the
 * narrative sections (description, definition of done, reference chips, dependency
 * chips), the task surface (real tasks once planned, or the indicative sketch —
 * `FeatureTaskList`), and the feature-scoped journal (`FeatureActivity`). A server
 * component: it composes the server-fetched detail and mounts the two client
 * children (the task rows open the `?task=` sheet; the journal is client-fetched).
 */
import Link from 'next/link';
import { sanitizeUrl } from '@/lib/security/sanitize';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { StatusPill } from '@/components/hub/projects/plan/status-pill';
import { featureStatus } from '@/components/hub/projects/plan/presentation';
import { initials } from '@/components/hub/projects/presentation';
import { FeatureTaskList } from '@/components/hub/projects/feature-view/feature-task-list';
import { FeatureActivity } from '@/components/hub/projects/feature-view/feature-activity';
import type {
  FeatureDetailDTO,
  FeatureReferenceDTO,
} from '@/components/hub/projects/feature-view/types';

const sectionLabel = 'font-mono text-[10px] tracking-wider uppercase';

/** A reference chip — a link when its target sanitizes to a safe http(s) URL, else text. */
function ReferenceChip({ reference }: { reference: FeatureReferenceDTO }) {
  const safe = sanitizeUrl(reference.target);
  const isLink = safe.startsWith('http://') || safe.startsWith('https://');
  const className = 'inline-flex items-center rounded border px-2 py-0.5 text-xs';
  const style = { borderColor: 'var(--line)', color: 'var(--ink-mute)' } as const;

  return isLink ? (
    <a
      href={safe}
      target="_blank"
      rel="noreferrer"
      className={`${className} hover:underline`}
      style={style}
    >
      {reference.label}
    </a>
  ) : (
    <span className={className} style={style} title={reference.target}>
      {reference.label}
    </span>
  );
}

/** Quiet chip marking whether the feature's tasks are defined yet (§18 depth axis). */
function StageChip({ stage }: { stage: FeatureDetailDTO['planningStage'] }) {
  const indicative = stage === 'indicative';
  return (
    <span
      className="inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase"
      style={{
        borderStyle: indicative ? 'dashed' : 'solid',
        borderColor: 'var(--line)',
        color: 'var(--ink-faint)',
      }}
      title={indicative ? 'High-level sketch — tasks not planned yet' : 'Tasks planned'}
    >
      {stage}
    </span>
  );
}

export function FeatureView({ feature }: { feature: FeatureDetailDTO }) {
  const status = featureStatus(feature.status);

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <Link
        href={`/projects/${feature.projectId}`}
        className="text-xs hover:underline"
        style={{ color: 'var(--ink-faint)' }}
      >
        ← {feature.projectName}
      </Link>

      <header className="mt-3 mb-8">
        <div className="flex flex-wrap items-center gap-2">
          {feature.slug && (
            <span className="font-mono text-sm" style={{ color: 'var(--ink-faint)' }}>
              {feature.slug}
            </span>
          )}
          <StatusPill tone={status.tone} label={status.label} />
          <StageChip stage={feature.planningStage} />
          {feature.helpWanted && (
            <span
              className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] font-medium"
              style={{ backgroundColor: 'var(--accent-bg)', color: 'var(--accent-ink)' }}
            >
              help wanted
            </span>
          )}
        </div>
        <h1 className="mt-2 text-[26px] font-medium tracking-[-0.02em]">{feature.title}</h1>

        <div className="mt-3 flex items-center gap-2 text-sm" style={{ color: 'var(--ink-mute)' }}>
          <span style={{ color: 'var(--ink-faint)' }}>owner</span>
          {feature.owner ? (
            <span className="flex items-center gap-1.5">
              <Avatar className="h-6 w-6">
                {feature.owner.image && <AvatarImage src={feature.owner.image} alt="" />}
                <AvatarFallback className="text-[10px]">
                  {initials(feature.owner.name)}
                </AvatarFallback>
              </Avatar>
              {feature.owner.name}
            </span>
          ) : (
            <span className="italic" style={{ color: 'var(--ink-faint)' }}>
              unassigned
            </span>
          )}
        </div>
      </header>

      <div className="flex flex-col gap-8">
        {feature.description && (
          <p
            className="text-[15px] leading-relaxed whitespace-pre-wrap"
            style={{ color: 'var(--ink-soft)' }}
          >
            {feature.description}
          </p>
        )}

        {feature.doneWhen && (
          <section className="flex flex-col gap-1.5">
            <div className={sectionLabel} style={{ color: 'var(--ink-faint)' }}>
              Done when
            </div>
            <p
              className="text-[14px] leading-relaxed whitespace-pre-wrap"
              style={{ color: 'var(--ink-soft)' }}
            >
              {feature.doneWhen}
            </p>
          </section>
        )}

        {feature.references.length > 0 && (
          <section className="flex flex-col gap-1.5">
            <div className={sectionLabel} style={{ color: 'var(--ink-faint)' }}>
              References
            </div>
            <div className="flex flex-wrap gap-1.5">
              {feature.references.map((r, i) => (
                <ReferenceChip key={`${r.label}-${i}`} reference={r} />
              ))}
            </div>
          </section>
        )}

        {feature.dependsOn.length > 0 && (
          <section className="flex flex-col gap-1.5">
            <div className={sectionLabel} style={{ color: 'var(--ink-faint)' }}>
              Depends on
            </div>
            <div className="flex flex-wrap gap-1.5">
              {feature.dependsOn.map((d) => (
                <Link
                  key={d.id}
                  href={`/projects/${feature.projectId}/features/${d.slug ?? d.id}`}
                  className="inline-flex items-center rounded border px-2 py-0.5 font-mono text-xs hover:underline"
                  style={{ borderColor: 'var(--line)', color: 'var(--ink-mute)' }}
                  title={d.title}
                >
                  {d.slug ?? d.title}
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="flex flex-col gap-2">
          <div className={sectionLabel} style={{ color: 'var(--ink-faint)' }}>
            {feature.planningStage === 'planned' ? 'Tasks' : 'Sketch'}
          </div>
          <FeatureTaskList tasks={feature.tasks} indicativeTasks={feature.indicativeTasks} />
        </section>

        <FeatureActivity projectId={feature.projectId} featureId={feature.id} />
      </div>
    </div>
  );
}
