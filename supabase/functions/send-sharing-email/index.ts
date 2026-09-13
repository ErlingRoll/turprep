type SharingEmail = {
  to: string
  subject: string
  actionUrl: string
  actionLabel: string
}

const resendApiKey = Deno.env.get("RESEND_API_KEY")
// Temporary test sender; replace with the verified production domain before launch.
const sender = Deno.env.get("SHARING_EMAIL_FROM")
const functionSecret = Deno.env.get("SHARING_EMAIL_FUNCTION_SECRET")

const MAX_FIELD_LENGTH = 500
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= MAX_FIELD_LENGTH
}

function isHttpsUrl(value: string) {
  try {
    return new URL(value).protocol === "https:"
  } catch {
    return false
  }
}

function parseSharingEmail(body: unknown): SharingEmail | null {
  if (typeof body !== "object" || body === null) {
    return null
  }

  const { to, subject, actionUrl, actionLabel } = body as Record<string, unknown>

  if (
    !isNonEmptyString(to) ||
    !emailPattern.test(to) ||
    !isNonEmptyString(subject) ||
    !isNonEmptyString(actionUrl) ||
    !isHttpsUrl(actionUrl) ||
    !isNonEmptyString(actionLabel)
  ) {
    return null
  }

  return { to, subject, actionUrl, actionLabel }
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 })
  }

  if (!functionSecret || request.headers.get("authorization") !== `Bearer ${functionSecret}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  if (!resendApiKey || !sender) {
    return Response.json({ message: "Email delivery is not configured" }, { status: 503 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ message: "Invalid email data" }, { status: 400 })
  }

  const email = parseSharingEmail(body)
  if (!email) {
    return Response.json({ message: "Invalid email data" }, { status: 400 })
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: sender,
      to: [email.to],
      subject: email.subject,
      // Escape every interpolated value so callers cannot inject markup.
      html: `<p>${escapeHtml(email.subject)}</p><p><a href="${escapeHtml(email.actionUrl)}">${escapeHtml(email.actionLabel)}</a></p>`,
    }),
  })

  if (!response.ok) {
    return Response.json({ message: "Resend rejected the email" }, { status: 502 })
  }

  return Response.json({ sent: true })
})
