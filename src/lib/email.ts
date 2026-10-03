/**
 * Email notification helper — calls the send-email edge function.
 * Email sending is best-effort: failures are reported but never block the main operation.
 */

export interface EmailRecipient {
  email: string;
  name: string;
}

export interface EmailEventData {
  title: string;
  date: string;
  time: string;
  venue: string;
  city: string;
  description: string;
  category: string;
  image_url?: string;
  price?: number;
}

export interface EmailRegistrationData {
  registration_id: string;
  seats: number;
  total_amount: number;
  registration_status: string;
}

export type EmailType =
  | 'welcome'
  | 'registration'
  | 'cancelled'
  | 'postponed'
  | 'today_reminder'
  | 'new_event';

interface SendEmailPayload {
  type: EmailType;
  recipient: EmailRecipient;
  event?: EmailEventData;
  registration?: EmailRegistrationData;
  extra?: Record<string, string>;
  batch?: {
    recipients: EmailRecipient[];
    type: EmailType;
    event?: EmailEventData;
  };
}

interface EmailResult {
  success: boolean;
  error?: string;
}

async function callSendEmail(payload: SendEmailPayload): Promise<EmailResult> {
  try {
    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email`;
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      return { success: false, error: data.error || `Email service returned ${response.status}` };
    }

    const data = await response.json().catch(() => ({}));
    if (data.error) {
      return { success: false, error: data.error };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Network error' };
  }
}

/**
 * Send a welcome email after successful account creation.
 * Never throws — returns the result so the caller can show appropriate UI.
 */
export async function sendWelcomeEmail(recipient: EmailRecipient): Promise<EmailResult> {
  return callSendEmail({ type: 'welcome', recipient });
}

/**
 * Send a registration confirmation email after successful event registration.
 */
export async function sendRegistrationEmail(
  recipient: EmailRecipient,
  event: EmailEventData,
  registration: EmailRegistrationData
): Promise<EmailResult> {
  return callSendEmail({ type: 'registration', recipient, event, registration });
}

/**
 * Send cancellation emails to all registered users of an event.
 * Called from the admin panel after an event is cancelled.
 */
export async function sendCancelledEmails(
  recipients: EmailRecipient[],
  event: EmailEventData
): Promise<EmailResult> {
  if (recipients.length === 0) return { success: true };
  return callSendEmail({
    type: 'cancelled',
    recipient: recipients[0],
    event,
    batch: { recipients, type: 'cancelled', event },
  });
}

/**
 * Send postponement emails to all registered users of an event.
 */
export async function sendPostponedEmails(
  recipients: EmailRecipient[],
  event: EmailEventData,
  oldDate?: string,
  oldTime?: string
): Promise<EmailResult> {
  if (recipients.length === 0) return { success: true };
  return callSendEmail({
    type: 'postponed',
    recipient: recipients[0],
    event,
    extra: { oldDate: oldDate || '', oldTime: oldTime || '' },
    batch: { recipients, type: 'postponed', event },
  });
}

/**
 * Send new event notification to all users.
 */
export async function sendNewEventEmails(
  recipients: EmailRecipient[],
  event: EmailEventData
): Promise<EmailResult> {
  if (recipients.length === 0) return { success: true };
  return callSendEmail({
    type: 'new_event',
    recipient: recipients[0],
    event,
    batch: { recipients, type: 'new_event', event },
  });
}
