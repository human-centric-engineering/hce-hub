'use client';

/**
 * MemberSelect (f-task-assignment §22 t2) — the shared member-picker dropdown used
 * wherever the Hub assigns work to a person: the task-sheet assignee picker and the
 * feature page's "reassign remaining" affordance. Each option is an **avatar +
 * first name**, so the two surfaces read identically (a single component, not two
 * divergent renderings).
 *
 * Presentational + controlled: the caller owns the value, the write, and the
 * busy/failure state; this just renders the Radix Select. `invalid` surfaces a
 * failed write on the trigger (a `!` + the `invalidTitle`) without swallowing it.
 * A one-shot picker (the feature affordance) passes no `value` and reads the choice
 * from `onSelect`; a bound picker (the assignee) passes the current member as
 * `value`, so the trigger mirrors them (avatar + name).
 */
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { initials } from '@/components/hub/projects/presentation';
import { firstName } from '@/components/hub/projects/plan/presentation';
import type { UserRef } from '@/components/hub/projects/types';

/** One member option — avatar + first name (also mirrored in the trigger via SelectValue). */
export function MemberOption({ member }: { member: UserRef }) {
  return (
    <span className="flex items-center gap-1.5">
      <Avatar className="h-4 w-4">
        {member.image && <AvatarImage src={member.image} alt="" />}
        <AvatarFallback className="text-[8px]">{initials(member.name)}</AvatarFallback>
      </Avatar>
      {firstName(member.name)}
    </span>
  );
}

export function MemberSelect({
  members,
  value,
  onSelect,
  disabled,
  placeholder,
  ariaLabel,
  invalid = false,
  invalidTitle,
  validTitle,
}: {
  /** The options. */
  members: UserRef[];
  /** The currently-selected member id, or `undefined` for a one-shot picker. */
  value?: string | null;
  /** Called with the chosen member id. */
  onSelect: (memberId: string) => void;
  disabled?: boolean;
  /** Shown on the trigger when nothing is selected. */
  placeholder: string;
  ariaLabel: string;
  /** A failed write — surfaces a `!` on the trigger + the `invalidTitle`. */
  invalid?: boolean;
  invalidTitle?: string;
  validTitle?: string;
}) {
  return (
    <Select value={value ?? undefined} onValueChange={onSelect} disabled={disabled}>
      <SelectTrigger
        className="h-7 w-auto max-w-[12rem] gap-1.5 text-xs"
        aria-label={ariaLabel}
        title={invalid ? invalidTitle : validTitle}
      >
        {invalid && <span className="text-destructive">!</span>}
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {members.map((m) => (
          <SelectItem key={m.id} value={m.id}>
            <MemberOption member={m} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
