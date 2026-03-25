export interface SmsResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function sendSms(phone: string, message: string): Promise<SmsResult> {
  // TODO: Integrate with SMSAPI.pl or Twilio
  // For now, just log and return success
  console.log(`[SMS] To: ${phone}, Message: ${message}`);
  return { success: true, messageId: `placeholder-${Date.now()}` };
}

export function formatTrackingMessage(orderId: string, baseUrl: string): string {
  const trackingUrl = `${baseUrl}/tracking/${orderId}`;
  return `Twój kierowca jest w drodze! Śledź przejazd: ${trackingUrl}`;
}
