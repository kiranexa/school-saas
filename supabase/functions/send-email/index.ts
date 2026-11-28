import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get pending emails (limit 10 per run)
    const { data: emails, error } = await supabase
      .from("email_outbox")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(10);

    if (error) throw error;

    if (!emails || emails.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Email service configuration
    const emailProvider = Deno.env.get("EMAIL_PROVIDER") || "resend"; // resend, sendgrid, mailgun
    const apiKey = Deno.env.get("EMAIL_API_KEY");
    const fromEmail = Deno.env.get("EMAIL_FROM") || "noreply@school-saas.local";

    if (!apiKey) {
      console.warn("EMAIL_API_KEY not set, marking emails as failed");
      for (const email of emails) {
        await supabase
          .from("email_outbox")
          .update({ status: "failed", error_msg: "EMAIL_API_KEY not configured", retries: email.retries + 1 })
          .eq("id", email.id);
      }
      return new Response(JSON.stringify({ processed: emails.length, error: "No API key" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    for (const email of emails) {
      try {
        let result: Response;

        if (emailProvider === "resend") {
          result = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: fromEmail,
              to: [email.to_email],
              subject: email.subject,
              html: email.body_html,
              text: email.body_text,
            }),
          });
        } else if (emailProvider === "sendgrid") {
          result = await fetch("https://api.sendgrid.com/v3/mail/send", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              personalizations: [{ to: [{ email: email.to_email }], subject: email.subject }],
              from: { email: fromEmail },
              content: [
                { type: "text/html", value: email.body_html },
                { type: "text/plain", value: email.body_text || email.body_html.replace(/<[^>]*>/g, "") },
              ],
            }),
          });
        } else if (emailProvider === "mailgun") {
          const domain = Deno.env.get("MAILGUN_DOMAIN");
          const formData = new FormData();
          formData.append("from", fromEmail);
          formData.append("to", email.to_email);
          formData.append("subject", email.subject);
          formData.append("html", email.body_html);
          if (email.body_text) formData.append("text", email.body_text);

          result = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
            method: "POST",
            headers: { "Authorization": `Basic ${btoa("api:" + apiKey)}` },
            body: formData,
          });
        } else {
          throw new Error(`Unknown EMAIL_PROVIDER: ${emailProvider}`);
        }

        if (result.ok) {
          await supabase
            .from("email_outbox")
            .update({ status: "sent", sent_at: new Date().toISOString() })
            .eq("id", email.id);
        } else {
          const errText = await result.text();
          throw new Error(`Email API error: ${result.status} ${errText}`);
        }
      } catch (e) {
        console.error(`Failed to send email ${email.id}:`, e);
        await supabase
          .from("email_outbox")
          .update({
            status: email.retries >= 3 ? "failed" : "pending",
            error_msg: String(e),
            retries: email.retries + 1,
          })
          .eq("id", email.id);
      }
    }

    return new Response(JSON.stringify({ processed: emails.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Edge Function error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});