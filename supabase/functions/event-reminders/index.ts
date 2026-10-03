import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;

const GMAIL_USER = Deno.env.get("GMAIL_USER");
const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD");

const BRAND_NAME = "EventKalam";
const SITE_URL = Deno.env.get("SITE_URL") || "https://eventkalam.com";

interface Registration {
  registration_id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  phone: string;
  seats: number;
  total_amount: number;
  registration_date: string;
  registration_status: string;
}

interface EventRow {
  event_id: string;
  title: string;
  description: string;
  category: string;
  date: string;
  time: string;
  venue: string;
  city: string;
  price: number;
  image_url: string;
  status: string;
  registrations: Registration[];
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

function getKolkataToday(): string {
  const now = new Date();
  const kolkataTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const year = kolkataTime.getFullYear();
  const month = String(kolkataTime.getMonth() + 1).padStart(2, "0");
  const day = String(kolkataTime.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayReminderHtml(recipientName: string, event: EventRow, reg: Registration): string {
  const firstName = recipientName?.split(" ")[0] || "there";
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Inter', -apple-system, sans-serif; background: #f0f4fa; color: #1a2236; line-height: 1.6; }
.wrapper { width: 100%; max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,.06); }
.header { background: #0a0e1a; padding: 28px 32px; text-align: center; }
.header h1 { color: #ffffff; font-size: 22px; font-weight: 700; font-family: 'Space Grotesk', sans-serif; }
.header p { color: #9fb3d1; font-size: 12px; margin-top: 4px; letter-spacing: .04em; text-transform: uppercase; }
.body { padding: 36px 32px; }
.body h2 { color: #0f172a; font-size: 20px; font-weight: 700; margin-bottom: 12px; font-family: 'Space Grotesk', sans-serif; }
.body p { color: #3b4a63; font-size: 15px; margin-bottom: 14px; }
.body strong { color: #0f172a; }
.info-table { width: 100%; border-collapse: collapse; margin: 20px 0; border: 1px solid #e2eaf5; border-radius: 8px; overflow: hidden; }
.info-table td { padding: 12px 16px; border-bottom: 1px solid #eef3fb; font-size: 14px; }
.info-table td:first-child { color: #76849a; font-weight: 500; width: 35%; background: #f8fafc; }
.info-table td:last-child { color: #0f172a; font-weight: 600; }
.info-table tr:last-child td { border-bottom: none; }
.cta-btn { display: inline-block; background: #2563eb; color: #ffffff !important; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-size: 15px; font-weight: 600; margin: 16px 0; }
.alert-box { padding: 16px 20px; border-radius: 8px; margin: 20px 0; font-size: 14px; }
.alert-reminder { background: #f0fdf4; border-left: 4px solid #22c55e; color: #166534; }
.footer { background: #0a0e1a; padding: 24px 32px; text-align: center; }
.footer p { color: #6b7d99; font-size: 12px; margin: 0; }
.footer a { color: #60a5fa; text-decoration: none; }
.greeting { font-size: 15px; color: #3b4a63; margin-bottom: 20px; }
.greeting strong { color: #0f172a; }
@media only screen and (max-width: 480px) { .wrapper { border-radius: 0; } .body { padding: 24px 20px; } }
</style></head><body>
<div class="wrapper">
  <div class="header"><h1>${BRAND_NAME}</h1><p>Student events, locally curated</p></div>
  <div class="body">
    <p class="greeting">Hi <strong>${firstName}</strong>,</p>
    <h2>Your event is happening today!</h2>
    <div class="alert-box alert-reminder">This is a reminder that <strong>${event.title}</strong> is scheduled for today.</div>
    <div class="info-table">
      <tr><td>Event</td><td>${event.title}</td></tr>
      <tr><td>Date</td><td>${formatDate(event.date)}</td></tr>
      <tr><td>Time</td><td>${event.time || "TBA"}</td></tr>
      <tr><td>Venue</td><td>${event.venue}${event.city ? `, ${event.city}` : ""}</td></tr>
      <tr><td>Seats</td><td>${reg.seats}</td></tr>
      <tr><td>Registration ID</td><td>${reg.registration_id.slice(0, 8).toUpperCase()}</td></tr>
    </div>
    <p>We look forward to seeing you there. Please arrive on time and bring your registration ID for reference.</p>
    <a href="${SITE_URL}" class="cta-btn">View event details</a>
  </div>
  <div class="footer"><p>&copy; 2026 ${BRAND_NAME}. All rights reserved.</p><p><a href="${SITE_URL}">${SITE_URL.replace(/^https?:\/\//, "")}</a></p></div>
</div>
</body></html>`;
}

function todayReminderText(recipientName: string, event: EventRow, reg: Registration): string {
  const firstName = recipientName?.split(" ")[0] || "there";
  return `${BRAND_NAME} — Student events, locally curated\n\nHi ${firstName},\n\nThis is a reminder that "${event.title}" is scheduled for today.\n\nEvent: ${event.title}\nDate: ${formatDate(event.date)}\nTime: ${event.time || "TBA"}\nVenue: ${event.venue}${event.city ? ", " + event.city : ""}\nSeats: ${reg.seats}\nRegistration ID: ${reg.registration_id.slice(0, 8).toUpperCase()}\n\nWe look forward to seeing you there. Please arrive on time.\n\n---\n${BRAND_NAME}\n${SITE_URL}`;
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

async function sendGmail(to: string, subject: string, html: string, text: string): Promise<{ success: boolean; error?: string }> {
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    return { success: false, error: "Gmail credentials not configured." };
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const today = getKolkataToday();

    // Find published events happening today
    const { data: eventsToday, error: eventsError } = await adminClient
      .from("events")
      .select("*")
      .eq("status", "published")
      .eq("date", today);

    if (eventsError) {
      return new Response(
        JSON.stringify({ error: eventsError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!eventsToday || eventsToday.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No events today.", sent: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let sentCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    for (const event of eventsToday as EventRow[]) {
      const registeredUsers = (event.registrations || []).filter(
        (r) => r.registration_status === "registered" && r.user_email
      );

      for (const reg of registeredUsers) {
        const subject = `Today: ${event.title} \uD83C\uDF89`;
        const html = todayReminderHtml(reg.user_name, event, reg);
        const text = todayReminderText(reg.user_name, event, reg);

        const result = await sendGmail(reg.user_email, subject, html, text);
        if (result.success) {
          sentCount++;
        } else {
          failedCount++;
          errors.push(`${reg.user_email}: ${result.error}`);
        }
        // Rate limit between sends
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        date: today,
        eventsFound: eventsToday.length,
        sent: sentCount,
        failed: failedCount,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
