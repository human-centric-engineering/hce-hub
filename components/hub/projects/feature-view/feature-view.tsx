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
import { WaitingOnChips } from '@/components/hub/projects/plan/waiting-on-chips';
import { featureStatus } from '@/components/hub/projects/plan/presentation';
import { initials } from '@/components/hub/projects/presentation';
import { Markdown } from '@/components/hub/markdown';
import { FeatureTaskList } from '@/components/hub/projects/feature-view/feature-task-list';
import { FeatureActivity } from '@/components/hub/projects/feature-view/feature-activity';
import { ClaimFeatureButton } from '@/components/hub/projects/feature-view/claim-feature-button';
import { ReassignRemainingButton } from '@/components/hub/projects/feature-view/reassign-remaining-button';
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
  // The "reassign remaining tasks" affordance only makes sense once there are real
  // tasks and at least one is still open (merged tasks keep their doer credit).
  const hasOpenTasks =
    feature.planningStage === 'planned' && feature.tasks.some((t) => t.status !== 'merged');

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <Link
        href={`/projects/${feature.projectSlug ?? feature.projectId}`}
        className="text-xs hover:underline"
        style={{ color: 'var(--ink-faint)' }}
      >
        ← {feature.projectName}
      </Link>

      <header className="mt-3 mb-8">
        <div className="flex flex-wrap items-center gap-2">
          {feature.number != null && (
            <span className="font-mono text-sm tabular-nums" style={{ color: 'var(--ink-faint)' }}>
              §{feature.number}
            </span>
          )}
          {feature.slug && (
            <span className="font-mono text-sm" style={{ color: 'var(--ink-faint)' }}>
              {feature.slug}
            </span>
          )}
          <StatusPill tone={status.tone} label={status.label} />
          <StageChip stage={feature.planningStage} />
          {/*
            Which band this feature sits in — filed since §22, shown nowhere until
            now. Links back to the Plan with that band open (§33 t-99), so the
            phase reads as a place you can go rather than a label.
          */}
          {feature.phase && (
            <Link
              href={`/projects/${feature.projectSlug ?? feature.projectId}?phase=${encodeURIComponent(feature.phase.id)}`}
              className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] font-medium hover:underline"
              style={{ backgroundColor: 'var(--surface-sunk)', color: 'var(--ink-mute)' }}
            >
              {feature.phase.name}
            </Link>
          )}
          {feature.helpWanted && (
            <span
              className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] font-medium"
              style={{ backgroundColor: 'var(--accent-bg)', color: 'var(--accent-ink)' }}
            >
              help wanted
            </span>
          )}
        </div>
        {/* Why this feature is blocked — the unshipped deps it waits on (§20 t-37). */}
        {feature.status === 'blocked' && (
          <WaitingOnChips waitingOn={feature.waitingOn} className="mt-2" />
        )}
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

        {/* Claim affordance — an unowned, unshipped feature is available to pick
            up (owner's self-hosting flow: claim here, then a repo session plans it). */}
        {!feature.owner && feature.status !== 'shipped' && (
          <div className="mt-4">
            <ClaimFeatureButton projectId={feature.projectId} featureId={feature.id} />
          </div>
        )}
      </header>

      <div className="flex flex-col gap-8">
        {/* Description + done-when render as markdown (§21 t-d) — no more leaked
            literal `**`. Server-rendered (the Markdown wrapper is stateless). */}
        {feature.description && <Markdown content={feature.description} className="text-[15px]" />}

        {feature.doneWhen && (
          <section className="flex flex-col gap-1.5">
            <div className={sectionLabel} style={{ color: 'var(--ink-faint)' }}>
              Done when
            </div>
            <Markdown content={feature.doneWhen} className="text-[14px]" />
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
                  href={`/projects/${feature.projectSlug ?? feature.projectId}/features/${d.slug ?? d.id}`}
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
          <div className="flex items-center justify-between gap-3">
            <div className={sectionLabel} style={{ color: 'var(--ink-faint)' }}>
              {feature.planningStage === 'planned' ? 'Tasks' : 'Sketch'}
            </div>
            {hasOpenTasks && feature.members.length > 0 && (
              <ReassignRemainingButton
                projectId={feature.projectId}
                featureId={feature.id}
                members={feature.members}
              />
            )}
          </div>
          <FeatureTaskList
            tasks={feature.tasks}
            indicativeTasks={feature.indicativeTasks}
            phaseBoundaries={feature.taskPhaseBoundaries}
          />
        </section>

        <FeatureActivity
          projectId={feature.projectId}
          projectRef={feature.projectSlug ?? feature.projectId}
          featureId={feature.id}
        />
      </div>
    </div>
  );
}
