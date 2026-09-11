import React from 'react';
import { UpcomingBillsSection } from '@/modules/bills';

export interface UpcomingBillsWidgetProps {
  daysAhead?: number;
}

export function UpcomingBillsWidget({ daysAhead = 30 }: UpcomingBillsWidgetProps) {
  return <UpcomingBillsSection daysAhead={daysAhead} />;
}
