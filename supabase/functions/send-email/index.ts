import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Gmail SMTP credentials (stored as edge function secrets)
const GMAIL_USER = Deno.env.get("GMAIL_USER");
const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD");

const BRAND_NAME = "EventKalam";
const BRAND_TAGLINE = "Student events, locally curated";
const SITE_URL = Deno.env.get("SITE_URL") || "https://eventkalam.com";

interface EmailRecipient {
  email: string;
  name: string;
}

interface EventData {
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

interface RegistrationData {
  registration_id: string;
  seats: number;
  total_amount: number;
  registration_status: string;
}

// ============================================================
// EMAIL TEMPLATE HELPERS
// ============================================================

function emailShell(contentHtml: string, previewText: string): string {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <title>${BRAND_NAME}</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #f0f4fa; color: #1a2236; line-height: 1.6; -webkit-font-smoothing: antialiased; }
    .wrapper { width: 100%; max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,.06); }
    .header { background: #0a0e1a; padding: 28px 32px; text-align: center; }
    .header h1 { color: #ffffff; font-size: 22px; font-weight: 700; letter-spacing: -.02em; font-family: 'Space Grotesk', 'Inter', sans-serif; }
    .header p { color: #9fb3d1; font-size: 12px; margin-top: 4px; letter-spacing: .04em; text-transform: uppercase; }
    .body { padding: 36px 32px; }
    .body h2 { color: #0f172a; font-size: 20px; font-weight: 700; margin-bottom: 12px; font-family: 'Space Grotesk', 'Inter', sans-serif; }
    .body p { color: #3b4a63; font-size: 15px; margin-bottom: 14px; }
    .body strong { color: #0f172a; }
    .info-table { width: 100%; border-collapse: collapse; margin: 20px 0; border: 1px solid #e2eaf5; border-radius: 8px; overflow: hidden; }
    .info-table td { padding: 12px 16px; border-bottom: 1px solid #eef3fb; font-size: 14px; }
    .info-table td:first-child { color: #76849a; font-weight: 500; width: 35%; background: #f8fafc; }
    .info-table td:last-child { color: #0f172a; font-weight: 600; }
    .info-table tr:last-child td { border-bottom: none; }
    .cta-btn { display: inline-block; background: #2563eb; color: #ffffff !important; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-size: 15px; font-weight: 600; margin: 16px 0; }
    .cta-btn:hover { background: #3b82f6; }
    .alert-box { padding: 16px 20px; border-radius: 8px; margin: 20px 0; font-size: 14px; }
    .alert-cancelled { background: #fef2f2; border-left: 4px solid #dc4444; color: #991b1b; }
    .alert-postponed { background: #fffbeb; border-left: 4px solid #f5b342; color: #92400e; }
    .alert-reminder { background: #f0fdf4; border-left: 4px solid #22c55e; color: #166534; }
    .event-image { width: 100%; max-height: 220px; object-fit: cover; border-radius: 8px; margin-bottom: 20px; display: block; }
    .footer { background: #0a0e1a; padding: 24px 32px; text-align: center; }
    .footer p { color: #6b7d99; font-size: 12px; margin: 0; line-height: 1.8; }
    .footer a { color: #60a5fa; text-decoration: none; }
    .greeting { font-size: 15px; color: #3b4a63; margin-bottom: 20px; }
    .greeting strong { color: #0f172a; }
    @media only screen and (max-width: 480px) {
      .wrapper { border-radius: 0; }
      .body { padding: 24px 20px; }
      .header { padding: 20px; }
      .info-table td { display: block; width: 100% !important; padding: 6px 16px; }
      .info-table td:first-child { background: transparent; padding-top: 12px; }
      .info-table td:last-child { padding-bottom: 12px; }
    }
  </style>
</head>
<body>
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${previewText}</div>
  <div class="wrapper">
    <div class="header">
      <h1>${BRAND_NAME}</h1>
      <p>${BRAND_TAGLINE}</p>
    </div>
    <div class="body">
      ${contentHtml}
    </div>
    <div class="footer">
      <p>&copy; 2026 ${BRAND_NAME}. All rights reserved.</p>
      <p><a href="${SITE_URL}">${SITE_URL.replace(/^https?:\/\//, '')}</a></p>
    </div>
  </div>
</body>
</html>`;
}

function plainTextShell(content: string): string {
  return `${BRAND_NAME} — ${BRAND_TAGLINE}\n\n${content}\n\n---\n${BRAND_NAME}\n${SITE_URL}`;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "TBA";
  try {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
  } catch {
    return dateStr;
  }
}

function formatPrice(price: number): string {
  return price === 0 ? "Free" : `\u20b9${price}`;
}

// ============================================================
// EMAIL TEMPLATES
// ============================================================

function welcomeEmail(recipient: EmailRecipient): { subject: string; html: string; text: string } {
  const subject = `Welcome to ${BRAND_NAME} \uD83C\uDF89`;
  const firstName = recipient.name?.split(" ")[0] || "there";
  const html = emailShell(`
    <p class="greeting">Hi <strong>${firstName}</strong>,</p>
    <h2>Welcome to ${BRAND_NAME}!</h2>
    <p>Your account has been created successfully. We're glad to have you here.</p>
    <p>${BRAND_NAME} is a place for students to find events worth showing up for — workshops, hackathons, career fairs, and cultural moments happening around your campus.</p>
    <p>Here's what you can do next:</p>
    <div class="info-table">
      <tr><td>Browse events</td><td>Discover events happening near you</td></tr>
      <tr><td>Register</td><td>Save your place in seconds</td></tr>
      <tr><td>Show up</td><td>Arrive, learn something, leave with more</td></tr>
    </div>
    <a href="${SITE_URL}" class="cta-btn">Explore events</a>
    <p>If you have any questions, feel free to reach out. We're here to help.</p>
  `, `Welcome to ${BRAND_NAME} — your account is ready.`);
  const text = plainTextShell(`Hi ${firstName},\n\nWelcome to ${BRAND_NAME}! Your account has been created successfully.\n\n${BRAND_NAME} is a place for students to find events worth showing up for — workshops, hackathons, career fairs, and cultural moments happening around your campus.\n\nNext steps:\n- Browse events at ${SITE_URL}\n- Register for events that interest you\n- Show up and make the most of it\n\nIf you have any questions, feel free to reach out.`);
  return { subject, html, text };
}

function registrationEmail(recipient: EmailRecipient, event: EventData, reg: RegistrationData): { subject: string; html: string; text: string } {
  const subject = `You're registered for ${event.title} \uD83C\uDF9F\uFE0F`;
  const firstName = recipient.name?.split(" ")[0] || "there";
  const html = emailShell(`
    <p class="greeting">Hi <strong>${firstName}</strong>,</p>
    <h2>You're registered!</h2>
    <p>Your registration for <strong>${event.title}</strong> has been confirmed. Here are the details:</p>
    <div class="info-table">
      <tr><td>Event</td><td>${event.title}</td></tr>
      <tr><td>Date</td><td>${formatDate(event.date)}</td></tr>
      <tr><td>Time</td><td>${event.time || "TBA"}</td></tr>
      <tr><td>Venue</td><td>${event.venue}${event.city ? `, ${event.city}` : ""}</td></tr>
      <tr><td>Seats</td><td>${reg.seats}</td></tr>
      <tr><td>Amount</td><td>${formatPrice(reg.total_amount)}</td></tr>
      <tr><td>Registration ID</td><td>${reg.registration_id.slice(0, 8).toUpperCase()}</td></tr>
    </div>
    ${event.description ? `<p>${event.description}</p>` : ""}
    <a href="${SITE_URL}" class="cta-btn">View event details</a>
    <p>Save your registration ID for reference. We look forward to seeing you there!</p>
  `, `You're registered for ${event.title}.`);
  const text = plainTextShell(`Hi ${firstName},\n\nYour registration for "${event.title}" has been confirmed.\n\nEvent: ${event.title}\nDate: ${formatDate(event.date)}\nTime: ${event.time || "TBA"}\nVenue: ${event.venue}${event.city ? ", " + event.city : ""}\nSeats: ${reg.seats}\nAmount: ${formatPrice(reg.total_amount)}\nRegistration ID: ${reg.registration_id.slice(0, 8).toUpperCase()}\n\nWe look forward to seeing you there!`);
  return { subject, html, text };
}

function cancelledEmail(recipient: EmailRecipient, event: EventData): { subject: string; html: string; text: string } {
  const subject = `Event Cancelled — ${event.title}`;
  const firstName = recipient.name?.split(" ")[0] || "there";
  const html = emailShell(`
    <p class="greeting">Hi <strong>${firstName}</strong>,</p>
    <h2>Event Cancelled</h2>
    <div class="alert-box alert-cancelled">
      <strong>${event.title}</strong> has been cancelled and will no longer take place as originally scheduled.
    </div>
    <p>We're sorry for the inconvenience. Here were the original details:</p>
    <div class="info-table">
      <tr><td>Event</td><td>${event.title}</td></tr>
      <tr><td>Date</td><td>${formatDate(event.date)}</td></tr>
      <tr><td>Time</td><td>${event.time || "TBA"}</td></tr>
      <tr><td>Venue</td><td>${event.venue}${event.city ? `, ${event.city}` : ""}</td></tr>
    </div>
    <p>If you have any questions, please don't hesitate to reach out to us.</p>
    <a href="${SITE_URL}" class="cta-btn">Browse other events</a>
  `, `${event.title} has been cancelled.`);
  const text = plainTextShell(`Hi ${firstName},\n\nWe're sorry to inform you that "${event.title}" has been cancelled and will no longer take place as originally scheduled.\n\nOriginal details:\nEvent: ${event.title}\nDate: ${formatDate(event.date)}\nTime: ${event.time || "TBA"}\nVenue: ${event.venue}${event.city ? ", " + event.city : ""}\n\nWe apologize for the inconvenience. If you have any questions, please reach out to us.\n\nBrowse other events at ${SITE_URL}`);
  return { subject, html, text };
}

function postponedEmail(recipient: EmailRecipient, event: EventData, oldDate?: string, oldTime?: string): { subject: string; html: string; text: string } {
  const subject = `Event Postponed — ${event.title}`;
  const firstName = recipient.name?.split(" ")[0] || "there";
  const hasNewDate = event.date && event.date !== oldDate;
  const html = emailShell(`
    <p class="greeting">Hi <strong>${firstName}</strong>,</p>
    <h2>Event Postponed</h2>
    <div class="alert-box alert-postponed">
      <strong>${event.title}</strong> has been postponed. The originally scheduled date is no longer valid.
    </div>
    <p>Here's what we know so far:</p>
    <div class="info-table">
      <tr><td>Event</td><td>${event.title}</td></tr>
      ${oldDate ? `<tr><td>Previous date</td><td>${formatDate(oldDate)}</td></tr>` : ""}
      ${oldTime ? `<tr><td>Previous time</td><td>${oldTime}</td></tr>` : ""}
      <tr><td>Current date</td><td>${hasNewDate ? formatDate(event.date) : "To be announced"}</td></tr>
      <tr><td>Current time</td><td>${event.time || "TBA"}</td></tr>
      <tr><td>Venue</td><td>${event.venue}${event.city ? `, ${event.city}` : ""}</td></tr>
    </div>
    <p>Please check the website for the most up-to-date information. We'll keep you posted as details are finalized.</p>
    <a href="${SITE_URL}" class="cta-btn">Check for updates</a>
  `, `${event.title} has been postponed.`);
  const text = plainTextShell(`Hi ${firstName},\n\n"${event.title}" has been postponed. The originally scheduled date is no longer valid.\n\n${oldDate ? "Previous date: " + formatDate(oldDate) + "\n" : ""}${oldTime ? "Previous time: " + oldTime + "\n" : ""}Current date: ${hasNewDate ? formatDate(event.date) : "To be announced"}\nCurrent time: ${event.time || "TBA"}\nVenue: ${event.venue}${event.city ? ", " + event.city : ""}\n\nPlease check ${SITE_URL} for the most up-to-date information.`);
  return { subject, html, text };
}

function todayReminderEmail(recipient: EmailRecipient, event: EventData, reg: RegistrationData): { subject: string; html: string; text: string } {
  const subject = `Today: ${event.title} \uD83C\uDF89`;
  const firstName = recipient.name?.split(" ")[0] || "there";
  const html = emailShell(`
    <p class="greeting">Hi <strong>${firstName}</strong>,</p>
    <h2>Your event is happening today!</h2>
    <div class="alert-box alert-reminder">
      This is a reminder that <strong>${event.title}</strong> is scheduled for today.
    </div>
    <div class="info-table">
      <tr><td>Event</td><td>${event.title}</td></tr>
      <tr><td>Date</td><td>${formatDate(event.date)}</td></tr>
      <tr><td>Time</td><td>${event.time || "TBA"}</td></tr>
      <tr><td>Venue</td><td>${event.venue}${event.city ? `, ${event.city}` : ""}</td></tr>
      <tr><td>Seats</td><td>${reg.seats}</td></tr>
      <tr><td>Registration ID</td><td>${reg.registration_id.slice(0, 8).toUpperCase()}</td></tr>
    </div>
    <p>We look forward to seeing you there. Please arrive on time and bring your registration ID for reference.</p>
  `, `Reminder: ${event.title} is happening today.`);
  const text = plainTextShell(`Hi ${firstName},\n\nThis is a reminder that "${event.title}" is scheduled for today.\n\nEvent: ${event.title}\nDate: ${formatDate(event.date)}\nTime: ${event.time || "TBA"}\nVenue: ${event.venue}${event.city ? ", " + event.city : ""}\nSeats: ${reg.seats}\nRegistration ID: ${reg.registration_id.slice(0, 8).toUpperCase()}\n\nWe look forward to seeing you there. Please arrive on time.`);
  return { subject, html, text };
}

function newEventEmail(recipient: EmailRecipient, event: EventData): { subject: string; html: string; text: string } {
  const subject = `New Event on ${BRAND_NAME} — ${event.title} \uD83C\uDF89`;
  const firstName = recipient.name?.split(" ")[0] || "there";
  const html = emailShell(`
    <p class="greeting">Hi <strong>${firstName}</strong>,</p>
    <h2>A new event just dropped!</h2>
    <p>There's a new event on ${BRAND_NAME} that might interest you.</p>
    ${event.image_url ? `<img src="${event.image_url}" alt="${event.title}" class="event-image" />` : ""}
    <div class="info-table">
      <tr><td>Event</td><td>${event.title}</td></tr>
      <tr><td>Date</td><td>${formatDate(event.date)}</td></tr>
      <tr><td>Time</td><td>${event.time || "TBA"}</td></tr>
      <tr><td>Venue</td><td>${event.venue}${event.city ? `, ${event.city}` : ""}</td></tr>
      <tr><td>Category</td><td>${event.category}</td></tr>
      <tr><td>Price</td><td>${formatPrice(event.price || 0)}</td></tr>
    </div>
    ${event.description ? `<p>${event.description.length > 200 ? event.description.slice(0, 200) + "..." : event.description}</p>` : ""}
    <a href="${SITE_URL}" class="cta-btn">Register now</a>
  `, `New event: ${event.title} is now available on ${BRAND_NAME}.`);
  const text = plainTextShell(`Hi ${firstName},\n\nA new event just dropped on ${BRAND_NAME}!\n\nEvent: ${event.title}\nDate: ${formatDate(event.date)}\nTime: ${event.time || "TBA"}\nVenue: ${event.venue}${event.city ? ", " + event.city : ""}\nCategory: ${event.category}\nPrice: ${formatPrice(event.price || 0)}\n\n${event.description ? event.description.slice(0, 200) : ""}\n\nRegister now at ${SITE_URL}`);
  return { subject, html, text };
}

// ============================================================
// GMAIL SMTP SENDER
// ============================================================

async function sendGmail(
  to: string,
  subject: string,
  html: string,
  text: string
): Promise<{ success: boolean; error?: string }> {
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    return {
      success: false,
      error: "Gmail credentials not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD as edge function secrets.",
    };
  }

  const rawEmail = buildRawEmail(GMAIL_USER, to, subject, html, text);

  const authToken = btoa(`\u0000${GMAIL_USER}\u0000${GMAIL_APP_PASSWORD}`);

  const response = await fetch("https://api.gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${authToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      raw: btoa(rawEmail).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    return { success: false, error: `Gmail API error (${response.status}): ${errText}` };
  }

  return { success: true };
}

function buildRawEmail(from: string, to: string, subject: string, html: string, text: string): string {
  const boundary = "boundary_" + Math.random().toString(36).slice(2);
  const lines: string[] = [
    `From: ${BRAND_NAME} <${from}>`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: 8bit`,
    ``,
    text,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: 8bit`,
    ``,
    html,
    ``,
    `--${boundary}--`,
    ``,
  ];
  return lines.join("\r\n");
}

// ============================================================
// EMAIL TYPE DISPATCHER
// ============================================================

const templateFns: Record<string, (r: EmailRecipient, e: EventData, reg: RegistrationData, extra: Record<string, string>) => { subject: string; html: string; text: string }> = {
  welcome: (r) => welcomeEmail(r),
  registration: (r, e, reg) => registrationEmail(r, e, reg),
  cancelled: (r, e) => cancelledEmail(r, e),
  postponed: (r, e, _reg, extra) => postponedEmail(r, e, extra.oldDate, extra.oldTime),
  today_reminder: (r, e, reg) => todayReminderEmail(r, e, reg),
  new_event: (r, e) => newEventEmail(r, e),
};

interface SendEmailRequest {
  type: keyof typeof templateFns;
  recipient: EmailRecipient;
  event?: EventData;
  registration?: RegistrationData;
  extra?: Record<string, string>;
  // For batch sends (new event notification to all users)
  batch?: {
    recipients: EmailRecipient[];
    type: keyof typeof templateFns;
    event?: EventData;
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json() as SendEmailRequest;

    // Batch mode: send to multiple recipients (e.g. new event notification)
    if (body.batch && body.batch.recipients?.length > 0) {
      const { recipients, type, event } = body.batch;
      const fn = templateFns[type];
      if (!fn) {
        return new Response(
          JSON.stringify({ error: `Unknown email type: ${type}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const results: { email: string; success: boolean; error?: string }[] = [];
      for (const recipient of recipients) {
        const emailContent = fn(recipient, event || {} as EventData, {} as RegistrationData, {});
        const result = await sendGmail(recipient.email, emailContent.subject, emailContent.html, emailContent.text);
        results.push({ email: recipient.email, success: result.success, error: result.error });
        // Rate limit: 500ms between sends
        await new Promise((r) => setTimeout(r, 500));
      }
      const sent = results.filter((r) => r.success).length;
      return new Response(
        JSON.stringify({ success: true, sent, failed: results.length - sent, details: results }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Single email mode
    const { type, recipient, event, registration, extra } = body;
    const fn = templateFns[type];
    if (!fn) {
      return new Response(
        JSON.stringify({ error: `Unknown email type: ${type}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const emailContent = fn(recipient, event || {} as EventData, registration || {} as RegistrationData, extra || {});
    const result = await sendGmail(recipient.email, emailContent.subject, emailContent.html, emailContent.text);

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: result.error }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
