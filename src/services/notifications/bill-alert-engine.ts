import { getUpcomingBills } from '@/services/database/bill-dao';
import { insertNotification, getNotifications } from '@/services/database/notification-dao';
import { formatCurrency } from '@/utils/format';
import { DeviceEventEmitter } from 'react-native';

export class BillAlertEngine {
  /**
   * Evaluates all upcoming and overdue bills to trigger proactive notifications.
   * Prevents spam by checking existing notifications.
   */
  public static async evaluateUpcomingBillAlerts(): Promise<number> {
    try {
      const upcomingBills = await getUpcomingBills(7); // Check bills due within 7 days or overdue
      if (upcomingBills.length === 0) return 0;

      const existingNotifications = await getNotifications();
      const now = new Date();
      const pad = (n: number) => n.toString().padStart(2, '0');
      const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      const todayTime = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

      let alertedCount = 0;

      for (const bill of upcomingBills) {
        if (bill.status === 'PAID' || bill.status === 'DISMISSED') continue;

        const [bYear, bMonth, bDay] = bill.dueDate.split('-').map(Number);
        const dueTime = new Date(bYear, bMonth - 1, bDay).getTime();
        const diffDays = Math.round((dueTime - todayTime) / (1000 * 60 * 60 * 24));

        let alertTitle = '';
        let alertDesc = '';
        let alertType: 'alert' | 'default' = 'default';

        if (diffDays < 0) {
          // Overdue
          alertTitle = `Overdue Bill: ${bill.billerName}`;
          alertDesc = `Your ${bill.billerName} bill of ${formatCurrency(bill.amountDue)} was due on ${bill.dueDate}. Please pay to avoid penalties.`;
          alertType = 'alert';
        } else if (diffDays === 0) {
          // Due Today
          alertTitle = `Bill Due Today: ${bill.billerName}`;
          alertDesc = `Reminder: ${bill.billerName} bill of ${formatCurrency(bill.amountDue)} is due today (${bill.dueDate}).`;
          alertType = 'alert';
        } else if (diffDays <= bill.reminderDaysBefore) {
          // Due Soon
          alertTitle = `Bill Due in ${diffDays} Day${diffDays > 1 ? 's' : ''}: ${bill.billerName}`;
          alertDesc = `Your ${bill.billerName} bill of ${formatCurrency(bill.amountDue)} is due on ${bill.dueDate}.`;
          alertType = 'default';
        }

        if (!alertTitle) continue;

        // Check if we already sent an alert for this bill recently (in the last 24h)
        const alreadyAlerted = existingNotifications.some((n) => {
          const isSameTitle = n.title.includes(bill.billerName);
          const isRecent =
            now.getTime() - new Date(n.createdAt).getTime() < 24 * 60 * 60 * 1000;
          return isSameTitle && isRecent;
        });

        if (!alreadyAlerted) {
          await insertNotification({
            title: alertTitle,
            description: alertDesc,
            type: alertType,
            actionUrl: '/(app)/bills',
          });
          alertedCount++;
        }
      }

      if (alertedCount > 0) {
        DeviceEventEmitter.emit('notificationsUpdated');
      }

      return alertedCount;
    } catch (error) {
      console.warn('[BillAlertEngine] Error evaluating bill alerts:', error);
      return 0;
    }
  }
}
