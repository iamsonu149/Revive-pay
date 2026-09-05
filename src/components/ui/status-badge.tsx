import {Badge} from './badge';
import type {ComponentProps} from 'react';

type BadgeVariant = ComponentProps<typeof Badge>['variant'];

/** Maps RecoveryCase.status → Badge variant + display label */
const statusMap: Record<string, {variant: BadgeVariant; label: string}> = {
  PENDING:          {variant: 'default',  label: 'Pending'},
  APPROVED:         {variant: 'info',     label: 'Approved'},
  NEEDS_REVIEW:     {variant: 'warning',  label: 'Needs Review'},
  EXECUTED:         {variant: 'info',     label: 'Executed'},
  RECOVERED:        {variant: 'success',  label: 'Recovered'},
  FAILED:           {variant: 'danger',   label: 'Failed'},
  STOP:             {variant: 'danger',   label: 'Stopped'},
  RETRY_LATER:      {variant: 'warning',  label: 'Retry Later'},
  SEND_PAYMENT_UPDATE_LINK: {variant: 'info', label: 'Send Link'},
};

export function StatusBadge({status, className}: {status: string; className?: string}) {
  const mapped = statusMap[status] ?? {variant: 'muted' as BadgeVariant, label: status};
  return (
    <Badge variant={mapped.variant} className={className}>
      {mapped.label}
    </Badge>
  );
}
